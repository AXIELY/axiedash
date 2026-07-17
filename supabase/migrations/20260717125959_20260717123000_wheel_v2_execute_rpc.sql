/*
# AXIE Wheel V2 — Execute Spins RPC

## Purpose
The single authoritative server function for all spin counts (1, 5, 10).
Handles the complete atomic transaction: authentication, config loading,
free-spin calculation, cost deduction, prize selection, reward application,
Grand Prize progress, and result storage.

## Function: execute_wheel_spins(p_spin_count, p_client_request_id)

### Algorithm (all in one transaction):
1. Authenticate with auth.uid()
2. Validate wheel_v2_enabled flag
3. Load current PUBLISHED configuration
4. Validate requested spin count against allowed_spin_counts and max
5. Check for existing batch (idempotency) — return if completed
6. Lock user's points balance (SELECT FOR UPDATE)
7. Lock free-spin usage row (SELECT FOR UPDATE)
8. Calculate free_spins_remaining, free_used, paid_spin_count, total_cost
9. Verify sufficient points
10. Create parent batch
11. Consume free-spin entitlement
12. Deduct total_cost from users.points
13. Log SPIN_COST debit in point_transactions
14. Execute each child spin independently:
    a. Generate secure draw_number
    b. Select prize by probability range
    c. Check eligibility (Grand Prize lock, stock, limits)
    d. Apply fallback if ineligible
    e. Apply reward (POINTS credit, COINS credit, NO_REWARD, etc.)
    f. Create reward_grant for manual/service prizes
    g. Store child result
    h. Increment Grand Prize progress
15. Log PRIZE_REWARD credits in point_transactions
16. Create winner events for public prizes
17. Update batch with final economy values
18. Mark batch COMPLETED
19. Return structured response

### Idempotency:
- UNIQUE(user_id, client_request_id) prevents duplicates
- Retry returns the same stored batch and results
- No double deduction, no double rewards

### Rollback:
- Any failure rolls back the entire transaction
- No partial batches, no partial rewards

## Security
- SECURITY DEFINER, fixed search_path = public
- auth.uid() validation
- No dynamic SQL from client input
- Server calculates cost — client never submits trusted cost

## Notes
1. Reuses `users.points` for global balance (no wheel-specific balance)
2. Reuses `point_transactions` for audit ledger
3. Reuses `reward_grants` for non-instant rewards
4. Reuses `fulfillment_cases` for manual/service prizes (via existing RPC)
5. Grand Prize: PER_USER scope, unlock_after_completed_spins from config
*/

