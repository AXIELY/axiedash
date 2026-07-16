/*
# Fix perform_spin_batch: Grand Prize Progress + reward_grants + Response

## Problems Fixed

1. **reward_grants INSERT crash**: The batch function inserted into reward_grants
   using columns `prize_name_ar`, `prize_name_en`, `prize_value` that do NOT exist
   on the table. The table only has `grant_type` and `grant_value`. This caused
   every multi-spin (5X/10X) or single-spin that landed on a service/grand/coins
   prize to fail with a SQL column-not-exists error, surfacing as
   "حدث خطأ أثناء الدوران" in the UI.

2. **Grand Prize never detected**: The function looked for `is_grand_prize` field
   in the published probability snapshot, but that field is `null` in the actual
   published data. The grand prize is identified by `type = 'grand'`.

3. **Wrong progress prize_id**: Progress was stored with literal `prize_id = 'grand'`
   instead of the actual grand prize ID (e.g. `prize_1783884291700`), creating
   duplicate stale rows that don't match what `get_user_grand_prize_progress` reads.

4. **Wrong unlock threshold**: The function used `unlock_after_completed_spins`
   (null in the data) instead of `unlock_target_value` (300) to determine when
   the grand prize unlocks.

5. **Missing progress + balance in response**: The response did not include
   `progress` (before/after/required/remaining/unlocked) or `balance_before`/
   `balance_after`, so the frontend could not update the Grand Prize card or
   balance display from the server result.

## Changes
- Replaces `perform_spin_batch` with a corrected version that:
  - Detects grand prize by `type = 'grand'` (fallback to `is_grand_prize`)
  - Uses `unlock_target_value` as the unlock threshold (fallback to
    `unlock_after_completed_spins`, then 30)
  - Stores progress with the actual grand prize ID
  - Inserts reward_grants using only existing columns
  - Returns `progress` object and `balance_before`/`balance_after`
  - Preserves all existing probability logic, eligibility checks, and idempotency

## Security
- No RLS changes. Function remains SECURITY DEFINER.
- No new tables.
*/

