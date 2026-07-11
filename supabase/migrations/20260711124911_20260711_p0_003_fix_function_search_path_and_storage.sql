/*
# Security Hardening P0-003: Fix SECURITY DEFINER Function search_path + Storage Policies

## Summary

### Part A — Function search_path
SECURITY DEFINER functions without a fixed `search_path` are vulnerable to
search-path injection: a malicious user can create objects in a schema that
appears before `public` and intercept function calls. Each function below is
recreated with `SET search_path = public, pg_catalog` and all table references
schema-qualified to `public.`.

Functions fixed (exact signatures preserved):
- public.is_admin()
- public.make_user_admin(user_email text)
- public.claim_daily_login()
- public.get_daily_login_status()
- public.generate_case_code()
- public.claim_fulfillment_case(p_case_id uuid, p_admin_id uuid)
- public.create_fulfillment_case(13-arg form)
- public.update_fulfillment_case_status(p_case_id uuid, p_new_status text, ...)
- public.send_fulfillment_message(p_case_id uuid, p_body text, ...)
- public.mark_fulfillment_thread_read(p_thread_id uuid)

### Part B — Storage Policies
Avatar bucket: restrict UPDATE/DELETE to object owner (own uid in path folder).
Magic-chest-images: restrict INSERT/UPDATE/DELETE to admins only (these are
admin-managed banners, not user uploads).
payment-proofs: already correct — owner-scoped upload, admin read. No changes.
prize-icons: already correct — admin-only write, public read. No changes.
*/

-- ============================================================
-- PART A: Fix search_path on SECURITY DEFINER functions
-- ============================================================

-- is_admin()
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  RETURN auth.jwt()->>'role' = 'admin' OR auth.jwt()->>'role' = 'super_admin';
END;
$$;

-- make_user_admin(user_email text)
CREATE OR REPLACE FUNCTION public.make_user_admin(user_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  target_user_id uuid;
BEGIN
  SELECT id INTO target_user_id
  FROM auth.users
  WHERE email = user_email;

  IF target_user_id IS NOT NULL THEN
    INSERT INTO public.admins (user_id, role, permissions, is_active)
    VALUES (target_user_id, 'super_admin', '["all"]'::jsonb, true)
    ON CONFLICT (user_id) DO UPDATE
    SET role = 'super_admin', is_active = true;
  END IF;
END;
$$;

-- get_daily_login_status()
CREATE OR REPLACE FUNCTION public.get_daily_login_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_today      date := (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date;
  v_streak_row public.daily_login_streaks%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false);
  END IF;

  SELECT * INTO v_streak_row
  FROM public.daily_login_streaks
  WHERE user_id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success',         true,
      'current_streak',  0,
      'already_claimed', false,
      'last_claim_date', null
    );
  END IF;

  RETURN jsonb_build_object(
    'success',         true,
    'current_streak',  v_streak_row.current_streak,
    'already_claimed', v_streak_row.last_claim_date = v_today,
    'last_claim_date', v_streak_row.last_claim_date
  );
END;
$$;

-- claim_daily_login()
CREATE OR REPLACE FUNCTION public.claim_daily_login()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user_id        uuid := auth.uid();
  v_today          date := (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date;
  v_streak_row     public.daily_login_streaks%ROWTYPE;
  v_new_streak     int;
  v_day_number     int;
  v_points         int;
  v_reward_points  int[] := ARRAY[50, 75, 100, 150, 200, 250, 500];
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthenticated');
  END IF;

  INSERT INTO public.daily_login_streaks (user_id, current_streak, last_claim_date, total_claims)
  VALUES (v_user_id, 0, NULL, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_streak_row
  FROM public.daily_login_streaks
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_streak_row.last_claim_date = v_today THEN
    RETURN jsonb_build_object(
      'success',         false,
      'already_claimed', true,
      'current_streak',  v_streak_row.current_streak,
      'day_number',      v_streak_row.current_streak
    );
  END IF;

  IF v_streak_row.last_claim_date IS NULL THEN
    v_new_streak := 1;
  ELSIF v_streak_row.last_claim_date = v_today - INTERVAL '1 day' THEN
    v_new_streak := LEAST(v_streak_row.current_streak + 1, 7);
    IF v_streak_row.current_streak >= 7 THEN
      v_new_streak := 1;
    END IF;
  ELSE
    v_new_streak := 1;
  END IF;

  v_day_number := v_new_streak;
  v_points     := v_reward_points[v_day_number];

  INSERT INTO public.daily_login_claims (user_id, claim_date, day_number, points_awarded, streak_count)
  VALUES (v_user_id, v_today, v_day_number, v_points, v_new_streak)
  ON CONFLICT (user_id, claim_date) DO NOTHING;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success',         false,
      'already_claimed', true,
      'current_streak',  v_streak_row.current_streak,
      'day_number',      v_streak_row.current_streak
    );
  END IF;

  UPDATE public.daily_login_streaks SET
    current_streak  = v_new_streak,
    last_claim_date = v_today,
    total_claims    = total_claims + 1,
    updated_at      = now()
  WHERE user_id = v_user_id;

  UPDATE public.users SET
    points = points + v_points
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success',         true,
    'already_claimed', false,
    'points_awarded',  v_points,
    'day_number',      v_day_number,
    'current_streak',  v_new_streak
  );
