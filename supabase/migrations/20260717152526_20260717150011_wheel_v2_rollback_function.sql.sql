/*
# Wheel V2 Release Safety — Automatic Rollback Function

rollback_wheel_v2_release(p_publish_request_id, p_failed_version_id, p_candidate_id, p_previous_active_id, p_admin_id)
Restores the previous working version if a critical post-activation check fails.
*/
CREATE OR REPLACE FUNCTION public.rollback_wheel_v2_release(
  p_publish_request_id text,
  p_failed_version_id uuid,
  p_candidate_id uuid,
  p_previous_active_id uuid,
  p_admin_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_runtime record;
  v_previous_checksum text;
BEGIN
  SELECT * INTO v_runtime FROM wheel_v2_runtime_settings WHERE id = 1 FOR UPDATE;

  -- Mark failed candidate
  UPDATE wheel_v2_config_versions
  SET status = 'RELEASE_FAILED'
  WHERE id = p_failed_version_id;

  -- Restore previous active version if it exists
  IF p_previous_active_id IS NOT NULL THEN
    UPDATE wheel_v2_config_versions
    SET status = 'PUBLISHED_ACTIVE'
    WHERE id = p_previous_active_id;

    -- Get previous checksum from snapshot
    SELECT snapshot_checksum INTO v_previous_checksum
    FROM wheel_v2_release_snapshots
    WHERE version_id = p_previous_active_id
    ORDER BY compiled_at DESC LIMIT 1;

    UPDATE wheel_v2_runtime_settings
    SET
      active_version_id = p_previous_active_id,
      active_snapshot_checksum = v_previous_checksum,
      public_enabled = true,
      maintenance_mode = false,
      release_generation = v_runtime.release_generation + 1,
      updated_at = now(),
      updated_by = p_admin_id
    WHERE id = 1;
  ELSE
    -- No previous version: disable public access
    UPDATE wheel_v2_runtime_settings
    SET
      active_version_id = NULL,
      active_snapshot_checksum = NULL,
      public_enabled = false,
      maintenance_mode = false,
      release_generation = v_runtime.release_generation + 1,
      updated_at = now(),
      updated_by = p_admin_id
    WHERE id = 1;
  END IF;

  -- Write rollback audit
  INSERT INTO wheel_v2_release_audits (
    publish_request_id, action, version_id, candidate_version_id,
    active_version_id, previous_active_version_id, release_generation,
    error_code, admin_id
  )
  VALUES (
    p_publish_request_id, 'AUTO_ROLLBACK', p_failed_version_id, p_candidate_id,
    p_previous_active_id, NULL, v_runtime.release_generation + 1,
    'AUTO_ROLLBACK_COMPLETED', p_admin_id
  );
END;
$function$;