CREATE OR REPLACE FUNCTION public.perform_spin_batch(
  p_spin_count integer,
  p_request_id uuid,
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
  v_grand_unlock_spins int;
  v_grand_prize_id text;
  v_unlocked_grand_ids jsonb := '[]'::jsonb;
  v_batch_id uuid;
  v_progress_before int;
  v_unlocked_during_batch int;
BEGIN
  -- Auth
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Validate spin count
  IF p_spin_count NOT IN (1, 5, 10) THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_spin_count');
  END IF;

  -- Idempotency check
  IF EXISTS (SELECT 1 FROM spin_requests WHERE client_request_id = p_request_id AND user_id = v_user_id) THEN
    SELECT jsonb_agg(jsonb_build_object(
      'prize_index', 0,
      'prize_id', sr.final_awarded_prize_id,
      'prize_type', sr.prize_type,
      'prize_value', sr.prize_value,
      'prize_name_ar', sr.prize_name_ar,
      'prize_name_en', sr.prize_name_en,
      'points_awarded', sr.points_awarded,
      'sequence_number', sr.sequence_number,
      'fallback_used', sr.fallback_used,
      'original_prize_id', sr.original_selected_prize_id
    ) ORDER BY sr.sequence_number)
    INTO v_results
    FROM spin_results sr
    JOIN spin_requests sreq ON sr.spin_request_id = sreq.id
    WHERE sreq.client_request_id = p_request_id AND sreq.user_id = v_user_id;

    RETURN jsonb_build_object(
      'success', true,
      'recovered', true,
      'results', COALESCE(v_results, '[]'::jsonb),
      'quantity', p_spin_count
    );
  END IF;

  -- Load active settings
  SELECT * INTO v_settings
  FROM wheel_game_settings
  WHERE active = true
  LIMIT 1;

  IF v_settings IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_active_wheel');
  END IF;

  -- Load PUBLISHED probability version
  SELECT * INTO v_version
  FROM wheel_probability_versions
  WHERE wheel_settings_id = v_settings.id AND status = 'PUBLISHED'
  ORDER BY version_number DESC
  LIMIT 1;

  IF v_version IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_published_version');
  END IF;

  -- Validate total = 10000
  IF v_version.total_probability_bp != 10000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_probability_config');
  END IF;

  -- Calculate cost
  IF p_spin_count = 1 THEN
    -- Check free spins
    SELECT COUNT(*) INTO v_user_wins_today
    FROM game_logs
    WHERE user_id = v_user_id AND game_type = 'wheel'
    AND played_at >= date_trunc('day', now());

    v_free_spins_left := GREATEST(v_settings.free_daily_spins - v_user_wins_today, 0);
    IF v_free_spins_left > 0 AND p_payment_mode = 'free' THEN
      v_use_free := true;
      v_cost := 0;
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

  -- Lock user row and check balance
  SELECT points INTO v_user_points
  FROM users WHERE id = v_user_id FOR UPDATE;

  v_balance_before := v_user_points;

  IF NOT v_use_free AND v_user_points < v_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_points', 'required', v_cost, 'available', v_user_points);
  END IF;

  -- Deduct cost once
  IF NOT v_use_free AND v_cost > 0 THEN
    UPDATE users SET points = points - v_cost WHERE id = v_user_id;
  END IF;

  -- Create spin request
  INSERT INTO spin_requests (user_id, client_request_id, config_version_id, spin_type, points_deducted, status)
  VALUES (v_user_id, p_request_id, v_version.id,
    CASE WHEN v_use_free THEN 'free' ELSE 'paid' END,
    v_cost, 'completed')
  RETURNING id INTO v_spin_request_id;

  v_batch_id := gen_random_uuid();

  -- Get fallback prize from version
  SELECT elem INTO v_fallback_prize
  FROM jsonb_array_elements(v_version.prizes_snapshot) elem
  WHERE elem->>'id' = v_version.fallback_prize_id
  LIMIT 1;

  -- Get grand prize config: detect by type='grand' (is_grand_prize is null in published snapshots)
  SELECT elem->>'id', COALESCE(
    (elem->>'unlock_target_value')::int,
    (elem->>'unlock_after_completed_spins')::int,
    30
  )
  INTO v_grand_prize_id, v_grand_unlock_spins
  FROM jsonb_array_elements(v_version.prizes_snapshot) elem
  WHERE (elem->>'type') = 'grand'
     OR COALESCE((elem->>'is_grand_prize')::boolean, false)
  LIMIT 1;

  -- Get user's current progress (using actual grand prize ID)
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

  -- Process each sub-spin sequentially
  FOR v_i IN 1..p_spin_count LOOP
    v_fallback_used := false;
    v_fallback_reason := NULL;

    -- Generate random bucket 0-9999
    v_random_bucket := floor(random() * 10000)::int;
    IF v_random_bucket >= 10000 THEN v_random_bucket := 9999; END IF;

    -- Walk cumulative probability ranges to find selected prize
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

    -- Safety: if no prize selected, use fallback
    IF v_original_prize_id IS NULL THEN
      v_original_prize_id := v_version.fallback_prize_id;
      v_prize := v_fallback_prize;
    END IF;

    -- Eligibility check (NO renormalization — use fallback instead)
    v_eligible := true;
    v_final_prize_id := v_original_prize_id;

    -- Check if disabled
    IF COALESCE((v_prize->>'disabled')::boolean, false) THEN
      v_eligible := false;
      v_fallback_reason := 'PRIZE_DISABLED';
    END IF;

    -- Check grand prize lock (uses actual grand prize ID + unlock_target_value)
    IF v_eligible AND v_original_prize_id = v_grand_prize_id AND v_grand_unlock_spins IS NOT NULL THEN
      IF v_progress_count < v_grand_unlock_spins THEN
        v_eligible := false;
        v_fallback_reason := 'GRAND_PRIZE_LOCKED';
      END IF;
    END IF;

    -- Check per-user cap
    IF v_eligible AND (v_prize->>'max_wins_per_user') IS NOT NULL AND (v_prize->>'max_wins_per_user')::int > 0 THEN
      SELECT COUNT(*) INTO v_user_wins_total
      FROM spin_results
      WHERE user_id = v_user_id AND final_awarded_prize_id = v_original_prize_id;
      IF v_user_wins_total >= (v_prize->>'max_wins_per_user')::int THEN
        v_eligible := false;
        v_fallback_reason := 'USER_CAP_REACHED';
      END IF;
    END IF;

    -- Check daily cap
    IF v_eligible AND (v_prize->>'max_winners_per_day') IS NOT NULL AND (v_prize->>'max_winners_per_day')::int > 0 THEN
      SELECT COUNT(*) INTO v_user_wins_today
      FROM spin_results
      WHERE final_awarded_prize_id = v_original_prize_id
      AND created_at >= date_trunc('day', now());
      IF v_user_wins_today >= (v_prize->>'max_winners_per_day')::int THEN
        v_eligible := false;
        v_fallback_reason := 'DAILY_CAP_REACHED';
      END IF;
    END IF;

    -- Apply fallback if ineligible
    IF NOT v_eligible THEN
      v_fallback_used := true;
      v_final_prize_id := v_version.fallback_prize_id;
      v_prize := v_fallback_prize;
    END IF;

    -- Calculate points awarded
    v_points_awarded := 0;
    IF (v_prize->>'type') = 'points' THEN
      v_points_awarded := COALESCE((v_prize->>'value')::int, 0);
    END IF;

    -- Create spin result with full trace
    INSERT INTO spin_results (
      spin_request_id, user_id, prize_id, prize_type, prize_value,
      prize_name_ar, prize_name_en, points_awarded,
      probability_version_id, random_bucket,
      original_selected_prize_id, final_awarded_prize_id,
      fallback_used, fallback_reason,
      sequence_number, batch_request_id
    ) VALUES (
      v_spin_request_id, v_user_id, v_final_prize_id,
      v_prize->>'type', v_prize->>'value',
      v_prize->>'name_ar', v_prize->>'name_en', v_points_awarded,
      v_version.id, v_random_bucket,
      v_original_prize_id, v_final_prize_id,
      v_fallback_used, v_fallback_reason,
      v_i, v_batch_id
    ) RETURNING id INTO v_spin_result_id;

    -- Award points
    IF v_points_awarded > 0 THEN
      UPDATE users SET points = points + v_points_awarded WHERE id = v_user_id;
      v_total_points_awarded := v_total_points_awarded + v_points_awarded;
    END IF;

    -- Create reward_grant for service/grand/coins prizes (using ONLY existing columns)
    IF (v_prize->>'type') IN ('service', 'grand', 'coins') AND NOT v_fallback_used THEN
      INSERT INTO reward_grants (user_id, spin_request_id, grant_type, grant_value, status)
      VALUES (v_user_id, v_spin_request_id, v_prize->>'type', COALESCE(v_prize->>'value', ''), 'pending');
    END IF;

    -- Update progress count
    v_progress_count := v_progress_count + 1;

    -- Check grand prize unlock during batch
    IF v_grand_prize_id IS NOT NULL AND v_grand_unlock_spins IS NOT NULL THEN
      IF v_progress_count = v_grand_unlock_spins THEN
        v_unlocked_grand_ids := v_unlocked_grand_ids || jsonb_build_array(v_grand_prize_id);
        v_unlocked_during_batch := v_i;
      END IF;
    END IF;

    -- Log to game_logs
    INSERT INTO game_logs (user_id, game_type, bet_amount, win_amount, result, result_data, played_at)
    VALUES (v_user_id, 'wheel', 0, v_points_awarded,
      CASE WHEN (v_prize->>'type') = 'miss' THEN 'miss' ELSE 'win' END,
      jsonb_build_object('prize_id', v_final_prize_id, 'prize_type', v_prize->>'type',
        'fallback_used', v_fallback_used, 'sequence', v_i),
      now()
    );

    -- Build result entry
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'prize_index', (SELECT idx - 1 FROM (
        SELECT elem->>'id' AS pid, ROW_NUMBER() OVER () AS idx
        FROM jsonb_array_elements(
          (SELECT prizes FROM wheel_game_settings WHERE id = v_settings.id)
        ) elem
      ) sub WHERE sub.pid = v_final_prize_id LIMIT 1),
      'prize_id', v_final_prize_id,
      'prize_type', v_prize->>'type',
      'prize_value', v_prize->>'value',
      'prize_name_ar', v_prize->>'name_ar',
      'prize_name_en', v_prize->>'name_en',
      'points_awarded', v_points_awarded,
      'sequence_number', v_i,
      'fallback_used', v_fallback_used,
      'original_prize_id', v_original_prize_id,
      'random_bucket', v_random_bucket
    ));
  END LOOP;

  -- Update user_grand_prize_progress (using actual grand prize ID)
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

  -- Get final balance
  SELECT points INTO v_balance_after FROM users WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'quantity', p_spin_count,
    'results', v_results,
    'points_awarded', v_total_points_awarded,
    'points_deducted', v_cost,
    'spin_request_id', v_spin_request_id,
    'probability_version_id', v_version.id,
    'unlocked_grand_prize_ids', v_unlocked_grand_ids,
    'batch_request_id', v_batch_id,
    'balance_before', v_balance_before,
    'balance_after', v_balance_after,
    'progress', jsonb_build_object(
      'before', v_progress_before,
      'after', v_progress_count,
      'required', v_grand_unlock_spins,
      'remaining', GREATEST(v_grand_unlock_spins - v_progress_count, 0),
      'unlocked', v_progress_count >= v_grand_unlock_spins,
      'unlocked_during_batch_at', v_unlocked_during_batch
    )
  );
END;
$function$;