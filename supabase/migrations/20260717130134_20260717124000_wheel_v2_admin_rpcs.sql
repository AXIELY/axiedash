/*
# AXIE Wheel V2 — Admin RPCs (fixed audit function)

## Purpose
Server functions for Admin draft management, publishing, probability audit,
and 100,000-draw simulation. Fixed version — removed record[] pseudo-type.

## Functions
- create_wheel_v2_draft()
- update_wheel_v2_draft(p_version_id, p_config)
- add_wheel_v2_prize(p_version_id, p_prize)
- update_wheel_v2_prize(p_prize_id, p_prize)
- delete_wheel_v2_prize(p_prize_id)
- publish_wheel_v2_version(p_version_id)
- audit_wheel_v2_probability(p_version_id) — bucket audit
- simulate_wheel_v2_spins(p_version_id, p_count) — simulation
- get_wheel_v2_admin_overview()
- get_wheel_v2_audit_log(p_limit)

## Security
- SECURITY DEFINER, fixed search_path = public
- is_current_user_admin() validation in every function
*/

-- ═══════════════════════════════════════════════════════
-- Create draft
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION create_wheel_v2_draft()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_published record;
  v_new_id uuid;
  v_next_version int;
BEGIN
  IF v_admin_id IS NULL OR NOT is_current_user_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT * INTO v_published FROM wheel_v2_config_versions WHERE id = get_published_wheel_v2();

  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next_version
  FROM wheel_v2_config_versions WHERE status IN ('PUBLISHED', 'ARCHIVED');

  IF v_published.id IS NOT NULL THEN
    INSERT INTO wheel_v2_config_versions (
      version_number, status, enabled, maintenance_mode, timezone,
      title_ar, title_en, subtitle_ar, subtitle_en,
      free_spins_per_period, free_spin_reset_type, free_spin_reset_time,
      single_spin_cost, max_spins_per_request, allowed_spin_counts,
      animation_duration_ms, animation_turns, sounds_enabled, confetti_enabled,
      ticker_enabled, leaderboard_enabled, grand_prize_enabled,
      visual_config, created_by
    ) VALUES (
      v_next_version, 'DRAFT', v_published.enabled, false, v_published.timezone,
      v_published.title_ar, v_published.title_en, v_published.subtitle_ar, v_published.subtitle_en,
      v_published.free_spins_per_period, v_published.free_spin_reset_type, v_published.free_spin_reset_time,
      v_published.single_spin_cost, v_published.max_spins_per_request, v_published.allowed_spin_counts,
      v_published.animation_duration_ms, v_published.animation_turns, v_published.sounds_enabled, v_published.confetti_enabled,
      v_published.ticker_enabled, v_published.leaderboard_enabled, v_published.grand_prize_enabled,
      v_published.visual_config, v_admin_id
    )
    RETURNING id INTO v_new_id;

    INSERT INTO wheel_v2_version_prizes (
      version_id, prize_key, display_order,
      name_ar, name_en, short_label_ar, short_label_en, description_ar, description_en,
      reward_type, reward_payload, rarity, icon_url,
      wheel_color_start, wheel_color_end, text_color,
      probability_ppm, enabled, visible_on_wheel, is_grand_prize,
      fallback_prize_key, stock_limit, total_win_limit, daily_win_limit, per_user_win_limit,
      starts_at, ends_at, is_public_winner, fulfillment_mode
    )
    SELECT
      v_new_id, prize_key, display_order,
      name_ar, name_en, short_label_ar, short_label_en, description_ar, description_en,
      reward_type, reward_payload, rarity, icon_url,
      wheel_color_start, wheel_color_end, text_color,
      probability_ppm, enabled, visible_on_wheel, is_grand_prize,
      fallback_prize_key, stock_limit, total_win_limit, daily_win_limit, per_user_win_limit,
      starts_at, ends_at, is_public_winner, fulfillment_mode
    FROM wheel_v2_version_prizes
    WHERE version_id = v_published.id;
  ELSE
    INSERT INTO wheel_v2_config_versions (version_number, status, created_by)
    VALUES (v_next_version, 'DRAFT', v_admin_id)
    RETURNING id INTO v_new_id;
  END IF;

  RETURN v_new_id;