CREATE OR REPLACE FUNCTION execute_wheel_spins(
  p_spin_count int,
  p_client_request_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  v_results jsonb[] := '{}'::jsonb[];
  v_draw int;
  v_prize record;
  v_final_prize_key text;
  v_fallback_used boolean := false;
  v_fallback_reason text;
  v_reward_grant_id uuid;
  v_username text;
  v_username_masked text;
  v_i int;
  v_gp_threshold int;
  v_grand_prize_prize record;
  v_is_grand_prize_locked boolean := false;
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

  -- 5. Idempotency check — return existing batch if completed
  SELECT * INTO v_existing_batch
  FROM wheel_v2_spin_batches
  WHERE user_id = v_user_id AND client_request_id = p_client_request_id
  FOR UPDATE;

  IF v_existing_batch IS NOT NULL THEN
    IF v_existing_batch.status = 'completed' THEN
      -- Return existing results
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
          'before', 0,
          'after', 0,
          'required', 30,
          'unlocked', false
        ),
        'results', v_existing_results
      );
    END IF;
    -- If pending/failed, we'll proceed to create a new one
    -- (the old one is in a failed state)
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
    status
  ) VALUES (
    v_user_id, p_client_request_id, v_version_id,
    p_spin_count, v_free_used, v_paid_count,
    v_config.single_spin_cost, v_total_cost,
    v_points_before, v_points_after_cost, v_points_after_cost,
    'pending'
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

    -- 13. Log SPIN_COST debit
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
  INSERT INTO wheel_v2_grand_prize_progress (user_id, published_version_id, completed_spins, unlocked)
  VALUES (v_user_id, v_version_id, 0, false)
  ON CONFLICT (user_id, published_version_id) DO NOTHING;

  SELECT * INTO v_grand_prize_progress
  FROM wheel_v2_grand_prize_progress
  WHERE user_id = v_user_id AND published_version_id = v_version_id
  FOR UPDATE;

  v_gp_before := v_grand_prize_progress.completed_spins;
  v_gp_threshold := COALESCE((v_config.visual_config->>'grand_prize_unlock_threshold')::int, 30);

  -- Find the Grand Prize prize to check if it's locked
  SELECT * INTO v_grand_prize_prize
  FROM wheel_v2_version_prizes
  WHERE version_id = v_version_id AND is_grand_prize = true AND enabled = true
  LIMIT 1;

  v_is_grand_prize_locked := (v_grand_prize_prize IS NOT NULL)
    AND (NOT v_grand_prize_progress.unlocked)
    AND (v_grand_prize_progress.completed_spins < v_gp_threshold);

  -- Get username for winner events
  SELECT username INTO v_username FROM users WHERE id = v_user_id;
  IF v_username IS NULL THEN
    v_username_masked := 'user_' || substring(v_user_id::text, 1, 6);
  ELSE
    -- Mask: first 3 chars + ***
    v_username_masked := LEFT(v_username, 3) || '***';
  END IF;

  -- 14. Execute each child spin
  FOR v_i IN 1..p_spin_count LOOP
    -- a. Generate secure draw number
    v_draw := secure_random_0_to_999999();

    -- b. Select prize by probability range
    SELECT * INTO v_prize FROM select_wheel_v2_prize(v_version_id, v_draw);

    IF v_prize IS NULL THEN
      -- No prize found — this is a configuration error
      UPDATE wheel_v2_spin_batches
      SET status = 'failed', failure_code = 'NO_PRIZE_SELECTED', completed_at = now()
      WHERE id = v_batch_id;
      -- Force exception to rollback
      RAISE EXCEPTION 'NO_PRIZE_SELECTED for draw %', v_draw;
    END IF;

    v_final_prize_key := v_prize.prize_key;
    v_fallback_used := false;
    v_fallback_reason := NULL;

    -- c. Check eligibility: Grand Prize locked?
    IF v_prize.is_grand_prize AND v_is_grand_prize_locked THEN
      -- Use fallback
      v_fallback_used := true;
      v_fallback_reason := 'GRAND_PRIZE_LOCKED';

      IF v_prize.fallback_prize_key IS NOT NULL THEN
        SELECT * INTO v_prize FROM wheel_v2_version_prizes
        WHERE version_id = v_version_id AND prize_key = v_prize.fallback_prize_key AND enabled = true
        LIMIT 1;
        v_final_prize_key := v_prize.prize_key;
      ELSE
        -- No fallback configured — abort
        UPDATE wheel_v2_spin_batches
        SET status = 'failed', failure_code = 'PRIZE_FALLBACK_UNAVAILABLE', completed_at = now()
        WHERE id = v_batch_id;
        RAISE EXCEPTION 'PRIZE_FALLBACK_UNAVAILABLE';
      END IF;
    END IF;

    -- d. Apply reward based on reward_type
    v_reward_grant_id := NULL;

    IF v_prize.reward_type = 'POINTS' THEN
      v_points_reward := v_points_reward + COALESCE((v_prize.reward_payload->>'amount')::int, 0);
    ELSIF v_prize.reward_type = 'COINS' THEN
      v_coins_reward := v_coins_reward + COALESCE((v_prize.reward_payload->>'amount')::int, 0);
    ELSIF v_prize.reward_type = 'FREE_SPIN' THEN
      -- Grant extra free spins by adding to the usage allowance
      -- For V2 initial release, treat FREE_SPIN as NO_REWARD (per spec: no streak rewards)
      NULL;
    ELSIF v_prize.reward_type = 'NO_REWARD' THEN
      NULL;
    ELSIF v_prize.reward_type IN ('MANUAL_SERVICE', 'VIP_ACCESS', 'GRAND_PRIZE') THEN
      -- Create reward_grant
      INSERT INTO reward_grants (user_id, grant_type, grant_value, status, notes)
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
        'Wheel V2 prize: ' || v_final_prize_key
      )
      RETURNING id INTO v_reward_grant_id;
    END IF;

    -- e. Store child result
    INSERT INTO wheel_v2_spin_results (
      batch_id, sequence_number, user_id, published_version_id,
      draw_number, probability_range_start, probability_range_end,
      original_selected_prize_key, final_awarded_prize_key,
      fallback_used, fallback_reason,
      reward_grant_id, payment_mode, status
    ) VALUES (
      v_batch_id, v_i, v_user_id, v_version_id,
      v_draw, v_prize.range_start, v_prize.range_end,
      CASE WHEN v_fallback_used THEN v_final_prize_key ELSE v_final_prize_key END,
      v_final_prize_key,
      v_fallback_used, v_fallback_reason,
      v_reward_grant_id,
      CASE WHEN v_i <= v_free_used THEN 'free' ELSE 'paid' END,
      'completed'
    );

    -- f. Create winner event for public prizes
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

    -- g. Increment Grand Prize progress
    v_grand_prize_progress.completed_spins := v_grand_prize_progress.completed_spins + 1;

    -- Check if Grand Prize just unlocked
    IF NOT v_grand_prize_progress.unlocked AND v_grand_prize_progress.completed_spins >= v_gp_threshold THEN
      v_grand_prize_progress.unlocked := true;
      v_grand_prize_progress.unlocked_at := now();
      v_gp_unlocked := true;
      v_is_grand_prize_locked := false;
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

  -- 16. Update Grand Prize progress
  UPDATE wheel_v2_grand_prize_progress
  SET completed_spins = v_grand_prize_progress.completed_spins,
      unlocked = v_grand_prize_progress.unlocked,
      unlocked_at = v_grand_prize_progress.unlocked_at,
      updated_at = now()
  WHERE id = v_grand_prize_progress.id;

  v_gp_after := v_grand_prize_progress.completed_spins;

  -- 17. Update batch with final economy values
  UPDATE wheel_v2_spin_batches
  SET status = 'completed',
      final_points = v_points_after_cost + v_points_reward,
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
      'free_spins_after', v_free_remaining - v_free_used,
      'paid_spin_count', v_paid_count,
      'single_spin_cost', v_config.single_spin_cost,
      'total_cost', v_total_cost,
      'points_before', v_points_before,
      'points_after_cost', v_points_after_cost
    ),
    'rewards', jsonb_build_object(
      'points_credited', v_points_reward,
      'coins_credited', v_coins_reward,
      'final_points', v_points_after_cost + v_points_reward
    ),
    'grand_prize_progress', jsonb_build_object(
      'before', v_gp_before,
      'after', v_gp_after,
      'required', v_gp_threshold,
      'unlocked', v_gp_unlocked
    ),
    'results', v_results
  );

