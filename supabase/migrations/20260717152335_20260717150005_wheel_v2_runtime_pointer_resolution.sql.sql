/*
# Wheel V2 Release Safety — Update Runtime Pointer Resolution

Replaces get_published_wheel_v2() to use the authoritative runtime_settings
active_version_id pointer instead of querying by status + ORDER BY published_at.

Also updates is_wheel_v2_enabled() to check both the feature flag and the
runtime_settings public_enabled flag.
*/
CREATE OR REPLACE FUNCTION public.get_published_wheel_v2()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT active_version_id FROM wheel_v2_runtime_settings WHERE id = 1;
$function$;

CREATE OR REPLACE FUNCTION public.is_wheel_v2_enabled()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE(
      (SELECT (value->>'wheel_v2_enabled')::boolean FROM wheel_v2_feature_flags WHERE key = 'wheel_v2_enabled'),
      false
    )
    AND
    COALESCE(
      (SELECT public_enabled FROM wheel_v2_runtime_settings WHERE id = 1),
      false
    );
$function$;
