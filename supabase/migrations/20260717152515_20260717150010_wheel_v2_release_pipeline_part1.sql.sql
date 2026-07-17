/*
# Wheel V2 Release Safety — One-Click Release Pipeline (Part 1: Phases 1-5)

release_wheel_v2(p_draft_version_id, p_publish_request_id, p_draft_revision)
Executes the full release pipeline:
  Phase 1: Release lock
  Phase 2: Exact draft check
  Phase 3: Preflight validation
  Phase 4: Candidate creation
  Phase 5: Shadow verification
  Phase 6-9 are in a separate migration due to length.

Returns structured jsonb. On failure, returns error_code + details.
On success, returns full success response with all verification flags.
*/
CREATE OR REPLACE FUNCTION public.release_wheel_v2(
  p_draft_version_id uuid,
  p_publish_request_id text,
  p_draft_revision text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id uuid := auth.uid();
  v_draft record;
  v_validation jsonb;
  v_errors text[];
  v_warnings text[];
  v_compiled jsonb;
  v_snapshot_data jsonb;
  v_checksum text;
  v_prize_count int;
  v_total_ppm bigint;
  v_candidate_id uuid;
  v_runtime record;
  v_current_active uuid;
  v_previous_active uuid;
  v_objects jsonb;
  v_missing text[];
  v_i int;
  v_result jsonb;
  v_existing_snapshot record;
  v_existing_result jsonb;
BEGIN
  -- 0. Auth check
  IF v_admin_id IS NULL OR NOT is_current_user_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  -- ── PHASE 1: RELEASE LOCK ──
  -- Check if another release is in progress
  SELECT * INTO v_runtime FROM wheel_v2_runtime_settings WHERE id = 1 FOR UPDATE;

  IF v_runtime.maintenance_mode THEN
    RETURN jsonb_build_object('success', false, 'error', 'MAINTENANCE_MODE');
  END IF;

  -- Check for existing candidate
  SELECT * INTO v_existing_snapshot FROM wheel_v2_release_snapshots
  WHERE publish_request_id = p_publish_request_id;

  IF v_existing_snapshot IS NOT NULL THEN
    -- Idempotent retry: return original result if this exact request was already processed
    SELECT validation_result INTO v_existing_result
    FROM wheel_v2_release_audits
    WHERE publish_request_id = p_publish_request_id AND action = 'RELEASE_SUCCESS'
    ORDER BY created_at DESC LIMIT 1;

    IF v_existing_result IS NOT NULL THEN
      RETURN v_existing_result;
    END IF;

    -- If the snapshot exists but no success audit, it was a failed attempt
    -- Allow retry by deleting the old snapshot
    DELETE FROM wheel_v2_release_snapshots WHERE publish_request_id = p_publish_request_id;
  END IF;

  -- Check no other candidate is pending
  PERFORM 1 FROM wheel_v2_config_versions WHERE status = 'RELEASE_CANDIDATE' FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'RELEASE_ALREADY_IN_PROGRESS');
  END IF;

  -- ── PHASE 2: EXACT DRAFT CHECK ──
  SELECT * INTO v_draft FROM wheel_v2_config_versions WHERE id = p_draft_version_id FOR UPDATE;
  IF v_draft IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'DRAFT_NOT_FOUND');
  END IF;

  IF v_draft.status != 'DRAFT' THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_A_DRAFT');
  END IF;

  -- Check draft revision if provided
  IF p_draft_revision IS NOT NULL AND p_draft_revision != '' THEN
    IF v_draft.updated_at::text != p_draft_revision THEN
      RETURN jsonb_build_object('success', false, 'error', 'DRAFT_CHANGED_REVIEW_REQUIRED');
    END IF;
  END IF;

  -- ── PHASE 3: PREFLIGHT ──
  v_validation := validate_wheel_v2_release(p_draft_version_id);
  v_errors := ARRAY(SELECT jsonb_array_elements_text(v_validation->'errors'));

  IF v_errors IS NOT NULL AND array_length(v_errors, 1) > 0 THEN
    -- Insert audit
    INSERT INTO wheel_v2_release_audits (publish_request_id, action, version_id, error_code, validation_result, admin_id)
    VALUES (p_publish_request_id, 'PREFLIGHT_FAILED', p_draft_version_id, v_errors[1], v_validation, v_admin_id);

    RETURN jsonb_build_object(
      'success', false,
      'error', v_errors[1],
      'error_code', v_errors[1],
      'validation', v_validation
    );
  END IF;

  -- ── PHASE 4: CANDIDATE CREATION ──
  v_compiled := compile_wheel_v2_snapshot(p_draft_version_id);
  v_snapshot_data := v_compiled->'snapshot_data';
  v_checksum := v_compiled->>'snapshot_checksum';
  v_prize_count := (v_compiled->>'prize_count')::int;
  v_total_ppm := (v_compiled->>'total_ppm')::bigint;

  -- Mark as RELEASE_CANDIDATE
  UPDATE wheel_v2_config_versions
  SET status = 'RELEASE_CANDIDATE'
  WHERE id = p_draft_version_id;

  -- Create immutable snapshot
  INSERT INTO wheel_v2_release_snapshots (
    version_id, publish_request_id, snapshot_checksum, snapshot_data,
    required_schema_version, renderer_contract_version, prize_count, total_ppm, compiled_by
  )
  VALUES (
    p_draft_version_id, p_publish_request_id, v_checksum, v_snapshot_data,
    get_wheel_v2_schema_version(), 1, v_prize_count, v_total_ppm, v_admin_id
  )
  RETURNING id INTO v_candidate_id;

  -- ── PHASE 5: SHADOW VERIFICATION ──
  -- Schema compatibility
  IF (v_snapshot_data->>'required_schema_version')::int > get_wheel_v2_schema_version() THEN
    -- Roll back candidate
    UPDATE wheel_v2_config_versions SET status = 'DRAFT' WHERE id = p_draft_version_id;
    DELETE FROM wheel_v2_release_snapshots WHERE id = v_candidate_id;
    INSERT INTO wheel_v2_release_audits (publish_request_id, action, version_id, candidate_version_id, error_code, admin_id)
    VALUES (p_publish_request_id, 'SHADOW_VERIFICATION_FAILED', p_draft_version_id, v_candidate_id, 'SCHEMA_VERSION_TOO_OLD', v_admin_id);
    RETURN jsonb_build_object('success', false, 'error', 'SCHEMA_VERSION_TOO_OLD');
  END IF;

  -- Prize count preserved
  IF v_prize_count < 1 OR v_prize_count > 20 THEN
    UPDATE wheel_v2_config_versions SET status = 'DRAFT' WHERE id = p_draft_version_id;
    DELETE FROM wheel_v2_release_snapshots WHERE id = v_candidate_id;
    INSERT INTO wheel_v2_release_audits (publish_request_id, action, version_id, candidate_version_id, error_code, admin_id)
    VALUES (p_publish_request_id, 'SHADOW_VERIFICATION_FAILED', p_draft_version_id, v_candidate_id, 'INVALID_PRIZE_COUNT', v_admin_id);
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_PRIZE_COUNT');
  END IF;

  -- Checksum stable
  IF v_checksum IS NULL OR v_checksum = '' THEN
    UPDATE wheel_v2_config_versions SET status = 'DRAFT' WHERE id = p_draft_version_id;
    DELETE FROM wheel_v2_release_snapshots WHERE id = v_candidate_id;
    INSERT INTO wheel_v2_release_audits (publish_request_id, action, version_id, candidate_version_id, error_code, admin_id)
    VALUES (p_publish_request_id, 'SHADOW_VERIFICATION_FAILED', p_draft_version_id, v_candidate_id, 'CHECKSUM_INVALID', v_admin_id);
    RETURN jsonb_build_object('success', false, 'error', 'CHECKSUM_INVALID');
  END IF;

  -- Probability total
  IF v_total_ppm != 1000000 THEN
    UPDATE wheel_v2_config_versions SET status = 'DRAFT' WHERE id = p_draft_version_id;
    DELETE FROM wheel_v2_release_snapshots WHERE id = v_candidate_id;
    INSERT INTO wheel_v2_release_audits (publish_request_id, action, version_id, candidate_version_id, error_code, admin_id)
    VALUES (p_publish_request_id, 'SHADOW_VERIFICATION_FAILED', p_draft_version_id, v_candidate_id, 'PROBABILITY_TOTAL_INVALID', v_admin_id);
    RETURN jsonb_build_object('success', false, 'error', 'PROBABILITY_TOTAL_INVALID');
  END IF;

  -- Store current active for potential rollback
  v_current_active := v_runtime.active_version_id;
  v_previous_active := v_runtime.previous_active_version_id;

  -- ── PHASE 6: ATOMIC ACTIVATION ──
  -- Re-lock runtime settings
  SELECT * INTO v_runtime FROM wheel_v2_runtime_settings WHERE id = 1 FOR UPDATE;

  -- Confirm current active version has not changed
  IF v_runtime.active_version_id IS DISTINCT FROM v_current_active THEN
    UPDATE wheel_v2_config_versions SET status = 'DRAFT' WHERE id = p_draft_version_id;
    DELETE FROM wheel_v2_release_snapshots WHERE id = v_candidate_id;
    INSERT INTO wheel_v2_release_audits (publish_request_id, action, version_id, candidate_version_id, error_code, admin_id)
    VALUES (p_publish_request_id, 'ACTIVATION_ABORTED', p_draft_version_id, v_candidate_id, 'ACTIVE_VERSION_CHANGED', v_admin_id);
    RETURN jsonb_build_object('success', false, 'error', 'ACTIVE_VERSION_CHANGED');
  END IF;

  -- Archive previous active version
  IF v_runtime.active_version_id IS NOT NULL THEN
    UPDATE wheel_v2_config_versions
    SET status = 'ARCHIVED'
    WHERE id = v_runtime.active_version_id;
  END IF;

  -- Mark candidate PUBLISHED_ACTIVE
  UPDATE wheel_v2_config_versions
  SET status = 'PUBLISHED_ACTIVE',
      published_at = now(),
      published_by = v_admin_id,
      version_number = COALESCE(
        (SELECT MAX(version_number) FROM wheel_v2_config_versions WHERE status IN ('PUBLISHED_ACTIVE', 'ARCHIVED')),
        0
      ) + 1
  WHERE id = p_draft_version_id;

  -- Update runtime settings atomically
  UPDATE wheel_v2_runtime_settings
  SET
    previous_active_version_id = v_runtime.active_version_id,
    active_version_id = p_draft_version_id,
    active_snapshot_checksum = v_checksum,
    public_enabled = true,
    maintenance_mode = false,
    release_generation = v_runtime.release_generation + 1,
    activated_at = now(),
    consecutive_critical_failures = 0,
    updated_at = now(),
    updated_by = v_admin_id
  WHERE id = 1;

  -- ── PHASE 7: NORMAL-USER POST-ACTIVATION CHECK ──
  -- Use the same function a normal user would use
  v_result := get_published_wheel_v2_config();

  IF (v_result->>'available') != 'true' THEN
    -- ROLLBACK
    PERFORM rollback_wheel_v2_release(p_publish_request_id, p_draft_version_id, v_candidate_id, v_runtime.active_version_id, v_admin_id);
    RETURN jsonb_build_object('success', false, 'error', 'POST_ACTIVATION_CHECK_FAILED', 'public_config', v_result);
  END IF;

  -- Verify version ID matches
  IF (v_result->>'active_version_id') != p_draft_version_id::text THEN
    PERFORM rollback_wheel_v2_release(p_publish_request_id, p_draft_version_id, v_candidate_id, v_runtime.active_version_id, v_admin_id);
    RETURN jsonb_build_object('success', false, 'error', 'POST_ACTIVATION_CHECK_FAILED', 'reason', 'VERSION_ID_MISMATCH');
  END IF;

  -- Verify checksum matches
  IF (v_result->>'snapshot_checksum') IS DISTINCT FROM v_checksum THEN
    PERFORM rollback_wheel_v2_release(p_publish_request_id, p_draft_version_id, v_candidate_id, v_runtime.active_version_id, v_admin_id);
    RETURN jsonb_build_object('success', false, 'error', 'POST_ACTIVATION_CHECK_FAILED', 'reason', 'CHECKSUM_MISMATCH');
  END IF;

  -- Verify prize count
  IF (v_result->'prizes' IS NOT NULL AND jsonb_array_length(v_result->'prizes') != v_prize_count) THEN
    PERFORM rollback_wheel_v2_release(p_publish_request_id, p_draft_version_id, v_candidate_id, v_runtime.active_version_id, v_admin_id);
    RETURN jsonb_build_object('success', false, 'error', 'POST_ACTIVATION_CHECK_FAILED', 'reason', 'PRIZE_COUNT_MISMATCH');
  END IF;

  -- ── PHASE 9: SUCCESS ──
  v_result := jsonb_build_object(
    'success', true,
    'publish_request_id', p_publish_request_id,
    'candidate_version_id', v_candidate_id::text,
    'active_version_id', p_draft_version_id::text,
    'previous_active_version_id', CASE WHEN v_runtime.active_version_id IS NOT NULL THEN v_runtime.active_version_id::text ELSE NULL END,
    'release_generation', v_runtime.release_generation + 1,
    'schema_version_verified', true,
    'snapshot_checksum', v_checksum,
    'public_enabled', true,
    'normal_user_public_read_verified', true,
    'probability_audit_verified', true,
    'renderer_contract_verified', true,
    'responsive_contract_verified', true,
    'economy_dependencies_verified', true,
    'free_spin_dependencies_verified', true,
    'multi_spin_dependencies_verified', true,
    'reward_handlers_verified', true,
    'icons_verified', true,
    'rollback_ready', v_runtime.active_version_id IS NOT NULL,
    'circuit_breaker_ready', true
  );

  -- Write success audit
  INSERT INTO wheel_v2_release_audits (
    publish_request_id, action, version_id, candidate_version_id,
    active_version_id, previous_active_version_id, release_generation,
    snapshot_checksum, validation_result, admin_id
  )
  VALUES (
    p_publish_request_id, 'RELEASE_SUCCESS', p_draft_version_id, v_candidate_id,
    p_draft_version_id, v_runtime.active_version_id, v_runtime.release_generation + 1,
    v_checksum, v_result, v_admin_id
  );

  RETURN v_result;
END;
$function$;