END;
$$;

-- generate_case_code()
CREATE OR REPLACE FUNCTION public.generate_case_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_code  text;
  v_year  text := to_char(now(), 'YY');
  v_month text := to_char(now(), 'MM');
BEGIN
  LOOP
    v_code := 'AX-' || v_year || v_month || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 5));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.fulfillment_cases WHERE case_code = v_code);
  END LOOP;
  RETURN v_code;
END;
$$;

-- mark_fulfillment_thread_read(p_thread_id uuid)
CREATE OR REPLACE FUNCTION public.mark_fulfillment_thread_read(p_thread_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  INSERT INTO public.fulfillment_unread (thread_id, user_id, unread_count, last_read_at)
  VALUES (p_thread_id, auth.uid(), 0, now())
  ON CONFLICT (thread_id, user_id) DO UPDATE
  SET unread_count = 0, last_read_at = now();
END;
$$;

-- claim_fulfillment_case(p_case_id uuid, p_admin_id uuid)
CREATE OR REPLACE FUNCTION public.claim_fulfillment_case(
  p_case_id  uuid,
  p_admin_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_admin_id uuid := COALESCE(p_admin_id, auth.uid());
  v_rows     int;
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  UPDATE public.fulfillment_cases SET
    assigned_admin_id = v_admin_id,
    assigned_at       = now(),
    status            = CASE WHEN status = 'NEW' OR status = 'READY_FOR_FULFILLMENT'
                             THEN 'ASSIGNED'::fulfillment_status
                             ELSE status END,
    last_activity_at  = now(),
    updated_at        = now()
  WHERE id = p_case_id
    AND (assigned_admin_id IS NULL OR assigned_admin_id = v_admin_id)
    AND status NOT IN ('FULFILLED', 'CANCELLED');

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_claimed');
  END IF;

  INSERT INTO public.fulfillment_case_events (
    case_id, event_type, actor_id, actor_type, metadata
  ) VALUES (
    p_case_id, 'ASSIGNED', v_admin_id, 'admin',
    jsonb_build_object('admin_id', v_admin_id)
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- send_fulfillment_message (8-param form)
CREATE OR REPLACE FUNCTION public.send_fulfillment_message(
  p_case_id       uuid,
  p_body          text,
  p_message_type  text    DEFAULT 'TEXT',
  p_is_internal   boolean DEFAULT false,
  p_info_fields   text[]  DEFAULT NULL,
  p_info_response jsonb   DEFAULT NULL,
  p_secure_payload jsonb  DEFAULT NULL,
  p_client_req_id text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_thread_id   uuid;
  v_sender_id   uuid := auth.uid();
  v_sender_type text;
  v_msg_id      uuid;
  v_case        public.fulfillment_cases;
BEGIN
  SELECT * INTO v_case FROM public.fulfillment_cases WHERE id = p_case_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'case_not_found');
  END IF;

  IF NOT public.is_current_user_admin() AND v_case.user_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;
  IF v_case.status IN ('FULFILLED', 'CANCELLED') THEN
    RETURN jsonb_build_object('success', false, 'error', 'case_closed');
  END IF;
  IF p_is_internal AND NOT public.is_current_user_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  v_sender_type := CASE WHEN public.is_current_user_admin() THEN 'admin' ELSE 'user' END;

  SELECT id INTO v_thread_id FROM public.fulfillment_threads WHERE case_id = p_case_id;
  IF v_thread_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'thread_not_found');
  END IF;

  INSERT INTO public.fulfillment_messages (
    thread_id, case_id, sender_id, sender_type, message_type,
    body, is_internal, info_fields, info_response,
    secure_payload, client_request_id
  ) VALUES (
    v_thread_id, p_case_id, v_sender_id, v_sender_type,
    p_message_type::fulfillment_message_type,
    p_body, p_is_internal, p_info_fields, p_info_response,
    p_secure_payload, p_client_req_id
  )
  ON CONFLICT (thread_id, sender_id, client_request_id) DO NOTHING
  RETURNING id INTO v_msg_id;

  IF v_msg_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true);
  END IF;

  UPDATE public.fulfillment_cases SET last_activity_at = now(), updated_at = now()
  WHERE id = p_case_id;

  IF p_info_response IS NOT NULL AND v_sender_type = 'user' THEN
    INSERT INTO public.fulfillment_case_events (
      case_id, event_type, actor_id, actor_type, metadata
    ) VALUES (
      p_case_id, 'USER_INFO_SUBMITTED', v_sender_id, 'user',
      jsonb_build_object('fields', p_info_fields)
    );
    IF v_case.status = 'AWAITING_USER_INFO' THEN
      UPDATE public.fulfillment_cases SET status = 'READY_FOR_FULFILLMENT', updated_at = now()
      WHERE id = p_case_id;
    END IF;
  END IF;

  IF v_sender_type = 'user' THEN
    INSERT INTO public.fulfillment_unread (thread_id, user_id, unread_count)
    SELECT v_thread_id, v_sender_id, 0
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.fulfillment_unread (thread_id, user_id, unread_count)
    VALUES (v_thread_id, v_case.user_id, 1)
    ON CONFLICT (thread_id, user_id) DO UPDATE
    SET unread_count = public.fulfillment_unread.unread_count + 1;
  END IF;

  RETURN jsonb_build_object('success', true, 'message_id', v_msg_id, 'duplicate', false);
END;
$$;

-- update_fulfillment_case_status (6-param form)
CREATE OR REPLACE FUNCTION public.update_fulfillment_case_status(
  p_case_id       uuid,
  p_new_status    text,
  p_actor_id      uuid    DEFAULT NULL,
  p_actor_type    text    DEFAULT 'admin',
  p_note          text    DEFAULT NULL,
  p_dispute_reason text   DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_case      public.fulfillment_cases;
  v_new       fulfillment_status;
  v_allowed   fulfillment_status[];
  v_thread_id uuid;
  v_actor     uuid := COALESCE(p_actor_id, auth.uid());
BEGIN
  SELECT * INTO v_case FROM public.fulfillment_cases WHERE id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'case_not_found');
  END IF;

  IF NOT public.is_current_user_admin() THEN
    IF v_case.user_id != auth.uid() THEN
      RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
    END IF;
    IF p_new_status NOT IN ('FULFILLED', 'DISPUTED') THEN
      RETURN jsonb_build_object('success', false, 'error', 'unauthorized_transition');
    END IF;
    IF p_new_status = 'FULFILLED' AND v_case.status != 'DELIVERED_PENDING_CONFIRMATION' THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_transition');
    END IF;
    IF p_new_status = 'DISPUTED' AND v_case.status != 'DELIVERED_PENDING_CONFIRMATION' THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_transition');
    END IF;
  END IF;

  v_new := p_new_status::fulfillment_status;

  IF public.is_current_user_admin() THEN
    v_allowed := CASE v_case.status
      WHEN 'NEW'                            THEN ARRAY['AWAITING_USER_INFO','READY_FOR_FULFILLMENT','ASSIGNED','PROCESSING','CANCELLED']::fulfillment_status[]
      WHEN 'AWAITING_USER_INFO'             THEN ARRAY['READY_FOR_FULFILLMENT','ASSIGNED','PROCESSING','CANCELLED']::fulfillment_status[]
      WHEN 'READY_FOR_FULFILLMENT'          THEN ARRAY['ASSIGNED','PROCESSING','CANCELLED']::fulfillment_status[]
      WHEN 'ASSIGNED'                       THEN ARRAY['PROCESSING','CANCELLED','READY_FOR_FULFILLMENT']::fulfillment_status[]
      WHEN 'PROCESSING'                     THEN ARRAY['DELIVERED_PENDING_CONFIRMATION','CANCELLED']::fulfillment_status[]
      WHEN 'DELIVERED_PENDING_CONFIRMATION' THEN ARRAY['FULFILLED','DISPUTED','PROCESSING']::fulfillment_status[]
      WHEN 'DISPUTED'                       THEN ARRAY['PROCESSING','FULFILLED','CANCELLED']::fulfillment_status[]
      ELSE ARRAY[]::fulfillment_status[]
    END;

    IF NOT (v_new = ANY(v_allowed)) THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_transition',
        'from', v_case.status, 'to', v_new);
    END IF;
  END IF;

  UPDATE public.fulfillment_cases SET
    status                            = v_new,
    last_activity_at                  = now(),
    updated_at                        = now(),
    assigned_at                       = CASE WHEN v_new = 'ASSIGNED' THEN now() ELSE assigned_at END,
    processing_started_at             = CASE WHEN v_new = 'PROCESSING' AND processing_started_at IS NULL THEN now() ELSE processing_started_at END,
    delivered_at                      = CASE WHEN v_new = 'DELIVERED_PENDING_CONFIRMATION' THEN now() ELSE delivered_at END,
    confirmed_at                      = CASE WHEN v_new = 'FULFILLED' THEN now() ELSE confirmed_at END,
    cancelled_at                      = CASE WHEN v_new = 'CANCELLED' THEN now() ELSE cancelled_at END,
    dispute_reason                    = CASE WHEN v_new = 'DISPUTED' THEN p_dispute_reason ELSE dispute_reason END,
    dispute_opened_at                 = CASE WHEN v_new = 'DISPUTED' THEN now() ELSE dispute_opened_at END
  WHERE id = p_case_id;

  INSERT INTO public.fulfillment_case_events (
    case_id, event_type, actor_id, actor_type, previous_status, new_status, metadata
  ) VALUES (
    p_case_id,
    CASE v_new
      WHEN 'FULFILLED'                      THEN 'USER_CONFIRMED'
      WHEN 'DISPUTED'                       THEN 'DISPUTE_OPENED'
      WHEN 'CANCELLED'                      THEN 'CASE_CANCELLED'
      WHEN 'DELIVERED_PENDING_CONFIRMATION' THEN 'DELIVERY_SENT'
      WHEN 'PROCESSING'                     THEN 'PROCESSING_STARTED'
      ELSE                                       'STATUS_CHANGED'
    END::fulfillment_event_type,
    v_actor, p_actor_type, v_case.status, v_new,
    jsonb_build_object('note', p_note, 'dispute_reason', p_dispute_reason)
  );

  SELECT id INTO v_thread_id FROM public.fulfillment_threads WHERE case_id = p_case_id;
  IF v_thread_id IS NOT NULL THEN
    INSERT INTO public.fulfillment_messages (
      thread_id, case_id, sender_id, sender_type, message_type, body, is_internal
    ) VALUES (
      v_thread_id, p_case_id, v_actor, p_actor_type, 'STATUS_EVENT',
      p_new_status,
      false
    );
  END IF;

  IF v_new = 'FULFILLED' THEN
    UPDATE public.reward_grants SET status = 'delivered', updated_at = now()
    WHERE id = v_case.reward_grant_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'status', v_new);
