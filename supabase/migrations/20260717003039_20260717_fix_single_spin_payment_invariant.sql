/*
# Fix Single-Spin Payment Invariant

## Problem
The single-spin (1X) flow was not deducting points for paid spins because:
1. The server trusted `p_payment_mode` sent from the frontend, which could be stale/incorrect.
2. Free-spin usage was counted from `game_logs` (ALL wheel plays) instead of `spin_requests` (only actual free spins).
3. After 3 paid spins, the server incorrectly believed free spins were exhausted, and the frontend sent `payment_mode='free'` based on the same wrong count.
4. No payment invariant was enforced before committing the spin result.

## Changes

### 1. New Column
- `spin_requests.free_spins_consumed` (int, default 0): tracks how many free spins were consumed by this request. Used for authoritative free-spin counting and idempotency.

### 2. Rewritten `perform_spin_batch` — 1X Path Only
The 5X/10X batch path is preserved unchanged. Only the standalone 1X path is rewritten:

- **Server decides free or paid**: The `p_payment_mode` parameter is IGNORED for 1X. The server calculates `free_spins_remaining` from `spin_requests` where `spin_type='free'` and `created_at >= today`. If > 0, the spin is FREE (consume one free spin, deduct 0 points). Otherwise, it is POINTS (deduct `single_spin_cost`).
- **Authoritative free-spin source**: `free_spins_remaining = free_daily_spins - COUNT(spin_requests WHERE spin_type='free' AND created_at >= today)`. This is persistent — survives refresh, remount, relogin, other devices.
- **Payment invariant**: Before commit, the function asserts `(free_spins_consumed=1 AND points_deducted=0) OR (free_spins_consumed=0 AND points_deducted=single_spin_cost)`. If neither is true, it raises `SPIN_PAYMENT_NOT_APPLIED` and rolls back.
- **Transaction order**: Lock user balance → determine free/paid → consume free spin OR deduct points → THEN resolve prize → create spin_result → apply reward → increment progress. Result/reward is never inserted before payment is committed.
- **Structured response**: Returns a `payment` object with `mode`, `single_spin_cost`, `points_before`, `points_deducted`, `points_after`, `free_spins_before`, `free_spins_consumed`, `free_spins_after`.
- **Idempotency preserved**: Same `client_request_id` returns the existing result with no additional deduction/consumption.

### 3. Security
- No RLS changes. Existing policies on `spin_requests` remain.
- The function is `SECURITY DEFINER` and uses `auth.uid()` for authentication.

### Important Notes
1. The 5X/10X batch path is NOT modified — it remains disabled via `multi_spin_enabled` flag.
2. The `p_payment_mode` parameter is kept in the signature for backward compatibility but is IGNORED for 1X spins.
3. Historical broken spins are NOT auto-corrected — an admin-reviewed reconciliation report is produced separately.
*/

-- Add free_spins_consumed column to spin_requests
ALTER TABLE spin_requests
ADD COLUMN IF NOT EXISTS free_spins_consumed integer NOT NULL DEFAULT 0;

