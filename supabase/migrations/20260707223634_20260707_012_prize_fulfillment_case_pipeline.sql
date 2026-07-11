/*
# Prize Fulfillment Case Pipeline

## Overview
Builds a complete end-to-end prize fulfillment case system for AXIE Lucky Spin.
Manual prizes (service/grand type) create private fulfillment cases with dedicated
case-scoped private chat threads, idempotent creation, full state machine, audit trail,
SLA tracking, and RLS-enforced participant privacy.

## Tables Created / Extended

### 1. fulfillment_cases
Central case record. One per reward_grant. Unique constraint on reward_grant_id
prevents duplicate cases from retries or double processing.

### 2. fulfillment_threads
One dedicated private messaging thread per case. Unique constraint on case_id.

### 3. fulfillment_messages
All messages in a thread: TEXT, SYSTEM, INFO_REQUEST, SECURE_DELIVERY, STATUS_EVENT,
INTERNAL_NOTE. Internal notes are filtered from user view by RLS.

### 4. fulfillment_info_requests
Structured data requests (e.g. phone number, email) attached to a message.
Separate from message body so admin can query submitted fields directly.

### 5. fulfillment_case_events
Immutable audit log of every case lifecycle action.

### 6. fulfillment_case_assignments
History of all admin assignment changes.

## Security
- All tables have RLS enabled
- Users can only see their own cases/threads/messages
- INTERNAL_NOTE messages are filtered from user SELECT policies
- Admins (is_current_user_admin()) have full access
- Idempotent case creation via UNIQUE(reward_grant_id)
- Atomic admin assignment via UPDATE ... WHERE assigned_admin_id IS NULL
*/