END;
$$;

-- create_fulfillment_case (13-param form)
CREATE OR REPLACE FUNCTION public.create_fulfillment_case(
  p_reward_grant_id   uuid,
  p_spin_id           uuid    DEFAULT NULL,
  p_user_id           uuid    DEFAULT NULL,
  p_prize_id          text    DEFAULT NULL,
  p_prize_name_ar     text    DEFAULT NULL,
  p_prize_name_en     text    DEFAULT NULL,
  p_prize_type        text    DEFAULT NULL,
  p_prize_value       text    DEFAULT NULL,
  p_prize_icon_url    text    DEFAULT NULL,
  p_prize_accent      text    DEFAULT NULL,
  p_prize_rarity      text    DEFAULT NULL,
  p_delivery_minutes  integer DEFAULT 1440,
  p_required_fields   text[]  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_case_id   uuid;
  v_thread_id uuid;
  v_case_code text;
  v_user_id   uuid := COALESCE(p_user_id, auth.uid());
  v_sla_due   timestamptz := now() + (p_delivery_minutes || ' minutes')::interval;
  v_existing  uuid;
BEGIN
  SELECT id INTO v_existing FROM public.fulfillment_cases WHERE reward_grant_id = p_reward_grant_id;
  IF FOUND THEN
    SELECT ft.id INTO v_thread_id
    FROM public.fulfillment_threads ft
    JOIN public.fulfillment_cases fc ON fc.id = ft.case_id
    WHERE fc.id = v_existing;
    RETURN jsonb_build_object('case_id', v_existing, 'thread_id', v_thread_id, 'existed', true);
  END IF;

  v_case_code := public.generate_case_code();

  INSERT INTO public.fulfillment_cases (
    case_code, reward_grant_id, spin_id, user_id,
    prize_id, prize_name_ar, prize_name_en, prize_type, prize_value,
    prize_icon_url, prize_accent_color, prize_rarity,
    expected_delivery_minutes, required_user_fields,
    sla_due_at, status, priority
  ) VALUES (
    v_case_code, p_reward_grant_id, p_spin_id, v_user_id,
    p_prize_id, p_prize_name_ar, p_prize_name_en, p_prize_type, p_prize_value,
    p_prize_icon_url, p_prize_accent, p_prize_rarity,
    p_delivery_minutes, p_required_fields,
    v_sla_due,
    CASE WHEN p_required_fields IS NOT NULL AND array_length(p_required_fields, 1) > 0
         THEN 'AWAITING_USER_INFO'::fulfillment_status
         ELSE 'NEW'::fulfillment_status
    END,
    'NORMAL'
  ) RETURNING id INTO v_case_id;

  INSERT INTO public.fulfillment_threads (case_id) VALUES (v_case_id) RETURNING id INTO v_thread_id;

  INSERT INTO public.fulfillment_messages (
    thread_id, case_id, sender_type, message_type, body, is_internal
  ) VALUES (
    v_thread_id, v_case_id, 'system', 'SYSTEM',
    'مبروك! تم تسجيل جائزتك بنجاح. سيقوم فريق أكسي بمتابعة عملية التسليم من خلال هذه المحادثة الخاصة.',
    false
  );

  IF p_required_fields IS NOT NULL AND array_length(p_required_fields, 1) > 0 THEN
    INSERT INTO public.fulfillment_messages (
      thread_id, case_id, sender_type, message_type, body, info_fields, is_internal
    ) VALUES (
      v_thread_id, v_case_id, 'system', 'INFO_REQUEST',
      'لإكمال تسليم جائزتك نحتاج بعض المعلومات. يرجى تعبئة البيانات المطلوبة أدناه.',
      p_required_fields,
      false
    );
  END IF;

  INSERT INTO public.fulfillment_case_events (
    case_id, event_type, actor_type, new_status, metadata
  ) VALUES (
    v_case_id, 'CASE_CREATED', 'system', 'NEW'::fulfillment_status,
    jsonb_build_object('prize_id', p_prize_id, 'prize_name_en', p_prize_name_en)
  );

  INSERT INTO public.fulfillment_unread (thread_id, user_id, unread_count)
  VALUES (v_thread_id, v_user_id, 1)
  ON CONFLICT (thread_id, user_id) DO NOTHING;

  RETURN jsonb_build_object(
    'case_id',   v_case_id,
    'thread_id', v_thread_id,
    'case_code', v_case_code,
    'existed',   false
  );
END;
$$;

-- ============================================================
-- PART B: Storage Policy Fixes
-- ============================================================

-- AVATARS: Restrict UPDATE and DELETE to object owner
-- (owner = UID matches first path segment per Supabase storage convention)

DROP POLICY IF EXISTS "Authenticated can update avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload avatars" ON storage.objects;

CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

CREATE POLICY "Users can delete own avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

-- MAGIC-CHEST-IMAGES: Admin-only upload/update/delete
-- These are admin-managed banner images, not user uploads.

DROP POLICY IF EXISTS "Authenticated can upload magic chest images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete magic chest images" ON storage.objects;

CREATE POLICY "Admins can upload magic chest images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'magic-chest-images' AND public.is_admin());

CREATE POLICY "Admins can delete magic chest images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'magic-chest-images' AND public.is_admin());