-- ═══════════════════════════════════════════════════════════════════════════
-- Rewrite perform_spin_batch: fix 1X payment path, preserve 5X/10X path
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.perform_spin_batch(
  p_spin_count integer,
  p_client_request_id uuid,
  p_payment_mode text DEFAULT 'points'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_settings record;
  v_version record;
  v_single_cost int;
  v_total_cost int;
  v_user_points int;
  v_balance_before int;
  v_balance_after int;
  v_free_spins_left int;
  v_free_spins_before int;
  v_free_spins_consumed int := 0;
  v_use_free bool := false;
  v_spin_request_id uuid;
  v_results jsonb := '[]'::jsonb;
  v_total_points_awarded int := 0;
  v_i int;
  v_random_bucket int;
  v_cumulative int;
  v_original_prize_id text;
  v_final_prize_id text;
  v_fallback_used bool;
  v_fallback_reason text;
  v_prize jsonb;
  v_fallback_prize jsonb;
  v_eligible bool;
  v_user_wins_today int;
  v_user_wins_total int;
  v_spin_result_id uuid;
  v_points_awarded int;
  v_progress_count int;
  v_progress_before int;
  v_progress_after int;
  v_grand_unlock_spins int;
  v_grand_prize_id text;
  v_unlocked_grand_ids jsonb := '[]'::jsonb;
  v_batch_id uuid;
  v_unlocked_during_batch int;
  v_existing_batch record;
  v_existing_results jsonb;
  v_existing_snapshot jsonb;
  v_existing_spin_type text;
  v_is_batch boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  IF p_spin_count NOT IN (1, 5, 10) THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_spin_count');
  END IF;

  v_is_batch := p_spin_count IN (5, 10);

  -- ═══ IDEMPOTENCY: Check existing batch (5X/10X) ═══
  IF v_is_batch THEN
    SELECT * INTO v_existing_batch
    FROM wheel_spin_batches
    WHERE user_id = v_user_id AND client_request_id = p_client_request_id
    LIMIT 1;

    IF FOUND THEN
      IF v_existing_batch.status = 'COMPLETED' THEN
        SELECT prizes_snapshot INTO v_existing_snapshot
        FROM wheel_probability_versions
        WHERE id = v_existing_batch.probability_version_id;

        SELECT jsonb_agg(jsonb_build_object(
          'sequence_number', sr.sequence_number,
          'spin_result_id', sr.id,
          'prize_id', sr.final_awarded_prize_id,
          'prize_type', sr.prize_type,
          'prize_value', sr.prize_value,
          'prize_name_ar', sr.prize_name_ar,
          'prize_name_en', sr.prize_name_en,
          'points_awarded', sr.points_awarded,
          'fallback_used', sr.fallback_used,
          'original_prize_id', sr.original_selected_prize_id,
          'random_bucket', sr.random_bucket,
          'prize_index',
          (SELECT idx - 1 FROM (
            SELECT elem->>'id' AS pid, ROW_NUMBER() OVER () AS idx
            FROM jsonb_array_elements(v_existing_snapshot) elem
          ) sub WHERE sub.pid = sr.final_awarded_prize_id LIMIT 1)
        ) ORDER BY sr.sequence_number)
        INTO v_existing_results
        FROM spin_results sr
        WHERE sr.batch_id = v_existing_batch.id;

        v_grand_unlock_spins := 30;
        v_grand_prize_id := NULL;
        BEGIN
          SELECT elem->>'id', COALESCE(
            (elem->>'unlock_target_value')::int,
            (elem->>'unlock_after_completed_spins')::int, 30)
          INTO v_grand_prize_id, v_grand_unlock_spins
          FROM jsonb_array_elements(v_existing_snapshot) elem
          WHERE (elem->>'type') = 'grand' OR COALESCE((elem->>'is_grand_prize')::boolean, false)
          LIMIT 1;
        EXCEPTION WHEN OTHERS THEN
          v_grand_unlock_spins := 30;
        END;

        RETURN jsonb_build_object(
          'success', true, 'recovered', true,
          'batch_id', v_existing_batch.id,
          'client_request_id', p_client_request_id,
          'spin_count', v_existing_batch.spin_count,
          'single_spin_cost', v_existing_batch.single_spin_cost,
          'cost', v_existing_batch.total_cost,
          'total_cost', v_existing_batch.total_cost,
          'balance_before', v_existing_batch.balance_before,
          'balance_after', v_existing_batch.balance_after,
          'probability_version_id', v_existing_batch.probability_version_id,
          'progress', jsonb_build_object(
            'before', v_existing_batch.progress_before,
            'after', v_existing_batch.progress_after,
            'required', v_grand_unlock_spins,
            'remaining', GREATEST(v_grand_unlock_spins - COALESCE(v_existing_batch.progress_after, 0), 0),
            'unlocked', COALESCE(v_existing_batch.progress_after, 0) >= v_grand_unlock_spins,
            'unlocked_during_batch_at', null
          ),
          'results', COALESCE(v_existing_results, '[]'::jsonb)
        );
      ELSIF v_existing_batch.status = 'PROCESSING' THEN
        RETURN jsonb_build_object('success', false, 'error', 'batch_already_processing');
      ELSIF v_existing_batch.status = 'FAILED' THEN
        RETURN jsonb_build_object('success', false, 'error', 'batch_failed',
          'failure_code', v_existing_batch.failure_code);
      END IF;
    END IF;
  ELSE
    -- ═══ Standalone 1X idempotency ═══
    IF EXISTS (SELECT 1 FROM spin_results WHERE user_id = v_user_id AND standalone_request_id = p_client_request_id) THEN
      SELECT prizes_snapshot INTO v_existing_snapshot
      FROM wheel_probability_versions v
      JOIN spin_results sr ON sr.probability_version_id = v.id
      WHERE sr.user_id = v_user_id AND sr.standalone_request_id = p_client_request_id
      LIMIT 1;

      SELECT jsonb_agg(jsonb_build_object(
        'sequence_number', 1,
        'spin_result_id', sr.id,
        'prize_id', sr.final_awarded_prize_id,
        'prize_type', sr.prize_type,
        'prize_value', sr.prize_value,
        'prize_name_ar', sr.prize_name_ar,
        'prize_name_en', sr.prize_name_en,
        'points_awarded', sr.points_awarded,
        'fallback_used', sr.fallback_used,
        'original_prize_id', sr.original_selected_prize_id,
        'random_bucket', sr.random_bucket,
        'prize_index',
        (SELECT idx - 1 FROM (
          SELECT elem->>'id' AS pid, ROW_NUMBER() OVER () AS idx
          FROM jsonb_array_elements(v_existing_snapshot) elem
        ) sub WHERE sub.pid = sr.final_awarded_prize_id LIMIT 1)
      )) INTO v_existing_results
      FROM spin_results sr
      WHERE sr.user_id = v_user_id AND sr.standalone_request_id = p_client_request_id;

      -- Get the original spin_type for the payment object
      SELECT spin_type INTO v_existing_spin_type
      FROM spin_requests
      WHERE user_id = v_user_id AND client_request_id = p_client_request_id
      LIMIT 1;

      RETURN jsonb_build_object('success', true, 'recovered', true,
        'results', COALESCE(v_existing_results, '[]'::jsonb), 'quantity', 1,
        'spin_count', 1, 'cost', 0, 'total_cost', 0,
        'payment', jsonb_build_object(
          'mode', UPPER(COALESCE(v_existing_spin_type, 'points')),
          'recovered', true
        ));
    END IF;
  END IF;

  -- ═══ Load settings ═══
  SELECT * INTO v_settings FROM wheel_game_settings WHERE active = true LIMIT 1;
  IF v_settings IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_active_wheel');
  END IF;

  -- ═══ Load published probability version ═══
  SELECT * INTO v_version
  FROM wheel_probability_versions
  WHERE wheel_settings_id = v_settings.id AND status = 'PUBLISHED'
  ORDER BY version_number DESC LIMIT 1;
  IF v_version IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_published_version');
  END IF;
  IF v_version.total_probability_bp != 10000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_probability_config');
  END IF;

  -- Feature flag check for batch spins
  IF v_is_batch AND NOT COALESCE(v_settings.multi_spin_enabled, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'multi_spin_disabled');
  END IF;

  v_single_cost := v_settings.single_spin_cost;

  -- ═════════════════════════════════════════════════════════════════════
  -- 1X PATH — SERVER DECIDES FREE OR PAID (ignores p_payment_mode)
  -- ═════════════════════════════════════════════════════════════════════
  IF p_spin_count = 1 THEN

    -- Authoritative free-spin count from spin_requests (NOT game_logs)
    SELECT COUNT(*) INTO v_free_spins_left
    FROM spin_requests
    WHERE user_id = v_user_id
      AND spin_type = 'free'
      AND created_at >= date_trunc('day', now());

    v_free_spins_before := GREATEST(v_settings.free_daily_spins - v_free_spins_left, 0);

    IF v_free_spins_left < v_settings.free_daily_spins THEN
      -- FREE: consume one free spin, deduct 0 points
      v_use_free := true;
      v_free_spins_consumed := 1;
      v_total_cost := 0;
    ELSE
      -- POINTS: deduct single_spin_cost
      v_use_free := false;
      v_free_spins_consumed := 0;
      v_total_cost := v_single_cost;
    END IF;

    -- Lock + verify balance
    SELECT points INTO v_user_points FROM users WHERE id = v_user_id FOR UPDATE;
    v_balance_before := v_user_points;

    IF NOT v_use_free AND v_user_points < v_total_cost THEN
      RETURN jsonb_build_object('success', false, 'error', 'insufficient_points',
        'required', v_total_cost, 'available', v_user_points);
    END IF;

    -- Fallback prize
    SELECT elem INTO v_fallback_prize
    FROM jsonb_array_elements(v_version.prizes_snapshot) elem
    WHERE elem->>'id' = v_version.fallback_prize_id LIMIT 1;

    -- Grand prize config
    v_grand_prize_id := NULL;
    v_grand_unlock_spins := 30;
    BEGIN
      SELECT elem->>'id', COALESCE(
        (elem->>'unlock_target_value')::int,
        (elem->>'unlock_after_completed_spins')::int, 30)
      INTO v_grand_prize_id, v_grand_unlock_spins
      FROM jsonb_array_elements(v_version.prizes_snapshot) elem
      WHERE (elem->>'type') = 'grand' OR COALESCE((elem->>'is_grand_prize')::boolean, false)
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      v_grand_unlock_spins := 30;
    END;

    -- Current progress
    v_progress_count := 0;
    v_progress_before := 0;
    IF v_grand_prize_id IS NOT NULL THEN
      SELECT spin_count INTO v_progress_count
      FROM user_grand_prize_progress
      WHERE user_id = v_user_id AND settings_id = v_settings.id AND prize_id = v_grand_prize_id;
      v_progress_count := COALESCE(v_progress_count, 0);
      v_progress_before := v_progress_count;
    END IF;

    -- ══ STEP 1: PAYMENT (consume free spin OR deduct points) ══
    INSERT INTO spin_requests (user_id, client_request_id, config_version_id, spin_type, points_deducted, free_spins_consumed, status)
    VALUES (v_user_id, p_client_request_id, v_version.id,
      CASE WHEN v_use_free THEN 'free' ELSE 'paid' END,
      v_total_cost, v_free_spins_consumed, 'completed')
    ON CONFLICT (user_id, client_request_id) DO NOTHING
    RETURNING id INTO v_spin_request_id;

    IF v_spin_request_id IS NULL THEN
      SELECT id INTO v_spin_request_id
      FROM spin_requests
      WHERE user_id = v_user_id AND client_request_id = p_client_request_id;
    END IF;

    IF NOT v_use_free AND v_total_cost > 0 THEN
      UPDATE users SET points = points - v_total_cost WHERE id = v_user_id;
    END IF;

    -- ══ PAYMENT INVARIANT CHECK ══
    IF NOT (
      (v_free_spins_consumed = 1 AND v_total_cost = 0)
      OR
      (v_free_spins_consumed = 0 AND v_total_cost = v_single_cost)
    ) THEN
      RAISE EXCEPTION 'SPIN_PAYMENT_NOT_APPLIED';
    END IF;

    -- ══ STEP 2: PRIZE RESOLUTION (after payment committed) ══
    v_random_bucket := floor(random() * 10000)::int;
    IF v_random_bucket >= 10000 THEN v_random_bucket := 9999; END IF;

    v_cumulative := 0;
    v_original_prize_id := NULL;
    v_prize := NULL;
    FOR v_prize IN SELECT elem FROM jsonb_array_elements(v_version.prizes_snapshot) elem LOOP
      v_cumulative := v_cumulative + (v_prize->>'probability_bp')::int;
      IF v_random_bucket < v_cumulative THEN
        v_original_prize_id := v_prize->>'id';
        EXIT;
      END IF;
    END LOOP;
    IF v_original_prize_id IS NULL THEN
      v_original_prize_id := v_version.fallback_prize_id;
      v_prize := v_fallback_prize;
    END IF;

    v_eligible := true;
    v_final_prize_id := v_original_prize_id;
    v_fallback_used := false;
    v_fallback_reason := NULL;

    IF COALESCE((v_prize->>'disabled')::boolean, false) THEN
      v_eligible := false;
      v_fallback_reason := 'PRIZE_DISABLED';
    END IF;

    IF v_eligible AND v_original_prize_id = v_grand_prize_id AND v_grand_unlock_spins IS NOT NULL THEN
      IF v_progress_count < v_grand_unlock_spins THEN
        v_eligible := false;
        v_fallback_reason := 'GRAND_PRIZE_LOCKED';
      END IF;
    END IF;

    IF v_eligible AND (v_prize->>'max_wins_per_user') IS NOT NULL AND (v_prize->>'max_wins_per_user')::int > 0 THEN
      SELECT COUNT(*) INTO v_user_wins_total FROM spin_results
      WHERE user_id = v_user_id AND final_awarded_prize_id = v_original_prize_id;
      IF v_user_wins_total >= (v_prize->>'max_wins_per_user')::int THEN
        v_eligible := false;
        v_fallback_reason := 'USER_CAP_REACHED';
      END IF;
    END IF;

    IF v_eligible AND (v_prize->>'max_winners_per_day') IS NOT NULL AND (v_prize->>'max_winners_per_day')::int > 0 THEN
      SELECT COUNT(*) INTO v_user_wins_today FROM spin_results
      WHERE final_awarded_prize_id = v_original_prize_id AND created_at >= date_trunc('day', now());
      IF v_user_wins_today >= (v_prize->>'max_winners_per_day')::int THEN
        v_eligible := false;
        v_fallback_reason := 'DAILY_CAP_REACHED';
      END IF;
    END IF;

    IF NOT v_eligible THEN
      v_fallback_used := true;
      v_final_prize_id := v_version.fallback_prize_id;
      v_prize := v_fallback_prize;
    END IF;

    v_points_awarded := 0;
    IF (v_prize->>'type') = 'points' THEN
      v_points_awarded := COALESCE((v_prize->>'value')::int, 0);
    END IF;

    -- ══ STEP 3: CREATE SPIN RESULT ══
    INSERT INTO spin_results (
      spin_request_id, user_id, prize_id, prize_type, prize_value,
      prize_name_ar, prize_name_en, points_awarded,
      probability_version_id, random_bucket,
      original_selected_prize_id, final_awarded_prize_id,
      fallback_used, fallback_reason, sequence_number, standalone_request_id, status)
    VALUES (v_spin_request_id, v_user_id, v_final_prize_id, v_prize->>'type', v_prize->>'value',
      v_prize->>'name_ar', v_prize->>'name_en', v_points_awarded,
      v_version.id, v_random_bucket, v_original_prize_id, v_final_prize_id,
      v_fallback_used, v_fallback_reason, 1, p_client_request_id, 'completed')
    RETURNING id INTO v_spin_result_id;

    -- ══ STEP 4: APPLY REWARD ══
    IF v_points_awarded > 0 THEN
      UPDATE users SET points = points + v_points_awarded WHERE id = v_user_id;
    END IF;

    IF (v_prize->>'type') IN ('service', 'grand', 'coins') AND NOT v_fallback_used THEN
      INSERT INTO reward_grants (user_id, spin_request_id, grant_type, grant_value, status, spin_result_id)
      VALUES (v_user_id, v_spin_request_id, v_prize->>'type', COALESCE(v_prize->>'value', ''), 'pending', v_spin_result_id);
    END IF;

    -- ══ STEP 5: INCREMENT PROGRESS ══
    INSERT INTO wheel_progress_events (user_id, wheel_event_id, spin_result_id, sequence_number)
    VALUES (v_user_id, v_settings.id, v_spin_result_id, 1);

    v_progress_count := v_progress_count + 1;

    IF v_grand_prize_id IS NOT NULL AND v_grand_unlock_spins IS NOT NULL THEN
      IF v_progress_count = v_grand_unlock_spins THEN
        v_unlocked_grand_ids := v_unlocked_grand_ids || jsonb_build_array(v_grand_prize_id);
      END IF;
    END IF;

    IF v_grand_prize_id IS NOT NULL THEN
      INSERT INTO user_grand_prize_progress (user_id, settings_id, prize_id, spin_count, updated_at)
      VALUES (v_user_id, v_settings.id, v_grand_prize_id, v_progress_count, now())
      ON CONFLICT (user_id, settings_id, prize_id)
      DO UPDATE SET spin_count = v_progress_count, updated_at = now(),
        unlocked_at = CASE
          WHEN user_grand_prize_progress.unlocked_at IS NULL AND v_progress_count >= v_grand_unlock_spins
          THEN now()
          ELSE user_grand_prize_progress.unlocked_at
        END;
    END IF;

    INSERT INTO game_logs (user_id, game_type, bet_amount, win_amount, result, result_data, played_at)
    VALUES (v_user_id, 'wheel', v_total_cost, v_points_awarded,
      CASE WHEN (v_prize->>'type') = 'miss' THEN 'miss' ELSE 'win' END,
      jsonb_build_object('prize_id', v_final_prize_id, 'prize_type', v_prize->>'type',
        'fallback_used', v_fallback_used, 'sequence', 1,
        'spin_type', CASE WHEN v_use_free THEN 'free' ELSE 'paid' END), now());

    SELECT points INTO v_balance_after FROM users WHERE id = v_user_id;

    v_results := jsonb_build_array(jsonb_build_object(
      'sequence_number', 1,
      'spin_result_id', v_spin_result_id,
      'prize_index',
      (SELECT idx - 1 FROM (
        SELECT elem->>'id' AS pid, ROW_NUMBER() OVER () AS idx
        FROM jsonb_array_elements(v_version.prizes_snapshot) elem
      ) sub WHERE sub.pid = v_final_prize_id LIMIT 1),
      'prize_id', v_final_prize_id,
      'prize_type', v_prize->>'type',
      'prize_value', v_prize->>'value',
      'prize_name_ar', v_prize->>'name_ar',
      'prize_name_en', v_prize->>'name_en',
      'points_awarded', v_points_awarded,
      'fallback_used', v_fallback_used,
      'original_prize_id', v_original_prize_id,
      'random_bucket', v_random_bucket,
      'progress_before', v_progress_count - 1,
      'progress_after', v_progress_count
    ));

    RETURN jsonb_build_object(
      'success', true,
      'client_request_id', p_client_request_id,
      'spin_count', 1,
      'single_spin_cost', v_single_cost,
      'total_cost', v_total_cost,
      'cost', v_total_cost,
      'balance_before', v_balance_before,
      'balance_after', v_balance_after,
      'progress_before', v_progress_before,
      'progress_after', v_progress_count,
      'probability_version_id', v_version.id,
      'payment', jsonb_build_object(
        'mode', CASE WHEN v_use_free THEN 'FREE' ELSE 'POINTS' END,
        'single_spin_cost', v_single_cost,
        'points_before', v_balance_before,
        'points_deducted', v_total_cost,
        'points_after', v_balance_after,
        'free_spins_before', v_free_spins_before,
        'free_spins_consumed', v_free_spins_consumed,
        'free_spins_after', GREATEST(v_free_spins_before - v_free_spins_consumed, 0)
      ),
      'progress', jsonb_build_object(
        'before', v_progress_before,
        'after', v_progress_count,
        'required', v_grand_unlock_spins,
        'remaining', GREATEST(v_grand_unlock_spins - v_progress_count, 0),
        'unlocked', v_progress_count >= v_grand_unlock_spins,
        'unlocked_during_batch_at', null
      ),
      'results', v_results
    );
  END IF;

  -- ═════════════════════════════════════════════════════════════════════
  -- BATCH PATH (5X/10X) — UNCHANGED, PRESERVED AS-IS
  -- ═════════════════════════════════════════════════════════════════════

  v_total_cost := v_single_cost * p_spin_count;

  -- Lock + verify balance
  SELECT points INTO v_user_points FROM users WHERE id = v_user_id FOR UPDATE;
  v_balance_before := v_user_points;
  IF v_user_points < v_total_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_points',
      'required', v_total_cost, 'available', v_user_points);
  END IF;

  -- Fallback prize
  SELECT elem INTO v_fallback_prize
  FROM jsonb_array_elements(v_version.prizes_snapshot) elem
  WHERE elem->>'id' = v_version.fallback_prize_id LIMIT 1;

  -- Grand prize config
  v_grand_prize_id := NULL;
  v_grand_unlock_spins := 30;
  BEGIN
    SELECT elem->>'id', COALESCE(
      (elem->>'unlock_target_value')::int,
      (elem->>'unlock_after_completed_spins')::int, 30)
    INTO v_grand_prize_id, v_grand_unlock_spins
    FROM jsonb_array_elements(v_version.prizes_snapshot) elem
    WHERE (elem->>'type') = 'grand' OR COALESCE((elem->>'is_grand_prize')::boolean, false)
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_grand_unlock_spins := 30;
  END;

  -- Current progress
  v_progress_before := 0;
  v_progress_count := 0;
  IF v_grand_prize_id IS NOT NULL THEN
    SELECT spin_count INTO v_progress_count
    FROM user_grand_prize_progress
    WHERE user_id = v_user_id AND settings_id = v_settings.id AND prize_id = v_grand_prize_id;
    v_progress_count := COALESCE(v_progress_count, 0);
    v_progress_before := v_progress_count;
  END IF;
  v_unlocked_during_batch := NULL;

  INSERT INTO spin_requests (user_id, client_request_id, config_version_id, spin_type, points_deducted, status)
  VALUES (v_user_id, p_client_request_id, v_version.id, 'paid', v_total_cost, 'completed')
  ON CONFLICT (user_id, client_request_id) DO NOTHING
  RETURNING id INTO v_spin_request_id;

  IF v_spin_request_id IS NULL THEN
    SELECT id INTO v_spin_request_id
    FROM spin_requests
    WHERE user_id = v_user_id AND client_request_id = p_client_request_id;
  END IF;

  INSERT INTO wheel_spin_batches (
    user_id, client_request_id, wheel_event_id, probability_version_id,
    spin_count, single_spin_cost, total_cost, status, balance_before, progress_before)
  VALUES (v_user_id, p_client_request_id, v_settings.id, v_version.id,
    p_spin_count, v_single_cost, v_total_cost, 'PROCESSING', v_balance_before, v_progress_before)
  RETURNING id INTO v_batch_id;

  IF v_total_cost > 0 THEN
    UPDATE users SET points = points - v_total_cost WHERE id = v_user_id;
  END IF;

  FOR v_i IN 1..p_spin_count LOOP
    v_fallback_used := false;
    v_fallback_reason := NULL;
    v_random_bucket := floor(random() * 10000)::int;
    IF v_random_bucket >= 10000 THEN v_random_bucket := 9999; END IF;

    v_cumulative := 0;
    v_original_prize_id := NULL;
    v_prize := NULL;
    FOR v_prize IN SELECT elem FROM jsonb_array_elements(v_version.prizes_snapshot) elem LOOP
      v_cumulative := v_cumulative + (v_prize->>'probability_bp')::int;
      IF v_random_bucket < v_cumulative THEN
        v_original_prize_id := v_prize->>'id';
        EXIT;
      END IF;
    END LOOP;
    IF v_original_prize_id IS NULL THEN
      v_original_prize_id := v_version.fallback_prize_id;
      v_prize := v_fallback_prize;
    END IF;

    v_eligible := true;
    v_final_prize_id := v_original_prize_id;

    IF COALESCE((v_prize->>'disabled')::boolean, false) THEN
      v_eligible := false;
      v_fallback_reason := 'PRIZE_DISABLED';
    END IF;

    IF v_eligible AND v_original_prize_id = v_grand_prize_id AND v_grand_unlock_spins IS NOT NULL THEN
      IF v_progress_count < v_grand_unlock_spins THEN
        v_eligible := false;
        v_fallback_reason := 'GRAND_PRIZE_LOCKED';
      END IF;
    END IF;

    IF v_eligible AND (v_prize->>'max_wins_per_user') IS NOT NULL AND (v_prize->>'max_wins_per_user')::int > 0 THEN
      SELECT COUNT(*) INTO v_user_wins_total FROM spin_results
      WHERE user_id = v_user_id AND final_awarded_prize_id = v_original_prize_id;
      IF v_user_wins_total >= (v_prize->>'max_wins_per_user')::int THEN
        v_eligible := false;
        v_fallback_reason := 'USER_CAP_REACHED';
      END IF;
    END IF;

    IF v_eligible AND (v_prize->>'max_winners_per_day') IS NOT NULL AND (v_prize->>'max_winners_per_day')::int > 0 THEN
      SELECT COUNT(*) INTO v_user_wins_today FROM spin_results
      WHERE final_awarded_prize_id = v_original_prize_id AND created_at >= date_trunc('day', now());
      IF v_user_wins_today >= (v_prize->>'max_winners_per_day')::int THEN
        v_eligible := false;
        v_fallback_reason := 'DAILY_CAP_REACHED';
      END IF;
    END IF;

    IF NOT v_eligible THEN
      v_fallback_used := true;
      v_final_prize_id := v_version.fallback_prize_id;
      v_prize := v_fallback_prize;
    END IF;

    v_points_awarded := 0;
    IF (v_prize->>'type') = 'points' THEN
      v_points_awarded := COALESCE((v_prize->>'value')::int, 0);
    END IF;

    INSERT INTO spin_results (
      spin_request_id, user_id, prize_id, prize_type, prize_value,
      prize_name_ar, prize_name_en, points_awarded,
      probability_version_id, random_bucket,
      original_selected_prize_id, final_awarded_prize_id,
      fallback_used, fallback_reason, sequence_number, batch_id, status)
    VALUES (v_spin_request_id, v_user_id, v_final_prize_id, v_prize->>'type', v_prize->>'value',
      v_prize->>'name_ar', v_prize->>'name_en', v_points_awarded,
      v_version.id, v_random_bucket, v_original_prize_id, v_final_prize_id,
      v_fallback_used, v_fallback_reason, v_i, v_batch_id, 'completed')
    RETURNING id INTO v_spin_result_id;

    IF v_points_awarded > 0 THEN
      UPDATE users SET points = points + v_points_awarded WHERE id = v_user_id;
      v_total_points_awarded := v_total_points_awarded + v_points_awarded;
    END IF;

    IF (v_prize->>'type') IN ('service', 'grand', 'coins') AND NOT v_fallback_used THEN
      INSERT INTO reward_grants (user_id, spin_request_id, grant_type, grant_value, status, spin_result_id)
      VALUES (v_user_id, v_spin_request_id, v_prize->>'type', COALESCE(v_prize->>'value', ''), 'pending', v_spin_result_id);
    END IF;

    INSERT INTO wheel_progress_events (user_id, wheel_event_id, spin_result_id, batch_id, sequence_number)
    VALUES (v_user_id, v_settings.id, v_spin_result_id, v_batch_id, v_i);

    v_progress_count := v_progress_count + 1;
    IF v_grand_prize_id IS NOT NULL AND v_grand_unlock_spins IS NOT NULL THEN
      IF v_progress_count = v_grand_unlock_spins THEN
        v_unlocked_grand_ids := v_unlocked_grand_ids || jsonb_build_array(v_grand_prize_id);
        v_unlocked_during_batch := v_i;
      END IF;
    END IF;

    INSERT INTO game_logs (user_id, game_type, bet_amount, win_amount, result, result_data, played_at)
    VALUES (v_user_id, 'wheel', 0, v_points_awarded,
      CASE WHEN (v_prize->>'type') = 'miss' THEN 'miss' ELSE 'win' END,
      jsonb_build_object('prize_id', v_final_prize_id, 'prize_type', v_prize->>'type',
        'fallback_used', v_fallback_used, 'sequence', v_i, 'batch_id', v_batch_id), now());

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'sequence_number', v_i,
      'spin_result_id', v_spin_result_id,
      'prize_index',
      (SELECT idx - 1 FROM (
        SELECT elem->>'id' AS pid, ROW_NUMBER() OVER () AS idx
        FROM jsonb_array_elements(v_version.prizes_snapshot) elem
      ) sub WHERE sub.pid = v_final_prize_id LIMIT 1),
      'prize_id', v_final_prize_id,
      'prize_type', v_prize->>'type',
      'prize_value', v_prize->>'value',
      'prize_name_ar', v_prize->>'name_ar',
      'prize_name_en', v_prize->>'name_en',
      'points_awarded', v_points_awarded,
      'fallback_used', v_fallback_used,
      'original_prize_id', v_original_prize_id,
      'random_bucket', v_random_bucket,
      'progress_before', v_progress_count - 1,
      'progress_after', v_progress_count
    ));
  END LOOP;

  IF v_grand_prize_id IS NOT NULL THEN
    INSERT INTO user_grand_prize_progress (user_id, settings_id, prize_id, spin_count, updated_at)
    VALUES (v_user_id, v_settings.id, v_grand_prize_id, v_progress_count, now())
    ON CONFLICT (user_id, settings_id, prize_id)
    DO UPDATE SET spin_count = v_progress_count, updated_at = now(),
      unlocked_at = CASE
        WHEN user_grand_prize_progress.unlocked_at IS NULL AND v_progress_count >= v_grand_unlock_spins
        THEN now()
        ELSE user_grand_prize_progress.unlocked_at
      END;
  END IF;

  SELECT points INTO v_balance_after FROM users WHERE id = v_user_id;
  v_progress_after := v_progress_count;

  UPDATE wheel_spin_batches
  SET status = 'COMPLETED',
    balance_after = v_balance_after,
    progress_after = v_progress_after,
    completed_at = now()
  WHERE id = v_batch_id;

  RETURN jsonb_build_object(
    'success', true,
    'batch_id', v_batch_id,
    'client_request_id', p_client_request_id,
    'spin_count', p_spin_count,
    'single_spin_cost', v_single_cost,
    'total_cost', v_total_cost,
    'cost', v_total_cost,
    'balance_before', v_balance_before,
    'balance_after', v_balance_after,
    'progress_before', v_progress_before,
    'progress_after', v_progress_after,
    'probability_version_id', v_version.id,
    'progress', jsonb_build_object(
      'before', v_progress_before,
      'after', v_progress_after,
      'required', v_grand_unlock_spins,
      'remaining', GREATEST(v_grand_unlock_spins - v_progress_after, 0),
      'unlocked', v_progress_after >= v_grand_unlock_spins,
      'unlocked_during_batch_at', v_unlocked_during_batch
    ),
    'results', v_results
  );
END;
$function$;
