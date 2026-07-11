/*
# Fix: ON CONFLICT DO NOTHING incompatible with DEFERRABLE unique constraint on payment_logs

## Root Cause
The unique constraint `payment_logs_request_approved_unique` on `payment_logs(payment_request_id, action)`
was created as DEFERRABLE. PostgreSQL does not allow `ON CONFLICT DO NOTHING` to target a deferrable
constraint as an arbiter — it raises:
  "ON CONFLICT does not support deferrable unique constraints/exclusion constraints as arbiters"

## Changes
- `approve_commerce_payment`: replaces `ON CONFLICT DO NOTHING` with `IF NOT EXISTS` guard
- `reject_commerce_payment`:  replaces `ON CONFLICT DO NOTHING` with `IF NOT EXISTS` guard

Both functions are otherwise identical to the live version — only the payment_logs insert pattern changes.

## Why IF NOT EXISTS is correct here
The function already holds a `FOR UPDATE` row lock on payment_requests, so no concurrent approval
can reach the payment_logs insert simultaneously. The IF NOT EXISTS check is safe and deterministic
inside this transaction. It is the same pattern already used for point_transactions in this function.

## Idempotency preserved
- approve: checks action = 'approved' before inserting
- reject:  checks action = 'rejected' before inserting
Double-execution still has no financial side effect.
*/

