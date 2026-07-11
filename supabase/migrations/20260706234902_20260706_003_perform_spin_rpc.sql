-- Phase 1: perform_spin() RPC
-- Server-authoritative: selects prize, deducts cost, records result, emits outbox event
-- Client provides client_request_id for idempotency

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
BEGIN
  -- Guard: authenticated
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthenticated');
  END IF;

  -- Check feature flag
  SELECT enabled INTO v_flag_enabled FROM engagement_flags WHERE flag = 'spin_v2';
  IF NOT COALESCE(v_flag_enabled, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'spin_v2_disabled');
  END IF;

  -- Idempotency check: return existing result if this request was already processed
  SELECT * INTO v_existing FROM spin_requests
  WHERE user_id = v_user_id AND client_request_id = p_client_request_id;

  IF FOUND THEN
    IF v_existing.status = 'completed' THEN
      -- Return the cached result
      DECLARE v_result spin_results%ROWTYPE;
      BEGIN
        SELECT * INTO v_result FROM spin_results WHERE spin_request_id = v_existing.id;
        RETURN jsonb_build_object(
          'success', true,
          'idempotent_replay', true,
          'spin_request_id', v_existing.id,
          'prize_id', v_result.prize_id,
          'prize_type', v_result.prize_type,
          'prize_value', v_result.prize_value,
          'prize_name_ar', v_result.prize_name_ar,
          'prize_name_en', v_result.prize_name_en,
          'points_awarded', v_result.points_awarded
        );
      END;
    ELSIF v_existing.status = 'failed' THEN
      RETURN jsonb_build_object('success', false, 'error', 'previous_request_failed');
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'request_in_progress');
    END IF;
  END IF;

  -- Load user (lock for update)
  SELECT * INTO v_user FROM users WHERE id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  -- Load wheel settings
  SELECT * INTO v_settings FROM wheel_game_settings WHERE active = true LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'wheel_not_configured');
  END IF;

  -- Count today's spins
  SELECT COUNT(*) INTO v_spins_today
  FROM spin_requests
  WHERE user_id = v_user_id
    AND status = 'completed'
    AND created_at >= (CURRENT_DATE AT TIME ZONE 'UTC');

  -- Determine spin type and cost
  IF v_spins_today < v_settings.free_daily_spins THEN
    v_spin_type := 'free';
    v_points_deducted := 0;
  ELSE
    -- Check spin credits
    DECLARE v_credits int;
    BEGIN
      SELECT balance INTO v_credits FROM spin_credits WHERE user_id = v_user_id;
      IF COALESCE(v_credits, 0) > 0 THEN
        v_spin_type := 'credit';
        v_points_deducted := 0;
        -- Atomically consume one credit
        UPDATE spin_credits SET balance = balance - 1, updated_at = now()
        WHERE user_id = v_user_id AND balance > 0;
        IF NOT FOUND THEN
          -- Race: credits gone, fall through to paid
          v_spin_type := 'paid';
        END IF;
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

  -- Capture config version
  INSERT INTO wheel_config_versions (settings_id, prizes, spin_cost)
  VALUES (v_settings.id, to_jsonb(v_settings.prizes), v_settings.spin_cost_points)
  RETURNING id INTO v_config_ver_id;

  -- Insert spin request
  INSERT INTO spin_requests (user_id, client_request_id, config_version_id, spin_type, points_deducted, status)
  VALUES (v_user_id, p_client_request_id, v_config_ver_id, v_spin_type, v_points_deducted, 'pending')
  RETURNING id INTO v_spin_req_id;

  -- Server-side weighted prize selection
  -- Exclude strong prizes already won today
  SELECT ARRAY(
    SELECT (sr2.prize_id)
    FROM spin_results sr2
    JOIN spin_requests sreq2 ON sr2.spin_request_id = sreq2.id
    WHERE sreq2.user_id = v_user_id
      AND sreq2.status = 'completed'
      AND sreq2.created_at >= (CURRENT_DATE AT TIME ZONE 'UTC')
  ) INTO v_won_strong_ids;

  v_prizes := v_settings.prizes;
  v_total_weight := 0;

  -- Sum weights (exclude strong prizes already won today where is_strong=true)
  FOR v_prize_index IN 0..jsonb_array_length(v_prizes) - 1 LOOP
    v_prize := v_prizes->v_prize_index;
    IF NOT (
      COALESCE((v_prize->>'is_strong')::boolean, false)
      AND (v_prize->>'id') = ANY(v_won_strong_ids)
    ) THEN
      v_total_weight := v_total_weight + COALESCE((v_prize->>'weight')::numeric, 1);
    END IF;
  END LOOP;

  v_roll := random() * v_total_weight;
  v_cumulative := 0;
  v_prize := NULL;
  v_prize_index := 0;

  FOR i IN 0..jsonb_array_length(v_prizes) - 1 LOOP
    DECLARE v_candidate jsonb;
    BEGIN
      v_candidate := v_prizes->i;
      IF NOT (
        COALESCE((v_candidate->>'is_strong')::boolean, false)
        AND (v_candidate->>'id') = ANY(v_won_strong_ids)
      ) THEN
        v_cumulative := v_cumulative + COALESCE((v_candidate->>'weight')::numeric, 1);
        IF v_roll <= v_cumulative AND v_prize IS NULL THEN
          v_prize := v_candidate;
          v_prize_index := i;
        END IF;
      END IF;
    END;
  END LOOP;

  -- Fallback: last prize
  IF v_prize IS NULL THEN
    v_prize := v_prizes->(jsonb_array_length(v_prizes) - 1);
    v_prize_index := jsonb_array_length(v_prizes) - 1;
  END IF;

  -- Award instant point prizes
  IF (v_prize->>'type') = 'points' THEN
    v_points_awarded := COALESCE((v_prize->>'value')::int, 0);
    IF v_points_awarded > 0 THEN
      UPDATE users SET points = points + v_points_awarded WHERE id = v_user_id;
    END IF;
  END IF;

  -- Non-instant prizes → reward grant
  IF (v_prize->>'type') IN ('service', 'grand') THEN
    INSERT INTO reward_grants (user_id, spin_request_id, grant_type, grant_value, status)
    VALUES (v_user_id, v_spin_req_id, v_prize->>'type', COALESCE(v_prize->>'value', ''), 'pending');
  END IF;

  -- Record result
  INSERT INTO spin_results (spin_request_id, user_id, prize_id, prize_type, prize_value,
    prize_name_ar, prize_name_en, points_awarded)
  VALUES (
    v_spin_req_id, v_user_id,
    COALESCE(v_prize->>'id', 'unknown'),
    COALESCE(v_prize->>'type', 'miss'),
    COALESCE(v_prize->>'value', '0'),
    COALESCE(v_prize->>'name_ar', ''),
    COALESCE(v_prize->>'name_en', ''),
    v_points_awarded
  );

  -- Mark request completed
  UPDATE spin_requests SET status = 'completed' WHERE id = v_spin_req_id;

  -- Legacy game_logs entry for backwards compatibility
  INSERT INTO game_logs (user_id, game_type, bet_amount, win_amount, result, result_data, created_at)
  VALUES (
    v_user_id, 'wheel', v_points_deducted, v_points_awarded,
    CASE WHEN (v_prize->>'type') = 'miss' THEN 'miss' ELSE 'win' END,
    jsonb_build_object(
      'prize_id', v_prize->>'id',
      'prize_type', v_prize->>'type',
      'prize_value', v_prize->>'value',
      'prize_name_ar', v_prize->>'name_ar',
      'spin_request_id', v_spin_req_id
    ),
    now()
  );

  -- Emit outbox event for async engagement processing
  INSERT INTO game_event_outbox (event_type, user_id, payload)
  VALUES ('spin_completed', v_user_id, jsonb_build_object(
    'spin_request_id', v_spin_req_id,
    'prize_id', v_prize->>'id',
    'prize_type', v_prize->>'type',
    'prize_value', v_prize->>'value',
    'prize_index', v_prize_index,
    'points_deducted', v_points_deducted,
    'points_awarded', v_points_awarded,
    'spin_type', v_spin_type
  ));

  RETURN jsonb_build_object(
    'success', true,
    'idempotent_replay', false,
    'spin_request_id', v_spin_req_id,
    'prize_index', v_prize_index,
    'prize_id', v_prize->>'id',
    'prize_type', v_prize->>'type',
    'prize_value', v_prize->>'value',
    'prize_name_ar', v_prize->>'name_ar',
    'prize_name_en', v_prize->>'name_en',
    'points_awarded', v_points_awarded,
    'points_deducted', v_points_deducted,
    'spin_type', v_spin_type
  );
END;
$$;
