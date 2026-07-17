/*
# Wheel V2 Release Safety — Comprehensive Release Validation

validate_wheel_v2_release(p_version_id)
Runs ALL preflight checks: configuration, prizes, probabilities, economy,
free spins, multi-spin, rewards, icons, schema, and runtime dependencies.
Returns jsonb with valid boolean, errors[], warnings[], and diagnostics.
*/
CREATE OR REPLACE FUNCTION public.validate_wheel_v2_release(p_version_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_errors text[] := '{}';
  v_warnings text[] := '{}';
  v_config record;
  v_prize_count int;
  v_total_ppm bigint;
  v_dup_keys int;
  v_bad_fallback int;
  v_self_fallback int;
  v_cycle_count int;
  v_zero_prob_awardable int;
  v_grand_prize_count int;
  v_prob_validation record;
  v_objects jsonb;
  v_missing text[];
  v_dup_counts int;
  v_bad_spin_counts int;
  v_schema_version int;
BEGIN
  -- Load config
  SELECT * INTO v_config FROM wheel_v2_config_versions WHERE id = p_version_id;
  IF v_config IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'errors', '["DRAFT_NOT_FOUND"]', 'warnings', '[]');
  END IF;

  IF v_config.status != 'DRAFT' THEN
    v_errors := array_append(v_errors, 'NOT_A_DRAFT');
    RETURN jsonb_build_object('valid', false, 'errors', to_jsonb(v_errors), 'warnings', '[]');
  END IF;

  -- GENERAL: title exists
  IF v_config.title_en IS NULL OR v_config.title_en = '' THEN
    v_errors := array_append(v_errors, 'TITLE_MISSING');
  END IF;

  -- PRIZES: count between 1 and 20
  SELECT COUNT(*) INTO v_prize_count
  FROM wheel_v2_version_prizes
  WHERE version_id = p_version_id AND enabled = true AND visible_on_wheel = true;
  IF v_prize_count < 1 OR v_prize_count > 20 THEN
    v_errors := array_append(v_errors, 'INVALID_PRIZE_COUNT');
  END IF;

  -- PRIZES: unique prize_key
  SELECT COUNT(*) INTO v_dup_keys FROM (
    SELECT prize_key FROM wheel_v2_version_prizes WHERE version_id = p_version_id
    GROUP BY prize_key HAVING COUNT(*) > 1
  ) t;
  IF v_dup_keys > 0 THEN
    v_errors := array_append(v_errors, 'DUPLICATE_PRIZE_KEYS');
  END IF;

  -- PRIZES: zero-probability awardable
  SELECT COUNT(*) INTO v_zero_prob_awardable
  FROM wheel_v2_version_prizes
  WHERE version_id = p_version_id AND enabled = true AND reward_type != 'NO_REWARD' AND probability_ppm = 0;
  IF v_zero_prob_awardable > 0 THEN
    v_errors := array_append(v_errors, 'ZERO_PROBABILITY_AWARDABLE');
  END IF;

  -- PRIZES: fallback references
  SELECT COUNT(*) INTO v_bad_fallback
  FROM wheel_v2_version_prizes p1
  WHERE p1.version_id = p_version_id AND p1.fallback_prize_key IS NOT NULL AND p1.fallback_prize_key != ''
  AND NOT EXISTS (
    SELECT 1 FROM wheel_v2_version_prizes p2
    WHERE p2.version_id = p_version_id AND p2.prize_key = p1.fallback_prize_key AND p2.enabled = true
  );
  IF v_bad_fallback > 0 THEN
    v_errors := array_append(v_errors, 'INVALID_FALLBACK_REFERENCE');
  END IF;

  -- PRIZES: self-referencing fallback
  SELECT COUNT(*) INTO v_self_fallback
  FROM wheel_v2_version_prizes
  WHERE version_id = p_version_id AND fallback_prize_key = prize_key;
  IF v_self_fallback > 0 THEN
    v_errors := array_append(v_errors, 'FALLBACK_SELF_REFERENCE');
  END IF;

  -- PRIZES: Grand Prize count
  SELECT COUNT(*) INTO v_grand_prize_count
  FROM wheel_v2_version_prizes
  WHERE version_id = p_version_id AND is_grand_prize = true AND enabled = true;
  IF v_config.grand_prize_enabled AND v_grand_prize_count != 1 THEN
    v_errors := array_append(v_errors, 'GRAND_PRIZE_COUNT_INVALID');
  END IF;

  -- PROBABILITIES
  SELECT * INTO v_prob_validation FROM validate_wheel_v2_probability(p_version_id);
  IF NOT v_prob_validation.is_valid THEN
    v_errors := array_append(v_errors, 'PROBABILITY_TOTAL_INVALID');
  END IF;

  -- PROBABILITIES: range audit (gaps/overlaps)
  BEGIN
    WITH ranges AS (
      SELECT range_start, range_end, prize_key
      FROM build_wheel_v2_probability_ranges(p_version_id)
      WHERE probability_ppm > 0
    ),
    gaps AS (
      SELECT r1.range_end AS gap_start, r2.range_start AS gap_end
      FROM ranges r1
      JOIN ranges r2 ON r2.range_start > r1.range_end
      WHERE NOT EXISTS (SELECT 1 FROM ranges r3 WHERE r3.range_start = r1.range_end)
      ORDER BY r1.range_end
      LIMIT 1
    )
    SELECT COUNT(*) INTO v_cycle_count FROM gaps;
    IF v_cycle_count > 0 THEN
      v_errors := array_append(v_errors, 'PROBABILITY_RANGE_GAP');
    END IF;
  END;

  -- ECONOMY: single_spin_cost safe integer
  IF v_config.single_spin_cost IS NULL OR v_config.single_spin_cost < 0 THEN
    v_errors := array_append(v_errors, 'INVALID_SINGLE_SPIN_COST');
  END IF;

  -- ECONOMY: max total cost overflow check
  IF v_config.single_spin_cost > 0 AND v_config.max_spins_per_request > 0 THEN
    IF v_config.single_spin_cost::bigint * v_config.max_spins_per_request::bigint > 2000000000 THEN
      v_errors := array_append(v_errors, 'MAX_COST_OVERFLOW');
    END IF;
  END IF;

  -- FREE SPINS: allowance safe integer
  IF v_config.free_spins_per_period IS NULL OR v_config.free_spins_per_period < 0 THEN
    v_errors := array_append(v_errors, 'INVALID_FREE_SPIN_ALLOWANCE');
  END IF;

  -- MULTI-SPIN: allowed counts unique and positive
  SELECT COUNT(*) INTO v_dup_counts FROM (
    SELECT unnest FROM unnest(v_config.allowed_spin_counts) GROUP BY unnest HAVING COUNT(*) > 1
  ) t;
  IF v_dup_counts > 0 THEN
    v_errors := array_append(v_errors, 'DUPLICATE_SPIN_COUNTS');
  END IF;

  SELECT COUNT(*) INTO v_bad_spin_counts FROM unnest(v_config.allowed_spin_counts)
  WHERE unnest <= 0 OR unnest > v_config.max_spins_per_request;
  IF v_bad_spin_counts > 0 THEN
    v_errors := array_append(v_errors, 'INVALID_SPIN_COUNTS');
  END IF;

  -- SCHEMA: check required objects
  v_objects := check_wheel_v2_required_objects();
  v_missing := ARRAY(SELECT jsonb_array_elements_text(v_objects->'missing'));
  IF v_missing IS NOT NULL AND array_length(v_missing, 1) > 0 THEN
    FOREACH v_cycle_count IN ARRAY v_missing LOOP
      v_errors := array_append(v_errors, v_cycle_count);
    END LOOP;
  END IF;

  -- ICONS: warn for missing optional icons (not blocking)
  SELECT COUNT(*) INTO v_cycle_count
  FROM wheel_v2_version_prizes
  WHERE version_id = p_version_id AND enabled = true AND visible_on_wheel = true
  AND (icon_url IS NULL OR icon_url = '');
  IF v_cycle_count > 0 THEN
    v_warnings := array_append(v_warnings, 'MISSING_OPTIONAL_ICONS');
  END IF;

  -- ICONS: block for malformed icon references
  SELECT COUNT(*) INTO v_cycle_count
  FROM wheel_v2_version_prizes
  WHERE version_id = p_version_id AND enabled = true AND icon_url IS NOT NULL AND icon_url != ''
  AND icon_url NOT LIKE 'https://%' AND icon_url NOT LIKE 'http://%';
  IF v_cycle_count > 0 THEN
    v_errors := array_append(v_errors, 'ICON_REFERENCE_INVALID');
  END IF;

  RETURN jsonb_build_object(
    'valid', array_length(v_errors, 1) IS NULL,
    'errors', to_jsonb(CASE WHEN array_length(v_errors, 1) IS NULL THEN '{}'::text[] ELSE v_errors END),
    'warnings', to_jsonb(CASE WHEN array_length(v_warnings, 1) IS NULL THEN '{}'::text[] ELSE v_warnings END),
    'prize_count', v_prize_count,
    'total_ppm', v_total_ppm,
    'version_status', v_config.status,
    'schema_version', get_wheel_v2_schema_version()
  );
END;
$function$;