-- ============================================================
-- 1. Fix approve_commerce_payment
-- ============================================================
CREATE OR REPLACE FUNCTION public.approve_commerce_payment(
  p_payment_request_id uuid,
  p_admin_note         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_req      payment_requests;
  v_order    commerce_orders;
  v_item     commerce_order_items;
  v_user     users;
  v_pts      integer;
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
  SET status      = 'approved',
      reviewed_by = v_admin_id,
      reviewed_at = now(),
      credited_at = now(),
      admin_note  = COALESCE(p_admin_note, admin_note),
      updated_at  = now()
  WHERE id = p_payment_request_id;

  -- Release review claim
  UPDATE payment_review_claims SET released_at = now()
  WHERE payment_request_id = p_payment_request_id;

  -- Log approval record (idempotent)
  INSERT INTO payment_approvals (payment_request_id, admin_user_id, approval_role, decision, note)
  VALUES (p_payment_request_id, v_admin_id, 'FIRST_APPROVER', 'APPROVE', p_admin_note)
  ON CONFLICT (payment_request_id, admin_user_id, approval_role) DO NOTHING;

  -- ── Product-specific fulfillment ──────────────────────────────────────

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

        INSERT INTO point_transactions (
          user_id, transaction_type, amount, description, reference_id, balance_before, balance_after
        ) VALUES (
          v_req.user_id, 'purchase', v_pts,
          'شراء نقاط - ' || COALESCE(v_item.item_name_ar_snapshot, 'حزمة نقاط'),
          p_payment_request_id::text,
          COALESCE(v_user.points, 0), COALESCE(v_user.points, 0) + v_pts
        );

        UPDATE users SET points = COALESCE(points, 0) + v_pts WHERE id = v_req.user_id;
      END IF;

      UPDATE commerce_orders
      SET order_status       = 'COMPLETED',
          payment_status     = 'APPROVED',
          fulfillment_status = 'NOT_REQUIRED',
          paid_at            = now(),
          completed_at       = now(),
          updated_at         = now()
      WHERE id = v_order.id;

    ELSE
      -- SERVICE / SUBSCRIPTION: create fulfillment case
      PERFORM create_fulfillment_case(
        NULL, NULL, v_req.user_id,
        v_item.item_id, v_item.item_name_ar_snapshot,
        COALESCE(v_item.item_name_en_snapshot, v_item.item_name_ar_snapshot),
        v_order.order_type, v_item.total_snapshot, NULL,
        '#d6b47b', 'standard', 1440, '[]'::jsonb
      );
      UPDATE commerce_orders
      SET order_status       = 'IN_FULFILLMENT',
          payment_status     = 'APPROVED',
          fulfillment_status = 'QUEUED',
          paid_at            = now(),
          updated_at         = now()
      WHERE id = v_order.id;
    END IF;

  ELSE
    -- Legacy flow: no commerce_order — use payment_requests.total_points directly
    IF NOT EXISTS (
      SELECT 1 FROM point_transactions WHERE reference_id = p_payment_request_id::text
    ) THEN
      v_pts := COALESCE(v_req.total_points, 0);
      IF v_pts > 0 THEN
        SELECT * INTO v_user FROM users WHERE id = v_req.user_id;
        INSERT INTO point_transactions (
          user_id, transaction_type, amount, description, reference_id, balance_before, balance_after
        ) VALUES (
          v_req.user_id, 'purchase', v_pts, 'شراء نقاط',
          p_payment_request_id::text,
          COALESCE(v_user.points, 0), COALESCE(v_user.points, 0) + v_pts
        );
        UPDATE users SET points = COALESCE(points, 0) + v_pts WHERE id = v_req.user_id;
      END IF;
    END IF;
  END IF;

  -- Redeem coupon if applicable
  UPDATE coupon_usages SET status = 'REDEEMED', redeemed_at = now()
  WHERE payment_request_id = p_payment_request_id AND status = 'RESERVED';

  -- Update coupon used_count
  UPDATE coupons c SET used_count = used_count + 1
  WHERE c.id = (
    SELECT coupon_id FROM coupon_usages
    WHERE payment_request_id = p_payment_request_id AND status = 'REDEEMED'
    LIMIT 1
  );

  -- Payment log — IF NOT EXISTS replaces ON CONFLICT DO NOTHING
  -- (ON CONFLICT cannot target a DEFERRABLE constraint)
  IF NOT EXISTS (
    SELECT 1 FROM payment_logs
    WHERE payment_request_id = p_payment_request_id AND action = 'approved'
  ) THEN
    INSERT INTO payment_logs (
      payment_request_id, user_id, admin_id, action, old_status, new_status, points_added, note
    ) VALUES (
      p_payment_request_id, v_req.user_id, v_admin_id,
      'approved', v_req.status, 'approved',
      COALESCE(v_req.total_points, 0), p_admin_note
    );
  END IF;

  -- Commerce audit event
  INSERT INTO commerce_events (entity_type, entity_id, event_type, actor_user_id, new_state)
  VALUES (
    'payment_request', p_payment_request_id, 'PAYMENT_APPROVED', v_admin_id,
    jsonb_build_object('points_credited', COALESCE(v_req.total_points, 0))
  );

  RETURN jsonb_build_object('ok', true, 'idempotent', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_commerce_payment(uuid, text) TO authenticated;

-- ============================================================
-- 2. Fix reject_commerce_payment
-- ============================================================
CREATE OR REPLACE FUNCTION public.reject_commerce_payment(
  p_payment_request_id uuid,
  p_reason_code        text,
  p_note               text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_req      payment_requests;
BEGIN
  IF NOT is_commerce_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  SELECT * INTO v_req FROM payment_requests WHERE id = p_payment_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  -- Idempotency
  IF v_req.status IN ('approved', 'rejected') THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;

  UPDATE payment_requests
  SET status               = 'rejected',
      reviewed_by          = v_admin_id,
      reviewed_at          = now(),
      rejection_reason      = p_note,
      rejection_reason_code = p_reason_code,
      admin_note           = p_note,
      updated_at           = now()
  WHERE id = p_payment_request_id;

  UPDATE payment_review_claims SET released_at = now()
  WHERE payment_request_id = p_payment_request_id;

  -- Release reserved coupon
  UPDATE coupon_usages SET status = 'RELEASED', released_at = now()
  WHERE payment_request_id = p_payment_request_id AND status = 'RESERVED';

  -- Update commerce_order if exists
  IF v_req.commerce_order_id IS NOT NULL THEN
    UPDATE commerce_orders
    SET order_status   = 'CANCELLED',
        payment_status = 'REJECTED',
        cancelled_at   = now(),
        updated_at     = now()
    WHERE id = v_req.commerce_order_id;
  END IF;

  -- Payment log — IF NOT EXISTS replaces ON CONFLICT DO NOTHING
  -- (ON CONFLICT cannot target a DEFERRABLE constraint)
  IF NOT EXISTS (
    SELECT 1 FROM payment_logs
    WHERE payment_request_id = p_payment_request_id AND action = 'rejected'
  ) THEN
    INSERT INTO payment_logs (
      payment_request_id, user_id, admin_id, action, old_status, new_status, note
    ) VALUES (
      p_payment_request_id, v_req.user_id, v_admin_id,
      'rejected', v_req.status, 'rejected', p_note
    );
  END IF;

  INSERT INTO commerce_events (entity_type, entity_id, event_type, actor_user_id, metadata)
  VALUES (
    'payment_request', p_payment_request_id, 'PAYMENT_REJECTED', v_admin_id,
    jsonb_build_object('reason_code', p_reason_code, 'note', p_note)
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_commerce_payment(uuid, text, text) TO authenticated;