END;
$$;

-- ═══════════════════════════════════════════════════════
-- Update draft config
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_wheel_v2_draft(p_version_id uuid, p_config jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_version record;
BEGIN
  IF v_admin_id IS NULL OR NOT is_current_user_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT * INTO v_version FROM wheel_v2_config_versions WHERE id = p_version_id FOR UPDATE;
  IF v_version IS NULL THEN RAISE EXCEPTION 'VERSION_NOT_FOUND'; END IF;
  IF v_version.status != 'DRAFT' THEN RAISE EXCEPTION 'NOT_A_DRAFT'; END IF;

  UPDATE wheel_v2_config_versions SET
    enabled = COALESCE((p_config->>'enabled')::boolean, enabled),
    maintenance_mode = COALESCE((p_config->>'maintenance_mode')::boolean, maintenance_mode),
    timezone = COALESCE(p_config->>'timezone', timezone),
    title_ar = COALESCE(p_config->>'title_ar', title_ar),
    title_en = COALESCE(p_config->>'title_en', title_en),
    subtitle_ar = COALESCE(p_config->>'subtitle_ar', subtitle_ar),
    subtitle_en = COALESCE(p_config->>'subtitle_en', subtitle_en),
    free_spins_per_period = COALESCE((p_config->>'free_spins_per_period')::int, free_spins_per_period),
    free_spin_reset_type = COALESCE(p_config->>'free_spin_reset_type', free_spin_reset_type),
    free_spin_reset_time = COALESCE(p_config->>'free_spin_reset_time', free_spin_reset_time),
    single_spin_cost = COALESCE((p_config->>'single_spin_cost')::int, single_spin_cost),
    max_spins_per_request = COALESCE((p_config->>'max_spins_per_request')::int, max_spins_per_request),
    allowed_spin_counts = COALESCE((p_config->>'allowed_spin_counts')::int[], allowed_spin_counts),
    animation_duration_ms = COALESCE((p_config->>'animation_duration_ms')::int, animation_duration_ms),
    animation_turns = COALESCE((p_config->>'animation_turns')::int, animation_turns),
    sounds_enabled = COALESCE((p_config->>'sounds_enabled')::boolean, sounds_enabled),
    confetti_enabled = COALESCE((p_config->>'confetti_enabled')::boolean, confetti_enabled),
    ticker_enabled = COALESCE((p_config->>'ticker_enabled')::boolean, ticker_enabled),
    leaderboard_enabled = COALESCE((p_config->>'leaderboard_enabled')::boolean, leaderboard_enabled),
    grand_prize_enabled = COALESCE((p_config->>'grand_prize_enabled')::boolean, grand_prize_enabled),
    visual_config = COALESCE(p_config->'visual_config', visual_config)
  WHERE id = p_version_id;
END;
$$;

-- ═══════════════════════════════════════════════════════
-- Add prize
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION add_wheel_v2_prize(p_version_id uuid, p_prize jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_version record;
  v_new_id uuid;
  v_max_order int;
BEGIN
  IF v_admin_id IS NULL OR NOT is_current_user_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT * INTO v_version FROM wheel_v2_config_versions WHERE id = p_version_id;
  IF v_version IS NULL OR v_version.status != 'DRAFT' THEN RAISE EXCEPTION 'NOT_A_DRAFT'; END IF;

  SELECT COALESCE(MAX(display_order), 0) + 1 INTO v_max_order
  FROM wheel_v2_version_prizes WHERE version_id = p_version_id;

  INSERT INTO wheel_v2_version_prizes (
    version_id, prize_key, display_order,
    name_ar, name_en, short_label_ar, short_label_en, description_ar, description_en,
    reward_type, reward_payload, rarity, icon_url,
    wheel_color_start, wheel_color_end, text_color,
    probability_ppm, enabled, visible_on_wheel, is_grand_prize,
    fallback_prize_key, stock_limit, total_win_limit, daily_win_limit, per_user_win_limit,
    is_public_winner, fulfillment_mode
  ) VALUES (
    p_version_id,
    COALESCE(p_prize->>'prize_key', 'prize_' || gen_random_uuid()::text),
    COALESCE((p_prize->>'display_order')::int, v_max_order),
    COALESCE(p_prize->>'name_ar', ''),
    COALESCE(p_prize->>'name_en', ''),
    COALESCE(p_prize->>'short_label_ar', ''),
    COALESCE(p_prize->>'short_label_en', ''),
    p_prize->>'description_ar',
    p_prize->>'description_en',
    COALESCE(p_prize->>'reward_type', 'NO_REWARD'),
    COALESCE(p_prize->'reward_payload', '{}'::jsonb),
    COALESCE(p_prize->>'rarity', 'common'),
    p_prize->>'icon_url',
    COALESCE(p_prize->>'wheel_color_start', '#f2e3bd'),
    COALESCE(p_prize->>'wheel_color_end', '#d6ba82'),
    COALESCE(p_prize->>'text_color', '#241705'),
    COALESCE((p_prize->>'probability_ppm')::int, 0),
    COALESCE((p_prize->>'enabled')::boolean, true),
    COALESCE((p_prize->>'visible_on_wheel')::boolean, true),
    COALESCE((p_prize->>'is_grand_prize')::boolean, false),
    p_prize->>'fallback_prize_key',
    NULLIF(p_prize->>'stock_limit', '')::int,
    NULLIF(p_prize->>'total_win_limit', '')::int,
    NULLIF(p_prize->>'daily_win_limit', '')::int,
    NULLIF(p_prize->>'per_user_win_limit', '')::int,
    COALESCE((p_prize->>'is_public_winner')::boolean, true),
    COALESCE(p_prize->>'fulfillment_mode', 'instant')
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

-- ═══════════════════════════════════════════════════════
-- Update prize
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_wheel_v2_prize(p_prize_id uuid, p_prize jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_prize record;
BEGIN
  IF v_admin_id IS NULL OR NOT is_current_user_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT * INTO v_prize FROM wheel_v2_version_prizes WHERE id = p_prize_id FOR UPDATE;
  IF v_prize IS NULL THEN RAISE EXCEPTION 'PRIZE_NOT_FOUND'; END IF;

  UPDATE wheel_v2_version_prizes SET
    prize_key = COALESCE(p_prize->>'prize_key', prize_key),
    display_order = COALESCE((p_prize->>'display_order')::int, display_order),
    name_ar = COALESCE(p_prize->>'name_ar', name_ar),
    name_en = COALESCE(p_prize->>'name_en', name_en),
    short_label_ar = COALESCE(p_prize->>'short_label_ar', short_label_ar),
    short_label_en = COALESCE(p_prize->>'short_label_en', short_label_en),
    description_ar = COALESCE(p_prize->>'description_ar', description_ar),
    description_en = COALESCE(p_prize->>'description_en', description_en),
    reward_type = COALESCE(p_prize->>'reward_type', reward_type),
    reward_payload = COALESCE(p_prize->'reward_payload', reward_payload),
    rarity = COALESCE(p_prize->>'rarity', rarity),
    icon_url = COALESCE(p_prize->>'icon_url', icon_url),
    wheel_color_start = COALESCE(p_prize->>'wheel_color_start', wheel_color_start),
    wheel_color_end = COALESCE(p_prize->>'wheel_color_end', wheel_color_end),
    text_color = COALESCE(p_prize->>'text_color', text_color),
    probability_ppm = COALESCE((p_prize->>'probability_ppm')::int, probability_ppm),
    enabled = COALESCE((p_prize->>'enabled')::boolean, enabled),
    visible_on_wheel = COALESCE((p_prize->>'visible_on_wheel')::boolean, visible_on_wheel),
    is_grand_prize = COALESCE((p_prize->>'is_grand_prize')::boolean, is_grand_prize),
    fallback_prize_key = COALESCE(p_prize->>'fallback_prize_key', fallback_prize_key),
    stock_limit = NULLIF(COALESCE(p_prize->>'stock_limit', stock_limit::text), '')::int,
    total_win_limit = NULLIF(COALESCE(p_prize->>'total_win_limit', total_win_limit::text), '')::int,
    daily_win_limit = NULLIF(COALESCE(p_prize->>'daily_win_limit', daily_win_limit::text), '')::int,
    per_user_win_limit = NULLIF(COALESCE(p_prize->>'per_user_win_limit', per_user_win_limit::text), '')::int,
    is_public_winner = COALESCE((p_prize->>'is_public_winner')::boolean, is_public_winner),
    fulfillment_mode = COALESCE(p_prize->>'fulfillment_mode', fulfillment_mode)
  WHERE id = p_prize_id;
END;
$$;

-- ═══════════════════════════════════════════════════════
-- Delete prize (DRAFT only)
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION delete_wheel_v2_prize(p_prize_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_prize record;
BEGIN
  IF v_admin_id IS NULL OR NOT is_current_user_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT v.* INTO v_prize
  FROM wheel_v2_version_prizes vp
  JOIN wheel_v2_config_versions v ON v.id = vp.version_id
  WHERE vp.id = p_prize_id;

  IF v_prize IS NULL THEN RAISE EXCEPTION 'PRIZE_NOT_FOUND'; END IF;
  IF v_prize.status != 'DRAFT' THEN RAISE EXCEPTION 'NOT_A_DRAFT'; END IF;

  DELETE FROM wheel_v2_version_prizes WHERE id = p_prize_id;
END;
$$;

-- ═══════════════════════════════════════════════════════
-- Publish version
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION publish_wheel_v2_version(p_version_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_version record;
  v_validation record;
  v_current_published uuid;
  v_prize_count int;
  v_dup_keys int;
  v_zero_prob_awardable int;
  v_bad_fallback int;
BEGIN
  IF v_admin_id IS NULL OR NOT is_current_user_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  SELECT * INTO v_version FROM wheel_v2_config_versions WHERE id = p_version_id FOR UPDATE;
  IF v_version IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'VERSION_NOT_FOUND'); END IF;
  IF v_version.status != 'DRAFT' THEN RETURN jsonb_build_object('success', false, 'error', 'NOT_A_DRAFT'); END IF;

  SELECT * INTO v_validation FROM validate_wheel_v2_probability(p_version_id);
  IF NOT v_validation.is_valid THEN
    RETURN jsonb_build_object('success', false, 'error', 'PROBABILITY_INVALID',
      'total_ppm', v_validation.total_ppm, 'remaining_ppm', v_validation.remaining_ppm);
  END IF;

  SELECT COUNT(*) INTO v_prize_count FROM wheel_v2_version_prizes WHERE version_id = p_version_id AND enabled = true;
  IF v_prize_count < 1 OR v_prize_count > 20 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_PRIZE_COUNT', 'count', v_prize_count);
  END IF;

  SELECT COUNT(*) INTO v_dup_keys FROM (
    SELECT prize_key FROM wheel_v2_version_prizes WHERE version_id = p_version_id
    GROUP BY prize_key HAVING COUNT(*) > 1
  ) t;
  IF v_dup_keys > 0 THEN RETURN jsonb_build_object('success', false, 'error', 'DUPLICATE_PRIZE_KEYS'); END IF;

  SELECT COUNT(*) INTO v_zero_prob_awardable
  FROM wheel_v2_version_prizes
  WHERE version_id = p_version_id AND enabled = true AND reward_type != 'NO_REWARD' AND probability_ppm = 0;
  IF v_zero_prob_awardable > 0 THEN RETURN jsonb_build_object('success', false, 'error', 'ZERO_PROBABILITY_AWARDABLE'); END IF;

  SELECT COUNT(*) INTO v_bad_fallback
  FROM wheel_v2_version_prizes p1
  WHERE p1.version_id = p_version_id AND p1.fallback_prize_key IS NOT NULL AND p1.fallback_prize_key != ''
    AND NOT EXISTS (
      SELECT 1 FROM wheel_v2_version_prizes p2
      WHERE p2.version_id = p_version_id AND p2.prize_key = p1.fallback_prize_key AND p2.enabled = true
    );
  IF v_bad_fallback > 0 THEN RETURN jsonb_build_object('success', false, 'error', 'INVALID_FALLBACK_REFERENCE'); END IF;

  v_current_published := get_published_wheel_v2();
  IF v_current_published IS NOT NULL AND v_current_published != p_version_id THEN
    UPDATE wheel_v2_config_versions SET status = 'ARCHIVED' WHERE id = v_current_published;
  END IF;

  UPDATE wheel_v2_config_versions
  SET status = 'PUBLISHED', published_at = now(), published_by = v_admin_id,
      version_number = COALESCE((SELECT MAX(version_number) FROM wheel_v2_config_versions WHERE status IN ('PUBLISHED', 'ARCHIVED')), 0) + 1
  WHERE id = p_version_id;

  RETURN jsonb_build_object('success', true, 'version_id', p_version_id);
END;
$$;

-- ═══════════════════════════════════════════════════════
-- Audit: bucket counts per prize (no loop over 1M — uses range math)
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION audit_wheel_v2_probability(p_version_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_counts jsonb;
  v_total int;
  v_prev_end int := 0;
  v_errors text[] := '{}'::text[];
  v_row record;
BEGIN
  IF v_admin_id IS NULL OR NOT is_current_user_admin() THEN
    RETURN jsonb_build_object('error', 'UNAUTHORIZED');
  END IF;

  -- Check ranges for gaps/overlaps by iterating in order
  FOR v_row IN
    SELECT * FROM build_wheel_v2_probability_ranges(p_version_id)
    ORDER BY range_start
  LOOP
    IF v_row.range_start != v_prev_end THEN
      v_errors := array_append(v_errors, 'GAP/OVERLAP: expected start=' || v_prev_end || ' got start=' || v_row.range_start || ' for ' || v_row.prize_key);
    END IF;
    v_prev_end := v_row.range_end;
  END LOOP;

  IF v_prev_end != 1000000 THEN
    v_errors := array_append(v_errors, 'TOTAL_NOT_1000000: ends at ' || v_prev_end);
  END IF;

  SELECT COALESCE(jsonb_object_agg(prize_key, jsonb_build_object(
    'bucket_count', bucket_count,
    'expected_ppm', expected_ppm,
    'match', bucket_count = expected_ppm
  )), '{}'::jsonb)
  INTO v_counts
  FROM (
    SELECT t.prize_key, (t.range_end - t.range_start) AS bucket_count, t.probability_ppm AS expected_ppm
    FROM build_wheel_v2_probability_ranges(p_version_id) t
  ) s;

  SELECT COALESCE(SUM(probability_ppm), 0) INTO v_total
  FROM build_wheel_v2_probability_ranges(p_version_id);

  RETURN jsonb_build_object(
    'bucket_counts', v_counts,
    'total_ppm', v_total,
    'errors', v_errors,
    'has_errors', array_length(v_errors, 1) > 0
  );
END;
$$;

-- ═══════════════════════════════════════════════════════
-- Simulate spins (no rewards, no balance changes)
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION simulate_wheel_v2_spins(p_version_id uuid, p_count int DEFAULT 100000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_draw int;
  v_prize record;
  v_counts jsonb;
  v_i int;
BEGIN
  IF v_admin_id IS NULL OR NOT is_current_user_admin() THEN
    RETURN jsonb_build_object('error', 'UNAUTHORIZED');
  END IF;

  IF p_count > 100000 THEN p_count := 100000; END IF;

  CREATE TEMP TABLE IF NOT EXISTS _sim_counts (prize_key text PRIMARY KEY, hit_count int DEFAULT 0);

  FOR v_i IN 1..p_count LOOP
    v_draw := secure_random_0_to_999999();
    SELECT * INTO v_prize FROM select_wheel_v2_prize(p_version_id, v_draw);
    IF v_prize IS NOT NULL THEN
      INSERT INTO _sim_counts (prize_key, hit_count) VALUES (v_prize.prize_key, 1)
      ON CONFLICT (prize_key) DO UPDATE SET hit_count = _sim_counts.hit_count + 1;
    END IF;
  END LOOP;

  SELECT COALESCE(jsonb_object_agg(prize_key, jsonb_build_object(
    'hits', hit_count,
    'actual_pct', ROUND((hit_count::float / p_count * 100)::numeric, 4),
    'expected_pct', ROUND((
      (SELECT probability_ppm FROM wheel_v2_version_prizes vp WHERE vp.version_id = p_version_id AND vp.prize_key = _sim_counts.prize_key)::float / 10000.0
    )::numeric, 4)
  )), '{}'::jsonb)
  INTO v_counts
  FROM _sim_counts;

  DROP TABLE IF EXISTS _sim_counts;

  RETURN jsonb_build_object('simulation_count', p_count, 'results', v_counts);
END;
$$;

-- ═══════════════════════════════════════════════════════
-- Admin overview
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_wheel_v2_admin_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_versions jsonb;
  v_published_id uuid;
  v_total_spins int;
  v_total_batches int;
  v_total_users int;
  v_feature_enabled boolean;
BEGIN
  IF v_admin_id IS NULL OR NOT is_current_user_admin() THEN
    RETURN jsonb_build_object('error', 'UNAUTHORIZED');
  END IF;

  v_published_id := get_published_wheel_v2();
  v_feature_enabled := is_wheel_v2_enabled();

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', v.id, 'version_number', v.version_number, 'status', v.status,
    'enabled', v.enabled, 'maintenance_mode', v.maintenance_mode,
    'title_en', v.title_en,
    'prize_count', (SELECT COUNT(*) FROM wheel_v2_version_prizes WHERE version_id = v.id),
    'created_at', v.created_at, 'published_at', v.published_at
  ) ORDER BY v.created_at DESC), '[]'::jsonb)
  INTO v_versions FROM wheel_v2_config_versions v;

  SELECT COUNT(*) INTO v_total_spins FROM wheel_v2_spin_results;
  SELECT COUNT(*) INTO v_total_batches FROM wheel_v2_spin_batches;
  SELECT COUNT(DISTINCT user_id) INTO v_total_users FROM wheel_v2_spin_batches;

  RETURN jsonb_build_object(
    'feature_enabled', v_feature_enabled,
    'published_version_id', v_published_id,
    'versions', v_versions,
    'total_spins', v_total_spins,
    'total_batches', v_total_batches,
    'total_users', v_total_users
  );
END;
$$;

-- ═══════════════════════════════════════════════════════
-- Admin audit log
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_wheel_v2_audit_log(p_limit int DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_results jsonb;
BEGIN
  IF v_admin_id IS NULL OR NOT is_current_user_admin() THEN
    RETURN jsonb_build_object('error', 'UNAUTHORIZED');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'batch_id', b.id, 'user_id', b.user_id, 'username', u.username,
    'client_request_id', b.client_request_id, 'version_id', b.published_version_id,
    'requested_count', b.requested_spin_count, 'free_spins_used', b.free_spins_used,
    'paid_spins', b.paid_spin_count, 'total_cost', b.total_cost,
    'points_before', b.points_before, 'points_after_cost', b.points_after_cost,
    'final_points', b.final_points, 'status', b.status, 'failure_code', b.failure_code,
    'child_count', (SELECT COUNT(*) FROM wheel_v2_spin_results WHERE batch_id = b.id),
    'created_at', b.created_at, 'completed_at', b.completed_at
  ) ORDER BY b.created_at DESC), '[]'::jsonb)
  INTO v_results
  FROM wheel_v2_spin_batches b LEFT JOIN users u ON u.id = b.user_id
  LIMIT LEAST(p_limit, 200);

  RETURN v_results;
END;
$$;