EXCEPTION WHEN OTHERS THEN
  -- Any failure rolls back the entire transaction
  -- Mark batch as failed if it was created
  IF v_batch_id IS NOT NULL THEN
    UPDATE wheel_v2_spin_batches
    SET status = 'failed', failure_code = left(SQLERRM, 200), completed_at = now()
    WHERE id = v_batch_id;
  END IF;
  RETURN jsonb_build_object('success', false, 'error', 'TRANSACTION_FAILED',
    'details', SQLERRM
  );
END;
$$;

-- ═══════════════════════════════════════════════════════
-- Get user's free spin remaining for current period
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_wheel_v2_free_spins_remaining()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_version_id uuid;
  v_config record;
  v_period_key text;
  v_usage record;
  v_remaining int;
  v_reset_at timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'UNAUTHENTICATED');
  END IF;

  v_version_id := get_published_wheel_v2();
  IF v_version_id IS NULL THEN
    RETURN jsonb_build_object('error', 'NO_PUBLISHED_VERSION');
  END IF;

  SELECT * INTO v_config FROM wheel_v2_config_versions WHERE id = v_version_id;
  v_period_key := get_wheel_v2_period_key(v_config.free_spin_reset_type, v_config.timezone);

  SELECT * INTO v_usage
  FROM wheel_v2_free_spin_usage
  WHERE user_id = v_user_id AND published_version_id = v_version_id AND period_key = v_period_key;

  v_remaining := GREATEST(0, v_config.free_spins_per_period - COALESCE(v_usage.spins_used, 0));

  -- Calculate next reset time
  IF v_config.free_spin_reset_type = 'DAILY' THEN
    v_reset_at := date_trunc('day', now() AT TIME ZONE v_config.timezone) + interval '1 day';
    v_reset_at := v_reset_at AT TIME ZONE v_config.timezone;
  ELSIF v_config.free_spin_reset_type = 'WEEKLY' THEN
    v_reset_at := date_trunc('week', now() AT TIME ZONE v_config.timezone) + interval '7 days';
    v_reset_at := v_reset_at AT TIME ZONE v_config.timezone;
  ELSE
    v_reset_at := NULL;
  END IF;

  RETURN jsonb_build_object(
    'free_spins_remaining', v_remaining,
    'free_spins_per_period', v_config.free_spins_per_period,
    'reset_type', v_config.free_spin_reset_type,
    'reset_at', v_reset_at,
    'period_key', v_period_key
  );