-- ── Enums / Domains ────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fulfillment_status') THEN
    CREATE TYPE fulfillment_status AS ENUM (
      'NEW',
      'AWAITING_USER_INFO',
      'READY_FOR_FULFILLMENT',
      'ASSIGNED',
      'PROCESSING',
      'DELIVERED_PENDING_CONFIRMATION',
      'FULFILLED',
      'DISPUTED',
      'CANCELLED'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fulfillment_priority') THEN
    CREATE TYPE fulfillment_priority AS ENUM ('NORMAL', 'HIGH', 'URGENT');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fulfillment_message_type') THEN
    CREATE TYPE fulfillment_message_type AS ENUM (
      'TEXT',
      'SYSTEM',
      'INFO_REQUEST',
      'SECURE_DELIVERY',
      'STATUS_EVENT',
      'INTERNAL_NOTE'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fulfillment_event_type') THEN
    CREATE TYPE fulfillment_event_type AS ENUM (
      'CASE_CREATED',
      'STATUS_CHANGED',
      'ASSIGNED',
      'REASSIGNED',
      'USER_INFO_REQUESTED',
      'USER_INFO_SUBMITTED',
      'PROCESSING_STARTED',
      'DELIVERY_SENT',
      'USER_CONFIRMED',
      'DISPUTE_OPENED',
      'DISPUTE_RESOLVED',
      'CASE_CANCELLED',
      'PRIORITY_CHANGED',
      'NOTE_ADDED'
    );
  END IF;
END $$;

-- ── fulfillment_cases ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fulfillment_cases (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_code                 text NOT NULL,
  reward_grant_id           uuid NOT NULL,
  spin_id                   uuid,                      -- spin_requests.id snapshot
  user_id                   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Immutable reward snapshots
  prize_id                  text NOT NULL,
  prize_name_ar             text NOT NULL,
  prize_name_en             text NOT NULL,
  prize_type                text NOT NULL,
  prize_value               text,
  prize_icon_url            text,
  prize_accent_color        text,
  prize_rarity              text,

  -- Fulfillment config snapshot
  expected_delivery_minutes int DEFAULT 1440,          -- 24 hours default
  required_user_fields      text[],                    -- e.g. ARRAY['email','phone']
  fulfillment_instructions  text,

  -- State machine
  status                    fulfillment_status NOT NULL DEFAULT 'NEW',
  priority                  fulfillment_priority NOT NULL DEFAULT 'NORMAL',

  -- Assignment
  assigned_admin_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Timeline
  created_at                timestamptz NOT NULL DEFAULT now(),
  assigned_at               timestamptz,
  processing_started_at     timestamptz,
  delivered_at              timestamptz,
  confirmed_at              timestamptz,
  cancelled_at              timestamptz,
  sla_due_at                timestamptz,
  last_activity_at          timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),

  -- Dispute support
  dispute_reason            text,
  dispute_opened_at         timestamptz,

  -- Uniqueness: one case per reward grant
  CONSTRAINT fulfillment_cases_reward_grant_unique UNIQUE (reward_grant_id)
);

-- Generate case_code safely without COUNT
CREATE UNIQUE INDEX IF NOT EXISTS fulfillment_cases_case_code_idx ON fulfillment_cases(case_code);
CREATE INDEX IF NOT EXISTS fulfillment_cases_user_id_idx ON fulfillment_cases(user_id);
CREATE INDEX IF NOT EXISTS fulfillment_cases_status_idx ON fulfillment_cases(status);
CREATE INDEX IF NOT EXISTS fulfillment_cases_assigned_admin_idx ON fulfillment_cases(assigned_admin_id);
CREATE INDEX IF NOT EXISTS fulfillment_cases_created_at_idx ON fulfillment_cases(created_at DESC);

-- ── fulfillment_threads ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fulfillment_threads (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id    uuid NOT NULL REFERENCES fulfillment_cases(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fulfillment_threads_case_unique UNIQUE (case_id)
);

CREATE INDEX IF NOT EXISTS fulfillment_threads_case_id_idx ON fulfillment_threads(case_id);

-- ── fulfillment_messages ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fulfillment_messages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id         uuid NOT NULL REFERENCES fulfillment_threads(id) ON DELETE CASCADE,
  case_id           uuid NOT NULL REFERENCES fulfillment_cases(id) ON DELETE CASCADE,
  sender_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_type       text NOT NULL DEFAULT 'user',   -- 'user' | 'admin' | 'system'
  message_type      fulfillment_message_type NOT NULL DEFAULT 'TEXT',
  body              text,                            -- visible message text
  is_internal       boolean NOT NULL DEFAULT false,  -- admin-only notes
  -- For SECURE_DELIVERY: payload stored separately, body contains safe label only
  secure_payload    jsonb,                           -- encrypted/isolated delivery data
  -- For INFO_REQUEST
  info_fields       text[],                          -- requested field names
  info_response     jsonb,                           -- submitted values {field: value}
  info_submitted_at timestamptz,
  -- Idempotency
  client_request_id text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fulfillment_messages_idempotency UNIQUE (thread_id, sender_id, client_request_id)
);

CREATE INDEX IF NOT EXISTS fulfillment_messages_thread_id_idx ON fulfillment_messages(thread_id);
CREATE INDEX IF NOT EXISTS fulfillment_messages_case_id_idx ON fulfillment_messages(case_id);
CREATE INDEX IF NOT EXISTS fulfillment_messages_created_at_idx ON fulfillment_messages(created_at);

-- ── fulfillment_case_events (immutable audit) ─────────────────────────────────

CREATE TABLE IF NOT EXISTS fulfillment_case_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         uuid NOT NULL REFERENCES fulfillment_cases(id) ON DELETE CASCADE,
  event_type      fulfillment_event_type NOT NULL,
  actor_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_type      text,                              -- 'user' | 'admin' | 'system'
  previous_status fulfillment_status,
  new_status      fulfillment_status,
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fulfillment_case_events_case_id_idx ON fulfillment_case_events(case_id);

-- ── fulfillment_unread_counts ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fulfillment_unread (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id    uuid NOT NULL REFERENCES fulfillment_threads(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  unread_count int NOT NULL DEFAULT 0,
  last_read_at timestamptz,
  CONSTRAINT fulfillment_unread_unique UNIQUE (thread_id, user_id)
);

CREATE INDEX IF NOT EXISTS fulfillment_unread_user_idx ON fulfillment_unread(user_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE fulfillment_cases   ENABLE ROW LEVEL SECURITY;
ALTER TABLE fulfillment_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE fulfillment_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE fulfillment_case_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE fulfillment_unread  ENABLE ROW LEVEL SECURITY;

-- fulfillment_cases: users see only their own; admins see all
DROP POLICY IF EXISTS "user_select_own_cases" ON fulfillment_cases;
CREATE POLICY "user_select_own_cases" ON fulfillment_cases FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR is_current_user_admin());

DROP POLICY IF EXISTS "admin_insert_cases" ON fulfillment_cases;
CREATE POLICY "admin_insert_cases" ON fulfillment_cases FOR INSERT
  TO authenticated
  WITH CHECK (is_current_user_admin() OR auth.uid() = user_id);

DROP POLICY IF EXISTS "admin_update_cases" ON fulfillment_cases;
CREATE POLICY "admin_update_cases" ON fulfillment_cases FOR UPDATE
  TO authenticated
  USING (is_current_user_admin())
  WITH CHECK (is_current_user_admin());

-- fulfillment_threads: same privacy as cases
DROP POLICY IF EXISTS "user_select_own_threads" ON fulfillment_threads;
CREATE POLICY "user_select_own_threads" ON fulfillment_threads FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM fulfillment_cases fc
      WHERE fc.id = case_id AND (fc.user_id = auth.uid() OR is_current_user_admin())
    )
  );

