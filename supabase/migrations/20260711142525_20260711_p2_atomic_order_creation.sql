/*
# Phase 2 — Atomic Order Creation: repair create_payment_request

## Summary
The root cause of "My Orders shows 0" is that create_payment_request only writes
payment_requests, never commerce_orders. MyOrders.tsx reads commerce_orders.
This migration replaces create_payment_request to atomically create both.

## Changes

### create_payment_request (replaced)
- Now creates a commerce_order + commerce_order_item FIRST
- Then creates the payment_request with commerce_order_id populated
- Returns order_id and order_code in addition to existing return fields
- All existing callers (usePaymentSystem.ts) still work; extra fields are ignored

### Legacy backfill
- For every payment_request with commerce_order_id IS NULL, creates a backfill commerce_order
- Uses LEGACY_PAYMENT source to avoid financial side effects
- Fully idempotent (skips already-backfilled requests)
- Does NOT credit points, does NOT trigger notifications

## Security
SECURITY DEFINER + SET search_path = public, pg_catalog
auth.uid() checked internally; client cannot pass user_id
*/

-- ============================================================
-- 1. Replace create_payment_request
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_payment_request(
  p_package_id          uuid,
  p_payment_method_code text,
  p_coupon_code         text    DEFAULT NULL,
  p_sender_phone        text    DEFAULT NULL,
  p_reference_number    text    DEFAULT NULL,
  p_proof_image_url     text    DEFAULT NULL,
  p_proof_image_hash    text    DEFAULT NULL,
  p_fraud_flags         jsonb   DEFAULT '[]',
  p_device_info         text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user_id          uuid := auth.uid();
  v_method           RECORD;
  v_package          RECORD;
  v_price_info       jsonb;
  v_final_price      numeric(12,2);
  v_base_price       numeric(12,2);
  v_promo_disc       numeric(12,2) := 0;
  v_coupon_disc      numeric(12,2) := 0;
  v_base_pts         integer := 0;
  v_pkg_bonus        integer := 0;
  v_promo_bonus      integer := 0;
  v_coupon_bonus     integer := 0;
  v_total_pts        integer := 0;
  v_promo_id         uuid;
  v_coupon_id        uuid;
  v_promo_name_ar    text;
  v_promo_name_en    text;
  v_coupon_code_snap text;
  v_promo_disc_snap  numeric(12,2) := 0;
  v_coupon_disc_snap numeric(12,2) := 0;
  v_order_id         uuid;
  v_order_code       text;
  v_req_id           uuid;
  v_req_code         text;
  v_pending_count    integer;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Validate payment method
  SELECT * INTO v_method
  FROM public.payment_methods
  WHERE code = p_payment_method_code AND active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_payment_method');
  END IF;

  -- Cap pending requests
  SELECT COUNT(*) INTO v_pending_count
  FROM public.payment_requests
  WHERE user_id = v_user_id AND status = 'pending';
  IF v_pending_count >= 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'too_many_pending');
  END IF;

  -- Load and validate package
  SELECT * INTO v_package
  FROM public.payment_packages
  WHERE id = p_package_id
    AND (lifecycle_status IS NULL OR lifecycle_status = 'ACTIVE')
    AND active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'package_not_available');
  END IF;

  -- Calculate pricing
  SELECT public.calculate_package_price(p_package_id, p_coupon_code) INTO v_price_info;
  IF (v_price_info->>'success')::boolean = false THEN
    RETURN jsonb_build_object('success', false, 'error', COALESCE(v_price_info->>'error', 'price_error'));
  END IF;

  v_base_price    := COALESCE((v_price_info->>'base_price')::numeric,   v_package.price_lyd);
  v_promo_disc    := COALESCE((v_price_info->>'promo_discount')::numeric, 0);
  v_coupon_disc   := COALESCE((v_price_info->>'coupon_discount')::numeric, 0);
  v_final_price   := COALESCE((v_price_info->>'final_price')::numeric,   v_base_price);
  v_base_pts      := COALESCE((v_price_info->>'base_points')::integer,   v_package.points);
  v_pkg_bonus     := COALESCE((v_price_info->>'bonus_points')::integer,  COALESCE(v_package.bonus_points, 0));
  v_promo_bonus   := COALESCE((v_price_info->>'promo_bonus_points')::integer,  0);
  v_coupon_bonus  := COALESCE((v_price_info->>'coupon_bonus_points')::integer, 0);
  v_total_pts     := v_base_pts + v_pkg_bonus + v_promo_bonus + v_coupon_bonus;
  v_promo_id      := (v_price_info->>'promotion_id')::uuid;
  v_coupon_id     := (v_price_info->>'coupon_id')::uuid;
  v_promo_name_ar := v_price_info->>'promotion_name_ar';
  v_promo_name_en := v_price_info->>'promotion_name_en';
  v_coupon_code_snap := v_price_info->>'coupon_code';
  v_promo_disc_snap  := COALESCE((v_price_info->>'promo_discount')::numeric,   0);
  v_coupon_disc_snap := COALESCE((v_price_info->>'coupon_discount')::numeric,  0);

  -- ── Create commerce_order ──────────────────────────────────
  INSERT INTO public.commerce_orders (
    user_id, order_type, source, order_status, payment_status, fulfillment_status,
    currency, subtotal_snapshot, promotion_discount_snapshot, coupon_discount_snapshot,
    fees_snapshot, final_total_snapshot, promotion_id, coupon_id,
    payment_method_id, customer_input_snapshot, expires_at
  ) VALUES (
    v_user_id,
    'POINT_PACKAGE',
    'STORE',
    'AWAITING_PAYMENT',
    'NOT_SUBMITTED',
    'NOT_REQUIRED',
    'LYD',
    v_base_price,
    v_promo_disc,
    v_coupon_disc,
    0,                    -- no extra fees via this path
    v_final_price,
    v_promo_id,
    v_coupon_id,
    v_method.id,
    '{}',
    now() + interval '24 hours'
  )
  RETURNING id, order_code INTO v_order_id, v_order_code;

  -- ── Create order item ──────────────────────────────────────
  INSERT INTO public.commerce_order_items (
    order_id, item_type, item_id,
    item_name_ar_snapshot, item_name_en_snapshot,
    unit_price_snapshot, quantity, total_snapshot,
    base_points_snapshot, package_bonus_points_snapshot,
    promotion_bonus_points_snapshot, coupon_bonus_points_snapshot,
    total_points_snapshot, fulfillment_mode_snapshot
  ) VALUES (
    v_order_id,
    'POINT_PACKAGE',
    p_package_id,
    v_package.name_ar,
    v_package.name_en,
    v_base_price,
    1,
    v_final_price,
    v_base_pts,
    v_pkg_bonus,
    v_promo_bonus,
    v_coupon_bonus,
    v_total_pts,
    'AUTO_POINTS'
  );

  -- ── Reserve coupon ─────────────────────────────────────────
  IF v_coupon_id IS NOT NULL THEN
    INSERT INTO public.coupon_usages (coupon_id, user_id, status, reserved_at)
    VALUES (v_coupon_id, v_user_id, 'RESERVED', now())
    ON CONFLICT DO NOTHING;
  END IF;

  -- ── Create payment_request (linked to the new order) ──────
  v_req_code := 'PAY-' || upper(substring(gen_random_uuid()::text, 1, 8));

  INSERT INTO public.payment_requests (
    request_code,
    user_id,
    package_id,
    commerce_order_id,
    payment_method_code,
    amount,
    currency,
    points,
    bonus_points,
    total_points,
    sender_phone,
    reference_number,
    proof_image_url,
    proof_image_hash,
    status,
    fraud_flags,
    device_info,
    package_name_ar_snapshot,
    package_name_en_snapshot,
    base_price_snapshot,
    final_price_snapshot,
    base_points_snapshot,
    pkg_bonus_points_snapshot,
    promotion_id,
    promotion_name_ar_snapshot,
    promotion_name_en_snapshot,
    promo_bonus_points_snapshot,
    promo_discount_snapshot,
    coupon_id,
    coupon_code_snapshot,
    coupon_bonus_points_snapshot,
    coupon_discount_snapshot
  ) VALUES (
    v_req_code,
    v_user_id,
    p_package_id,
    v_order_id,
    p_payment_method_code,
    v_final_price,
    'LYD',
    v_base_pts,
    v_pkg_bonus,
    v_total_pts,
    p_sender_phone,
    p_reference_number,
    p_proof_image_url,
    p_proof_image_hash,
    'pending',
    COALESCE(p_fraud_flags, '[]'),
    p_device_info,
    v_package.name_ar,
    v_package.name_en,
    v_base_price,
    v_final_price,
    v_base_pts,
    v_pkg_bonus,
    v_promo_id,
    v_promo_name_ar,
    v_promo_name_en,
    v_promo_bonus,
    v_promo_disc_snap,
    v_coupon_id,
    v_coupon_code_snap,
    v_coupon_bonus,
    v_coupon_disc_snap
  )
  RETURNING id INTO v_req_id;

  -- Link coupon usage to payment request
  IF v_coupon_id IS NOT NULL THEN
    UPDATE public.coupon_usages
    SET payment_request_id = v_req_id
    WHERE coupon_id = v_coupon_id AND user_id = v_user_id AND payment_request_id IS NULL;
  END IF;

  -- Update commerce_order payment_status now that request exists
  UPDATE public.commerce_orders
  SET payment_status = 'NOT_SUBMITTED',
      updated_at = now()
  WHERE id = v_order_id;

  -- Audit
  INSERT INTO public.commerce_events (entity_type, entity_id, event_type, actor_user_id, new_state)
  VALUES ('commerce_order', v_order_id, 'ORDER_CREATED', v_user_id,
    jsonb_build_object('order_type', 'POINT_PACKAGE', 'amount', v_final_price, 'total_points', v_total_pts));

  RETURN jsonb_build_object(
    'success',        true,
    'request_id',     v_req_id,
    'request_code',   v_req_code,
    'order_id',       v_order_id,
    'order_code',     v_order_code,
    'total_points',   v_total_pts,
    'final_price',    v_final_price,
    'promo_applied',  v_promo_id IS NOT NULL,
    'coupon_applied', v_coupon_id IS NOT NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_payment_request(uuid, text, text, text, text, text, text, jsonb, text) TO authenticated;

-- ============================================================
-- 2. Backfill: create missing commerce_orders for existing payment_requests
-- ============================================================
DO $$
DECLARE
  r RECORD;
  v_order_id uuid;
  v_method_id uuid;
BEGIN
  FOR r IN
    SELECT pr.*
    FROM public.payment_requests pr
    WHERE pr.commerce_order_id IS NULL
    ORDER BY pr.created_at
  LOOP
    -- Try to find a matching payment method by code
    SELECT id INTO v_method_id
    FROM public.payment_methods
    WHERE code = r.payment_method_code
    LIMIT 1;

    -- Create the backfill commerce_order
    INSERT INTO public.commerce_orders (
      user_id, order_type, source, order_status, payment_status, fulfillment_status,
      currency, subtotal_snapshot, promotion_discount_snapshot, coupon_discount_snapshot,
      fees_snapshot, final_total_snapshot, promotion_id, coupon_id,
      payment_method_id, customer_input_snapshot, submitted_at, paid_at, completed_at,
      created_at, updated_at
    ) VALUES (
      r.user_id,
      'POINT_PACKAGE',
      'LEGACY_PAYMENT_REQUEST',
      CASE r.status
        WHEN 'approved' THEN 'COMPLETED'
        WHEN 'rejected' THEN 'CANCELLED'
        WHEN 'cancelled' THEN 'CANCELLED'
        ELSE 'AWAITING_PAYMENT'
      END,
      CASE r.status
        WHEN 'approved'     THEN 'PAID'
        WHEN 'rejected'     THEN 'FAILED'
        WHEN 'needs_info'   THEN 'NEEDS_INFO'
        WHEN 'under_review' THEN 'UNDER_REVIEW'
        WHEN 'submitted'    THEN 'SUBMITTED'
        WHEN 'SUBMITTED'    THEN 'SUBMITTED'
        ELSE 'NOT_SUBMITTED'
      END,
      'NOT_REQUIRED',
      COALESCE(r.currency, 'LYD'),
      COALESCE(r.base_price_snapshot, r.amount, 0),
      COALESCE(r.promo_discount_snapshot, 0),
      COALESCE(r.coupon_discount_snapshot, 0),
      0,
      COALESCE(r.final_price_snapshot, r.amount, 0),
      r.promotion_id,
      r.coupon_id,
      v_method_id,
      '{}',
      r.created_at,   -- submitted_at (approximate)
      CASE WHEN r.status = 'approved' THEN r.reviewed_at END,
      CASE WHEN r.status = 'approved' THEN r.reviewed_at END,
      r.created_at,
      COALESCE(r.updated_at, r.created_at)
    )
    RETURNING id INTO v_order_id;

    -- Create order item snapshot
    INSERT INTO public.commerce_order_items (
      order_id, item_type, item_id,
      item_name_ar_snapshot, item_name_en_snapshot,
      unit_price_snapshot, quantity, total_snapshot,
      base_points_snapshot, package_bonus_points_snapshot,
      total_points_snapshot, fulfillment_mode_snapshot
    ) VALUES (
      v_order_id,
      'POINT_PACKAGE',
      r.package_id,
      COALESCE(r.package_name_ar_snapshot, 'باقة نقاط'),
      COALESCE(r.package_name_en_snapshot, 'Points Package'),
      COALESCE(r.base_price_snapshot, r.amount, 0),
      1,
      COALESCE(r.final_price_snapshot, r.amount, 0),
      COALESCE(r.base_points_snapshot, r.points, 0),
      COALESCE(r.pkg_bonus_points_snapshot, r.bonus_points, 0),
      COALESCE(r.total_points, 0),
      'AUTO_POINTS'
    );

    -- Link payment_request → commerce_order
    UPDATE public.payment_requests
    SET commerce_order_id = v_order_id
    WHERE id = r.id;

    RAISE NOTICE 'Backfilled order % for payment_request %', v_order_id, r.id;
  END LOOP;
END $$;