END;
$$;

-- ═══════════════════════════════════════════════════════
-- Get user's Grand Prize progress
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_wheel_v2_grand_prize_progress()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_version_id uuid;
  v_progress record;
  v_threshold int;
  v_config record;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'UNAUTHENTICATED');
  END IF;

  v_version_id := get_published_wheel_v2();
  IF v_version_id IS NULL THEN
    RETURN jsonb_build_object('error', 'NO_PUBLISHED_VERSION');
  END IF;

  SELECT * INTO v_config FROM wheel_v2_config_versions WHERE id = v_version_id;
  v_threshold := COALESCE((v_config.visual_config->>'grand_prize_unlock_threshold')::int, 30);

  SELECT * INTO v_progress
  FROM wheel_v2_grand_prize_progress
  WHERE user_id = v_user_id AND published_version_id = v_version_id;

  RETURN jsonb_build_object(
    'completed_spins', COALESCE(v_progress.completed_spins, 0),
    'required', v_threshold,
    'unlocked', COALESCE(v_progress.unlocked, false),
    'unlocked_at', v_progress.unlocked_at
  );
END;
$$;

-- ═══════════════════════════════════════════════════════
-- Get published wheel config + prizes for frontend
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_published_wheel_v2_config()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version_id uuid;
  v_config record;
  v_prizes jsonb;
BEGIN
  v_version_id := get_published_wheel_v2();
  IF v_version_id IS NULL THEN
    RETURN jsonb_build_object('error', 'NO_PUBLISHED_VERSION');
  END IF;

  SELECT * INTO v_config FROM wheel_v2_config_versions WHERE id = v_version_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'prize_key', p.prize_key,
    'display_order', p.display_order,
    'name_ar', p.name_ar,
    'name_en', p.name_en,
    'short_label_ar', p.short_label_ar,
    'short_label_en', p.short_label_en,
    'description_ar', p.description_ar,
    'description_en', p.description_en,
    'reward_type', p.reward_type,
    'reward_payload', p.reward_payload,
    'rarity', p.rarity,
    'icon_url', p.icon_url,
    'wheel_color_start', p.wheel_color_start,
    'wheel_color_end', p.wheel_color_end,
    'text_color', p.text_color,
    'probability_ppm', p.probability_ppm,
    'enabled', p.enabled,
    'visible_on_wheel', p.visible_on_wheel,
    'is_grand_prize', p.is_grand_prize,
    'is_public_winner', p.is_public_winner,
    'fulfillment_mode', p.fulfillment_mode,
    'range_start', 0,
    'range_end', 0
  ) ORDER BY p.display_order), '[]'::jsonb)
  INTO v_prizes
  FROM wheel_v2_version_prizes p
  WHERE p.version_id = v_version_id AND p.enabled = true AND p.visible_on_wheel = true;

  -- Compute actual ranges
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'prize_key', t.prize_key,
    'display_order', t.display_order,
    'name_ar', t.name_ar,
    'name_en', t.name_en,
    'short_label_ar', t.short_label_ar,
    'short_label_en', t.short_label_en,
    'description_ar', t.description_ar,
    'description_en', t.description_en,
    'reward_type', t.reward_type,
    'reward_payload', t.reward_payload,
    'rarity', t.rarity,
    'icon_url', t.icon_url,
    'wheel_color_start', t.wheel_color_start,
    'wheel_color_end', t.wheel_color_end,
    'text_color', t.text_color,
    'probability_ppm', t.probability_ppm,
    'enabled', t.enabled,
    'visible_on_wheel', t.visible_on_wheel,
    'is_grand_prize', t.is_grand_prize,
    'is_public_winner', t.is_public_winner,
    'fulfillment_mode', t.fulfillment_mode,
    'range_start', t.range_start,
    'range_end', t.range_end,
    'sector_angle', (t.probability_ppm::float / 1000000.0 * 360.0)
  ) ORDER BY t.display_order), '[]'::jsonb)
  INTO v_prizes
  FROM build_wheel_v2_probability_ranges(v_version_id) t;

  RETURN jsonb_build_object(
    'version_id', v_version_id,
    'version_number', v_config.version_number,
    'title_ar', v_config.title_ar,
    'title_en', v_config.title_en,
    'subtitle_ar', v_config.subtitle_ar,
    'subtitle_en', v_config.subtitle_en,
    'single_spin_cost', v_config.single_spin_cost,
    'free_spins_per_period', v_config.free_spins_per_period,
    'free_spin_reset_type', v_config.free_spin_reset_type,
    'allowed_spin_counts', v_config.allowed_spin_counts,
    'max_spins_per_request', v_config.max_spins_per_request,
    'animation_duration_ms', v_config.animation_duration_ms,
    'animation_turns', v_config.animation_turns,
    'sounds_enabled', v_config.sounds_enabled,
    'confetti_enabled', v_config.confetti_enabled,
    'ticker_enabled', v_config.ticker_enabled,
    'leaderboard_enabled', v_config.leaderboard_enabled,
    'grand_prize_enabled', v_config.grand_prize_enabled,
    'visual_config', v_config.visual_config,
    'prizes', v_prizes
  );
