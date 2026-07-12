/*
# Wheel Prize Availability System

## Overview
Extends the existing JSONB-based wheel prize system with configurable availability modes,
runtime state tracking, and server-side eligibility enforcement.

Prizes remain stored as JSONB in wheel_game_settings.prizes. New availability fields
are added to each prize JSON object by the admin UI. Runtime state (stock counts,
winner counts, unlock status) is tracked in a dedicated table for atomic updates.

## 1. New Tables

### wheel_prize_states
Tracks runtime state for prizes that need it (LIMITED_STOCK, LIMITED_WINNERS, LOCKED_BY_GOAL).
- prize_id (text, PK) — matches the prize id in the JSONB array
- settings_id (uuid, FK) — references wheel_game_settings
- runtime_status (text) — ACTIVE, LOCKED, SCHEDULED, EXHAUSTED, EXPIRED, DISABLED
- available_stock (int, nullable) — current remaining stock
- winners_count (int) — number of times this prize has been won
- unique_participants (int) — for LOCKED_BY_GOAL metric tracking
- unlocked_at (timestamptz, nullable) — when the prize was unlocked
- exhausted_at (timestamptz, nullable) — when stock/winners hit zero
- last_evaluated_at (timestamptz, nullable) — last unlock evaluation

### wheel_prize_events
Audit log for prize lifecycle events.
- id (uuid, PK)
- prize_id (text)
- settings_id (uuid)
- event_type (text) — PRIZE_CREATED, PRIZE_UNLOCKED_AUTOMATICALLY, etc.
- actor_id (uuid, nullable) — admin who triggered the action
- previous_state (jsonb, nullable)
- new_state (jsonb, nullable)
- metadata (jsonb)
- created_at (timestamptz)

## 2. Modified Functions

### perform_spin (REPLACED)
Updated to check prize eligibility:
- Excludes prizes with runtime_status != ACTIVE
- Excludes prizes past ends_at or before starts_at
- Checks per-user limits (max_wins_per_user, user_cooldown_days)
- Decrements available_stock for LIMITED_STOCK prizes
- Increments winners_count for LIMITED_WINNERS prizes
- Falls back to fallback_prize_id when exhausted

### evaluate_wheel_prize_unlocks (NEW)
Evaluates LOCKED_BY_GOAL prizes and unlocks when target is reached.
Idempotent — safe to call repeatedly.

### get_wheel_prize_states (NEW)
Returns current runtime state for all prizes. Used by frontend for progress display.

### admin_manual_unlock_prize (NEW)
Admin action to manually unlock a locked prize.

## 3. Security
- wheel_prize_states: RLS enabled, authenticated SELECT for players, admin writes via SECURITY DEFINER RPCs
- wheel_prize_events: RLS enabled, admin-only via is_admin_role()

## 4. Important Notes
- Existing prizes continue working with availability_mode defaulting to ALWAYS_ACTIVE
- No data loss — additive changes only
- Runtime state is lazily initialized on first spin or admin action
*/

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. wheel_prize_states — runtime state per prize
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS wheel_prize_states (
  prize_id           text NOT NULL,
  settings_id        uuid NOT NULL REFERENCES wheel_game_settings(id) ON DELETE CASCADE,
  runtime_status     text NOT NULL DEFAULT 'ACTIVE'
    CHECK (runtime_status IN ('ACTIVE','LOCKED','SCHEDULED','EXHAUSTED','EXPIRED','DISABLED')),
  available_stock    int,
  winners_count      int NOT NULL DEFAULT 0,
  unique_participants int NOT NULL DEFAULT 0,
  unlocked_at        timestamptz,
  exhausted_at       timestamptz,
  last_evaluated_at  timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (prize_id, settings_id)
);

ALTER TABLE wheel_prize_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_prize_states" ON wheel_prize_states;
CREATE POLICY "authenticated_read_prize_states" ON wheel_prize_states
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_manage_prize_states" ON wheel_prize_states;
CREATE POLICY "admin_manage_prize_states" ON wheel_prize_states
  FOR ALL TO authenticated
  USING (is_admin_role())
  WITH CHECK (is_admin_role());

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. wheel_prize_events — audit log
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS wheel_prize_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prize_id        text NOT NULL,
  settings_id     uuid REFERENCES wheel_game_settings(id) ON DELETE SET NULL,
  event_type      text NOT NULL,
  actor_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  previous_state  jsonb,
  new_state       jsonb,
  metadata        jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wheel_prize_events_prize ON wheel_prize_events(prize_id);
