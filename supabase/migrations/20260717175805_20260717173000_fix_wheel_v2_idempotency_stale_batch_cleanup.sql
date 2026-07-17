-- Fix: Idempotency check was not catching existing pending batches.
-- The SELECT ... INTO v_existing_batch found the row but the IF only
-- checked for status = 'completed'. If a batch exists with ANY status
-- (including 'pending' from a crashed attempt), the INSERT would fail
-- with a unique constraint violation.
-- Now: if a batch exists with ANY status, return it (completed) or
-- fail gracefully (pending/failed) instead of trying to INSERT again.

CREATE OR REPLACE FUNCTION public.execute_wheel_spins(p_spin_count integer, p_client_request_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_version_id uuid;
  v_config record;
  v_period_key text;
  v_free_usage record;
  v_free_remaining int;
  v_free_used int;
  v_paid_count int;
  v_total_cost int;
  v_points_before int;
  v_points_after_cost int;
  v_points_reward int := 0;
  v_coins_reward int := 0;
  v_batch_id uuid;
  v_existing_batch record;
  v_existing_results jsonb;
  v_grand_prize_progress record;
  v_gp_before int;
  v_gp_after int;
  v_gp_unlocked boolean := false;
  v_results jsonb;
  v_draw int;
  v_prize record;
  v_final_prize_key text;
  v_fallback_used boolean := false;
  v_fallback_reason text;
  v_reward_grant_id uuid;
  v_spin_result_id uuid;
  v_username text;
  v_username_masked text;
  v_i int;
  v_gp_threshold int;
  v_grand_prize_prize record;
  v_is_grand_prize_locked boolean := false;
  v_orig_range_start int;
  v_orig_range_end int;
  v_streak_progress int;
  v_streak_required int;
  v_streak_reward_free_spins int;
  v_streak_free_spins_awarded int := 0;
  v_streak_just_completed boolean := false;
  v_daily_win_count int;
  v_fulfillment_result jsonb;
  v_real_prize_count int := 0;
  v_no_reward_count int := 0;
BEGIN
  -- 1. Authenticate
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  -- 2. Validate feature flag
  IF NOT is_wheel_v2_enabled() THEN
    RETURN jsonb_build_object('success', false, 'error', 'WHEEL_V2_DISABLED');
  END IF;

  -- 3. Load current PUBLISHED configuration
  v_version_id := get_published_wheel_v2();
  IF v_version_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_PUBLISHED_VERSION');
  END IF;

  SELECT * INTO v_config FROM wheel_v2_config_versions WHERE id = v_version_id;
  IF v_config.maintenance_mode THEN
    RETURN jsonb_build_object('success', false, 'error', 'MAINTENANCE_MODE');
  END IF;

  -- 4. Validate spin count
  IF p_spin_count <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'SPIN_COUNT_NOT_ALLOWED');
  END IF;

  IF p_spin_count > v_config.max_spins_per_request THEN
    RETURN jsonb_build_object('success', false, 'error', 'SPIN_COUNT_NOT_ALLOWED');
  END IF;

  IF NOT (p_spin_count = ANY(v_config.allowed_spin_counts)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'SPIN_COUNT_NOT_ALLOWED');
  END IF;

  -- 5. Idempotency check — find ANY existing batch for this request
  SELECT * INTO v_existing_batch
  FROM wheel_v2_spin_batches
  WHERE user_id = v_user_id AND client_request_id = p_client_request_id
  FOR UPDATE;

  -- If a completed batch exists, return its cached results
  IF v_existing_batch IS NOT NULL AND v_existing_batch.status = 'completed' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'sequence_number', sr.sequence_number,
      'spin_result_id', sr.id,
      'draw_number', sr.draw_number,
      'original_selected_prize_key', sr.original_selected_prize_key,
      'final_awarded_prize_key', sr.final_awarded_prize_key,
      'fallback_used', sr.fallback_used,
      'fallback_reason', sr.fallback_reason,
      'reward_grant_id', sr.reward_grant_id,
      'reward_applied', true
    ) ORDER BY sr.sequence_number), '[]'::jsonb)
    INTO v_existing_results
    FROM wheel_v2_spin_results sr
    WHERE sr.batch_id = v_existing_batch.id;

    RETURN jsonb_build_object(
      'success', true,
      'batch_id', v_existing_batch.id,
      'client_request_id', p_client_request_id,
      'published_version_id', v_existing_batch.published_version_id,
      'requested_spin_count', v_existing_batch.requested_spin_count,
      'payment', jsonb_build_object(
        'free_spins_before', v_existing_batch.free_spins_used,
        'free_spins_used', v_existing_batch.free_spins_used,
        'free_spins_after', 0,
        'paid_spin_count', v_existing_batch.paid_spin_count,
        'single_spin_cost', v_existing_batch.single_spin_cost,
        'total_cost', v_existing_batch.total_cost,
        'points_before', v_existing_batch.points_before,
        'points_after_cost', v_existing_batch.points_after_cost
      ),
      'rewards', jsonb_build_object(
        'points_credited', 0,
        'coins_credited', 0,
        'final_points', v_existing_batch.final_points
      ),
      'grand_prize_progress', jsonb_build_object(
        'before', 0, 'after', 0, 'required', 30, 'unlocked', false
      ),
      'streak', jsonb_build_object(
        'progress', 0, 'required', 3, 'reward_free_spins', 1, 'just_completed', false, 'free_spins_awarded', 0
      ),
      'results', v_existing_results
    );
  END IF;

  -- If a pending/failed batch exists, it's a stale batch from a crashed attempt.
  -- Delete it and its children so we can retry cleanly.
  IF v_existing_batch IS NOT NULL AND v_existing_batch.status IN ('pending', 'failed') THEN
    DELETE FROM wheel_v2_spin_results WHERE batch_id = v_existing_batch.id;
    DELETE FROM wheel_v2_spin_batches WHERE id = v_existing_batch.id;
  END IF;

  -- 6. Lock user's points balance
  SELECT points INTO v_points_before
  FROM users
  WHERE id = v_user_id
  FOR UPDATE;

  IF v_points_before IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND');
  END IF;

  -- 7. Lock free-spin usage row
  v_period_key := get_wheel_v2_period_key(v_config.free_spin_reset_type, v_config.timezone);

  INSERT INTO wheel_v2_free_spin_usage (user_id, published_version_id, period_key, spins_used)
  VALUES (v_user_id, v_version_id, v_period_key, 0)
  ON CONFLICT (user_id, published_version_id, period_key) DO NOTHING;

  SELECT * INTO v_free_usage
  FROM wheel_v2_free_spin_usage
  WHERE user_id = v_user_id AND published_version_id = v_version_id AND period_key = v_period_key
  FOR UPDATE;

  -- 8. Calculate free spins and cost
  v_free_remaining := GREATEST(0, v_config.free_spins_per_period - v_free_usage.spins_used);
  v_free_used := LEAST(v_free_remaining, p_spin_count);
  v_paid_count := p_spin_count - v_free_used;
  v_total_cost := v_paid_count * v_config.single_spin_cost;

  -- 9. Verify sufficient points
  IF v_total_cost > v_points_before THEN
    RETURN jsonb_build_object('success', false, 'error', 'INSUFFICIENT_POINTS',
      'details', jsonb_build_object(
        'points_before', v_points_before,
        'total_cost', v_total_cost,
        'free_used', v_free_used,
        'paid_count', v_paid_count
      )
    );
  END IF;

  -- 10. Create parent batch
  v_points_after_cost := v_points_before - v_total_cost;

  INSERT INTO wheel_v2_spin_batches (
    user_id, client_request_id, published_version_id,
    requested_spin_count, free_spins_used, paid_spin_count,
    single_spin_cost, total_cost,
    points_before, points_after_cost, final_points,
    status, streak_free_spins_awarded
  ) VALUES (
    v_user_id, p_client_request_id, v_version_id,
    p_spin_count, v_free_used, v_paid_count,
    v_config.single_spin_cost, v_total_cost,
    v_points_before, v_points_after_cost, v_points_after_cost,
    'pending', 0
  )
  RETURNING id INTO v_batch_id;

  -- 11. Consume free-spin entitlement
  IF v_free_used > 0 THEN
    UPDATE wheel_v2_free_spin_usage
    SET spins_used = spins_used + v_free_used, updated_at = now()
    WHERE id = v_free_usage.id;
  END IF;

  -- 12. Deduct total_cost from users.points
  IF v_total_cost > 0 THEN
    UPDATE users SET points = points - v_total_cost WHERE id = v_user_id;

    INSERT INTO point_transactions (
      user_id, transaction_type, amount, description, reference_id,
      balance_before, balance_after, metadata
    ) VALUES (
      v_user_id, 'spin_cost', -v_total_cost,
      'Wheel V2 spin cost (' || v_paid_count || ' paid spins)',
      v_batch_id::text,
      v_points_before, v_points_after_cost,
      jsonb_build_object('game', 'wheel_v2', 'spin_count', p_spin_count, 'paid_spins', v_paid_count, 'free_spins', v_free_used)
    );
  END IF;

  -- Lock Grand Prize progress
  INSERT INTO wheel_v2_grand_prize_progress (user_id, published_version_id, completed_spins, unlocked, streak_progress, streak_free_spins_bonus)
  VALUES (v_user_id, v_version_id, 0, false, 0, 0)
  ON CONFLICT (user_id, published_version_id) DO NOTHING;

  SELECT * INTO v_grand_prize_progress
  FROM wheel_v2_grand_prize_progress
  WHERE user_id = v_user_id AND published_version_id = v_version_id
  FOR UPDATE;

  v_gp_before := v_grand_prize_progress.completed_spins;
  v_gp_threshold := COALESCE(v_config.jackpot_unlock_spins, 30);
  v_streak_required := COALESCE(v_config.streak_spins_required, 3);
  v_streak_reward_free_spins := COALESCE(v_config.streak_reward_free_spins, 1);
  v_streak_progress := COALESCE(v_grand_prize_progress.streak_progress, 0);

  -- Find the Grand Prize prize to check if it's locked
  SELECT * INTO v_grand_prize_prize
  FROM wheel_v2_version_prizes
  WHERE version_id = v_version_id AND is_grand_prize = true AND enabled = true
  LIMIT 1;

  v_is_grand_prize_locked := (v_grand_prize_prize IS NOT NULL)
    AND COALESCE(v_config.jackpot_lock_enabled, true)
    AND (NOT v_grand_prize_progress.unlocked)
    AND (v_grand_prize_progress.completed_spins < v_gp_threshold);

  -- Get username for winner events
  SELECT username INTO v_username FROM users WHERE id = v_user_id;
  IF v_username IS NULL THEN
    v_username_masked := 'user_' || substring(v_user_id::text, 1, 6);
  ELSE
    v_username_masked := LEFT(v_username, 3) || '***';
  END IF;

  -- 14. Execute each child spin
  FOR v_i IN 1..p_spin_count LOOP
    -- a. Generate secure draw number
    v_draw := secure_random_0_to_999999();

    -- b. Select prize by probability range
    SELECT * INTO v_prize FROM select_wheel_v2_prize(v_version_id, v_draw);

    IF v_prize IS NULL THEN
      UPDATE wheel_v2_spin_batches
      SET status = 'failed', failure_code = 'NO_PRIZE_SELECTED', completed_at = now()
      WHERE id = v_batch_id;
      RAISE EXCEPTION 'NO_PRIZE_SELECTED for draw %', v_draw;
    END IF;

    v_final_prize_key := v_prize.prize_key;
    v_fallback_used := false;
    v_fallback_reason := NULL;
    v_reward_grant_id := NULL;

    -- Save original probability range before any fallback overwrites v_prize
    v_orig_range_start := v_prize.range_start;
    v_orig_range_end := v_prize.range_end;

    -- c. Check eligibility: Grand Prize locked?
    IF v_prize.is_grand_prize AND v_is_grand_prize_locked THEN
      v_fallback_used := true;
      v_fallback_reason := 'GRAND_PRIZE_LOCKED';

      IF v_prize.fallback_prize_key IS NOT NULL THEN
        SELECT * INTO v_prize FROM build_wheel_v2_probability_ranges(v_version_id)
        WHERE prize_key = v_prize.fallback_prize_key AND enabled = true
        LIMIT 1;
        v_final_prize_key := v_prize.prize_key;
      ELSE
        UPDATE wheel_v2_spin_batches
        SET status = 'failed', failure_code = 'PRIZE_FALLBACK_UNAVAILABLE', completed_at = now()
        WHERE id = v_batch_id;
        RAISE EXCEPTION 'PRIZE_FALLBACK_UNAVAILABLE';
      END IF;
    END IF;

    -- c2. Check daily win limit
    IF v_prize.daily_win_limit IS NOT NULL AND v_prize.daily_win_limit > 0 THEN
      SELECT COALESCE(win_count, 0) INTO v_daily_win_count
      FROM wheel_v2_daily_win_counts
      WHERE published_version_id = v_version_id AND prize_key = v_final_prize_key AND period_date = CURRENT_DATE;

      IF v_daily_win_count >= v_prize.daily_win_limit THEN
        IF v_prize.fallback_prize_key IS NOT NULL AND v_prize.fallback_prize_key != '' THEN
          v_fallback_used := true;
          v_fallback_reason := 'DAILY_WIN_LIMIT_REACHED';
          SELECT * INTO v_prize FROM build_wheel_v2_probability_ranges(v_version_id)
          WHERE prize_key = v_prize.fallback_prize_key AND enabled = true
          LIMIT 1;
          v_final_prize_key := v_prize.prize_key;
        ELSE
          v_final_prize_key := 'no_reward';
          v_fallback_used := true;
          v_fallback_reason := 'DAILY_WIN_LIMIT_REACHED';
        END IF;
      END IF;
    END IF;

    -- d. Store child result FIRST (so we can link reward_grant to it)
    INSERT INTO wheel_v2_spin_results (
      batch_id, sequence_number, user_id, published_version_id,
      draw_number, probability_range_start, probability_range_end,
      original_selected_prize_key, final_awarded_prize_key,
      fallback_used, fallback_reason,
      reward_grant_id, payment_mode, status
    ) VALUES (
      v_batch_id, v_i, v_user_id, v_version_id,
      v_draw, v_orig_range_start, v_orig_range_end,
      CASE WHEN v_fallback_used THEN v_final_prize_key ELSE v_final_prize_key END,
      v_final_prize_key,
      v_fallback_used, v_fallback_reason,
      NULL,
      CASE WHEN v_i <= v_free_used THEN 'free' ELSE 'paid' END,
      'completed'
    )
    RETURNING id INTO v_spin_result_id;

    -- e. Apply reward based on reward_type
    IF v_prize.reward_type = 'POINTS' THEN
      v_points_reward := v_points_reward + COALESCE((v_prize.reward_payload->>'amount')::int, 0);
      v_real_prize_count := v_real_prize_count + 1;
    ELSIF v_prize.reward_type = 'COINS' THEN
      v_coins_reward := v_coins_reward + COALESCE((v_prize.reward_payload->>'amount')::int, 0);
      v_real_prize_count := v_real_prize_count + 1;
    ELSIF v_prize.reward_type = 'FREE_SPIN' THEN
      v_real_prize_count := v_real_prize_count + 1;
    ELSIF v_prize.reward_type = 'NO_REWARD' THEN
      v_no_reward_count := v_no_reward_count + 1;
    ELSIF v_prize.reward_type IN ('MANUAL_SERVICE', 'VIP_ACCESS', 'GRAND_PRIZE') THEN
      v_real_prize_count := v_real_prize_count + 1;
      INSERT INTO reward_grants (user_id, grant_type, grant_value, status, notes, spin_result_id)
      VALUES (
        v_user_id,
        CASE v_prize.reward_type
          WHEN 'MANUAL_SERVICE' THEN 'service'
          WHEN 'VIP_ACCESS' THEN 'service'
          WHEN 'GRAND_PRIZE' THEN 'grand'
          ELSE 'service'
        END,
        COALESCE(v_prize.name_en, v_final_prize_key),
        'pending',
        'Wheel V2 prize: ' || v_final_prize_key,
        v_spin_result_id
      )
      RETURNING id INTO v_reward_grant_id;

      -- Link reward grant back to spin result
      UPDATE wheel_v2_spin_results SET reward_grant_id = v_reward_grant_id WHERE id = v_spin_result_id;

      -- Create fulfillment case so prize appears in "جوائزي"
      v_fulfillment_result := create_fulfillment_case(
        p_reward_grant_id := v_reward_grant_id,
        p_spin_id := v_spin_result_id,
        p_user_id := v_user_id,
        p_prize_id := v_final_prize_key,
        p_prize_name_ar := v_prize.name_ar,
        p_prize_name_en := v_prize.name_en,
        p_prize_type := v_prize.reward_type,
        p_prize_value := COALESCE(v_prize.short_label_en, v_prize.name_en),
        p_prize_icon_url := v_prize.icon_url,
        p_prize_accent := v_prize.wheel_color_start,
        p_prize_rarity := v_prize.rarity
      );
    END IF;

    -- f. Increment daily win count
    IF v_prize.reward_type != 'NO_REWARD' AND NOT v_fallback_used THEN
      INSERT INTO wheel_v2_daily_win_counts (published_version_id, prize_key, period_date, win_count)
      VALUES (v_version_id, v_final_prize_key, CURRENT_DATE, 1)
      ON CONFLICT (published_version_id, prize_key, period_date)
      DO UPDATE SET win_count = wheel_v2_daily_win_counts.win_count + 1, updated_at = now();
    END IF;

    -- g. Create winner event for public prizes
    IF v_prize.is_public_winner AND v_prize.reward_type NOT IN ('NO_REWARD') THEN
      INSERT INTO wheel_v2_winner_events (
        user_id, username_masked, prize_key,
        prize_name_ar, prize_name_en, prize_rarity,
        reward_type, reward_display,
        published_version_id, is_public
      ) VALUES (
        v_user_id, v_username_masked, v_final_prize_key,
        v_prize.name_ar, v_prize.name_en, v_prize.rarity,
        v_prize.reward_type,
        COALESCE(v_prize.short_label_en, v_prize.name_en, v_final_prize_key),
        v_version_id, true
      );
    END IF;

    -- h. Increment Grand Prize progress
    v_grand_prize_progress.completed_spins := v_grand_prize_progress.completed_spins + 1;

    IF NOT v_grand_prize_progress.unlocked
       AND v_grand_prize_progress.completed_spins >= v_gp_threshold THEN
      v_grand_prize_progress.unlocked := true;
      v_grand_prize_progress.unlocked_at := now();
      v_gp_unlocked := true;
      v_is_grand_prize_locked := false;
    END IF;

    -- i. Increment streak progress
    IF COALESCE(v_config.streak_enabled, true) THEN
      v_streak_progress := v_streak_progress + 1;
      IF v_streak_progress >= v_streak_required THEN
        v_streak_free_spins_awarded := v_streak_free_spins_awarded + v_streak_reward_free_spins;
        v_streak_progress := 0;
        v_streak_just_completed := true;
      END IF;
    END IF;
  END LOOP;

  -- 15. Log PRIZE_REWARD credits for points
  IF v_points_reward > 0 THEN
    UPDATE users SET points = points + v_points_reward WHERE id = v_user_id;

    INSERT INTO point_transactions (
      user_id, transaction_type, amount, description, reference_id,
      balance_before, balance_after, metadata
    ) VALUES (
      v_user_id, 'prize_reward', v_points_reward,
      'Wheel V2 prize rewards (' || p_spin_count || ' spins)',
      v_batch_id::text,
      v_points_after_cost, v_points_after_cost + v_points_reward,
      jsonb_build_object('game', 'wheel_v2', 'spin_count', p_spin_count)
    );
  END IF;

  -- Credit coins
  IF v_coins_reward > 0 THEN
    UPDATE users SET coins = coins + v_coins_reward WHERE id = v_user_id;
  END IF;

  -- 15b. Award streak free spins
  IF v_streak_free_spins_awarded > 0 THEN
    UPDATE wheel_v2_free_spin_usage
    SET spins_used = GREATEST(0, spins_used - v_streak_free_spins_awarded), updated_at = now()
    WHERE id = v_free_usage.id;
  END IF;

  -- 16. Update Grand Prize + streak progress
  UPDATE wheel_v2_grand_prize_progress
  SET completed_spins = v_grand_prize_progress.completed_spins,
      unlocked = v_grand_prize_progress.unlocked,
      unlocked_at = v_grand_prize_progress.unlocked_at,
      streak_progress = v_streak_progress,
      streak_free_spins_bonus = streak_free_spins_bonus + v_streak_free_spins_awarded,
      updated_at = now()
  WHERE id = v_grand_prize_progress.id;

  v_gp_after := v_grand_prize_progress.completed_spins;

  -- 17. Update batch with final economy values
  UPDATE wheel_v2_spin_batches
  SET status = 'completed',
      final_points = v_points_after_cost + v_points_reward,
      streak_free_spins_awarded = v_streak_free_spins_awarded,
      completed_at = now()
  WHERE id = v_batch_id;

  -- 18. Build results array
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'sequence_number', sr.sequence_number,
    'spin_result_id', sr.id,
    'draw_number', sr.draw_number,
    'original_selected_prize_key', sr.original_selected_prize_key,
    'final_awarded_prize_key', sr.final_awarded_prize_key,
    'fallback_used', sr.fallback_used,
    'fallback_reason', sr.fallback_reason,
    'reward_grant_id', sr.reward_grant_id,
    'reward_applied', true
  ) ORDER BY sr.sequence_number), '[]'::jsonb)
  INTO v_results
  FROM wheel_v2_spin_results sr
  WHERE sr.batch_id = v_batch_id;

  -- 19. Return structured response
  RETURN jsonb_build_object(
    'success', true,
    'batch_id', v_batch_id,
    'client_request_id', p_client_request_id,
    'published_version_id', v_version_id,
    'requested_spin_count', p_spin_count,
    'payment', jsonb_build_object(
      'free_spins_before', v_free_remaining,
      'free_spins_used', v_free_used,
      'free_spins_after', GREATEST(0, v_free_remaining - v_free_used) + v_streak_free_spins_awarded,
      'paid_spin_count', v_paid_count,
      'single_spin_cost', v_config.single_spin_cost,
      'total_cost', v_total_cost,
      'points_before', v_points_before,
      'points_after_cost', v_points_after_cost
    ),
    'rewards', jsonb_build_object(
      'real_prize_count', v_real_prize_count,
      'no_reward_count', v_no_reward_count,
      'points_credited', v_points_reward,
      'coins_credited', v_coins_reward,
      'final_points', v_points_after_cost + v_points_reward
    ),
    'grand_prize_progress', jsonb_build_object(
      'before', v_gp_before,
      'after', v_gp_after,
      'required', v_gp_threshold,
      'unlocked', v_gp_unlocked,
      'jackpot_lock_enabled', COALESCE(v_config.jackpot_lock_enabled, true)
    ),
    'streak', jsonb_build_object(
      'progress', v_streak_progress,
      'required', v_streak_required,
      'reward_free_spins', v_streak_reward_free_spins,
      'just_completed', v_streak_just_completed,
      'free_spins_awarded', v_streak_free_spins_awarded
    ),
    'results', v_results
  );

  EXCEPTION WHEN OTHERS THEN
    IF v_batch_id IS NOT NULL THEN
      UPDATE wheel_v2_spin_batches
      SET status = 'failed', failure_code = left(SQLERRM, 200), completed_at = now()
      WHERE id = v_batch_id;
    END IF;
    RETURN jsonb_build_object('success', false, 'error', 'TRANSACTION_FAILED',
      'details', SQLERRM
    );
END;
$function$;