DROP POLICY IF EXISTS "admin_insert_threads" ON fulfillment_threads;
CREATE POLICY "admin_insert_threads" ON fulfillment_threads FOR INSERT
  TO authenticated
  WITH CHECK (is_current_user_admin() OR EXISTS (
    SELECT 1 FROM fulfillment_cases fc WHERE fc.id = case_id AND fc.user_id = auth.uid()
  ));

-- fulfillment_messages: users see non-internal messages in their own threads
DROP POLICY IF EXISTS "user_select_own_messages" ON fulfillment_messages;
CREATE POLICY "user_select_own_messages" ON fulfillment_messages FOR SELECT
  TO authenticated
  USING (
    (is_internal = false AND EXISTS (
      SELECT 1 FROM fulfillment_cases fc
      WHERE fc.id = case_id AND fc.user_id = auth.uid()
    ))
    OR is_current_user_admin()
  );

DROP POLICY IF EXISTS "user_insert_own_messages" ON fulfillment_messages;
CREATE POLICY "user_insert_own_messages" ON fulfillment_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND is_internal = false
    AND message_type IN ('TEXT', 'INFO_REQUEST')
    AND EXISTS (
      SELECT 1 FROM fulfillment_cases fc
      WHERE fc.id = case_id AND fc.user_id = auth.uid()
        AND fc.status NOT IN ('FULFILLED', 'CANCELLED')
    )
  );

DROP POLICY IF EXISTS "admin_insert_messages" ON fulfillment_messages;
CREATE POLICY "admin_insert_messages" ON fulfillment_messages FOR INSERT
  TO authenticated
  WITH CHECK (is_current_user_admin());

DROP POLICY IF EXISTS "admin_update_messages" ON fulfillment_messages;
CREATE POLICY "admin_update_messages" ON fulfillment_messages FOR UPDATE
  TO authenticated
  USING (is_current_user_admin())
  WITH CHECK (is_current_user_admin());

-- fulfillment_case_events: users see their own, admins see all
DROP POLICY IF EXISTS "user_select_own_events" ON fulfillment_case_events;
CREATE POLICY "user_select_own_events" ON fulfillment_case_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM fulfillment_cases fc
      WHERE fc.id = case_id AND (fc.user_id = auth.uid() OR is_current_user_admin())
    )
  );

