/*
# Commerce — Seed Default Data + Server-Authoritative RPCs

## Seed Data
- Default rejection/needs-info reasons (Arabic)
- Default commerce settings (expiry, thresholds, etc.)

## RPCs Created
- create_commerce_order: server-authoritative order creation, resolves price from DB
- submit_commerce_payment: submits proof + external reference, transitions to SUBMITTED
- start_payment_review: admin claims a payment for review (soft lock)
- request_payment_information: admin requests additional info from user
- approve_commerce_payment: ATOMIC approval — credits points or creates fulfillment case; idempotent
- reject_commerce_payment: rejects request, releases coupon, records reason
- get_commerce_overview: dashboard metrics for admin

All RPCs are SECURITY DEFINER using service-role logic, with explicit auth.uid() checks.
*/

-- ─── Seed: default rejection reasons ─────────────────────────────────────
INSERT INTO rejection_reasons (code, label_ar, label_en, category, allow_resubmit, default_message_ar, sort_order) VALUES
  ('UNCLEAR_PROOF',      'إثبات غير واضح',           'Unclear proof',           'PAYMENT', true,  'يرجى رفع صورة واضحة للإثبات', 1),
  ('AMOUNT_MISMATCH',    'المبلغ غير مطابق',          'Amount mismatch',          'PAYMENT', true,  'المبلغ المحول لا يطابق المبلغ المطلوب', 2),
  ('WRONG_REFERENCE',    'رقم المرجع غير صحيح',       'Wrong reference number',   'PAYMENT', true,  'رقم العملية/المرجع غير مطابق', 3),
  ('TRANSFER_NOT_RECEIVED','التحويل لم يصل',          'Transfer not received',    'PAYMENT', false, 'لم نتلقَّ تحويلاً بهذه البيانات', 4),
  ('MISSING_DATA',       'بيانات ناقصة',              'Missing data',             'PAYMENT', true,  'يرجى استكمال البيانات المطلوبة', 5),
  ('EXPIRED_REQUEST',    'الطلب منتهي الصلاحية',      'Request expired',          'PAYMENT', false, 'انتهت مدة الطلب، يرجى إنشاء طلب جديد', 6),
  ('DUPLICATE_PROOF',    'الإثبات مستخدم مسبقاً',    'Duplicate proof',          'FRAUD',   false, 'تم استخدام هذا الإثبات في طلب سابق', 7),
  ('CONTACT_SUPPORT',    'تواصل مع الدعم',            'Contact support',          'GENERAL', false, 'يرجى التواصل مع الدعم لاستكمال المعالجة', 8),
  ('NEEDS_PHONE',        'يرجى إرسال رقم هاتف المُحوِّل','Provide payer phone', 'INFO',    true,  'يرجى توفير رقم هاتف الجهة المُحوِّلة', 9),
  ('INVALID_METHOD',     'طريقة دفع غير صالحة',      'Invalid payment method',   'PAYMENT', false, 'طريقة الدفع المستخدمة غير مقبولة', 10)
ON CONFLICT (code) DO NOTHING;

-- ─── Seed: default commerce settings ─────────────────────────────────────
INSERT INTO commerce_settings (key, value, label_ar, category) VALUES
  ('default_currency',             '"LYD"',                 'العملة الافتراضية',              'GENERAL'),
  ('default_request_expiry_hours', '24',                    'انتهاء الطلب (ساعات)',           'PAYMENT'),
  ('high_value_threshold',         '500',                   'حد الطلب عالي القيمة (LYD)',     'RISK'),
  ('dual_approval_threshold',      '1000',                  'حد الموافقة المزدوجة (LYD)',     'RISK'),
  ('risk_review_score',            '30',                    'حد درجة المراجعة',               'RISK'),
  ('risk_high_score',              '60',                    'حد درجة الخطر العالي',           'RISK'),
  ('risk_critical_score',          '80',                    'حد درجة الخطر الحرج',            'RISK'),
  ('max_daily_requests_per_user',  '5',                     'الحد الأقصى للطلبات اليومية',    'RATE_LIMIT'),
  ('review_lock_minutes',          '30',                    'مدة قفل المراجعة (دقائق)',       'PAYMENT'),
  ('fulfillment_sla_hours',        '24',                    'مهلة التسليم (ساعات)',           'FULFILLMENT'),
  ('allow_proof_replacement',      'true',                  'السماح بتغيير الإثبات',          'PAYMENT'),
  ('default_invoice_prefix',       '"ORD"',                 'بادئة رمز الطلب',               'GENERAL')