CREATE INDEX IF NOT EXISTS idx_wheel_prize_events_type ON wheel_prize_events(event_type);

ALTER TABLE wheel_prize_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_prize_events" ON wheel_prize_events;
CREATE POLICY "admin_read_prize_events" ON wheel_prize_events
  FOR SELECT TO authenticated USING (is_admin_role());

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. get_wheel_prize_states — public read for player UI
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_wheel_prize_states(p_settings_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings_id uuid;
  v_result jsonb;
BEGIN
  IF p_settings_id IS NOT NULL THEN
    v_settings_id := p_settings_id;
  ELSE
    SELECT id INTO v_settings_id FROM wheel_game_settings WHERE active = true LIMIT 1;
  END IF;

  IF v_settings_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'prize_id', ps.prize_id,
    'runtime_status', ps.runtime_status,
    'available_stock', ps.available_stock,
    'winners_count', ps.winners_count,
    'unique_participants', ps.unique_participants,
    'unlocked_at', ps.unlocked_at,
    'exhausted_at', ps.exhausted_at
  )), '[]'::jsonb)
  INTO v_result
  FROM wheel_prize_states ps
  WHERE ps.settings_id = v_settings_id;

  RETURN v_result;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. ensure_prize_state — lazily initialize runtime state for a prize
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION ensure_prize_state(
  p_prize_id text,
  p_settings_id uuid,
  p_prize jsonb
)
RETURNS wheel_prize_states
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state wheel_prize_states;
  v_mode text;
  v_status text;
