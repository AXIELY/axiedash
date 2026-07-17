/*
# Wheel V2 Release Safety — Maintenance Check + Schema Version Helper

1. is_wheel_v2_in_maintenance(): Returns true if runtime_settings.maintenance_mode is true.
2. get_wheel_v2_schema_version(): Returns the current schema compatibility version.
3. check_wheel_v2_required_objects(): Returns an array of missing required DB objects.
*/
CREATE OR REPLACE FUNCTION public.is_wheel_v2_in_maintenance()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT maintenance_mode FROM wheel_v2_runtime_settings WHERE id = 1),
    false
  );
$function$;

CREATE OR REPLACE FUNCTION public.get_wheel_v2_schema_version()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT 2;
$function$;

CREATE OR REPLACE FUNCTION public.check_wheel_v2_required_objects()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_missing text[] := '{}';
  v_count int;
BEGIN
  -- Check required tables
  FOR v_count IN EXECUTE $q$
    SELECT COUNT(*) FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ANY(ARRAY[
      'wheel_v2_config_versions', 'wheel_v2_version_prizes',
      'wheel_v2_spin_batches', 'wheel_v2_spin_results',
      'wheel_v2_free_spin_usage', 'wheel_v2_grand_prize_progress',
      'wheel_v2_winner_events', 'wheel_v2_runtime_settings',
      'wheel_v2_release_snapshots', 'wheel_v2_release_audits',
      'users', 'point_transactions', 'reward_grants', 'fulfillment_cases'
    ])
  $q$ LOOP
    IF v_count < 14 THEN
      v_missing := array_append(v_missing, 'REQUIRED_TABLE_MISSING');
    END IF;
  END LOOP;

  -- Check required RPCs
  SELECT COUNT(*) INTO v_count FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = ANY(ARRAY[
    'execute_wheel_spins', 'get_published_wheel_v2_config',
    'get_wheel_v2_free_spins_remaining', 'get_wheel_v2_grand_prize_progress',
    'get_wheel_v2_leaderboard', 'select_wheel_v2_prize',
    'build_wheel_v2_probability_ranges', 'secure_random_0_to_999999',
    'get_published_wheel_v2', 'is_wheel_v2_enabled',
    'is_wheel_v2_in_maintenance', 'get_wheel_v2_schema_version'
  ]);
  IF v_count < 12 THEN
    v_missing := array_append(v_missing, 'REQUIRED_RPC_MISSING');
  END IF;

  -- Check storage bucket
  SELECT COUNT(*) INTO v_count FROM storage.buckets WHERE name = 'wheel-v2-prizes';
  IF v_count = 0 THEN
    v_missing := array_append(v_missing, 'STORAGE_BUCKET_MISSING');
  END IF;

  RETURN jsonb_build_object(
    'all_present', (array_length(v_missing, 1) IS NULL),
    'missing', to_jsonb(v_missing)
  );
END;
$function$;