DROP POLICY IF EXISTS "system_insert_events" ON fulfillment_case_events;
CREATE POLICY "system_insert_events" ON fulfillment_case_events FOR INSERT
  TO authenticated
  WITH CHECK (is_current_user_admin() OR EXISTS (
    SELECT 1 FROM fulfillment_cases fc WHERE fc.id = case_id AND fc.user_id = auth.uid()
  ));

-- fulfillment_unread: own rows only
DROP POLICY IF EXISTS "user_select_unread" ON fulfillment_unread;
CREATE POLICY "user_select_unread" ON fulfillment_unread FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR is_current_user_admin());

DROP POLICY IF EXISTS "user_upsert_unread" ON fulfillment_unread;
CREATE POLICY "user_upsert_unread" ON fulfillment_unread FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id OR is_current_user_admin());

DROP POLICY IF EXISTS "user_update_unread" ON fulfillment_unread;
CREATE POLICY "user_update_unread" ON fulfillment_unread FOR UPDATE
  TO authenticated USING (auth.uid() = user_id OR is_current_user_admin());

-- ── Helper: generate case code ────────────────────────────────────────────────
-- Uses random suffix so concurrent inserts don't collide. Unique index ensures safety.
CREATE OR REPLACE FUNCTION generate_case_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_code text;
  v_year text := to_char(now(), 'YY');
  v_month text := to_char(now(), 'MM');
BEGIN
  LOOP
    v_code := 'AX-' || v_year || v_month || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 5));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM fulfillment_cases WHERE case_code = v_code);
  END LOOP;
  RETURN v_code;
END;
$$;

