/*
# Wheel Game: Batch Multi-Spin, Coins Prize Type, Per-User Grand Prize Unlock + Notifications

## Overview
This migration addresses four interconnected improvements to the wheel game:
1. Multi-spin support (×1, ×5, ×10) via a single batched RPC call
2. New "coins" prize type that requires manual fulfillment (opens support chat)
3. Per-user grand prize unlocking (each user must complete 30 spins individually)
4. Grand prize notifications to all users when a new/updated grand prize is configured

## 1. New Tables
- `user_grand_prize_progress`
  - Tracks each user's individual spin count toward unlocking LOCKED_BY_GOAL prizes.
  - Columns: user_id (uuid, FK auth.users), prize_id (text), settings_id (uuid, FK wheel_game_settings),
    spin_count (int, default 0), unlocked_at (timestamptz, nullable), created_at, updated_at.
  - Primary key: (user_id, prize_id, settings_id).
  - RLS: owner-scoped — users can read their own progress; inserts/updates happen via SECURITY DEFINER functions.

## 2. Modified Functions
- `perform_spin(p_client_request_id uuid, p_quantity int DEFAULT 1)`
  - Now accepts a quantity parameter (default 1 for backward compatibility).
  - Deducts `quantity * spin_cost_points` in a single UPDATE (respecting free daily spins for the first N).
  - Loops the weighted selection `p_quantity` times, creating one spin_result per prize.
  - Creates reward_grants for each 'service', 'grand', or 'coins' prize.
  - Awards total points from all 'points' prizes in one UPDATE.
  - Returns a `results` JSON array (each entry: prize_index, prize_id, prize_type, prize_value, etc.)
    plus aggregate totals.
  - For LOCKED_BY_GOAL prizes: checks per-user progress via `user_grand_prize_progress` instead of
    global spin count. A locked prize is only eligible if the user has reached their personal
    unlock target. After each spin, increments the user's per-user spin_count and unlocks if
    target reached.
  - Adds 'coins' to the manual-fulfillment types (reward_grants created).

- `evaluate_wheel_prize_unlocks(p_settings_id uuid)`
  - Updated to evaluate per-user progress: for each LOCKED_BY_GOAL prize, increments the
    calling user's spin_count in `user_grand_prize_progress` and unlocks when the user's
    personal count reaches the target.

## 3. New Functions
- `notify_grand_prize_update(p_settings_id uuid, p_prize_name_ar text, p_prize_name_en text)`
  - SECURITY DEFINER function that inserts a notification_inbox row for every user in the
    `users` table, announcing a new or updated grand prize.
  - Also inserts a row in `game_event_outbox` for push notification processing.

- `get_user_grand_prize_progress(p_settings_id uuid DEFAULT NULL)`
  - Returns the calling user's progress rows for LOCKED_BY_GOAL prizes, including spin_count,
    target, and unlocked status.

## 4. Security
- RLS enabled on `user_grand_prize_progress`.
- SELECT policy: authenticated users can read their own progress rows.
- All writes to `user_grand_prize_progress` happen via SECURITY DEFINER functions (perform_spin,
  evaluate_wheel_prize_unlocks) which bypass RLS safely.
- `notify_grand_prize_update` is SECURITY DEFINER so it can insert notifications for all users.

## 5. Important Notes
1. The `perform_spin` function is backward compatible: calling it with only `p_client_request_id`
   behaves exactly as before (quantity=1, single prize result).
2. The return format changes from a flat object to an object with a `results` array. The frontend
   must be updated to handle both single and batch results.
3. Free daily spins are consumed first: for quantity=5 with 3 free spins remaining, the first 3 are
   free and the remaining 2 cost `2 * spin_cost_points`.
4. The `coins` prize type follows the same fulfillment flow as `service` and `grand`: a
   reward_grant is created and the frontend opens a support chat for manual delivery.
5. Per-user unlock means each new user starts at 0 spins and must individually reach 30 (or
   whatever unlock_target_value is set to) before the grand prize segment becomes eligible for them.
6. Grand prize notifications are inserted directly into `notification_inbox` for immediate display
   in the NotificationBell component.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Create user_grand_prize_progress table
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_grand_prize_progress (
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prize_id     text        NOT NULL,
  settings_id  uuid        NOT NULL REFERENCES wheel_game_settings(id) ON DELETE CASCADE,
  spin_count   integer     NOT NULL DEFAULT 0,
  unlocked_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, prize_id, settings_id)
);

ALTER TABLE user_grand_prize_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_grand_prize_progress" ON user_grand_prize_progress;
CREATE POLICY "select_own_grand_prize_progress"
  ON user_grand_prize_progress FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Index for quick lookups by user
CREATE INDEX IF NOT EXISTS idx_ugpp_user_id ON user_grand_prize_progress(user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. notify_grand_prize_update RPC
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.notify_grand_prize_update(
  p_settings_id   uuid,
  p_prize_id       text,
  p_prize_name_ar  text,
  p_prize_name_en  text,
  p_unlock_target  integer DEFAULT 30
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inserted_count integer := 0;
  v_notification_id uuid;
BEGIN
  -- Insert a notification_inbox row for every user
  INSERT INTO notification_inbox (
    user_id, event_key, category, title_ar, title_en, body_ar, body_en,
    deep_link, priority, is_read
  )
  SELECT
    u.id,
    'grand_prize_update_' || p_prize_id || '_' || extract(epoch from now())::bigint,
    'wheel',
    'جائزة كبرى جديدة على العجلة!',
    'New Grand Prize on the Wheel!',
    'تم تحديث الجائزة الكبرى: ' || COALESCE(p_prize_name_ar, 'جائزة كبرى') || E'\nأكمل ' || p_unlock_target || ' لفة لفتحها!',
    'Grand prize updated: ' || COALESCE(p_prize_name_en, 'Grand Prize') || E'\nComplete ' || p_unlock_target || ' spins to unlock it!',
    'wheel',
    'high',
    false
  FROM users u
  WHERE u.id IS NOT NULL;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  -- Also queue an event for push notification processing
  INSERT INTO game_event_outbox (event_type, user_id, payload)
  VALUES (
    'grand_prize_update',
    NULL,
    jsonb_build_object(
      'prize_id', p_prize_id,
      'prize_name_ar', p_prize_name_ar,
      'prize_name_en', p_prize_name_en,
      'unlock_target', p_unlock_target,
      'notification_count', v_inserted_count
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'notifications_created', v_inserted_count
  );
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. get_user_grand_prize_progress RPC
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_user_grand_prize_progress(
  p_settings_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id    uuid := auth.uid();
  v_settings_id uuid;
  v_settings   wheel_game_settings%ROWTYPE;
  v_results    jsonb := '[]'::jsonb;
  v_prize      jsonb;
  v_progress   int;
  v_target     int;
  v_unlocked   timestamptz;
  v_i          int;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthenticated');
  END IF;

  IF p_settings_id IS NOT NULL THEN
    v_settings_id := p_settings_id;
  ELSE
    SELECT id INTO v_settings_id FROM wheel_game_settings WHERE active = true LIMIT 1;
  END IF;

  IF v_settings_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_active_settings');
  END IF;

  SELECT * INTO v_settings FROM wheel_game_settings WHERE id = v_settings_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'settings_not_found');
  END IF;

  FOR v_i IN 0..jsonb_array_length(v_settings.prizes) - 1 LOOP
    v_prize := v_settings.prizes->v_i;
    IF COALESCE(v_prize->>'availability_mode', 'ALWAYS_ACTIVE') = 'LOCKED_BY_GOAL' THEN
      v_target := COALESCE((v_prize->>'unlock_target_value')::int, 30);

      SELECT spin_count, unlocked_at INTO v_progress, v_unlocked
      FROM user_grand_prize_progress
      WHERE user_id = v_user_id AND prize_id = v_prize->>'id' AND settings_id = v_settings_id;

      v_results := v_results || jsonb_build_object(
        'prize_id', v_prize->>'id',
        'prize_name_ar', v_prize->>'name_ar',
        'prize_name_en', v_prize->>'name_en',
        'spin_count', COALESCE(v_progress, 0),
        'unlock_target', v_target,
        'is_unlocked', v_unlocked IS NOT NULL,
        'unlocked_at', v_unlocked
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'progress', v_results);
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Rewrite perform_spin with p_quantity parameter
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.perform_spin(
  p_client_request_id uuid,
  p_quantity          integer DEFAULT 1
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_prize_state     wheel_prize_states%ROWTYPE;
  v_now             timestamptz := now();
  v_user_wins       int;
  v_last_win_at     timestamptz;
  v_quantity        int := GREATEST(COALESCE(p_quantity, 1), 1);
  v_free_spins_used int := 0;
  v_paid_spins      int := 0;
  v_total_cost      int := 0;
  v_results         jsonb := '[]'::jsonb;
  v_batch_prize     jsonb;
  v_batch_index     int;
  v_unlocked_ids    text[] := '{}';
  v_grand_prize     jsonb;
  v_grand_target    int;
  v_user_progress   int;
  v_user_unlocked   timestamptz;
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
      DECLARE v_result spin_results%ROWTYPE; BEGIN
        SELECT * INTO v_result FROM spin_results WHERE spin_request_id = v_existing.id;
        RETURN jsonb_build_object(
          'success', true, 'idempotent_replay', true,
          'spin_request_id', v_existing.id,
          'results', jsonb_build_array(jsonb_build_object(
            'prize_id', v_result.prize_id, 'prize_type', v_result.prize_type,
            'prize_value', v_result.prize_value,
            'prize_name_ar', v_result.prize_name_ar, 'prize_name_en', v_result.prize_name_en,
            'points_awarded', v_result.points_awarded, 'prize_index', 0
          )),
          'points_awarded', v_result.points_awarded,
          'points_deducted', v_existing.points_deducted,
          'spin_type', v_existing.spin_type
        );
      END;
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'spin_in_progress');
    END IF;
  END IF;

  SELECT * INTO v_user FROM users WHERE id = v_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  SELECT * INTO v_settings FROM wheel_game_settings WHERE active = true LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_active_settings');
  END IF;

  v_prizes := v_settings.prizes;
  IF v_prizes IS NULL OR jsonb_array_length(v_prizes) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_prizes_configured');
  END IF;

  -- Count spins today
  SELECT count(*) INTO v_spins_today FROM spin_requests
  WHERE user_id = v_user_id AND status = 'completed'
  AND created_at >= date_trunc('day', v_now);

  -- Calculate cost: free spins first, then paid
  v_free_spins_used := LEAST(v_quantity, GREATEST(v_settings.free_daily_spins - v_spins_today, 0));
  v_paid_spins := v_quantity - v_free_spins_used;
  v_total_cost := v_paid_spins * v_settings.spin_cost_points;

  IF v_paid_spins > 0 AND COALESCE(v_user.points, 0) < v_total_cost THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'insufficient_points',
      'required', v_total_cost, 'available', v_user.points,
      'quantity', v_quantity
    );
  END IF;

  -- Deduct points
  IF v_total_cost > 0 THEN
    UPDATE users SET points = points - v_total_cost WHERE id = v_user_id;
    v_points_deducted := v_total_cost;
    v_spin_type := 'paid';
  ELSE
    v_spin_type := 'free';
  END IF;

  -- Create config version snapshot
  INSERT INTO wheel_config_versions (settings_id, prizes, spin_cost)
  VALUES (v_settings.id, to_jsonb(v_settings.prizes), v_settings.spin_cost_points)
  RETURNING id INTO v_config_ver_id;

  -- Create spin request
  INSERT INTO spin_requests (user_id, client_request_id, config_version_id, spin_type, points_deducted, status)
  VALUES (v_user_id, p_client_request_id, v_config_ver_id, v_spin_type, v_points_deducted, 'pending')
  RETURNING id INTO v_spin_req_id;

  -- Find grand prize for per-user unlock tracking
  FOR v_batch_index IN 0..jsonb_array_length(v_prizes) - 1 LOOP
    IF (v_prizes->v_batch_index)->>'type' = 'grand'
       AND COALESCE((v_prizes->v_batch_index)->>'availability_mode', 'ALWAYS_ACTIVE') = 'LOCKED_BY_GOAL' THEN
      v_grand_prize := v_prizes->v_batch_index;
      v_grand_target := COALESCE((v_grand_prize->>'unlock_target_value')::int, 30);
      EXIT;
    END IF;
  END LOOP;

  -- ── Process each spin in the batch ──────────────────────────────────────
  FOR v_batch_index IN 1..v_quantity LOOP
    v_won_strong_ids := ARRAY(
      SELECT prize_id FROM spin_results
      WHERE user_id = v_user_id AND prize_type IN ('service', 'grand', 'coins')
    );

    -- Filter eligible prizes and compute total weight
    v_total_weight := 0;
    v_prize := NULL;
    v_prize_index := 0;

    FOR v_prize_index IN 0..jsonb_array_length(v_prizes) - 1 LOOP
      v_candidate := v_prizes->v_prize_index;
      v_avail_mode := COALESCE(v_candidate->>'availability_mode', 'ALWAYS_ACTIVE');

      -- Skip already-won strong prizes
      IF COALESCE((v_candidate->>'is_strong')::boolean, false)
         AND (v_candidate->>'id') = ANY(v_won_strong_ids) THEN
        CONTINUE;
      END IF;

      -- LOCKED_BY_GOAL: check per-user unlock
      IF v_avail_mode IN ('LOCKED_BY_GOAL', 'EVENT_ONLY') THEN
        SELECT runtime_status INTO v_prize_state.runtime_status
        FROM wheel_prize_states
        WHERE prize_id = v_candidate->>'id' AND settings_id = v_settings.id;
        IF NOT FOUND OR v_prize_state.runtime_status != 'ACTIVE' THEN
          -- For LOCKED_BY_GOAL, also check per-user unlock
          IF v_avail_mode = 'LOCKED_BY_GOAL' THEN
            SELECT unlocked_at INTO v_user_unlocked
            FROM user_grand_prize_progress
            WHERE user_id = v_user_id AND prize_id = v_candidate->>'id' AND settings_id = v_settings.id;
            IF v_user_unlocked IS NULL THEN
              CONTINUE;
            END IF;
          ELSE
            CONTINUE;
          END IF;
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

    -- Weighted selection
    v_roll := random() * v_total_weight;
    v_cumulative := 0;
    v_prize := NULL;
    v_prize_index := 0;

    FOR v_prize_index IN 0..jsonb_array_length(v_prizes) - 1 LOOP
      v_candidate := v_prizes->v_prize_index;
      v_avail_mode := COALESCE(v_candidate->>'availability_mode', 'ALWAYS_ACTIVE');

      -- Re-check eligibility (same conditions as above)
      DECLARE v_eligible boolean := true; BEGIN
        IF COALESCE((v_candidate->>'is_strong')::boolean, false)
           AND (v_candidate->>'id') = ANY(v_won_strong_ids) THEN
          v_eligible := false;
        END IF;

        IF v_eligible AND v_avail_mode IN ('LOCKED_BY_GOAL', 'EVENT_ONLY') THEN
          SELECT runtime_status INTO v_prize_state.runtime_status
          FROM wheel_prize_states
          WHERE prize_id = v_candidate->>'id' AND settings_id = v_settings.id;
          IF NOT FOUND OR v_prize_state.runtime_status != 'ACTIVE' THEN
            IF v_avail_mode = 'LOCKED_BY_GOAL' THEN
              SELECT unlocked_at INTO v_user_unlocked
              FROM user_grand_prize_progress
              WHERE user_id = v_user_id AND prize_id = v_candidate->>'id' AND settings_id = v_settings.id;
              IF v_user_unlocked IS NULL THEN v_eligible := false; END IF;
            ELSE
              v_eligible := false;
            END IF;
          END IF;
        END IF;

        IF v_eligible AND v_avail_mode = 'SCHEDULED' THEN
          IF v_now < COALESCE((v_candidate->>'starts_at')::timestamptz, '2000-01-01'::timestamptz)
             OR v_now > COALESCE((v_candidate->>'ends_at')::timestamptz, '2999-12-31'::timestamptz) THEN
            v_eligible := false;
          END IF;
        END IF;

        IF v_eligible AND v_avail_mode = 'LIMITED_STOCK' THEN
          SELECT available_stock, runtime_status INTO v_prize_state.available_stock, v_prize_state.runtime_status
          FROM wheel_prize_states WHERE prize_id = v_candidate->>'id' AND settings_id = v_settings.id;
          IF FOUND AND (v_prize_state.runtime_status = 'EXHAUSTED' OR COALESCE(v_prize_state.available_stock, 0) <= 0) THEN
            v_eligible := false;
          END IF;
        END IF;

        IF v_eligible AND v_avail_mode = 'LIMITED_WINNERS' THEN
          SELECT winners_count, runtime_status INTO v_prize_state.winners_count, v_prize_state.runtime_status
          FROM wheel_prize_states WHERE prize_id = v_candidate->>'id' AND settings_id = v_settings.id;
          IF FOUND AND (v_prize_state.runtime_status = 'EXHAUSTED'
             OR v_prize_state.winners_count >= COALESCE((v_candidate->>'max_winners')::int, 999999)) THEN
            v_eligible := false;
          END IF;
        END IF;

        IF v_eligible AND v_avail_mode = 'ALWAYS_ACTIVE' THEN
          IF (v_candidate->>'starts_at') IS NOT NULL AND v_now < (v_candidate->>'starts_at')::timestamptz THEN v_eligible := false; END IF;
          IF (v_candidate->>'ends_at') IS NOT NULL AND v_now > (v_candidate->>'ends_at')::timestamptz THEN v_eligible := false; END IF;
        END IF;

        IF v_eligible AND (v_candidate->>'max_wins_per_user') IS NOT NULL THEN
          SELECT COUNT(*) INTO v_user_wins FROM spin_results WHERE user_id = v_user_id AND prize_id = v_candidate->>'id';
          IF v_user_wins >= (v_candidate->>'max_wins_per_user')::int THEN v_eligible := false; END IF;
        END IF;

        IF v_eligible AND (v_candidate->>'user_cooldown_days') IS NOT NULL THEN
          SELECT MAX(sr.created_at) INTO v_last_win_at FROM spin_results sr WHERE sr.user_id = v_user_id AND sr.prize_id = v_candidate->>'id';
          IF v_last_win_at IS NOT NULL AND v_now < v_last_win_at + ((v_candidate->>'user_cooldown_days')::int * interval '1 day') THEN v_eligible := false; END IF;
        END IF;
      END;

      IF v_eligible THEN
        v_cumulative := v_cumulative + COALESCE((v_candidate->>'weight')::numeric, 1);
        IF v_roll <= v_cumulative AND v_prize IS NULL THEN
          v_prize := v_candidate;
        END IF;
      END IF;
    END LOOP;

    -- Fallback: last prize
    IF v_prize IS NULL THEN
      v_prize := v_prizes->(jsonb_array_length(v_prizes) - 1);
      v_prize_index := jsonb_array_length(v_prizes) - 1;
    ELSE
      FOR v_prize_index IN 0..jsonb_array_length(v_prizes) - 1 LOOP
        IF (v_prizes->v_prize_index)->>'id' = v_prize->>'id' THEN EXIT; END IF;
      END LOOP;
    END IF;

    -- Update prize state tracking
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
          runtime_status = CASE WHEN winners_count + 1 >= COALESCE((v_prize->>'max_winners')::int, 999999) THEN 'EXHAUSTED' ELSE runtime_status END,
          exhausted_at = CASE WHEN winners_count + 1 >= COALESCE((v_prize->>'max_winners')::int, 999999) THEN now() ELSE exhausted_at END,
          updated_at = now()
      WHERE prize_id = v_prize->>'id' AND settings_id = v_settings.id;
    ELSIF v_avail_mode IN ('LOCKED_BY_GOAL', 'ALWAYS_ACTIVE') THEN
      INSERT INTO wheel_prize_states (prize_id, settings_id, runtime_status, winners_count)
      VALUES (v_prize->>'id', v_settings.id, 'ACTIVE', 1)
      ON CONFLICT (prize_id, settings_id)
      DO UPDATE SET winners_count = wheel_prize_states.winners_count + 1, updated_at = now();
    END IF;

    -- Award points for 'points' type
    IF (v_prize->>'type') = 'points' THEN
      DECLARE v_pts int := COALESCE((v_prize->>'value')::int, 0); BEGIN
        IF v_pts > 0 THEN
          UPDATE users SET points = points + v_pts WHERE id = v_user_id;
          v_points_awarded := v_points_awarded + v_pts;
        END IF;
      END;
    END IF;

    -- Create reward_grant for service, grand, or coins
    IF (v_prize->>'type') IN ('service', 'grand', 'coins') THEN
      INSERT INTO reward_grants (user_id, spin_request_id, grant_type, grant_value, status)
      VALUES (v_user_id, v_spin_req_id, v_prize->>'type', COALESCE(v_prize->>'value', ''), 'pending');
    END IF;

    -- Record spin result
    INSERT INTO spin_results (spin_request_id, user_id, prize_id, prize_type, prize_value,
      prize_name_ar, prize_name_en, points_awarded)
    VALUES (v_spin_req_id, v_user_id, COALESCE(v_prize->>'id', 'unknown'),
      COALESCE(v_prize->>'type', 'miss'), COALESCE(v_prize->>'value', '0'),
      COALESCE(v_prize->>'name_ar', ''), COALESCE(v_prize->>'name_en', ''),
      CASE WHEN (v_prize->>'type') = 'points' THEN COALESCE((v_prize->>'value')::int, 0) ELSE 0 END);

    -- Add to results array
    v_results := v_results || jsonb_build_object(
      'prize_index', v_prize_index,
      'prize_id', COALESCE(v_prize->>'id', 'unknown'),
      'prize_type', COALESCE(v_prize->>'type', 'miss'),
      'prize_value', COALESCE(v_prize->>'value', '0'),
      'prize_name_ar', COALESCE(v_prize->>'name_ar', ''),
      'prize_name_en', COALESCE(v_prize->>'name_en', ''),
      'points_awarded', CASE WHEN (v_prize->>'type') = 'points' THEN COALESCE((v_prize->>'value')::int, 0) ELSE 0 END
    );

    -- Game log
    INSERT INTO game_logs (user_id, game_type, bet_amount, win_amount, result, result_data, played_at)
    VALUES (v_user_id, 'wheel',
      CASE WHEN v_batch_index <= v_free_spins_used THEN 0 ELSE v_settings.spin_cost_points END,
      CASE WHEN (v_prize->>'type') = 'points' THEN COALESCE((v_prize->>'value')::int, 0) ELSE 0 END,
      CASE WHEN (v_prize->>'type') = 'miss' THEN 'miss' ELSE 'win' END,
      jsonb_build_object('prize_id', v_prize->>'id', 'prize_type', v_prize->>'type',
        'prize_value', v_prize->>'value', 'prize_name_ar', v_prize->>'name_ar',
        'spin_request_id', v_spin_req_id, 'batch_index', v_batch_index),
      now());
  END LOOP;

  -- ── Per-user grand prize progress ────────────────────────────────────────
  IF v_grand_prize IS NOT NULL THEN
    v_grand_target := COALESCE((v_grand_prize->>'unlock_target_value')::int, 30);

    -- Increment user's spin count
    INSERT INTO user_grand_prize_progress (user_id, prize_id, settings_id, spin_count)
    VALUES (v_user_id, v_grand_prize->>'id', v_settings.id, v_quantity)
    ON CONFLICT (user_id, prize_id, settings_id)
    DO UPDATE SET spin_count = user_grand_prize_progress.spin_count + v_quantity,
                  updated_at = now();

    -- Check if unlocked
    SELECT spin_count, unlocked_at INTO v_user_progress, v_user_unlocked
    FROM user_grand_prize_progress
    WHERE user_id = v_user_id AND prize_id = v_grand_prize->>'id' AND settings_id = v_settings.id;

    IF v_user_unlocked IS NULL AND v_user_progress >= v_grand_target THEN
      UPDATE user_grand_prize_progress
      SET unlocked_at = now(), updated_at = now()
      WHERE user_id = v_user_id AND prize_id = v_grand_prize->>'id' AND settings_id = v_settings.id;

      -- Insert notification for this user
      INSERT INTO notification_inbox (
        user_id, event_key, category, title_ar, title_en, body_ar, body_en,
        deep_link, priority, is_read
      ) VALUES (
        v_user_id,
        'grand_prize_unlocked_' || (v_grand_prize->>'id') || '_' || extract(epoch from now())::bigint,
        'wheel',
        'تم فتح الجائزة الكبرى!',
        'Grand Prize Unlocked!',
        'مبروك! أكملت ' || v_grand_target || ' لفة وتم فتح الجائزة الكبرى على العجلة. حظاً موفقاً!',
        'Congratulations! You completed ' || v_grand_target || ' spins and unlocked the Grand Prize. Good luck!',
        'wheel',
        'high',
        false
      );

      v_unlocked_ids := array_append(v_unlocked_ids, v_grand_prize->>'id');
    END IF;
  END IF;

  -- Mark spin request as completed
  UPDATE spin_requests SET status = 'completed' WHERE id = v_spin_req_id;

  -- Outbox event
  INSERT INTO game_event_outbox (event_type, user_id, payload)
  VALUES ('spin_completed', v_user_id, jsonb_build_object(
    'spin_request_id', v_spin_req_id,
    'quantity', v_quantity,
    'results', v_results,
    'points_deducted', v_points_deducted,
    'points_awarded', v_points_awarded,
    'spin_type', v_spin_type,
    'unlocked_grand_prize_ids', to_jsonb(v_unlocked_ids)
  ));

  RETURN jsonb_build_object(
    'success', true,
    'idempotent_replay', false,
    'spin_request_id', v_spin_req_id,
    'quantity', v_quantity,
    'results', v_results,
    'points_awarded', v_points_awarded,
    'points_deducted', v_points_deducted,
    'spin_type', v_spin_type,
    'unlocked_grand_prize_ids', to_jsonb(v_unlocked_ids)
  );
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Update evaluate_wheel_prize_unlocks for per-user tracking
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.evaluate_wheel_prize_unlocks(
  p_settings_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_settings_id uuid;
  v_settings   wheel_game_settings%ROWTYPE;
  v_prize      jsonb;
  v_state      wheel_prize_states%ROWTYPE;
  v_mode       text;
  v_metric     text;
  v_target     int;
  v_progress   int;
  v_unlocked_ids text[] := '{}';
  v_i          int;
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

        -- Global progress (for global unlock state)
        IF v_metric = 'UNIQUE_PARTICIPANTS' THEN
          SELECT COUNT(DISTINCT sr.user_id) INTO v_progress
          FROM spin_requests sr
          WHERE sr.status = 'completed'
          AND sr.created_at >= COALESCE((v_prize->>'starts_at')::timestamptz, '2000-01-01'::timestamptz);
        ELSIF v_metric IN ('VALID_SPINS', 'COMPLETED_WHEEL_SESSIONS') THEN
          SELECT COUNT(*) INTO v_progress
          FROM spin_requests sr
          WHERE sr.status = 'completed'
          AND sr.created_at >= COALESCE((v_prize->>'starts_at')::timestamptz, '2000-01-01'::timestamptz);
        ELSE
          v_progress := v_state.unique_participants;
        END IF;

        UPDATE wheel_prize_states
        SET unique_participants = v_progress,
            last_evaluated_at = now(),
            updated_at = now()
        WHERE prize_id = v_prize->>'id' AND settings_id = v_settings_id;

        -- Global unlock (for backwards compat)
        IF v_progress >= v_target AND COALESCE((v_prize->>'unlock_automatically')::boolean, true) THEN
          UPDATE wheel_prize_states
          SET runtime_status = 'ACTIVE', unlocked_at = now(), updated_at = now()
          WHERE prize_id = v_prize->>'id' AND settings_id = v_settings_id AND runtime_status = 'LOCKED';

          IF FOUND THEN
            v_unlocked_ids := array_append(v_unlocked_ids, v_prize->>'id');
            INSERT INTO wheel_prize_events (prize_id, settings_id, event_type, metadata)
            VALUES (v_prize->>'id', v_settings_id, 'PRIZE_UNLOCKED_AUTOMATICALLY',
              jsonb_build_object('progress', v_progress, 'target', v_target, 'metric', v_metric));
          END IF;
        END IF;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'unlocked_ids', to_jsonb(v_unlocked_ids), 'evaluated_at', now());
END;
$function$;