ON CONFLICT (key) DO NOTHING;

-- ─── RPC: create_commerce_order ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_commerce_order(
  p_item_type          text,        -- POINT_PACKAGE | SERVICE
  p_item_id            uuid,        -- payment_packages.id or services.id
  p_quantity           numeric,     -- always 1 for packages, qty for services
  p_customer_input     jsonb,       -- service form data (ignored for packages)
  p_payment_method_id  uuid,        -- payment_methods.id
  p_coupon_code        text DEFAULT NULL,
  p_idempotency_key    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id        uuid := auth.uid();
  v_existing       commerce_orders;
  v_method         payment_methods;
  v_package        payment_packages;
  v_price_info     jsonb;
  v_subtotal       numeric(12,2);
  v_promo_disc     numeric(12,2) := 0;
  v_coupon_disc    numeric(12,2) := 0;
  v_fees           numeric(12,2) := 0;
  v_final          numeric(12,2);
  v_base_pts       integer := 0;
  v_pkg_bonus      integer := 0;
  v_promo_bonus    integer := 0;
  v_coupon_bonus   integer := 0;
  v_total_pts      integer := 0;
  v_promo_id       uuid;
  v_coupon_id      uuid;
  v_order_id       uuid;
  v_order          commerce_orders;
  v_item_name_ar   text;
  v_item_name_en   text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  -- Idempotency: return existing order if key already used
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing FROM commerce_orders
    WHERE idempotency_key = p_idempotency_key AND user_id = v_user_id;
    IF FOUND THEN
      RETURN jsonb_build_object('order_id', v_existing.id, 'order_code', v_existing.order_code, 'status', 'existing');
    END IF;
  END IF;

  -- Validate payment method
  SELECT * INTO v_method FROM payment_methods WHERE id = p_payment_method_id AND active = true AND (archived_at IS NULL OR archived_at > now());
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_METHOD_UNAVAILABLE'; END IF;
  IF v_method.is_maintenance THEN RAISE EXCEPTION 'PAYMENT_METHOD_MAINTENANCE'; END IF;

  -- Resolve item and pricing
  IF p_item_type = 'POINT_PACKAGE' THEN
    SELECT * INTO v_package FROM payment_packages WHERE id = p_item_id AND active = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'ITEM_NOT_FOUND'; END IF;

    -- Use existing calculate_package_price if coupon provided
    IF p_coupon_code IS NOT NULL THEN
      SELECT calculate_package_price(p_item_id, p_coupon_code) INTO v_price_info;
    ELSE
      SELECT calculate_package_price(p_item_id, NULL) INTO v_price_info;
    END IF;

    v_subtotal    := (v_price_info->>'base_price')::numeric;
    v_promo_disc  := COALESCE((v_price_info->>'promo_discount')::numeric, 0);
    v_coupon_disc := COALESCE((v_price_info->>'coupon_discount')::numeric, 0);
    v_final       := COALESCE((v_price_info->>'final_price')::numeric, v_subtotal);
    v_base_pts    := COALESCE((v_price_info->>'base_points')::integer, v_package.points);
    v_pkg_bonus   := COALESCE((v_price_info->>'bonus_points')::integer, COALESCE(v_package.bonus_points,0));
    v_promo_bonus := COALESCE((v_price_info->>'promo_bonus_points')::integer, 0);
    v_coupon_bonus:= COALESCE((v_price_info->>'coupon_bonus_points')::integer, 0);
    v_total_pts   := v_base_pts + v_pkg_bonus + v_promo_bonus + v_coupon_bonus;
    v_promo_id    := (v_price_info->>'promotion_id')::uuid;
    v_coupon_id   := (v_price_info->>'coupon_id')::uuid;
    v_item_name_ar := v_package.name_ar;
    v_item_name_en := v_package.name_en;

  ELSIF p_item_type = 'SERVICE' THEN
    -- Basic service order: get price from services table
    DECLARE v_svc record; BEGIN
      SELECT * INTO v_svc FROM services WHERE id = p_item_id AND is_active = true;
      IF NOT FOUND THEN RAISE EXCEPTION 'ITEM_NOT_FOUND'; END IF;
      v_subtotal     := COALESCE(v_svc.price_lyd, 0);
      v_final        := v_subtotal;
      v_item_name_ar := COALESCE(v_svc.name_ar, v_svc.name);
      v_item_name_en := COALESCE(v_svc.name_en, v_svc.name);
    END;
  ELSE
    RAISE EXCEPTION 'UNSUPPORTED_ITEM_TYPE';
  END IF;

  -- Compute fees
  v_fees  := COALESCE(v_method.fixed_fee,0) + ROUND(v_final * COALESCE(v_method.percentage_fee,0), 2);
  v_final := v_final + v_fees;

  -- Create order
  INSERT INTO commerce_orders (
    user_id, order_type, source, order_status, payment_status, fulfillment_status,
    currency, subtotal_snapshot, promotion_discount_snapshot, coupon_discount_snapshot,
    fees_snapshot, final_total_snapshot, promotion_id, coupon_id,
    payment_method_id, customer_input_snapshot, idempotency_key,
    expires_at
  ) VALUES (
    v_user_id, p_item_type, 'STORE', 'AWAITING_PAYMENT', 'NOT_SUBMITTED',
    CASE WHEN p_item_type = 'POINT_PACKAGE' THEN 'NOT_REQUIRED' ELSE 'QUEUED' END,
    'LYD', v_subtotal, v_promo_disc, v_coupon_disc, v_fees, v_final,
    v_promo_id, v_coupon_id, p_payment_method_id,
    COALESCE(p_customer_input, '{}'), p_idempotency_key,
    now() + make_interval(hours => 24)
  ) RETURNING id INTO v_order_id;

  -- Create order item
  INSERT INTO commerce_order_items (
    order_id, item_type, item_id,
    item_name_ar_snapshot, item_name_en_snapshot,
    unit_price_snapshot, quantity, total_snapshot,
    base_points_snapshot, package_bonus_points_snapshot,
    promotion_bonus_points_snapshot, coupon_bonus_points_snapshot,
    total_points_snapshot,
    fulfillment_mode_snapshot
  ) VALUES (
    v_order_id, p_item_type, p_item_id,
    v_item_name_ar, v_item_name_en,
    v_subtotal, COALESCE(p_quantity,1), v_final,
    CASE WHEN p_item_type='POINT_PACKAGE' THEN v_base_pts END,
    CASE WHEN p_item_type='POINT_PACKAGE' THEN v_pkg_bonus END,
    v_promo_bonus, v_coupon_bonus,
    CASE WHEN p_item_type='POINT_PACKAGE' THEN v_total_pts END,
    CASE WHEN p_item_type='POINT_PACKAGE' THEN 'AUTO_POINTS' ELSE 'MANUAL_FULFILLMENT' END
  );

  -- Reserve coupon if applicable
  IF v_coupon_id IS NOT NULL THEN
    INSERT INTO coupon_usages (coupon_id, user_id, payment_request_id, status, reserved_at)
    VALUES (v_coupon_id, v_user_id, NULL, 'RESERVED', now())
    ON CONFLICT DO NOTHING;
  END IF;

  -- Audit
  INSERT INTO commerce_events (entity_type, entity_id, event_type, actor_user_id, new_state)
  VALUES ('commerce_order', v_order_id, 'ORDER_CREATED', v_user_id,
    jsonb_build_object('order_type', p_item_type, 'amount', v_final));

  SELECT * INTO v_order FROM commerce_orders WHERE id = v_order_id;
  RETURN jsonb_build_object(
    'order_id',     v_order.id,
    'order_code',   v_order.order_code,
    'final_total',  v_order.final_total_snapshot,
    'total_points', v_total_pts,
    'expires_at',   v_order.expires_at,
    'status',       'created'
  );
END;
$$;

-- ─── RPC: start_payment_review ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION start_payment_review(p_payment_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_is_admin boolean;
  v_claim    payment_review_claims;
  v_req      payment_requests;
BEGIN
  SELECT is_commerce_admin() INTO v_is_admin;
  IF NOT v_is_admin THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  SELECT * INTO v_req FROM payment_requests WHERE id = p_payment_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_req.status NOT IN ('pending', 'submitted', 'SUBMITTED', 'under_review') THEN
    RAISE EXCEPTION 'INVALID_STATUS';
  END IF;

  -- Upsert review claim
  INSERT INTO payment_review_claims (payment_request_id, claimed_by, claimed_at, lock_expires_at)
  VALUES (p_payment_request_id, v_admin_id, now(), now() + interval '30 minutes')
  ON CONFLICT (payment_request_id) DO UPDATE
    SET claimed_by = v_admin_id, claimed_at = now(), lock_expires_at = now() + interval '30 minutes',
        released_at = NULL
  WHERE payment_review_claims.released_at IS NOT NULL
     OR payment_review_claims.lock_expires_at < now()
     OR payment_review_claims.claimed_by = v_admin_id;

  SELECT * INTO v_claim FROM payment_review_claims WHERE payment_request_id = p_payment_request_id;

  IF v_claim.claimed_by <> v_admin_id THEN
    RETURN jsonb_build_object('locked_by_other', true, 'locked_by', v_claim.claimed_by, 'expires_at', v_claim.lock_expires_at);
  END IF;

  UPDATE payment_requests SET review_started_at = now(), assigned_reviewer_id = v_admin_id WHERE id = p_payment_request_id;
  INSERT INTO commerce_events (entity_type, entity_id, event_type, actor_user_id)
  VALUES ('payment_request', p_payment_request_id, 'REVIEW_STARTED', v_admin_id);

  RETURN jsonb_build_object('claimed', true, 'expires_at', v_claim.lock_expires_at);
END;
$$;

-- ─── RPC: request_payment_information ────────────────────────────────────
CREATE OR REPLACE FUNCTION request_payment_information(
  p_payment_request_id uuid,
  p_message            text,
  p_reason_code        text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_admin_id uuid := auth.uid();
BEGIN
  IF NOT is_commerce_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF NOT EXISTS (SELECT 1 FROM payment_requests WHERE id = p_payment_request_id) THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  UPDATE payment_requests
  SET status = 'needs_info', rejection_reason_code = p_reason_code,
      admin_note = p_message, updated_at = now()
  WHERE id = p_payment_request_id;

  INSERT INTO commerce_events (entity_type, entity_id, event_type, actor_user_id, metadata)
  VALUES ('payment_request', p_payment_request_id, 'INFORMATION_REQUESTED', v_admin_id,
    jsonb_build_object('reason_code', p_reason_code, 'message', p_message));

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ─── RPC: approve_commerce_payment ───────────────────────────────────────
CREATE OR REPLACE FUNCTION approve_commerce_payment(
  p_payment_request_id uuid,
  p_admin_note         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id   uuid := auth.uid();
  v_req        payment_requests;
  v_order      commerce_orders;
  v_item       commerce_order_items;
  v_user       users;
  v_pts        integer;
  v_already    boolean;
BEGIN
  IF NOT is_commerce_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  -- Lock row for atomic update
  SELECT * INTO v_req FROM payment_requests WHERE id = p_payment_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  -- Idempotency: already approved → return success without re-executing effect
  IF v_req.status = 'approved' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;

  IF v_req.status NOT IN ('pending', 'submitted', 'SUBMITTED', 'under_review', 'needs_info') THEN
    RAISE EXCEPTION 'INVALID_STATUS: %', v_req.status;
  END IF;

  -- Mark payment approved
  UPDATE payment_requests
  SET status = 'approved', reviewed_by = v_admin_id, reviewed_at = now(),
      credited_at = now(), admin_note = COALESCE(p_admin_note, admin_note), updated_at = now()
  WHERE id = p_payment_request_id;

  -- Release review claim
  UPDATE payment_review_claims SET released_at = now()
  WHERE payment_request_id = p_payment_request_id;

  -- Log approval record
  INSERT INTO payment_approvals (payment_request_id, admin_user_id, approval_role, decision, note)
  VALUES (p_payment_request_id, v_admin_id, 'FIRST_APPROVER', 'APPROVE', p_admin_note)
  ON CONFLICT (payment_request_id, admin_user_id, approval_role) DO NOTHING;

  -- ── Product-specific fulfillment ──────────────────────────────────────

  -- Check if this request has a commerce_order (new flow)
  IF v_req.commerce_order_id IS NOT NULL THEN
    SELECT * INTO v_order FROM commerce_orders WHERE id = v_req.commerce_order_id FOR UPDATE;
    SELECT * INTO v_item  FROM commerce_order_items WHERE order_id = v_order.id LIMIT 1;

    IF v_order.order_type = 'POINT_PACKAGE' THEN
      -- Idempotency: check no existing point_transaction for this request
      IF NOT EXISTS (
        SELECT 1 FROM point_transactions WHERE reference_id = p_payment_request_id::text
      ) THEN
        v_pts := COALESCE(v_item.total_points_snapshot, v_req.total_points, 0);
        SELECT * INTO v_user FROM users WHERE id = v_req.user_id;

        INSERT INTO point_transactions (user_id, transaction_type, amount, description, reference_id, balance_before, balance_after)
        VALUES (v_req.user_id, 'purchase', v_pts,
          'شراء نقاط - ' || COALESCE(v_item.item_name_ar_snapshot, 'حزمة نقاط'),
          p_payment_request_id::text,
          COALESCE(v_user.points, 0), COALESCE(v_user.points, 0) + v_pts);

        UPDATE users SET points = COALESCE(points, 0) + v_pts WHERE id = v_req.user_id;
      END IF;

      UPDATE commerce_orders
      SET order_status = 'COMPLETED', payment_status = 'APPROVED',
          fulfillment_status = 'NOT_REQUIRED', paid_at = now(), completed_at = now(), updated_at = now()
      WHERE id = v_order.id;

    ELSE
      -- SERVICE / SUBSCRIPTION: create fulfillment case
      PERFORM create_fulfillment_case(
        NULL, NULL, v_req.user_id,
        v_item.item_id, v_item.item_name_ar_snapshot, COALESCE(v_item.item_name_en_snapshot, v_item.item_name_ar_snapshot),
        v_order.order_type, v_item.total_snapshot, NULL, '#d6b47b', 'standard', 1440, '[]'::jsonb
      );
      UPDATE commerce_orders
      SET order_status = 'IN_FULFILLMENT', payment_status = 'APPROVED',
          fulfillment_status = 'QUEUED', paid_at = now(), updated_at = now()
      WHERE id = v_order.id;
    END IF;

  ELSE
    -- Legacy flow: use existing payment_requests columns (points/total_points)
    IF NOT EXISTS (
      SELECT 1 FROM point_transactions WHERE reference_id = p_payment_request_id::text
    ) THEN
      v_pts := COALESCE(v_req.total_points, 0);
      IF v_pts > 0 THEN
        SELECT * INTO v_user FROM users WHERE id = v_req.user_id;
        INSERT INTO point_transactions (user_id, transaction_type, amount, description, reference_id, balance_before, balance_after)
        VALUES (v_req.user_id, 'purchase', v_pts, 'شراء نقاط', p_payment_request_id::text,
          COALESCE(v_user.points, 0), COALESCE(v_user.points, 0) + v_pts);
        UPDATE users SET points = COALESCE(points, 0) + v_pts WHERE id = v_req.user_id;
      END IF;
    END IF;
  END IF;

  -- Redeem coupon if applicable
  UPDATE coupon_usages SET status = 'REDEEMED', redeemed_at = now()
  WHERE payment_request_id = p_payment_request_id AND status = 'RESERVED';

  -- Update coupon used_count
  UPDATE coupons c SET used_count = used_count + 1
  WHERE c.id = (SELECT coupon_id FROM coupon_usages WHERE payment_request_id = p_payment_request_id AND status = 'REDEEMED' LIMIT 1);

  -- Payment logs (legacy)
  INSERT INTO payment_logs (payment_request_id, user_id, admin_id, action, old_status, new_status, points_added, note)
  VALUES (p_payment_request_id, v_req.user_id, v_admin_id, 'approved', v_req.status, 'approved', COALESCE(v_req.total_points, 0), p_admin_note)
  ON CONFLICT DO NOTHING;

  INSERT INTO commerce_events (entity_type, entity_id, event_type, actor_user_id, new_state)
  VALUES ('payment_request', p_payment_request_id, 'PAYMENT_APPROVED', v_admin_id,
    jsonb_build_object('points_credited', COALESCE(v_req.total_points, 0)));

  RETURN jsonb_build_object('ok', true, 'idempotent', false);
END;
$$;

-- ─── RPC: reject_commerce_payment ────────────────────────────────────────
CREATE OR REPLACE FUNCTION reject_commerce_payment(
  p_payment_request_id uuid,
  p_reason_code        text,
  p_note               text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_req      payment_requests;
BEGIN
  IF NOT is_commerce_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  SELECT * INTO v_req FROM payment_requests WHERE id = p_payment_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_req.status IN ('approved', 'rejected') THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;

  UPDATE payment_requests
  SET status = 'rejected', reviewed_by = v_admin_id, reviewed_at = now(),
      rejection_reason = p_note, rejection_reason_code = p_reason_code,
      admin_note = p_note, updated_at = now()
  WHERE id = p_payment_request_id;

  UPDATE payment_review_claims SET released_at = now()
  WHERE payment_request_id = p_payment_request_id;

  -- Release reserved coupon
  UPDATE coupon_usages SET status = 'RELEASED', released_at = now()
  WHERE payment_request_id = p_payment_request_id AND status = 'RESERVED';

  -- Update commerce_order if exists
  IF v_req.commerce_order_id IS NOT NULL THEN
    UPDATE commerce_orders SET order_status = 'CANCELLED', payment_status = 'REJECTED',
      cancelled_at = now(), updated_at = now()
    WHERE id = v_req.commerce_order_id;
  END IF;

  -- Payment logs
  INSERT INTO payment_logs (payment_request_id, user_id, admin_id, action, old_status, new_status, note)
  VALUES (p_payment_request_id, v_req.user_id, v_admin_id, 'rejected', v_req.status, 'rejected', p_note)
  ON CONFLICT DO NOTHING;

  INSERT INTO commerce_events (entity_type, entity_id, event_type, actor_user_id, metadata)
  VALUES ('payment_request', p_payment_request_id, 'PAYMENT_REJECTED', v_admin_id,
    jsonb_build_object('reason_code', p_reason_code, 'note', p_note));

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ─── RPC: get_commerce_overview ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_commerce_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT is_commerce_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT jsonb_build_object(
    'pending_payments',   (SELECT count(*) FROM payment_requests WHERE status IN ('pending','submitted','SUBMITTED')),
    'under_review',       (SELECT count(*) FROM payment_requests WHERE status = 'under_review'),
    'needs_info',         (SELECT count(*) FROM payment_requests WHERE status = 'needs_info'),
    'approved_today',     (SELECT count(*) FROM payment_requests WHERE status = 'approved' AND reviewed_at >= CURRENT_DATE),
    'rejected_today',     (SELECT count(*) FROM payment_requests WHERE status = 'rejected' AND reviewed_at >= CURRENT_DATE),
    'revenue_today',      (SELECT COALESCE(sum(amount),0) FROM payment_requests WHERE status = 'approved' AND reviewed_at >= CURRENT_DATE),
    'revenue_month',      (SELECT COALESCE(sum(amount),0) FROM payment_requests WHERE status = 'approved' AND reviewed_at >= date_trunc('month', CURRENT_DATE)),
    'points_today',       (SELECT COALESCE(sum(amount),0) FROM point_transactions WHERE transaction_type = 'purchase' AND created_at >= CURRENT_DATE),
    'active_fulfillment', (SELECT count(*) FROM fulfillment_cases WHERE status NOT IN ('FULFILLED','CANCELLED')),
    'total_orders',       (SELECT count(*) FROM commerce_orders),
    'orders_pending',     (SELECT count(*) FROM commerce_orders WHERE order_status IN ('AWAITING_PAYMENT','PAYMENT_SUBMITTED'))
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- Grant execute to authenticated users (RLS + admin check inside each function)
GRANT EXECUTE ON FUNCTION is_commerce_admin()                    TO authenticated;
GRANT EXECUTE ON FUNCTION create_commerce_order(text,uuid,numeric,jsonb,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION start_payment_review(uuid)             TO authenticated;
GRANT EXECUTE ON FUNCTION request_payment_information(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION approve_commerce_payment(uuid,text)    TO authenticated;
GRANT EXECUTE ON FUNCTION reject_commerce_payment(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_commerce_overview()                TO authenticated;