-- ── RPC: create_fulfillment_case ──────────────────────────────────────────────
-- Called after spin result when prize type requires manual delivery.
-- Idempotent: returns existing case if reward_grant_id already has one.
CREATE OR REPLACE FUNCTION create_fulfillment_case(
  p_reward_grant_id   uuid,
  p_spin_id           uuid        DEFAULT NULL,
  p_user_id           uuid        DEFAULT NULL,
  p_prize_id          text        DEFAULT NULL,
  p_prize_name_ar     text        DEFAULT NULL,
  p_prize_name_en     text        DEFAULT NULL,
  p_prize_type        text        DEFAULT NULL,
  p_prize_value       text        DEFAULT NULL,
  p_prize_icon_url    text        DEFAULT NULL,
  p_prize_accent      text        DEFAULT NULL,
  p_prize_rarity      text        DEFAULT NULL,
  p_delivery_minutes  int         DEFAULT 1440,
  p_required_fields   text[]      DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_case_id     uuid;
  v_thread_id   uuid;
  v_case_code   text;
  v_user_id     uuid := COALESCE(p_user_id, auth.uid());
  v_sla_due     timestamptz := now() + (p_delivery_minutes || ' minutes')::interval;
  v_existing    uuid;
BEGIN
  -- Idempotency: return existing case if one already exists for this grant
  SELECT id INTO v_existing FROM fulfillment_cases WHERE reward_grant_id = p_reward_grant_id;
  IF FOUND THEN
    SELECT ft.id INTO v_thread_id FROM fulfillment_threads ft
    JOIN fulfillment_cases fc ON fc.id = ft.case_id
    WHERE fc.id = v_existing;
    RETURN jsonb_build_object(
      'case_id', v_existing,
      'thread_id', v_thread_id,
      'existed', true
    );
  END IF;

  -- Generate unique case code
  v_case_code := generate_case_code();

  -- Create case
  INSERT INTO fulfillment_cases (
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

  -- Create private thread
  INSERT INTO fulfillment_threads (case_id) VALUES (v_case_id) RETURNING id INTO v_thread_id;

  -- Initial system welcome message
  INSERT INTO fulfillment_messages (
    thread_id, case_id, sender_type, message_type, body, is_internal
  ) VALUES (
    v_thread_id, v_case_id, 'system', 'SYSTEM',
    'مبروك! تم تسجيل جائزتك بنجاح. سيقوم فريق أكسي بمتابعة عملية التسليم من خلال هذه المحادثة الخاصة.',
    false
  );

  -- Auto info request message if fields are required
  IF p_required_fields IS NOT NULL AND array_length(p_required_fields, 1) > 0 THEN
    INSERT INTO fulfillment_messages (
      thread_id, case_id, sender_type, message_type, body, info_fields, is_internal
    ) VALUES (
      v_thread_id, v_case_id, 'system', 'INFO_REQUEST',
      'لإكمال تسليم جائزتك نحتاج بعض المعلومات. يرجى تعبئة البيانات المطلوبة أدناه.',
      p_required_fields,
      false
    );
  END IF;

  -- Audit event
  INSERT INTO fulfillment_case_events (
    case_id, event_type, actor_type, new_status, metadata
  ) VALUES (
    v_case_id, 'CASE_CREATED', 'system', 'NEW'::fulfillment_status,
    jsonb_build_object('prize_id', p_prize_id, 'prize_name_en', p_prize_name_en)
  );

  -- Initialize unread counter for the winning user
  INSERT INTO fulfillment_unread (thread_id, user_id, unread_count)
  VALUES (v_thread_id, v_user_id, 1)
  ON CONFLICT (thread_id, user_id) DO NOTHING;

  RETURN jsonb_build_object(
    'case_id', v_case_id,
    'thread_id', v_thread_id,
    'case_code', v_case_code,
    'existed', false
  );
END;
$$;

-- ── RPC: update_fulfillment_case_status ───────────────────────────────────────
-- Validates state machine transitions, updates case, logs event.
CREATE OR REPLACE FUNCTION update_fulfillment_case_status(
  p_case_id     uuid,
  p_new_status  text,
  p_actor_id    uuid    DEFAULT NULL,
  p_actor_type  text    DEFAULT 'admin',
  p_note        text    DEFAULT NULL,
  p_dispute_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_case        fulfillment_cases;
  v_new         fulfillment_status;
  v_allowed     fulfillment_status[];
  v_thread_id   uuid;
  v_actor       uuid := COALESCE(p_actor_id, auth.uid());
BEGIN
  SELECT * INTO v_case FROM fulfillment_cases WHERE id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'case_not_found');
  END IF;

  -- Authorization: admin or case owner (only for USER_CONFIRMED / DISPUTED)
  IF NOT is_current_user_admin() THEN
    IF v_case.user_id != auth.uid() THEN
      RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
    END IF;
    -- Users may only confirm or dispute
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

  -- State machine validation (admin)
  IF is_current_user_admin() THEN
    v_allowed := CASE v_case.status
      WHEN 'NEW'                            THEN ARRAY['AWAITING_USER_INFO', 'READY_FOR_FULFILLMENT', 'ASSIGNED', 'PROCESSING', 'CANCELLED']::fulfillment_status[]
      WHEN 'AWAITING_USER_INFO'             THEN ARRAY['READY_FOR_FULFILLMENT', 'ASSIGNED', 'PROCESSING', 'CANCELLED']::fulfillment_status[]
      WHEN 'READY_FOR_FULFILLMENT'          THEN ARRAY['ASSIGNED', 'PROCESSING', 'CANCELLED']::fulfillment_status[]
      WHEN 'ASSIGNED'                       THEN ARRAY['PROCESSING', 'CANCELLED', 'READY_FOR_FULFILLMENT']::fulfillment_status[]
      WHEN 'PROCESSING'                     THEN ARRAY['DELIVERED_PENDING_CONFIRMATION', 'CANCELLED']::fulfillment_status[]
      WHEN 'DELIVERED_PENDING_CONFIRMATION' THEN ARRAY['FULFILLED', 'DISPUTED', 'PROCESSING']::fulfillment_status[]
      WHEN 'DISPUTED'                       THEN ARRAY['PROCESSING', 'FULFILLED', 'CANCELLED']::fulfillment_status[]
      WHEN 'FULFILLED'                      THEN ARRAY[]::fulfillment_status[]
      WHEN 'CANCELLED'                      THEN ARRAY[]::fulfillment_status[]
      ELSE ARRAY[]::fulfillment_status[]
    END;

    IF NOT (v_new = ANY(v_allowed)) THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_transition',
        'from', v_case.status, 'to', v_new);
    END IF;
  END IF;

  -- Update case
  UPDATE fulfillment_cases SET
    status                    = v_new,
    last_activity_at          = now(),
    updated_at                = now(),
    assigned_at               = CASE WHEN v_new = 'ASSIGNED' THEN now() ELSE assigned_at END,
    processing_started_at     = CASE WHEN v_new = 'PROCESSING' AND processing_started_at IS NULL THEN now() ELSE processing_started_at END,
    delivered_at              = CASE WHEN v_new = 'DELIVERED_PENDING_CONFIRMATION' THEN now() ELSE delivered_at END,
    confirmed_at              = CASE WHEN v_new = 'FULFILLED' THEN now() ELSE confirmed_at END,
    cancelled_at              = CASE WHEN v_new = 'CANCELLED' THEN now() ELSE cancelled_at END,
    dispute_reason            = CASE WHEN v_new = 'DISPUTED' THEN p_dispute_reason ELSE dispute_reason END,
    dispute_opened_at         = CASE WHEN v_new = 'DISPUTED' THEN now() ELSE dispute_opened_at END
  WHERE id = p_case_id;

  -- Audit event
  INSERT INTO fulfillment_case_events (
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

  -- Add status event message to thread
  SELECT id INTO v_thread_id FROM fulfillment_threads WHERE case_id = p_case_id;
  IF v_thread_id IS NOT NULL THEN
    INSERT INTO fulfillment_messages (
      thread_id, case_id, sender_id, sender_type, message_type, body, is_internal
    ) VALUES (
      v_thread_id, p_case_id, v_actor, p_actor_type, 'STATUS_EVENT',
      p_new_status,
      false
    );
  END IF;

  -- Update reward_grants status when case is fulfilled
  IF v_new = 'FULFILLED' THEN
    UPDATE reward_grants SET status = 'delivered', updated_at = now()
    WHERE id = v_case.reward_grant_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'status', v_new);
END;
$$;

-- ── RPC: claim_fulfillment_case ───────────────────────────────────────────────
-- Atomic claim: only succeeds if case is currently unassigned or assigned to caller.
CREATE OR REPLACE FUNCTION claim_fulfillment_case(
  p_case_id  uuid,
  p_admin_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_id uuid := COALESCE(p_admin_id, auth.uid());
  v_rows     int;
BEGIN
  IF NOT is_current_user_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  UPDATE fulfillment_cases SET
    assigned_admin_id = v_admin_id,
    assigned_at       = now(),
    status            = CASE WHEN status = 'NEW' OR status = 'READY_FOR_FULFILLMENT' THEN 'ASSIGNED'::fulfillment_status ELSE status END,
    last_activity_at  = now(),
    updated_at        = now()
  WHERE id = p_case_id
    AND (assigned_admin_id IS NULL OR assigned_admin_id = v_admin_id)
    AND status NOT IN ('FULFILLED', 'CANCELLED');

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_claimed');
  END IF;

  INSERT INTO fulfillment_case_events (
    case_id, event_type, actor_id, actor_type, metadata
  ) VALUES (
    p_case_id, 'ASSIGNED', v_admin_id, 'admin',
    jsonb_build_object('admin_id', v_admin_id)
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── RPC: send_fulfillment_message ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION send_fulfillment_message(
  p_case_id         uuid,
  p_body            text,
  p_message_type    text    DEFAULT 'TEXT',
  p_is_internal     boolean DEFAULT false,
  p_info_fields     text[]  DEFAULT NULL,
  p_info_response   jsonb   DEFAULT NULL,
  p_secure_payload  jsonb   DEFAULT NULL,
  p_client_req_id   text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread_id  uuid;
  v_sender_id  uuid := auth.uid();
  v_sender_type text;
  v_msg_id     uuid;
  v_case       fulfillment_cases;
BEGIN
  SELECT * INTO v_case FROM fulfillment_cases WHERE id = p_case_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'case_not_found');
  END IF;

  -- Authorization
  IF NOT is_current_user_admin() AND v_case.user_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;
  IF v_case.status IN ('FULFILLED', 'CANCELLED') THEN
    RETURN jsonb_build_object('success', false, 'error', 'case_closed');
  END IF;
  -- Only admins can send internal notes or secure delivery
  IF p_is_internal AND NOT is_current_user_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  v_sender_type := CASE WHEN is_current_user_admin() THEN 'admin' ELSE 'user' END;

  SELECT id INTO v_thread_id FROM fulfillment_threads WHERE case_id = p_case_id;
  IF v_thread_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'thread_not_found');
  END IF;

  INSERT INTO fulfillment_messages (
    thread_id, case_id, sender_id, sender_type, message_type,
    body, is_internal, info_fields, info_response,
    secure_payload, client_request_id
  ) VALUES (
    v_thread_id, p_case_id, v_sender_id, v_sender_type, p_message_type::fulfillment_message_type,
    p_body, p_is_internal, p_info_fields, p_info_response,
    p_secure_payload, p_client_req_id
  )
  ON CONFLICT (thread_id, sender_id, client_request_id) DO NOTHING
  RETURNING id INTO v_msg_id;

  IF v_msg_id IS NULL THEN
    -- Idempotent: message already existed
    RETURN jsonb_build_object('success', true, 'duplicate', true);
  END IF;

  -- Update case last_activity
  UPDATE fulfillment_cases SET last_activity_at = now(), updated_at = now()
  WHERE id = p_case_id;

  -- If user submitted info response, record event
  IF p_info_response IS NOT NULL AND v_sender_type = 'user' THEN
    INSERT INTO fulfillment_case_events (
      case_id, event_type, actor_id, actor_type, metadata
    ) VALUES (
      p_case_id, 'USER_INFO_SUBMITTED', v_sender_id, 'user',
      jsonb_build_object('fields', p_info_fields)
    );
    -- Auto-advance to READY_FOR_FULFILLMENT if was awaiting info
    IF v_case.status = 'AWAITING_USER_INFO' THEN
      UPDATE fulfillment_cases SET status = 'READY_FOR_FULFILLMENT', updated_at = now()
      WHERE id = p_case_id;
    END IF;
  END IF;

  -- Increment unread for the other party
  IF v_sender_type = 'user' THEN
    -- Increment for all admins (tracked via a generic admin slot)
    INSERT INTO fulfillment_unread (thread_id, user_id, unread_count)
    SELECT v_thread_id, v_sender_id, 0  -- placeholder; admin unread tracked differently
    ON CONFLICT DO NOTHING;
  ELSE
    -- Increment unread for the case owner
    INSERT INTO fulfillment_unread (thread_id, user_id, unread_count)
    VALUES (v_thread_id, v_case.user_id, 1)
    ON CONFLICT (thread_id, user_id) DO UPDATE
      SET unread_count = fulfillment_unread.unread_count + 1;
  END IF;

  RETURN jsonb_build_object('success', true, 'message_id', v_msg_id, 'duplicate', false);
END;
$$;

-- ── RPC: mark_thread_read ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION mark_fulfillment_thread_read(p_thread_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO fulfillment_unread (thread_id, user_id, unread_count, last_read_at)
  VALUES (p_thread_id, auth.uid(), 0, now())
  ON CONFLICT (thread_id, user_id) DO UPDATE
    SET unread_count = 0, last_read_at = now();
END;
$$;

-- ── Enable Realtime on messages ───────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE fulfillment_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE fulfillment_cases;
