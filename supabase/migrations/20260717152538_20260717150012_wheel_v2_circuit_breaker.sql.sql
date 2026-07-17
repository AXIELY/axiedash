/*
# Wheel V2 Release Safety — Runtime Circuit Breaker

report_wheel_v2_critical_failure(p_failure_code, p_details)
Called by the spin execution engine when a critical runtime violation is detected.
Increments consecutive_critical_failures. When the threshold is reached, sets
maintenance_mode = true to reject new spins while keeping the page readable.

get_wheel_v2_circuit_breaker_state()
Returns the current circuit breaker state for admin diagnostics.
*/
CREATE OR REPLACE FUNCTION public.report_wheel_v2_critical_failure(
  p_failure_code text,
  p_details jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_runtime record;
  v_new_count int;
BEGIN
  SELECT * INTO v_runtime FROM wheel_v2_runtime_settings WHERE id = 1 FOR UPDATE;

  v_new_count := v_runtime.consecutive_critical_failures + 1;

  IF v_new_count >= v_runtime.circuit_breaker_threshold THEN
    UPDATE wheel_v2_runtime_settings
    SET
      consecutive_critical_failures = v_new_count,
      maintenance_mode = true,
      last_health_check_at = now(),
      updated_at = now()
    WHERE id = 1;

    INSERT INTO wheel_v2_release_audits (action, error_code, error_details, release_generation)
    VALUES ('CIRCUIT_BREAKER_TRIPPED', p_failure_code, p_details, v_runtime.release_generation);
  ELSE
    UPDATE wheel_v2_runtime_settings
    SET
      consecutive_critical_failures = v_new_count,
      last_health_check_at = now(),
      updated_at = now()
    WHERE id = 1;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_wheel_v2_circuit_breaker_state()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'maintenance_mode', maintenance_mode,
    'consecutive_critical_failures', consecutive_critical_failures,
    'circuit_breaker_threshold', circuit_breaker_threshold,
    'last_health_check_at', last_health_check_at,
    'release_generation', release_generation,
    'active_version_id', active_version_id,
    'public_enabled', public_enabled
  )
  FROM wheel_v2_runtime_settings WHERE id = 1;
$function$;

-- Admin function to reset circuit breaker after fixing issues
CREATE OR REPLACE FUNCTION public.reset_wheel_v2_circuit_breaker()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id uuid := auth.uid();
BEGIN
  IF v_admin_id IS NULL OR NOT is_current_user_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  UPDATE wheel_v2_runtime_settings
  SET
    consecutive_critical_failures = 0,
    maintenance_mode = false,
    updated_at = now(),
    updated_by = v_admin_id
  WHERE id = 1;

  RETURN jsonb_build_object('success', true);
END;
$function$;