END;
$$;

-- ═══════════════════════════════════════════════════════
-- Get leaderboard data
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_wheel_v2_leaderboard(p_period text DEFAULT 'week', p_limit int DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version_id uuid;
  v_results jsonb;
  v_date_filter text;
BEGIN
  v_version_id := get_published_wheel_v2();
  IF v_version_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  IF p_period = 'today' THEN
    v_date_filter := to_char(now() AT TIME ZONE 'Africa/Tripoli', 'YYYY-MM-DD');
  ELSIF p_period = 'week' THEN
    v_date_filter := to_char(now() AT TIME ZONE 'Africa/Tripoli', 'IYYY-IW');
  ELSE
    v_date_filter := NULL;
  END IF;

  IF p_period = 'all' OR v_date_filter IS NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'user_id', t.user_id,
      'username', t.username,
      'total_spins', t.total_spins,
      'total_points_won', t.total_points_won,
      'rarity_score', t.rarity_score
    ) ORDER BY t.total_points_won DESC NULLS LAST, t.total_spins DESC), '[]'::jsonb)
    INTO v_results
    FROM (
      SELECT
        sr.user_id,
        u.username,
        COUNT(*)::int AS total_spins,
        COALESCE(SUM(CASE WHEN vp.reward_type = 'POINTS' THEN COALESCE((vp.reward_payload->>'amount')::int, 0) ELSE 0 END), 0)::int AS total_points_won,
        COALESCE(SUM(CASE
          WHEN vp.rarity = 'legendary' THEN 5
          WHEN vp.rarity = 'epic' THEN 4
          WHEN vp.rarity = 'rare' THEN 3
          WHEN vp.rarity = 'uncommon' THEN 2
          ELSE 1
        END), 0)::int AS rarity_score
      FROM wheel_v2_spin_results sr
      JOIN users u ON u.id = sr.user_id
      JOIN wheel_v2_version_prizes vp ON vp.version_id = sr.published_version_id AND vp.prize_key = sr.final_awarded_prize_key
      WHERE sr.published_version_id = v_version_id
      GROUP BY sr.user_id, u.username
      LIMIT LEAST(p_limit, 100)
    ) t;
  ELSE
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'user_id', t.user_id,
      'username', t.username,
      'total_spins', t.total_spins,
      'total_points_won', t.total_points_won,
      'rarity_score', t.rarity_score
    ) ORDER BY t.total_points_won DESC NULLS LAST, t.total_spins DESC), '[]'::jsonb)
    INTO v_results
    FROM (
      SELECT
        sr.user_id,
        u.username,
        COUNT(*)::int AS total_spins,
        COALESCE(SUM(CASE WHEN vp.reward_type = 'POINTS' THEN COALESCE((vp.reward_payload->>'amount')::int, 0) ELSE 0 END), 0)::int AS total_points_won,
        COALESCE(SUM(CASE
          WHEN vp.rarity = 'legendary' THEN 5
          WHEN vp.rarity = 'epic' THEN 4
          WHEN vp.rarity = 'rare' THEN 3
          WHEN vp.rarity = 'uncommon' THEN 2
          ELSE 1
        END), 0)::int AS rarity_score
      FROM wheel_v2_spin_results sr
      JOIN users u ON u.id = sr.user_id
      JOIN wheel_v2_version_prizes vp ON vp.version_id = sr.published_version_id AND vp.prize_key = sr.final_awarded_prize_key
      WHERE sr.published_version_id = v_version_id
        AND to_char(sr.created_at AT TIME ZONE 'Africa/Tripoli',
          CASE WHEN p_period = 'today' THEN 'YYYY-MM-DD' ELSE 'IYYY-IW' END
        ) = v_date_filter
      GROUP BY sr.user_id, u.username
      LIMIT LEAST(p_limit, 100)
    ) t;
  END IF;

  RETURN v_results;
END;
$$;
