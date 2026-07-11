/*
# Payment Review RPCs — request_payment_information + resubmit_payment_information

## Summary
Replaces the minimal `request_payment_information` function with a full implementation
that creates a private fulfillment case/thread and posts the admin's message into it.
Adds `resubmit_payment_information` so users can reply and re-submit their documents
through the same thread.

## Changes

### request_payment_information (replaced)
- Creates or retrieves a PAYMENT_REVIEW fulfillment case (idempotent via payment_request_id UNIQUE)
- Creates a fulfillment thread linked to the case
- Posts the admin's user-visible message into the thread
- Creates an unread marker for the user
- Saves needs_info_case_id, needs_info_requested_at, needs_info_requested_by on payment_request
- Returns case_id and thread_id so the admin can link directly to the conversation

### resubmit_payment_information (new)
- Owner-only: verifies payment_request.user_id = auth.uid()
- Status guard: must be needs_info
- Accepts new proof details and a message
- Updates payment_request: status submitted, sets resubmitted_at
- Posts user message to the existing thread
- Marks admin side as unread

## Security
Both functions use SECURITY DEFINER + SET search_path = public, pg_catalog
*/

-- ============================================================
-- 1. request_payment_information (admin action)
-- ============================================================
CREATE OR REPLACE FUNCTION public.request_payment_information(
  p_payment_request_id UUID,
  p_reason_code        TEXT DEFAULT NULL,
  p_message            TEXT DEFAULT NULL,
  p_internal_note      TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_admin_id   UUID := auth.uid();
  v_payment    RECORD;
  v_case_id    UUID;
  v_thread_id  UUID;
  v_case_code  TEXT;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT pr.*, co.user_id AS owner_id, co.package_name
  INTO v_payment
  FROM public.payment_requests pr
  JOIN public.commerce_orders co ON co.id = pr.commerce_order_id
  WHERE pr.id = p_payment_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment request not found';
  END IF;

  UPDATE public.payment_requests SET
    status                   = 'needs_info',
    rejection_reason_code    = COALESCE(p_reason_code, rejection_reason_code),
    admin_note               = COALESCE(p_internal_note, admin_note),
    needs_info_requested_at  = COALESCE(needs_info_requested_at, now()),
    needs_info_requested_by  = COALESCE(needs_info_requested_by, v_admin_id),
    updated_at               = now()
  WHERE id = p_payment_request_id;

  SELECT id INTO v_case_id
  FROM public.fulfillment_cases
  WHERE payment_request_id = p_payment_request_id;

  IF v_case_id IS NULL THEN
    v_case_code := 'PR-' || upper(substring(p_payment_request_id::text, 1, 8));

    INSERT INTO public.fulfillment_cases (
      user_id, source, status, case_code, payment_request_id,
      commerce_order_id, commerce_payment_id, reward_grant_id
    ) VALUES (
      v_payment.owner_id, 'PAYMENT_REVIEW', 'OPEN', v_case_code,
      p_payment_request_id, v_payment.commerce_order_id, p_payment_request_id, NULL
    )
    RETURNING id INTO v_case_id;

    INSERT INTO public.fulfillment_threads (case_id, status)
    VALUES (v_case_id, 'OPEN')
    RETURNING id INTO v_thread_id;

    INSERT INTO public.fulfillment_messages (
      thread_id, sender_id, sender_role, message_type, body
    ) VALUES (
      v_thread_id, v_admin_id, 'ADMIN', 'STATUS_EVENT',
      '{"event":"NEEDS_INFO_OPENED"}'
    );

    UPDATE public.payment_requests SET needs_info_case_id = v_case_id
    WHERE id = p_payment_request_id;

  ELSE
    SELECT id INTO v_thread_id
    FROM public.fulfillment_threads
    WHERE case_id = v_case_id
    ORDER BY created_at
    LIMIT 1;

    UPDATE public.fulfillment_threads SET status = 'OPEN' WHERE id = v_thread_id;
    UPDATE public.fulfillment_cases SET status = 'OPEN' WHERE id = v_case_id AND status <> 'OPEN';
  END IF;

  IF p_message IS NOT NULL AND trim(p_message) <> '' THEN
    INSERT INTO public.fulfillment_messages (
      thread_id, sender_id, sender_role, message_type, body
    ) VALUES (
      v_thread_id, v_admin_id, 'ADMIN', 'INFO_REQUEST',
      jsonb_build_object('text', p_message, 'reason_code', p_reason_code)::text
    );
  END IF;

  INSERT INTO public.fulfillment_unread (thread_id, user_id, unread_count)
  VALUES (v_thread_id, v_payment.owner_id, 1)
  ON CONFLICT (thread_id, user_id) DO UPDATE
    SET unread_count = fulfillment_unread.unread_count + 1,
        updated_at   = now();

  INSERT INTO public.commerce_events (
    order_id, payment_request_id, event_type, actor_id, metadata
  ) VALUES (
    v_payment.commerce_order_id, p_payment_request_id, 'INFORMATION_REQUESTED', v_admin_id,
    jsonb_build_object('reason_code', p_reason_code, 'case_id', v_case_id, 'thread_id', v_thread_id)
  );

  RETURN jsonb_build_object('ok', true, 'case_id', v_case_id, 'thread_id', v_thread_id);
END;
$$;

-- ============================================================
-- 2. resubmit_payment_information (user action)
-- ============================================================
CREATE OR REPLACE FUNCTION public.resubmit_payment_information(
  p_payment_request_id  UUID,
  p_proof_id            UUID    DEFAULT NULL,
  p_external_reference  TEXT    DEFAULT NULL,
  p_payer_phone         TEXT    DEFAULT NULL,
  p_message             TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user_id   UUID := auth.uid();
  v_payment   RECORD;
  v_thread_id UUID;
  v_case_id   UUID;
  v_admin_id  UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT pr.*, co.user_id AS owner_id
  INTO v_payment
  FROM public.payment_requests pr
  JOIN public.commerce_orders co ON co.id = pr.commerce_order_id
  WHERE pr.id = p_payment_request_id
    AND co.user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment request not found or not yours';
  END IF;

  IF lower(v_payment.status) <> 'needs_info' THEN
    RAISE EXCEPTION 'Payment request is not in needs_info status';
  END IF;

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

  UPDATE public.payment_requests SET
    status                 = 'submitted',
    resubmitted_at         = now(),
    needs_info_resolved_at = now(),
    proof_of_payment_id    = COALESCE(p_proof_id, proof_of_payment_id),
    external_reference     = COALESCE(p_external_reference, external_reference),
    payer_phone            = COALESCE(p_payer_phone, payer_phone),
    updated_at             = now()
  WHERE id = p_payment_request_id;

  IF p_message IS NOT NULL AND trim(p_message) <> '' THEN
    INSERT INTO public.fulfillment_messages (
      thread_id, sender_id, sender_role, message_type, body
    ) VALUES (
      v_thread_id, v_user_id, 'USER', 'TEXT',
      jsonb_build_object('text', p_message)::text
    );
  END IF;

  INSERT INTO public.fulfillment_messages (
    thread_id, sender_id, sender_role, message_type, body
  ) VALUES (
    v_thread_id, v_user_id, 'USER', 'STATUS_EVENT',
    '{"event":"RESUBMITTED"}'
  );

  -- Mark unread for each unique admin who sent a message in this thread
  FOR v_admin_id IN
    SELECT DISTINCT fm.sender_id
    FROM public.fulfillment_messages fm
    WHERE fm.thread_id = v_thread_id
      AND fm.sender_role = 'ADMIN'
      AND fm.sender_id IS NOT NULL
  LOOP
    INSERT INTO public.fulfillment_unread (thread_id, user_id, unread_count)
    VALUES (v_thread_id, v_admin_id, 1)
    ON CONFLICT (thread_id, user_id) DO UPDATE
      SET unread_count = fulfillment_unread.unread_count + 1,
          updated_at   = now();
  END LOOP;

  INSERT INTO public.commerce_events (
    order_id, payment_request_id, event_type, actor_id, metadata
  ) VALUES (
    v_payment.commerce_order_id, p_payment_request_id, 'INFORMATION_RESUBMITTED', v_user_id,
    jsonb_build_object('case_id', v_case_id, 'thread_id', v_thread_id)
  );

  RETURN jsonb_build_object('ok', true, 'case_id', v_case_id, 'thread_id', v_thread_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_payment_information(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resubmit_payment_information(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated;
