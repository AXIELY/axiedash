/*
# Minimal fix: FK violation in batch path of perform_spin_batch

## Root cause
In the batch path, spin_results.spin_request_id was set to v_batch_id
(the surrogate id from wheel_spin_batches). But the FK
spin_results_spin_request_id_fkey expects a spin_requests.id.
v_batch_id does not exist in spin_requests → FK violation.

## Fix
1. Insert a spin_requests row for the batch (idempotent via ON CONFLICT).
2. Capture its surrogate id into v_spin_request_id.
3. Use v_spin_request_id (not v_batch_id) as spin_request_id in child inserts.
4. batch_id column still correctly uses v_batch_id for child identity.

No other logic touched. No DROP+CREATE of the function — using CREATE OR REPLACE.
*/

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
  v_cost int;
  v_user_points int;
  v_balance_before int;
  v_balance_after int;
  v_free_spins_left int;
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
  v_grand_unlock_spins int;
  v_grand_prize_id text;
  v_unlocked_grand_ids jsonb := '[]'::jsonb;
  v_batch_id uuid;
  v_unlocked_during_batch int;
  v_existing_batch record;
  v_existing_results jsonb;
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

  -- IDEMPOTENCY: Check existing batch
  IF v_is_batch THEN
    SELECT * INTO v_existing_batch
    FROM wheel_spin_batches
    WHERE user_id = v_user_id AND client_request_id = p_client_request_id
    LIMIT 1;

    IF FOUND THEN
      IF v_existing_batch.status = 'COMPLETED' THEN
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
          'random_bucket', sr.random_bucket
        ) ORDER BY sr.sequence_number)
        INTO v_existing_results
        FROM spin_results sr
        WHERE sr.batch_id = v_existing_batch.id;

        RETURN jsonb_build_object(
          'success', true, 'recovered', true,
          'batch_id', v_existing_batch.id,
          'client_request_id', p_client_request_id,
          'spin_count', v_existing_batch.spin_count,
          'cost', v_existing_batch.total_cost,
          'balance_before', v_existing_batch.balance_before,
          'balance_after', v_existing_batch.balance_after,
          'probability_version_id', v_existing_batch.probability_version_id,
          'progress', jsonb_build_object(
            'before', v_existing_batch.progress_before,
            'after', v_existing_batch.progress_after,
            'required', v_grand_unlock_spins,
            'remaining', GREATEST(v_grand_unlock_spins - v_existing_batch.progress_after, 0),
            'unlocked', v_existing_batch.progress_after >= v_grand_unlock_spins,
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
    IF EXISTS (SELECT 1 FROM spin_results WHERE user_id = v_user_id AND standalone_request_id = p_client_request_id) THEN
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
        'random_bucket', sr.random_bucket
      ))
      INTO v_existing_results
      FROM spin_results sr
      WHERE sr.user_id = v_user_id AND sr.standalone_request_id = p_client_request_id;

      RETURN jsonb_build_object('success', true, 'recovered', true,
        'results', COALESCE(v_existing_results, '[]'::jsonb), 'quantity', 1);
    END IF;
  END IF;

  -- Load settings + version
  SELECT * INTO v_settings FROM wheel_game_settings WHERE active = true LIMIT 1;
  IF v_settings IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_active_wheel');
  END IF;

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

  -- Cost
  IF p_spin_count = 1 THEN
    SELECT COUNT(*) INTO v_user_wins_today
    FROM game_logs WHERE user_id = v_user_id AND game_type = 'wheel'
    AND played_at >= date_trunc('day', now());
    v_free_spins_left := GREATEST(v_settings.free_daily_spins - v_user_wins_today, 0);
    IF v_free_spins_left > 0 AND p_payment_mode = 'free' THEN
      v_use_free := true; v_cost := 0;
    ELSE
      v_cost := v_settings.single_spin_cost;
    END IF;
  ELSIF p_spin_count = 5 THEN
    IF NOT v_settings.five_spin_enabled THEN
      RETURN jsonb_build_object('success', false, 'error', 'five_spin_disabled');
    END IF;
    v_cost := v_settings.five_spin_cost;
  ELSIF p_spin_count = 10 THEN
    IF NOT v_settings.ten_spin_enabled THEN
      RETURN jsonb_build_object('success', false, 'error', 'ten_spin_disabled');
    END IF;
    v_cost := v_settings.ten_spin_cost;
  END IF;

  -- Lock + verify balance
  SELECT points INTO v_user_points FROM users WHERE id = v_user_id FOR UPDATE;
  v_balance_before := v_user_points;
  IF NOT v_use_free AND v_user_points < v_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_points',
      'required', v_cost, 'available', v_user_points);
  END IF;

  -- Fallback + grand prize config
  SELECT elem INTO v_fallback_prize
  FROM jsonb_array_elements(v_version.prizes_snapshot) elem
  WHERE elem->>'id' = v_version.fallback_prize_id LIMIT 1;

  SELECT elem->>'id', COALESCE(
    (elem->>'unlock_target_value')::int,
    (elem->>'unlock_after_completed_spins')::int, 30)
  INTO v_grand_prize_id, v_grand_unlock_spins
  FROM jsonb_array_elements(v_version.prizes_snapshot) elem
  WHERE (elem->>'type') = 'grand' OR COALESCE((elem->>'is_grand_prize')::boolean, false)
  LIMIT 1;

  -- Current progress
  v_progress_before := 0;
  IF v_grand_prize_id IS NOT NULL THEN
    SELECT spin_count INTO v_progress_count
    FROM user_grand_prize_progress
    WHERE user_id = v_user_id AND settings_id = v_settings.id AND prize_id = v_grand_prize_id;
    v_progress_count := COALESCE(v_progress_count, 0);
    v_progress_before := v_progress_count;
  ELSE
    v_progress_count := 0;
  END IF;
  v_unlocked_during_batch := NULL;

  -- BATCH PATH
  IF v_is_batch THEN
    -- Insert spin_requests parent row (idempotent)
    INSERT INTO spin_requests (user_id, client_request_id, config_version_id, spin_type, points_deducted, status)
    VALUES (v_user_id, p_client_request_id, v_version.id, 'paid', v_cost, 'completed')
    ON CONFLICT (user_id, client_request_id) DO NOTHING
    RETURNING id INTO v_spin_request_id;

    -- If conflict (retry), select existing id
    IF v_spin_request_id IS NULL THEN
      SELECT id INTO v_spin_request_id
      FROM spin_requests
      WHERE user_id = v_user_id AND client_request_id = p_client_request_id;
    END IF;

    -- Insert batch row
    INSERT INTO wheel_spin_batches (
      user_id, client_request_id, wheel_event_id, probability_version_id,
      spin_count, total_cost, status, balance_before, progress_before)
    VALUES (v_user_id, p_client_request_id, v_settings.id, v_version.id,
      p_spin_count, v_cost, 'PROCESSING', v_balance_before, v_progress_before)
    RETURNING id INTO v_batch_id;

    -- Deduct cost once
    IF NOT v_use_free AND v_cost > 0 THEN
      UPDATE users SET points = points - v_cost WHERE id = v_user_id;
    END IF;

    FOR v_i IN 1..p_spin_count LOOP
      v_fallback_used := false; v_fallback_reason := NULL;
      v_random_bucket := floor(random() * 10000)::int;
      IF v_random_bucket >= 10000 THEN v_random_bucket := 9999; END IF;

      v_cumulative := 0; v_original_prize_id := NULL; v_prize := NULL;
      FOR v_prize IN SELECT elem FROM jsonb_array_elements(v_version.prizes_snapshot) elem LOOP
        v_cumulative := v_cumulative + (v_prize->>'probability_bp')::int;
        IF v_random_bucket < v_cumulative THEN
          v_original_prize_id := v_prize->>'id'; EXIT;
        END IF;
      END LOOP;
      IF v_original_prize_id IS NULL THEN
        v_original_prize_id := v_version.fallback_prize_id; v_prize := v_fallback_prize;
      END IF;

      v_eligible := true; v_final_prize_id := v_original_prize_id;
      IF COALESCE((v_prize->>'disabled')::boolean, false) THEN
        v_eligible := false; v_fallback_reason := 'PRIZE_DISABLED';
      END IF;
      IF v_eligible AND v_original_prize_id = v_grand_prize_id AND v_grand_unlock_spins IS NOT NULL THEN
        IF v_progress_count < v_grand_unlock_spins THEN
          v_eligible := false; v_fallback_reason := 'GRAND_PRIZE_LOCKED';
        END IF;
      END IF;
      IF v_eligible AND (v_prize->>'max_wins_per_user') IS NOT NULL AND (v_prize->>'max_wins_per_user')::int > 0 THEN
        SELECT COUNT(*) INTO v_user_wins_total FROM spin_results
        WHERE user_id = v_user_id AND final_awarded_prize_id = v_original_prize_id;
        IF v_user_wins_total >= (v_prize->>'max_wins_per_user')::int THEN
          v_eligible := false; v_fallback_reason := 'USER_CAP_REACHED';
        END IF;
      END IF;
      IF v_eligible AND (v_prize->>'max_winners_per_day') IS NOT NULL AND (v_prize->>'max_winners_per_day')::int > 0 THEN
        SELECT COUNT(*) INTO v_user_wins_today FROM spin_results
        WHERE final_awarded_prize_id = v_original_prize_id AND created_at >= date_trunc('day', now());
        IF v_user_wins_today >= (v_prize->>'max_winners_per_day')::int THEN
          v_eligible := false; v_fallback_reason := 'DAILY_CAP_REACHED';
        END IF;
      END IF;
      IF NOT v_eligible THEN
        v_fallback_used := true; v_final_prize_id := v_version.fallback_prize_id; v_prize := v_fallback_prize;
      END IF;

      v_points_awarded := 0;
      IF (v_prize->>'type') = 'points' THEN
        v_points_awarded := COALESCE((v_prize->>'value')::int, 0);
      END IF;

      -- FIX: use v_spin_request_id (spin_requests.id) not v_batch_id
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
        'sequence_number', v_i, 'spin_result_id', v_spin_result_id,
        'prize_index', (SELECT idx - 1 FROM (SELECT elem->>'id' AS pid, ROW_NUMBER() OVER () AS idx
          FROM jsonb_array_elements((SELECT prizes FROM wheel_game_settings WHERE id = v_settings.id)) elem
        ) sub WHERE sub.pid = v_final_prize_id LIMIT 1),
        'prize_id', v_final_prize_id, 'prize_type', v_prize->>'type', 'prize_value', v_prize->>'value',
        'prize_name_ar', v_prize->>'name_ar', 'prize_name_en', v_prize->>'name_en',
        'points_awarded', v_points_awarded, 'fallback_used', v_fallback_used,
        'original_prize_id', v_original_prize_id, 'random_bucket', v_random_bucket,
        'progress_before', v_progress_count - 1, 'progress_after', v_progress_count));
    END LOOP;

    IF v_grand_prize_id IS NOT NULL THEN
      INSERT INTO user_grand_prize_progress (user_id, settings_id, prize_id, spin_count, updated_at)
      VALUES (v_user_id, v_settings.id, v_grand_prize_id, v_progress_count, now())
      ON CONFLICT (user_id, settings_id, prize_id)
      DO UPDATE SET spin_count = v_progress_count, updated_at = now(),
        unlocked_at = CASE WHEN user_grand_prize_progress.unlocked_at IS NULL AND v_progress_count >= v_grand_unlock_spins
          THEN now() ELSE user_grand_prize_progress.unlocked_at END;
    END IF;

    SELECT points INTO v_balance_after FROM users WHERE id = v_user_id;
    UPDATE wheel_spin_batches SET status = 'COMPLETED', balance_after = v_balance_after,
      progress_after = v_progress_count, completed_at = now() WHERE id = v_batch_id;

    RETURN jsonb_build_object('success', true, 'batch_id', v_batch_id,
      'client_request_id', p_client_request_id, 'spin_count', p_spin_count,
      'cost', v_cost, 'balance_before', v_balance_before, 'balance_after', v_balance_after,
      'probability_version_id', v_version.id,
      'progress', jsonb_build_object('before', v_progress_before, 'after', v_progress_count,
        'required', v_grand_unlock_spins, 'remaining', GREATEST(v_grand_unlock_spins - v_progress_count, 0),
        'unlocked', v_progress_count >= v_grand_unlock_spins, 'unlocked_during_batch_at', v_unlocked_during_batch),
      'results', v_results);

  -- SINGLE SPIN PATH
  ELSE
    IF NOT v_use_free AND v_cost > 0 THEN
      UPDATE users SET points = points - v_cost WHERE id = v_user_id;
    END IF;

    INSERT INTO spin_requests (user_id, client_request_id, config_version_id, spin_type, points_deducted, status)
    VALUES (v_user_id, p_client_request_id, v_version.id,
      CASE WHEN v_use_free THEN 'free' ELSE 'paid' END, v_cost, 'completed')
    RETURNING id INTO v_spin_request_id;

    v_random_bucket := floor(random() * 10000)::int;
    IF v_random_bucket >= 10000 THEN v_random_bucket := 9999; END IF;
    v_cumulative := 0; v_original_prize_id := NULL; v_prize := NULL;
    FOR v_prize IN SELECT elem FROM jsonb_array_elements(v_version.prizes_snapshot) elem LOOP
      v_cumulative := v_cumulative + (v_prize->>'probability_bp')::int;
      IF v_random_bucket < v_cumulative THEN v_original_prize_id := v_prize->>'id'; EXIT; END IF;
    END LOOP;
    IF v_original_prize_id IS NULL THEN v_original_prize_id := v_version.fallback_prize_id; v_prize := v_fallback_prize; END IF;

    v_eligible := true; v_final_prize_id := v_original_prize_id;
    IF COALESCE((v_prize->>'disabled')::boolean, false) THEN v_eligible := false; v_fallback_reason := 'PRIZE_DISABLED'; END IF;
    IF v_eligible AND v_original_prize_id = v_grand_prize_id AND v_grand_unlock_spins IS NOT NULL THEN
      IF v_progress_count < v_grand_unlock_spins THEN v_eligible := false; v_fallback_reason := 'GRAND_PRIZE_LOCKED'; END IF;
    END IF;
    IF v_eligible AND (v_prize->>'max_wins_per_user') IS NOT NULL AND (v_prize->>'max_wins_per_user')::int > 0 THEN
      SELECT COUNT(*) INTO v_user_wins_total FROM spin_results WHERE user_id = v_user_id AND final_awarded_prize_id = v_original_prize_id;
      IF v_user_wins_total >= (v_prize->>'max_wins_per_user')::int THEN v_eligible := false; v_fallback_reason := 'USER_CAP_REACHED'; END IF;
    END IF;
    IF v_eligible AND (v_prize->>'max_winners_per_day') IS NOT NULL AND (v_prize->>'max_winners_per_day')::int > 0 THEN
      SELECT COUNT(*) INTO v_user_wins_today FROM spin_results WHERE final_awarded_prize_id = v_original_prize_id AND created_at >= date_trunc('day', now());
      IF v_user_wins_today >= (v_prize->>'max_winners_per_day')::int THEN v_eligible := false; v_fallback_reason := 'DAILY_CAP_REACHED'; END IF;
    END IF;
    IF NOT v_eligible THEN v_fallback_used := true; v_final_prize_id := v_version.fallback_prize_id; v_prize := v_fallback_prize; END IF;

    v_points_awarded := 0;
    IF (v_prize->>'type') = 'points' THEN v_points_awarded := COALESCE((v_prize->>'value')::int, 0); END IF;

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

    IF v_points_awarded > 0 THEN UPDATE users SET points = points + v_points_awarded WHERE id = v_user_id; END IF;

    IF (v_prize->>'type') IN ('service', 'grand', 'coins') AND NOT v_fallback_used THEN
      INSERT INTO reward_grants (user_id, spin_request_id, grant_type, grant_value, status, spin_result_id)
      VALUES (v_user_id, v_spin_request_id, v_prize->>'type', COALESCE(v_prize->>'value', ''), 'pending', v_spin_result_id);
    END IF;

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
        unlocked_at = CASE WHEN user_grand_prize_progress.unlocked_at IS NULL AND v_progress_count >= v_grand_unlock_spins
          THEN now() ELSE user_grand_prize_progress.unlocked_at END;
    END IF;

    INSERT INTO game_logs (user_id, game_type, bet_amount, win_amount, result, result_data, played_at)
    VALUES (v_user_id, 'wheel', 0, v_points_awarded,
      CASE WHEN (v_prize->>'type') = 'miss' THEN 'miss' ELSE 'win' END,
      jsonb_build_object('prize_id', v_final_prize_id, 'prize_type', v_prize->>'type',
        'fallback_used', v_fallback_used, 'sequence', 1), now());

    SELECT points INTO v_balance_after FROM users WHERE id = v_user_id;

    v_results := jsonb_build_array(jsonb_build_object(
      'sequence_number', 1, 'spin_result_id', v_spin_result_id,
      'prize_index', (SELECT idx - 1 FROM (SELECT elem->>'id' AS pid, ROW_NUMBER() OVER () AS idx
        FROM jsonb_array_elements((SELECT prizes FROM wheel_game_settings WHERE id = v_settings.id)) elem
      ) sub WHERE sub.pid = v_final_prize_id LIMIT 1),
      'prize_id', v_final_prize_id, 'prize_type', v_prize->>'type', 'prize_value', v_prize->>'value',
      'prize_name_ar', v_prize->>'name_ar', 'prize_name_en', v_prize->>'name_en',
      'points_awarded', v_points_awarded, 'fallback_used', v_fallback_used,
      'original_prize_id', v_original_prize_id, 'random_bucket', v_random_bucket,
      'progress_before', v_progress_count - 1, 'progress_after', v_progress_count));

    RETURN jsonb_build_object('success', true, 'batch_id', null,
      'client_request_id', p_client_request_id, 'spin_count', 1,
      'cost', v_cost, 'balance_before', v_balance_before, 'balance_after', v_balance_after,
      'probability_version_id', v_version.id,
      'progress', jsonb_build_object('before', v_progress_before, 'after', v_progress_count,
        'required', v_grand_unlock_spins, 'remaining', GREATEST(v_grand_unlock_spins - v_progress_count, 0),
        'unlocked', v_progress_count >= v_grand_unlock_spins, 'unlocked_during_batch_at', null),
      'results', v_results);
  END IF;
END;
$function$;