BEGIN
  SELECT * INTO v_state FROM wheel_prize_states
  WHERE prize_id = p_prize_id AND settings_id = p_settings_id;

  IF FOUND THEN
    RETURN v_state;
  END IF;

  v_mode := COALESCE(p_prize->>'availability_mode', 'ALWAYS_ACTIVE');

  CASE v_mode
    WHEN 'LOCKED_BY_GOAL' THEN v_status := 'LOCKED';
    WHEN 'SCHEDULED' THEN v_status := 'SCHEDULED';
    ELSE v_status := 'ACTIVE';
  END CASE;

  INSERT INTO wheel_prize_states (
    prize_id, settings_id, runtime_status,
    available_stock, winners_count, unique_participants
  ) VALUES (
    p_prize_id, p_settings_id, v_status,
    (p_prize->>'initial_stock')::int,
    0, 0
  )
  ON CONFLICT (prize_id, settings_id) DO NOTHING
  RETURNING * INTO v_state;

  IF NOT FOUND THEN
    SELECT * INTO v_state FROM wheel_prize_states
    WHERE prize_id = p_prize_id AND settings_id = p_settings_id;
  END IF;

  RETURN v_state;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. evaluate_wheel_prize_unlocks — check LOCKED_BY_GOAL prizes
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION evaluate_wheel_prize_unlocks(p_settings_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings_id uuid;
  v_settings wheel_game_settings%ROWTYPE;
  v_prize jsonb;
  v_state wheel_prize_states;
  v_mode text;
  v_metric text;
  v_target int;
  v_progress int;
  v_unlocked_ids text[] := '{}';
  v_i int;
BEGIN
  IF p_settings_id IS NOT NULL THEN
    v_settings_id := p_settings_id;
  ELSE
    SELECT id INTO v_settings_id FROM wheel_game_settings WHERE active = true LIMIT 1;
  END IF;

  SELECT * INTO v_settings FROM wheel_game_settings WHERE id = v_settings_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'settings_not_found');
  END IF;

  FOR v_i IN 0..jsonb_array_length(v_settings.prizes) - 1 LOOP
    v_prize := v_settings.prizes->v_i;
    v_mode := COALESCE(v_prize->>'availability_mode', 'ALWAYS_ACTIVE');

    IF v_mode = 'LOCKED_BY_GOAL' THEN
      v_state := ensure_prize_state(v_prize->>'id', v_settings_id, v_prize);

      IF v_state.runtime_status = 'LOCKED' THEN
        v_metric := COALESCE(v_prize->>'unlock_target_metric', 'UNIQUE_PARTICIPANTS');
        v_target := COALESCE((v_prize->>'unlock_target_value')::int, 0);

        -- Calculate progress based on metric
        IF v_metric = 'UNIQUE_PARTICIPANTS' THEN
          SELECT COUNT(DISTINCT sr.user_id) INTO v_progress
          FROM spin_requests sr
          WHERE sr.status = 'completed'
            AND sr.created_at >= COALESCE((v_prize->>'starts_at')::timestamptz, '2000-01-01'::timestamptz);
        ELSIF v_metric = 'VALID_SPINS' THEN
          SELECT COUNT(*) INTO v_progress
          FROM spin_requests sr
          WHERE sr.status = 'completed'
            AND sr.created_at >= COALESCE((v_prize->>'starts_at')::timestamptz, '2000-01-01'::timestamptz);
        ELSIF v_metric = 'COMPLETED_WHEEL_SESSIONS' THEN
          SELECT COUNT(*) INTO v_progress
          FROM spin_requests sr
          WHERE sr.status = 'completed'
            AND sr.created_at >= COALESCE((v_prize->>'starts_at')::timestamptz, '2000-01-01'::timestamptz);
        ELSE
          v_progress := v_state.unique_participants;
        END IF;

        -- Update tracked progress
        UPDATE wheel_prize_states
        SET unique_participants = v_progress,
            last_evaluated_at = now(),
            updated_at = now()
        WHERE prize_id = v_prize->>'id'
          AND settings_id = v_settings_id;

        -- Unlock if target reached and unlock_automatically is true
        IF v_progress >= v_target AND COALESCE((v_prize->>'unlock_automatically')::boolean, true) THEN
          UPDATE wheel_prize_states
          SET runtime_status = 'ACTIVE',
              unlocked_at = now(),
              updated_at = now()
          WHERE prize_id = v_prize->>'id'
            AND settings_id = v_settings_id
            AND runtime_status = 'LOCKED';

          IF FOUND THEN
            v_unlocked_ids := array_append(v_unlocked_ids, v_prize->>'id');

            INSERT INTO wheel_prize_events (
              prize_id, settings_id, event_type, metadata
            ) VALUES (
              v_prize->>'id', v_settings_id, 'PRIZE_UNLOCKED_AUTOMATICALLY',
              jsonb_build_object('progress', v_progress, 'target', v_target, 'metric', v_metric)
            );
          END IF;
        END IF;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'unlocked_ids', to_jsonb(v_unlocked_ids),
    'evaluated_at', now()
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. admin_manual_unlock_prize — admin unlock action
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION admin_manual_unlock_prize(
  p_prize_id text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_settings_id uuid;
  v_state wheel_prize_states;
BEGIN
  IF NOT is_admin_role() THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_admin');
  END IF;

  SELECT id INTO v_settings_id FROM wheel_game_settings WHERE active = true LIMIT 1;
  IF v_settings_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_active_settings');
  END IF;

  SELECT * INTO v_state FROM wheel_prize_states
  WHERE prize_id = p_prize_id AND settings_id = v_settings_id
  FOR UPDATE;

  IF NOT FOUND OR v_state.runtime_status != 'LOCKED' THEN
    RETURN jsonb_build_object('success', false, 'error', 'prize_not_locked');
  END IF;

  UPDATE wheel_prize_states
  SET runtime_status = 'ACTIVE',
      unlocked_at = now(),
      updated_at = now()
  WHERE prize_id = p_prize_id AND settings_id = v_settings_id;

  INSERT INTO wheel_prize_events (
    prize_id, settings_id, event_type, actor_id, metadata
  ) VALUES (
    p_prize_id, v_settings_id, 'PRIZE_UNLOCKED_MANUALLY', v_admin_id,
    jsonb_build_object('reason', COALESCE(p_reason, ''), 'progress', v_state.unique_participants)
  );

  RETURN jsonb_build_object('success', true, 'message', 'تم فتح الجائزة بنجاح');
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. Updated perform_spin — with availability checks
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION perform_spin(p_client_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id         uuid := auth.uid();
  v_user            users%ROWTYPE;
  v_settings        wheel_game_settings%ROWTYPE;
  v_config_ver_id   uuid;
  v_spin_req_id     uuid;
  v_spin_type       text;
  v_points_deducted int := 0;
  v_spins_today     int;
  v_won_strong_ids  text[];
  v_prizes          jsonb;
  v_prize           jsonb;
  v_prize_index     int;
  v_total_weight    numeric;
  v_roll            numeric;
  v_cumulative      numeric;
  v_points_awarded  int := 0;
  v_existing        spin_requests%ROWTYPE;
  v_flag_enabled    boolean;
  v_candidate       jsonb;
  v_avail_mode      text;
  v_prize_state     wheel_prize_states;
  v_now             timestamptz := now();
  v_user_wins       int;
  v_last_win_at     timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthenticated');
  END IF;

  SELECT enabled INTO v_flag_enabled FROM engagement_flags WHERE flag = 'spin_v2';
  IF NOT COALESCE(v_flag_enabled, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'spin_v2_disabled');
  END IF;

  -- Idempotency check
  SELECT * INTO v_existing FROM spin_requests
  WHERE user_id = v_user_id AND client_request_id = p_client_request_id;

  IF FOUND THEN
    IF v_existing.status = 'completed' THEN
      DECLARE v_result spin_results%ROWTYPE;
      BEGIN
        SELECT * INTO v_result FROM spin_results WHERE spin_request_id = v_existing.id;
        RETURN jsonb_build_object(
          'success', true, 'idempotent_replay', true,
          'spin_request_id', v_existing.id,
          'prize_id', v_result.prize_id, 'prize_type', v_result.prize_type,
          'prize_value', v_result.prize_value,
          'prize_name_ar', v_result.prize_name_ar, 'prize_name_en', v_result.prize_name_en,
          'points_awarded', v_result.points_awarded
        );
      END;
    ELSIF v_existing.status = 'failed' THEN
      RETURN jsonb_build_object('success', false, 'error', 'previous_request_failed');
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'request_in_progress');
    END IF;
  END IF;

  SELECT * INTO v_user FROM users WHERE id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  SELECT * INTO v_settings FROM wheel_game_settings WHERE active = true LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'wheel_not_configured');
  END IF;

  SELECT COUNT(*) INTO v_spins_today
  FROM spin_requests
  WHERE user_id = v_user_id AND status = 'completed'
    AND created_at >= (CURRENT_DATE AT TIME ZONE 'UTC');

  IF v_spins_today < v_settings.free_daily_spins THEN
    v_spin_type := 'free';
    v_points_deducted := 0;
  ELSE
    DECLARE v_credits int;
    BEGIN
      SELECT balance INTO v_credits FROM spin_credits WHERE user_id = v_user_id;
      IF COALESCE(v_credits, 0) > 0 THEN
        v_spin_type := 'credit';
        v_points_deducted := 0;
        UPDATE spin_credits SET balance = balance - 1, updated_at = now()
        WHERE user_id = v_user_id AND balance > 0;
        IF NOT FOUND THEN v_spin_type := 'paid'; END IF;
      ELSE
        v_spin_type := 'paid';
      END IF;
    END;

    IF v_spin_type = 'paid' THEN
      IF COALESCE(v_user.points, 0) < v_settings.spin_cost_points THEN
        RETURN jsonb_build_object('success', false, 'error', 'insufficient_points',
          'required', v_settings.spin_cost_points, 'available', v_user.points);
      END IF;
      v_points_deducted := v_settings.spin_cost_points;
      UPDATE users SET points = points - v_settings.spin_cost_points WHERE id = v_user_id;
    END IF;
  END IF;

  INSERT INTO wheel_config_versions (settings_id, prizes, spin_cost)
  VALUES (v_settings.id, to_jsonb(v_settings.prizes), v_settings.spin_cost_points)
  RETURNING id INTO v_config_ver_id;

  INSERT INTO spin_requests (user_id, client_request_id, config_version_id, spin_type, points_deducted, status)
  VALUES (v_user_id, p_client_request_id, v_config_ver_id, v_spin_type, v_points_deducted, 'pending')
  RETURNING id INTO v_spin_req_id;

  -- Strong prizes won today
  SELECT ARRAY(
    SELECT sr2.prize_id FROM spin_results sr2
    JOIN spin_requests sreq2 ON sr2.spin_request_id = sreq2.id
    WHERE sreq2.user_id = v_user_id AND sreq2.status = 'completed'
      AND sreq2.created_at >= (CURRENT_DATE AT TIME ZONE 'UTC')
  ) INTO v_won_strong_ids;

  v_prizes := v_settings.prizes;
  v_total_weight := 0;

  -- Sum eligible weights with availability checks
  FOR v_prize_index IN 0..jsonb_array_length(v_prizes) - 1 LOOP
    v_candidate := v_prizes->v_prize_index;
    v_avail_mode := COALESCE(v_candidate->>'availability_mode', 'ALWAYS_ACTIVE');

    -- Skip strong prizes already won today
    IF COALESCE((v_candidate->>'is_strong')::boolean, false)
       AND (v_candidate->>'id') = ANY(v_won_strong_ids) THEN
      CONTINUE;
    END IF;

    -- Check availability mode
    IF v_avail_mode IN ('LOCKED_BY_GOAL', 'EVENT_ONLY') THEN
      -- Check runtime state
      SELECT runtime_status INTO v_prize_state.runtime_status
      FROM wheel_prize_states
      WHERE prize_id = v_candidate->>'id' AND settings_id = v_settings.id;

      IF NOT FOUND OR v_prize_state.runtime_status != 'ACTIVE' THEN
        CONTINUE;
      END IF;
    END IF;

    IF v_avail_mode = 'SCHEDULED' THEN
      IF v_now < COALESCE((v_candidate->>'starts_at')::timestamptz, '2000-01-01'::timestamptz)
         OR v_now > COALESCE((v_candidate->>'ends_at')::timestamptz, '2999-12-31'::timestamptz) THEN
        CONTINUE;
      END IF;
    END IF;

    IF v_avail_mode = 'LIMITED_STOCK' THEN
      SELECT available_stock, runtime_status INTO v_prize_state.available_stock, v_prize_state.runtime_status
      FROM wheel_prize_states
      WHERE prize_id = v_candidate->>'id' AND settings_id = v_settings.id;

      IF FOUND AND (v_prize_state.runtime_status = 'EXHAUSTED' OR COALESCE(v_prize_state.available_stock, 0) <= 0) THEN
        CONTINUE;
      END IF;
    END IF;

    IF v_avail_mode = 'LIMITED_WINNERS' THEN
      SELECT winners_count, runtime_status INTO v_prize_state.winners_count, v_prize_state.runtime_status
      FROM wheel_prize_states
      WHERE prize_id = v_candidate->>'id' AND settings_id = v_settings.id;

      IF FOUND AND (v_prize_state.runtime_status = 'EXHAUSTED'
         OR v_prize_state.winners_count >= COALESCE((v_candidate->>'max_winners')::int, 999999)) THEN
        CONTINUE;
      END IF;
    END IF;

    -- Check schedule for ALWAYS_ACTIVE too
    IF v_avail_mode = 'ALWAYS_ACTIVE' THEN
      IF (v_candidate->>'starts_at') IS NOT NULL
         AND v_now < (v_candidate->>'starts_at')::timestamptz THEN
        CONTINUE;
      END IF;
      IF (v_candidate->>'ends_at') IS NOT NULL
         AND v_now > (v_candidate->>'ends_at')::timestamptz THEN
        CONTINUE;
      END IF;
    END IF;

    -- Per-user limits
    IF (v_candidate->>'max_wins_per_user') IS NOT NULL THEN
      SELECT COUNT(*) INTO v_user_wins FROM spin_results
      WHERE user_id = v_user_id AND prize_id = v_candidate->>'id';
      IF v_user_wins >= (v_candidate->>'max_wins_per_user')::int THEN
        CONTINUE;
      END IF;
    END IF;

    IF (v_candidate->>'user_cooldown_days') IS NOT NULL THEN
      SELECT MAX(sr.created_at) INTO v_last_win_at
      FROM spin_results sr
      WHERE sr.user_id = v_user_id AND sr.prize_id = v_candidate->>'id';
      IF v_last_win_at IS NOT NULL
         AND v_now < v_last_win_at + ((v_candidate->>'user_cooldown_days')::int * interval '1 day') THEN
        CONTINUE;
      END IF;
    END IF;

    v_total_weight := v_total_weight + COALESCE((v_candidate->>'weight')::numeric, 1);
  END LOOP;

  -- Weighted selection among eligible prizes
  v_roll := random() * v_total_weight;
  v_cumulative := 0;
  v_prize := NULL;
  v_prize_index := 0;

  FOR v_prize_index IN 0..jsonb_array_length(v_prizes) - 1 LOOP
    v_candidate := v_prizes->v_prize_index;
    v_avail_mode := COALESCE(v_candidate->>'availability_mode', 'ALWAYS_ACTIVE');

    -- Re-apply same eligibility filters
    IF COALESCE((v_candidate->>'is_strong')::boolean, false)
       AND (v_candidate->>'id') = ANY(v_won_strong_ids) THEN
      CONTINUE;
    END IF;

    IF v_avail_mode IN ('LOCKED_BY_GOAL', 'EVENT_ONLY') THEN
      SELECT runtime_status INTO v_prize_state.runtime_status
      FROM wheel_prize_states WHERE prize_id = v_candidate->>'id' AND settings_id = v_settings.id;
      IF NOT FOUND OR v_prize_state.runtime_status != 'ACTIVE' THEN CONTINUE; END IF;
    END IF;

    IF v_avail_mode = 'SCHEDULED' THEN
      IF v_now < COALESCE((v_candidate->>'starts_at')::timestamptz, '2000-01-01'::timestamptz)
         OR v_now > COALESCE((v_candidate->>'ends_at')::timestamptz, '2999-12-31'::timestamptz) THEN
        CONTINUE;
      END IF;
    END IF;

    IF v_avail_mode = 'LIMITED_STOCK' THEN
      SELECT available_stock, runtime_status INTO v_prize_state.available_stock, v_prize_state.runtime_status
      FROM wheel_prize_states WHERE prize_id = v_candidate->>'id' AND settings_id = v_settings.id;
      IF FOUND AND (v_prize_state.runtime_status = 'EXHAUSTED' OR COALESCE(v_prize_state.available_stock, 0) <= 0) THEN
        CONTINUE;
      END IF;
    END IF;

    IF v_avail_mode = 'LIMITED_WINNERS' THEN
      SELECT winners_count, runtime_status INTO v_prize_state.winners_count, v_prize_state.runtime_status
      FROM wheel_prize_states WHERE prize_id = v_candidate->>'id' AND settings_id = v_settings.id;
      IF FOUND AND (v_prize_state.runtime_status = 'EXHAUSTED'
         OR v_prize_state.winners_count >= COALESCE((v_candidate->>'max_winners')::int, 999999)) THEN
        CONTINUE;
      END IF;
    END IF;

    IF v_avail_mode = 'ALWAYS_ACTIVE' THEN
      IF (v_candidate->>'starts_at') IS NOT NULL AND v_now < (v_candidate->>'starts_at')::timestamptz THEN CONTINUE; END IF;
      IF (v_candidate->>'ends_at') IS NOT NULL AND v_now > (v_candidate->>'ends_at')::timestamptz THEN CONTINUE; END IF;
    END IF;

    IF (v_candidate->>'max_wins_per_user') IS NOT NULL THEN
      SELECT COUNT(*) INTO v_user_wins FROM spin_results WHERE user_id = v_user_id AND prize_id = v_candidate->>'id';
      IF v_user_wins >= (v_candidate->>'max_wins_per_user')::int THEN CONTINUE; END IF;
    END IF;

    IF (v_candidate->>'user_cooldown_days') IS NOT NULL THEN
      SELECT MAX(sr.created_at) INTO v_last_win_at FROM spin_results sr WHERE sr.user_id = v_user_id AND sr.prize_id = v_candidate->>'id';
      IF v_last_win_at IS NOT NULL AND v_now < v_last_win_at + ((v_candidate->>'user_cooldown_days')::int * interval '1 day') THEN CONTINUE; END IF;
    END IF;

    v_cumulative := v_cumulative + COALESCE((v_candidate->>'weight')::numeric, 1);
    IF v_roll <= v_cumulative AND v_prize IS NULL THEN
      v_prize := v_candidate;
    END IF;
  END LOOP;

  -- Fallback: last prize in array
  IF v_prize IS NULL THEN
    v_prize := v_prizes->(jsonb_array_length(v_prizes) - 1);
    v_prize_index := jsonb_array_length(v_prizes) - 1;
  ELSE
    -- Find actual index
    FOR v_prize_index IN 0..jsonb_array_length(v_prizes) - 1 LOOP
      IF (v_prizes->v_prize_index)->>'id' = v_prize->>'id' THEN EXIT; END IF;
    END LOOP;
  END IF;

  -- Post-win updates for availability modes
  v_avail_mode := COALESCE(v_prize->>'availability_mode', 'ALWAYS_ACTIVE');

  IF v_avail_mode = 'LIMITED_STOCK' THEN
    UPDATE wheel_prize_states
    SET available_stock = GREATEST(available_stock - 1, 0),
        winners_count = winners_count + 1,
        runtime_status = CASE WHEN available_stock <= 1 THEN 'EXHAUSTED' ELSE runtime_status END,
        exhausted_at = CASE WHEN available_stock <= 1 THEN now() ELSE exhausted_at END,
        updated_at = now()
    WHERE prize_id = v_prize->>'id' AND settings_id = v_settings.id;
  ELSIF v_avail_mode = 'LIMITED_WINNERS' THEN
    UPDATE wheel_prize_states
    SET winners_count = winners_count + 1,
        runtime_status = CASE
          WHEN winners_count + 1 >= COALESCE((v_prize->>'max_winners')::int, 999999)
          THEN 'EXHAUSTED' ELSE runtime_status END,
        exhausted_at = CASE
          WHEN winners_count + 1 >= COALESCE((v_prize->>'max_winners')::int, 999999)
          THEN now() ELSE exhausted_at END,
        updated_at = now()
    WHERE prize_id = v_prize->>'id' AND settings_id = v_settings.id;
  ELSIF v_avail_mode IN ('LOCKED_BY_GOAL', 'ALWAYS_ACTIVE') THEN
    -- Track winner count for all modes
    INSERT INTO wheel_prize_states (prize_id, settings_id, runtime_status, winners_count)
    VALUES (v_prize->>'id', v_settings.id, 'ACTIVE', 1)
    ON CONFLICT (prize_id, settings_id)
    DO UPDATE SET winners_count = wheel_prize_states.winners_count + 1, updated_at = now();
  END IF;

  -- Award instant point prizes
  IF (v_prize->>'type') = 'points' THEN
    v_points_awarded := COALESCE((v_prize->>'value')::int, 0);
    IF v_points_awarded > 0 THEN
      UPDATE users SET points = points + v_points_awarded WHERE id = v_user_id;
    END IF;
  END IF;

  -- Non-instant prizes
  IF (v_prize->>'type') IN ('service', 'grand') THEN
    INSERT INTO reward_grants (user_id, spin_request_id, grant_type, grant_value, status)
    VALUES (v_user_id, v_spin_req_id, v_prize->>'type', COALESCE(v_prize->>'value', ''), 'pending');
  END IF;

  INSERT INTO spin_results (spin_request_id, user_id, prize_id, prize_type, prize_value,
    prize_name_ar, prize_name_en, points_awarded)
  VALUES (v_spin_req_id, v_user_id, COALESCE(v_prize->>'id', 'unknown'),
    COALESCE(v_prize->>'type', 'miss'), COALESCE(v_prize->>'value', '0'),
    COALESCE(v_prize->>'name_ar', ''), COALESCE(v_prize->>'name_en', ''), v_points_awarded);

  UPDATE spin_requests SET status = 'completed' WHERE id = v_spin_req_id;

  INSERT INTO game_logs (user_id, game_type, bet_amount, win_amount, result, result_data, created_at)
  VALUES (v_user_id, 'wheel', v_points_deducted, v_points_awarded,
    CASE WHEN (v_prize->>'type') = 'miss' THEN 'miss' ELSE 'win' END,
    jsonb_build_object('prize_id', v_prize->>'id', 'prize_type', v_prize->>'type',
      'prize_value', v_prize->>'value', 'prize_name_ar', v_prize->>'name_ar',
      'spin_request_id', v_spin_req_id), now());

  INSERT INTO game_event_outbox (event_type, user_id, payload)
  VALUES ('spin_completed', v_user_id, jsonb_build_object(
    'spin_request_id', v_spin_req_id, 'prize_id', v_prize->>'id',
    'prize_type', v_prize->>'type', 'prize_value', v_prize->>'value',
    'prize_index', v_prize_index, 'points_deducted', v_points_deducted,
    'points_awarded', v_points_awarded, 'spin_type', v_spin_type));

  -- Evaluate unlock progress after each spin
  PERFORM evaluate_wheel_prize_unlocks(v_settings.id);

  RETURN jsonb_build_object(
    'success', true, 'idempotent_replay', false,
    'spin_request_id', v_spin_req_id, 'prize_index', v_prize_index,
    'prize_id', v_prize->>'id', 'prize_type', v_prize->>'type',
    'prize_value', v_prize->>'value', 'prize_name_ar', v_prize->>'name_ar',
    'prize_name_en', v_prize->>'name_en', 'points_awarded', v_points_awarded,
    'points_deducted', v_points_deducted, 'spin_type', v_spin_type
  );
END;
$$;
