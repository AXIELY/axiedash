/*
# Phase 2 — Fix Payment Review RPCs

## Summary
The RPCs written in the previous session (request_payment_information 4-param and
resubmit_payment_information) have three bugs:
1. Used `sender_role` — actual column is `sender_type`
2. Used `'OPEN'` as fulfillment_cases.status — actual enum values are NEW, AWAITING_USER_INFO, etc.
3. Used `updated_at` in fulfillment_unread — that column does not exist

This migration replaces both RPCs with corrected versions.
Also drops the old 3-param request_payment_information to eliminate ambiguity.

## Changes
- DROP old request_payment_information(uuid, text, text) — obsolete 3-param version
- REPLACE request_payment_information(uuid, text, text, text) — fixed column names
- REPLACE resubmit_payment_information — fixed column names
- Add get_my_orders RPC — returns all commerce_orders for current user with denormalized fields
- Add create_or_get_order_case RPC — idempotent case creation per order
*/

-- ============================================================
-- 1. Drop the old broken 3-param version
-- ============================================================
DROP FUNCTION IF EXISTS public.request_payment_information(uuid, text, text);

-- ============================================================
-- 2. Fix request_payment_information (admin action)
-- ============================================================
CREATE OR REPLACE FUNCTION public.request_payment_information(
  p_payment_request_id uuid,
  p_reason_code        text DEFAULT NULL,
  p_message            text DEFAULT NULL,
  p_internal_note      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_admin_id   uuid := auth.uid();
  v_payment    RECORD;
  v_case_id    uuid;
  v_thread_id  uuid;
  v_case_code  text;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Load payment request + owning user
  SELECT pr.*, co.user_id AS owner_id, co.id AS order_id
  INTO v_payment
  FROM public.payment_requests pr
  JOIN public.commerce_orders co ON co.id = pr.commerce_order_id
  WHERE pr.id = p_payment_request_id;

  IF NOT FOUND THEN
    -- Try fallback: payment request might not yet have commerce_order_id
    SELECT pr.*, pr.user_id AS owner_id, NULL::uuid AS order_id
    INTO v_payment
    FROM public.payment_requests pr
    WHERE pr.id = p_payment_request_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Payment request not found'; END IF;
  END IF;

  -- Update payment_request status
  UPDATE public.payment_requests SET
    status                   = 'needs_info',
    rejection_reason_code    = COALESCE(p_reason_code, rejection_reason_code),
    admin_note               = COALESCE(p_internal_note, admin_note),
    needs_info_requested_at  = COALESCE(needs_info_requested_at, now()),
    needs_info_requested_by  = COALESCE(needs_info_requested_by, v_admin_id),
    updated_at               = now()
  WHERE id = p_payment_request_id;

  -- Update commerce_order payment_status
  IF v_payment.order_id IS NOT NULL THEN
    UPDATE public.commerce_orders SET
      payment_status = 'NEEDS_INFO',
      updated_at     = now()
    WHERE id = v_payment.order_id;
  END IF;

  -- Check for existing PAYMENT_REVIEW case (idempotent)
  SELECT id INTO v_case_id
  FROM public.fulfillment_cases
  WHERE payment_request_id = p_payment_request_id;

  IF v_case_id IS NULL THEN
    v_case_code := 'PR-' || upper(substring(p_payment_request_id::text, 1, 8));

    INSERT INTO public.fulfillment_cases (
      user_id, source, status, case_code, payment_request_id,
      commerce_order_id, commerce_payment_id, reward_grant_id
    ) VALUES (
      v_payment.owner_id,
      'PAYMENT_REVIEW',
      'NEW',                   -- valid enum value
      v_case_code,
      p_payment_request_id,
      v_payment.order_id,
      p_payment_request_id,
      NULL
    )
    RETURNING id INTO v_case_id;

    -- Create thread
    INSERT INTO public.fulfillment_threads (case_id, status)
    VALUES (v_case_id, 'OPEN')
    RETURNING id INTO v_thread_id;

    -- Opening system message
    INSERT INTO public.fulfillment_messages (
      thread_id, sender_id, sender_type, message_type, body, is_internal
    ) VALUES (
      v_thread_id, v_admin_id, 'admin', 'STATUS_EVENT',
      '{"event":"NEEDS_INFO_OPENED"}', false
    );

    -- Save case link on payment_request
    UPDATE public.payment_requests SET needs_info_case_id = v_case_id
    WHERE id = p_payment_request_id;

  ELSE
    -- Retrieve existing thread
    SELECT id INTO v_thread_id
    FROM public.fulfillment_threads
    WHERE case_id = v_case_id
    ORDER BY created_at
    LIMIT 1;

    UPDATE public.fulfillment_threads SET status = 'OPEN' WHERE id = v_thread_id;
  END IF;

  -- Post user-visible admin message
  IF p_message IS NOT NULL AND trim(p_message) <> '' THEN
    INSERT INTO public.fulfillment_messages (
      thread_id, sender_id, sender_type, message_type, body, is_internal
    ) VALUES (
      v_thread_id, v_admin_id, 'admin', 'INFO_REQUEST',
      jsonb_build_object('text', p_message, 'reason_code', p_reason_code)::text,
      false
    );
  END IF;

  -- Internal note (hidden from user)
  IF p_internal_note IS NOT NULL AND trim(p_internal_note) <> '' THEN
    INSERT INTO public.fulfillment_messages (
      thread_id, sender_id, sender_type, message_type, body, is_internal
    ) VALUES (
      v_thread_id, v_admin_id, 'admin', 'INTERNAL_NOTE',
      jsonb_build_object('text', p_internal_note)::text,
      true
    );
  END IF;

  -- Unread marker for user (no updated_at column on fulfillment_unread)
  INSERT INTO public.fulfillment_unread (thread_id, user_id, unread_count)
  VALUES (v_thread_id, v_payment.owner_id, 1)
  ON CONFLICT (thread_id, user_id) DO UPDATE
    SET unread_count = fulfillment_unread.unread_count + 1,
        last_read_at = fulfillment_unread.last_read_at;

  -- Commerce event log
  INSERT INTO public.commerce_events (
    entity_type, entity_id, event_type, actor_user_id, metadata
  ) VALUES (
    'payment_request', p_payment_request_id, 'INFORMATION_REQUESTED', v_admin_id,
    jsonb_build_object('reason_code', p_reason_code, 'case_id', v_case_id, 'thread_id', v_thread_id)
  );

  RETURN jsonb_build_object(
    'ok',        true,
    'case_id',   v_case_id,
    'thread_id', v_thread_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_payment_information(uuid, text, text, text) TO authenticated;

-- ============================================================
-- 3. Fix resubmit_payment_information (user action)
-- ============================================================
CREATE OR REPLACE FUNCTION public.resubmit_payment_information(
  p_payment_request_id  uuid,
  p_proof_id            uuid    DEFAULT NULL,
  p_external_reference  text    DEFAULT NULL,
  p_payer_phone         text    DEFAULT NULL,
  p_message             text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user_id   uuid := auth.uid();
  v_payment   RECORD;
  v_thread_id uuid;
  v_case_id   uuid;
  v_admin_id  uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Load + verify ownership
  SELECT pr.*, co.user_id AS owner_id, co.id AS order_id
  INTO v_payment
  FROM public.payment_requests pr
  JOIN public.commerce_orders co ON co.id = pr.commerce_order_id
  WHERE pr.id = p_payment_request_id
    AND co.user_id = v_user_id;

  IF NOT FOUND THEN
    -- Try without commerce_order join (legacy path)
    SELECT pr.*, pr.user_id AS owner_id, NULL::uuid AS order_id
    INTO v_payment
    FROM public.payment_requests pr
    WHERE pr.id = p_payment_request_id
      AND pr.user_id = v_user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Payment request not found or not yours'; END IF;
  END IF;

  IF lower(v_payment.status) <> 'needs_info' THEN
    RAISE EXCEPTION 'Payment request is not in needs_info status';
  END IF;

  -- Get thread
  SELECT fc.id, ft.id
  INTO v_case_id, v_thread_id
  FROM public.fulfillment_cases fc
  JOIN public.fulfillment_threads ft ON ft.case_id = fc.id
  WHERE fc.payment_request_id = p_payment_request_id
  ORDER BY ft.created_at
  LIMIT 1;

  IF v_thread_id IS NULL THEN
    RAISE EXCEPTION 'No communication thread found for this payment request';
  END IF;

  -- Update payment_request
  UPDATE public.payment_requests SET
    status                 = 'submitted',
    resubmitted_at         = now(),
    needs_info_resolved_at = now(),
    proof_image_url        = COALESCE(p_proof_id::text, proof_image_url),
    reference_number       = COALESCE(p_external_reference, reference_number),
    sender_phone           = COALESCE(p_payer_phone, sender_phone),
    updated_at             = now()
  WHERE id = p_payment_request_id;

  -- Update commerce_order payment_status
  IF v_payment.order_id IS NOT NULL THEN
    UPDATE public.commerce_orders SET
      payment_status = 'SUBMITTED',
      updated_at     = now()
    WHERE id = v_payment.order_id;
  END IF;

  -- Post user's reply message
  IF p_message IS NOT NULL AND trim(p_message) <> '' THEN
    INSERT INTO public.fulfillment_messages (
      thread_id, sender_id, sender_type, message_type, body, is_internal
    ) VALUES (
      v_thread_id, v_user_id, 'user', 'TEXT',
      jsonb_build_object('text', p_message)::text,
      false
    );
  END IF;

  -- Status event
  INSERT INTO public.fulfillment_messages (
    thread_id, sender_id, sender_type, message_type, body, is_internal
  ) VALUES (
    v_thread_id, v_user_id, 'user', 'STATUS_EVENT',
    '{"event":"RESUBMITTED"}', false
  );

  -- Mark unread for admins who replied
  FOR v_admin_id IN
    SELECT DISTINCT fm.sender_id
    FROM public.fulfillment_messages fm
    WHERE fm.thread_id = v_thread_id
      AND fm.sender_type = 'admin'
      AND fm.sender_id IS NOT NULL
  LOOP
    INSERT INTO public.fulfillment_unread (thread_id, user_id, unread_count)
    VALUES (v_thread_id, v_admin_id, 1)
    ON CONFLICT (thread_id, user_id) DO UPDATE
      SET unread_count = fulfillment_unread.unread_count + 1;
  END LOOP;

  -- Commerce event
  INSERT INTO public.commerce_events (
    entity_type, entity_id, event_type, actor_user_id, metadata
  ) VALUES (
    'payment_request', p_payment_request_id, 'INFORMATION_RESUBMITTED', v_user_id,
    jsonb_build_object('case_id', v_case_id, 'thread_id', v_thread_id)
  );

  RETURN jsonb_build_object('ok', true, 'case_id', v_case_id, 'thread_id', v_thread_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.resubmit_payment_information(uuid, uuid, text, text, text) TO authenticated;

-- ============================================================
-- 4. get_my_orders — authoritative user-facing order list
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_orders(
  p_status_filter text DEFAULT NULL,
  p_type_filter   text DEFAULT NULL,
  p_limit         integer DEFAULT 50,
  p_offset        integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_result  jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT jsonb_agg(row_to_json(q)) INTO v_result
  FROM (
    SELECT
      co.id,
      co.order_code,
      co.order_type,
      co.source,
      co.order_status,
      co.payment_status,
      co.fulfillment_status,
      co.currency,
      co.subtotal_snapshot,
      co.promotion_discount_snapshot,
      co.coupon_discount_snapshot,
      co.fees_snapshot,
      co.final_total_snapshot,
      co.customer_input_snapshot,
      co.submitted_at,
      co.paid_at,
      co.completed_at,
      co.cancelled_at,
      co.created_at,
      co.updated_at,
      -- Latest order item (name snapshot)
      (SELECT jsonb_build_object(
        'item_type',            oi.item_type,
        'item_name_ar',         oi.item_name_ar_snapshot,
        'item_name_en',         oi.item_name_en_snapshot,
        'total_points',         oi.total_points_snapshot,
        'unit_price',           oi.unit_price_snapshot
      )
       FROM public.commerce_order_items oi WHERE oi.order_id = co.id LIMIT 1
      ) AS item,
      -- Payment request
      (SELECT jsonb_build_object(
        'id',                   pr.id,
        'request_code',         pr.request_code,
        'status',               pr.status,
        'amount',               pr.amount,
        'payment_method_code',  pr.payment_method_code,
        'admin_note',           pr.admin_note,
        'rejection_reason',     pr.rejection_reason,
        'rejection_reason_code',pr.rejection_reason_code,
        'needs_info_case_id',   pr.needs_info_case_id,
        'resubmitted_at',       pr.resubmitted_at,
        'proof_image_url',      pr.proof_image_url,
        'reference_number',     pr.reference_number,
        'created_at',           pr.created_at
      )
       FROM public.payment_requests pr WHERE pr.commerce_order_id = co.id ORDER BY pr.created_at DESC LIMIT 1
      ) AS payment,
      -- Unread count from private case
      COALESCE((
        SELECT SUM(fu.unread_count)
        FROM public.fulfillment_cases fc
        JOIN public.fulfillment_threads ft ON ft.case_id = fc.id
        JOIN public.fulfillment_unread fu ON fu.thread_id = ft.id AND fu.user_id = v_user_id
        WHERE fc.commerce_order_id = co.id
      ), 0) AS unread_count,
      -- Action required derived flag
      CASE
        WHEN co.payment_status IN ('NEEDS_INFO', 'needs_info') THEN true
        WHEN co.fulfillment_status = 'AWAITING_USER_INFO' THEN true
        ELSE false
      END AS requires_user_action
    FROM public.commerce_orders co
    WHERE co.user_id = v_user_id
      AND (p_status_filter IS NULL OR co.order_status = p_status_filter OR co.payment_status = p_status_filter)
      AND (p_type_filter IS NULL OR co.order_type = p_type_filter)
    ORDER BY
      -- Pinned: action required first
      CASE WHEN co.payment_status IN ('NEEDS_INFO','needs_info') OR co.fulfillment_status = 'AWAITING_USER_INFO' THEN 0 ELSE 1 END,
      co.created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  ) q;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_orders(text, text, integer, integer) TO authenticated;

-- ============================================================
-- 5. create_or_get_order_case — idempotent per-order case
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_or_get_order_case(
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_order     RECORD;
  v_case_id   uuid;
  v_thread_id uuid;
  v_case_code text;
BEGIN
  IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_order FROM public.commerce_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  -- Only owner or admin can access
  IF v_order.user_id <> v_caller_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- Check for existing case
  SELECT id INTO v_case_id
  FROM public.fulfillment_cases
  WHERE commerce_order_id = p_order_id AND source = 'ORDER'
  LIMIT 1;

  IF v_case_id IS NOT NULL THEN
    SELECT id INTO v_thread_id
    FROM public.fulfillment_threads WHERE case_id = v_case_id LIMIT 1;
    RETURN jsonb_build_object('case_id', v_case_id, 'thread_id', v_thread_id, 'status', 'existing');
  END IF;

  -- Create new case
  v_case_code := 'ORD-' || upper(substring(p_order_id::text, 1, 8));

  INSERT INTO public.fulfillment_cases (
    user_id, source, status, case_code, commerce_order_id, reward_grant_id
  ) VALUES (
    v_order.user_id, 'ORDER', 'NEW', v_case_code, p_order_id, NULL
  )
  RETURNING id INTO v_case_id;

  INSERT INTO public.fulfillment_threads (case_id, status)
  VALUES (v_case_id, 'OPEN')
  RETURNING id INTO v_thread_id;

  INSERT INTO public.fulfillment_messages (
    thread_id, sender_id, sender_type, message_type, body, is_internal
  ) VALUES (
    v_thread_id, v_order.user_id, 'system', 'STATUS_EVENT',
    '{"event":"ORDER_CASE_OPENED"}', false
  );

  RETURN jsonb_build_object('case_id', v_case_id, 'thread_id', v_thread_id, 'status', 'created');
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_or_get_order_case(uuid) TO authenticated;

-- ============================================================
-- 6. Add 'ORDER' as valid source in fulfillment_cases
-- (source column is TEXT so no enum to update)
-- ============================================================

-- Ensure commerce_orders.payment_status can hold NEEDS_INFO / SUBMITTED etc.
-- (it's already TEXT, so no action needed)

-- ============================================================
-- 7. Ensure RLS: users can read their own commerce_orders + items
-- ============================================================
DROP POLICY IF EXISTS "users_read_own_commerce_orders" ON public.commerce_orders;
CREATE POLICY "users_read_own_commerce_orders" ON public.commerce_orders
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "users_read_own_order_items" ON public.commerce_order_items;
CREATE POLICY "users_read_own_order_items" ON public.commerce_order_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.commerce_orders co
      WHERE co.id = commerce_order_items.order_id
        AND co.user_id = auth.uid()
    )
  );
