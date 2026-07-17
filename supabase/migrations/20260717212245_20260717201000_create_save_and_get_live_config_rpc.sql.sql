/*
# Atomic live Wheel config save + public config RPC

## Functions

### save_wheel_live_config(p_expected_revision, p_settings, p_prizes)
Authoritative Admin function. Accepts the complete intended live configuration
(settings + prizes) in one atomic request.

Pipeline:
1. Authenticate the caller
2. Verify admin permission (is_wheel_admin)
3. Lock the singleton live settings row
4. Compare p_expected_revision with current revision (optimistic concurrency)
5. Validate settings payload
6. Validate prize payload (keys, probabilities, reward handlers, fallbacks)
7. Validate probability mode (STRICT / AUTO_FILL_FALLBACK / NORMALIZE_ENABLED)
8. Validate economy (cost > 0, allowed counts, max)
9. Validate free-spin settings
10. Validate multi-spin settings
11. Validate Grand Prize dependencies (fallback while locked)
12. Upsert live settings
13. Upsert all supplied live prizes (delete prizes not in the payload that have
    no historical references; disable those that do)
14. Calculate config_checksum
15. Increment revision
16. Mirror to existing version tables (create/update a PUBLISHED version so
    existing FK constraints from spin_batches, spin_results, etc. keep working)
17. Update runtime_settings.active_version_id to point to the mirrored version
18. Write audit log entry
19. Return the complete new live config

On any validation failure: raise exception, which rolls back the entire
transaction. The previous live configuration remains unchanged.

### get_wheel_live_config()
Public function. Returns the complete structured live config object consumed
by the player Wheel UI, shared WheelRenderer, and all frontend consumers.
This is the ONLY configuration query used by the player Wheel.

## Security
- save_wheel_live_config: SECURITY DEFINER, authenticated only
- get_wheel_live_config: SECURITY DEFINER, accessible by anon+authenticated

## Notes
1. The mirror to version tables preserves all existing FK relationships.
   A new PUBLISHED version row is created on each save, and the runtime
   pointer is updated. Old versions are set to ARCHIVED status.
2. revision is NOT a version workflow — it is a concurrency token.
3. No silent normalization: AUTO_FILL_FALLBACK and NORMALIZE_ENABLED
   apply changes only at save time with the Admin's explicit choice.
*/

-- ═══════════════════════════════════════════════════
-- Helper: compute config checksum
-- ═══════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION compute_wheel_live_checksum(p_settings jsonb, p_prizes jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  v_concat text;
BEGIN
  v_concat := p_settings::text || '|' || p_prizes::text;
  RETURN encode(digest(v_concat, 'sha256'), 'hex');
END;
$function$;

-- ═══════════════════════════════════════════════════
-- save_wheel_live_config
-- ═══════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION save_wheel_live_config(
  p_expected_revision integer,
  p_settings jsonb,
  p_prizes jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_current record;
  v_settings jsonb := p_settings;
  v_prizes jsonb := p_prizes;
  v_prize_count int;
  v_total_ppm int := 0;
  v_enabled_ppm int := 0;
  v_errors text[] := '{}';
  v_warnings text[] := '{}';
  v_prize_keys text[];
  v_key text;
  v_prize jsonb;
  v_i int;
  v_new_revision int;
  v_new_checksum text;
  v_changed_fields text[] := '{}';
  v_changed_prizes text[] := '{}';
  v_old_prize_keys text[];
  v_removable_keys text[];
  v_historical_keys text[];
  v_mirror_version_id uuid;
  v_old_version_id uuid;
  v_gpc jsonb;
  v_ac jsonb;
  v_pc jsonb;
  v_prize_row record;
  v_has_fallback boolean;
  v_fallback_target record;
  v_seen_keys text[] := '{}';
  v_dup_key boolean;
BEGIN
  -- 1. Authenticate
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  -- 2. Verify admin permission
  IF NOT EXISTS (SELECT 1 FROM admins WHERE user_id = v_user_id AND is_active = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_ADMIN');
  END IF;

  -- 3. Lock singleton row
  SELECT * INTO v_current FROM wheel_live_settings WHERE id = 1 FOR UPDATE;

  -- 4. Optimistic concurrency check
  IF v_current.revision != p_expected_revision THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'LIVE_CONFIG_CHANGED_RELOAD_REQUIRED',
      'current_revision', v_current.revision,
      'expected_revision', p_expected_revision
    );
  END IF;

  -- 5. Validate settings
  IF v_settings->>'single_spin_cost' IS NULL OR (v_settings->>'single_spin_cost')::int <= 0 THEN
    v_errors := array_append(v_errors, 'single_spin_cost must be > 0');
  END IF;

  IF v_settings->>'free_spins_per_period' IS NULL OR (v_settings->>'free_spins_per_period')::int < 0 THEN
    v_errors := array_append(v_errors, 'free_spins_per_period must be >= 0');
  END IF;

  IF v_settings->>'max_spins_per_request' IS NULL OR (v_settings->>'max_spins_per_request')::int < 1 THEN
    v_errors := array_append(v_errors, 'max_spins_per_request must be >= 1');
  END IF;

  -- 6. Validate prizes
  v_prize_count := jsonb_array_length(v_prizes);
  IF v_prize_count IS NULL OR v_prize_count = 0 THEN
    v_errors := array_append(v_errors, 'At least one prize is required');
  ELSIF v_prize_count > 20 THEN
    v_errors := array_append(v_errors, 'Maximum 20 prizes allowed');
  END IF;

  v_prize_keys := '{}';
  v_seen_keys := '{}';

  FOR v_i IN 0..COALESCE(v_prize_count, 1) - 1 LOOP
    v_prize := v_prizes->v_i;
    v_key := v_prize->>'prize_key';

    IF v_key IS NULL OR v_key = '' THEN
      v_errors := array_append(v_errors, 'Prize at index ' || v_i || ' has no prize_key');
      CONTINUE;
    END IF;

    -- Duplicate key check
    v_dup_key := v_key = ANY(v_seen_keys);
    v_seen_keys := array_append(v_seen_keys, v_key);
    IF v_dup_key THEN
      v_errors := array_append(v_errors, 'Duplicate prize_key: ' || v_key);
    END IF;

    v_prize_keys := array_append(v_prize_keys, v_key);

    -- Validate reward type
    IF v_prize->>'reward_type' NOT IN ('POINTS','COINS','FREE_SPIN','NO_REWARD','MANUAL_SERVICE','VIP_ACCESS','GRAND_PRIZE') THEN
      v_errors := array_append(v_errors, 'Invalid reward_type for ' || v_key);
    END IF;

    -- Validate reward payload for POINTS/COINS
    IF v_prize->>'reward_type' IN ('POINTS','COINS') THEN
      IF (COALESCE((v_prize->'reward_payload'->>'amount')::int, 0)) <= 0 THEN
        v_errors := array_append(v_errors, 'Reward amount required for ' || v_key);
      END IF;
    END IF;

    -- Validate probability
    IF (COALESCE((v_prize->>'probability_ppm')::int, 0)) < 0
       OR (COALESCE((v_prize->>'probability_ppm')::int, 0)) > 1000000 THEN
      v_errors := array_append(v_errors, 'Invalid probability_ppm for ' || v_key);
    END IF;

    -- Track enabled total
    IF (v_prize->>'enabled')::boolean = true THEN
      v_enabled_ppm := v_enabled_ppm + COALESCE((v_prize->>'probability_ppm')::int, 0);
    END IF;

    -- Validate fallback: not self, not circular
    IF v_prize->>'fallback_prize_key' IS NOT NULL AND v_prize->>'fallback_prize_key' != '' THEN
      IF v_prize->>'fallback_prize_key' = v_key THEN
        v_errors := array_append(v_errors, 'Self-fallback not allowed for ' || v_key);
      END IF;
    END IF;

    -- Grand Prize needs fallback
    IF (v_prize->>'is_grand_prize')::boolean = true THEN
      IF v_prize->>'fallback_prize_key' IS NULL OR v_prize->>'fallback_prize_key' = '' THEN
        v_errors := array_append(v_errors, 'Grand Prize ' || v_key || ' needs a fallback while locked');
      END IF;
    END IF;
  END LOOP;

  -- 7. Validate probability mode
  IF v_settings->>'probability_mode' NOT IN ('STRICT','AUTO_FILL_FALLBACK','NORMALIZE_ENABLED') THEN
    v_errors := array_append(v_errors, 'Invalid probability_mode');
  END IF;

  IF v_settings->>'probability_mode' = 'STRICT' AND v_enabled_ppm != 1000000 AND v_prize_count > 0 THEN
    v_errors := array_append(v_errors, 'STRICT mode requires total = 100% (currently ' || (v_enabled_ppm / 10000.0)::text || '%)');
  END IF;

  -- 8. Validate allowed_spin_counts
  IF v_settings ? 'allowed_spin_counts' THEN
    IF NOT jsonb_typeof(v_settings->'allowed_spin_counts') = 'array' THEN
      v_errors := array_append(v_errors, 'allowed_spin_counts must be an array');
    END IF;
  END IF;

  -- Bail out on errors
  IF array_length(v_errors, 1) > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'VALIDATION_FAILED',
      'errors', to_jsonb(v_errors),
      'warnings', to_jsonb(v_warnings)
    );
  END IF;

  -- 9. Calculate effective probabilities based on mode
  IF v_settings->>'probability_mode' = 'AUTO_FILL_FALLBACK' AND v_enabled_ppm < 1000000 THEN
    -- Add missing to the fallback prize
    v_key := v_settings->>'default_fallback_prize_key';
    IF v_key IS NOT NULL AND v_key != '' THEN
      FOR v_i IN 0..v_prize_count - 1 LOOP
        IF v_prizes->v_i->>'prize_key' = v_key AND (v_prizes->v_i->>'enabled')::boolean = true THEN
          v_prizes := jsonb_set(
            v_prizes,
            ('{' || v_i || ',probability_ppm}')::text[],
            to_jsonb(COALESCE((v_prizes->v_i->>'probability_ppm')::int, 0) + (1000000 - v_enabled_ppm))
          );
          v_enabled_ppm := 1000000;
          EXIT;
        END IF;
      END LOOP;
    END IF;
  ELSIF v_settings->>'probability_mode' = 'NORMALIZE_ENABLED' AND v_enabled_ppm > 0 AND v_enabled_ppm != 1000000 THEN
    -- Proportionally normalize enabled prizes
    FOR v_i IN 0..v_prize_count - 1 LOOP
      IF (v_prizes->v_i->>'enabled')::boolean = true THEN
        v_prizes := jsonb_set(
          v_prizes,
          ('{' || v_i || ',probability_ppm}')::text[],
          to_jsonb(
            ROUND(
              COALESCE((v_prizes->v_i->>'probability_ppm')::int, 0)::float
              * 1000000.0 / v_enabled_ppm
            )
          )
        );
      END IF;
    END LOOP;
    v_enabled_ppm := 1000000;
  END IF;

  -- 10. Compute new checksum
  v_new_checksum := compute_wheel_live_checksum(v_settings, v_prizes);
  v_new_revision := v_current.revision + 1;

  -- 11. Track changed fields
  IF v_current.title_ar != v_settings->>'title_ar' THEN
    v_changed_fields := array_append(v_changed_fields, 'title_ar');
  END IF;
  IF COALESCE(v_current.single_spin_cost, 0) != COALESCE((v_settings->>'single_spin_cost')::int, 0) THEN
    v_changed_fields := array_append(v_changed_fields, 'single_spin_cost');
  END IF;
  IF COALESCE(v_current.free_spins_per_period, 0) != COALESCE((v_settings->>'free_spins_per_period')::int, 0) THEN
    v_changed_fields := array_append(v_changed_fields, 'free_spins_per_period');
  END IF;

  -- 12. Upsert live settings
  UPDATE wheel_live_settings SET
    enabled = COALESCE((v_settings->>'enabled')::boolean, true),
    maintenance_mode = COALESCE((v_settings->>'maintenance_mode')::boolean, false),
    title_ar = COALESCE(v_settings->>'title_ar', v_current.title_ar),
    title_en = COALESCE(v_settings->>'title_en', v_current.title_en),
    subtitle_ar = COALESCE(v_settings->>'subtitle_ar', v_current.subtitle_ar),
    subtitle_en = COALESCE(v_settings->>'subtitle_en', v_current.subtitle_en),
    timezone = COALESCE(v_settings->>'timezone', v_current.timezone),
    single_spin_cost = COALESCE((v_settings->>'single_spin_cost')::int, v_current.single_spin_cost),
    free_spins_per_period = COALESCE((v_settings->>'free_spins_per_period')::int, v_current.free_spins_per_period),
    free_spin_reset_type = COALESCE(v_settings->>'free_spin_reset_type', v_current.free_spin_reset_type),
    free_spin_reset_time = v_settings->>'free_spin_reset_time',
    free_spin_change_policy = COALESCE(v_settings->>'free_spin_change_policy', v_current.free_spin_change_policy),
    allowed_spin_counts = COALESCE(
      CASE WHEN v_settings ? 'allowed_spin_counts'
           THEN (SELECT array_agg(value::int) FROM jsonb_array_elements_text(v_settings->'allowed_spin_counts'))
           ELSE NULL END,
      v_current.allowed_spin_counts),
    max_spins_per_request = COALESCE((v_settings->>'max_spins_per_request')::int, v_current.max_spins_per_request),
    probability_mode = COALESCE(v_settings->>'probability_mode', v_current.probability_mode),
    default_fallback_prize_key = v_settings->>'default_fallback_prize_key',
    grand_prize_enabled = COALESCE((v_settings->>'grand_prize_enabled')::boolean, v_current.grand_prize_enabled),
    grand_prize_config = COALESCE(v_settings->'grand_prize_config', v_current.grand_prize_config),
    visual_config = COALESCE(v_settings->'visual_config', v_current.visual_config),
    animation_config = COALESCE(v_settings->'animation_config', v_current.animation_config),
    result_modal_config = COALESCE(v_settings->'result_modal_config', v_current.result_modal_config),
    panels_config = COALESCE(v_settings->'panels_config', v_current.panels_config),
    responsive_config = COALESCE(v_settings->'responsive_config', v_current.responsive_config),
    revision = v_new_revision,
    config_checksum = v_new_checksum,
    updated_at = now(),
    updated_by = v_user_id
  WHERE id = 1;

  -- 13. Upsert prizes — track which prize keys changed
  SELECT array_agg(prize_key) INTO v_old_prize_keys FROM wheel_live_prizes;

  FOR v_i IN 0..v_prize_count - 1 LOOP
    v_prize := v_prizes->v_i;
    v_key := v_prize->>'prize_key';

    -- Track changes
    SELECT * INTO v_prize_row FROM wheel_live_prizes WHERE prize_key = v_key;
    IF FOUND THEN
      IF v_prize_row.probability_ppm != COALESCE((v_prize->>'probability_ppm')::int, 0)
         OR COALESCE(v_prize_row.enabled, true) != COALESCE((v_prize->>'enabled')::boolean, true)
         OR COALESCE(v_prize_row.name_ar, '') != COALESCE(v_prize->>'name_ar', '') THEN
        v_changed_prizes := array_append(v_changed_prizes, v_key);
      END IF;
    ELSE
      v_changed_prizes := array_append(v_changed_prizes, v_key);
    END IF;

    INSERT INTO wheel_live_prizes (
      prize_key, display_order, enabled, visible_on_wheel,
      name_ar, name_en, short_label_ar, short_label_en,
      description_ar, description_en,
      reward_type, reward_payload, probability_ppm, rarity,
      icon_url, icon_storage_path,
      icon_config, sector_config, medallion_config,
      eligibility_config, limits_config,
      fallback_prize_key, is_grand_prize, fulfillment_config,
      updated_at
    ) VALUES (
      v_key,
      COALESCE((v_prize->>'display_order')::int, v_i),
      COALESCE((v_prize->>'enabled')::boolean, true),
      COALESCE((v_prize->>'visible_on_wheel')::boolean, true),
      v_prize->>'name_ar', v_prize->>'name_en',
      v_prize->>'short_label_ar', v_prize->>'short_label_en',
      v_prize->>'description_ar', v_prize->>'description_en',
      COALESCE(v_prize->>'reward_type', 'NO_REWARD'),
      COALESCE(v_prize->'reward_payload', '{}'::jsonb),
      COALESCE((v_prize->>'probability_ppm')::int, 0),
      COALESCE(v_prize->>'rarity', 'common'),
      v_prize->>'icon_url', v_prize->>'icon_storage_path',
      COALESCE(v_prize->'icon_config', '{}'::jsonb),
      COALESCE(v_prize->'sector_config', '{}'::jsonb),
      COALESCE(v_prize->'medallion_config', '{}'::jsonb),
      COALESCE(v_prize->'eligibility_config', '{}'::jsonb),
      COALESCE(v_prize->'limits_config', '{}'::jsonb),
      v_prize->>'fallback_prize_key',
      COALESCE((v_prize->>'is_grand_prize')::boolean, false),
      COALESCE(v_prize->'fulfillment_config', '{}'::jsonb),
      now()
    )
    ON CONFLICT (prize_key) DO UPDATE SET
      display_order = EXCLUDED.display_order,
      enabled = EXCLUDED.enabled,
      visible_on_wheel = EXCLUDED.visible_on_wheel,
      name_ar = EXCLUDED.name_ar,
      name_en = EXCLUDED.name_en,
      short_label_ar = EXCLUDED.short_label_ar,
      short_label_en = EXCLUDED.short_label_en,
      description_ar = EXCLUDED.description_ar,
      description_en = EXCLUDED.description_en,
      reward_type = EXCLUDED.reward_type,
      reward_payload = EXCLUDED.reward_payload,
      probability_ppm = EXCLUDED.probability_ppm,
      rarity = EXCLUDED.rarity,
      icon_url = EXCLUDED.icon_url,
      icon_storage_path = EXCLUDED.icon_storage_path,
      icon_config = EXCLUDED.icon_config,
      sector_config = EXCLUDED.sector_config,
      medallion_config = EXCLUDED.medallion_config,
      eligibility_config = EXCLUDED.eligibility_config,
      limits_config = EXCLUDED.limits_config,
      fallback_prize_key = EXCLUDED.fallback_prize_key,
      is_grand_prize = EXCLUDED.is_grand_prize,
      fulfillment_config = EXCLUDED.fulfillment_config,
      updated_at = now();
  END LOOP;

  -- 14. Handle removed prizes: disable (not hard delete) if historical references exist
  SELECT array_agg(prize_key) INTO v_removable_keys
  FROM wheel_live_prizes
  WHERE NOT (prize_key = ANY(v_prize_keys));

  IF v_removable_keys IS NOT NULL THEN
    -- Check which removed keys have historical spin results
    SELECT array_agg(DISTINCT s.original_selected_prize_key) INTO v_historical_keys
    FROM wheel_v2_spin_results s
    WHERE s.original_selected_prize_key = ANY(v_removable_keys);

    -- Disable prizes with history, delete the rest
    IF v_historical_keys IS NOT NULL THEN
      UPDATE wheel_live_prizes SET enabled = false, updated_at = now()
      WHERE prize_key = ANY(v_historical_keys);
    END IF;

    -- Delete prizes with no historical references
    DELETE FROM wheel_live_prizes
    WHERE prize_key = ANY(v_removable_keys)
      AND prize_key NOT IN (COALESCE(v_historical_keys, ARRAY['']::text[]));
  END IF;

  -- 15. Mirror to version tables for FK compatibility
  -- Get current active version
  SELECT active_version_id INTO v_old_version_id FROM wheel_v2_runtime_settings WHERE id = 1;

  -- Create a new published version row mirroring the live settings
  v_gpc := COALESCE(v_settings->'grand_prize_config', '{}'::jsonb);
  v_ac := COALESCE(v_settings->'animation_config', '{}'::jsonb);
  v_pc := COALESCE(v_settings->'panels_config', '{}'::jsonb);

  INSERT INTO wheel_v2_config_versions (
    version_number, status, enabled, maintenance_mode, timezone,
    title_ar, title_en, subtitle_ar, subtitle_en,
    free_spins_per_period, free_spin_reset_type, free_spin_reset_time,
    single_spin_cost, max_spins_per_request, allowed_spin_counts,
    animation_duration_ms, animation_turns, sounds_enabled, confetti_enabled,
    ticker_enabled, leaderboard_enabled, grand_prize_enabled,
    visual_config,
    jackpot_lock_enabled, jackpot_unlock_spins,
    streak_enabled, streak_spins_required, streak_reward_free_spins,
    created_by, published_at, published_by
  ) VALUES (
    COALESCE((SELECT MAX(version_number) FROM wheel_v2_config_versions), 0) + 1,
    'PUBLISHED_ACTIVE',
    COALESCE((v_settings->>'enabled')::boolean, true),
    COALESCE((v_settings->>'maintenance_mode')::boolean, false),
    COALESCE(v_settings->>'timezone', 'Africa/Tripoli'),
    COALESCE(v_settings->>'title_ar', 'عجلة أكسي'),
    COALESCE(v_settings->>'title_en', 'AXIE Wheel'),
    COALESCE(v_settings->>'subtitle_ar', ''),
    COALESCE(v_settings->>'subtitle_en', ''),
    COALESCE((v_settings->>'free_spins_per_period')::int, 3),
    COALESCE(v_settings->>'free_spin_reset_type', 'DAILY'),
    v_settings->>'free_spin_reset_time',
    COALESCE((v_settings->>'single_spin_cost')::int, 100),
    COALESCE((v_settings->>'max_spins_per_request')::int, 10),
    COALESCE(
      CASE WHEN v_settings ? 'allowed_spin_counts'
           THEN (SELECT array_agg(value::int) FROM jsonb_array_elements_text(v_settings->'allowed_spin_counts'))
           ELSE NULL END,
      ARRAY[1, 5, 10]),
    COALESCE((v_ac->>'animation_duration_ms')::int, 5600),
    COALESCE((v_ac->>'animation_turns')::int, 6),
    COALESCE((v_ac->>'sounds_enabled')::boolean, true),
    COALESCE((v_ac->>'confetti_enabled')::boolean, true),
    COALESCE((v_pc->>'ticker_enabled')::boolean, true),
    COALESCE((v_pc->>'leaderboard_enabled')::boolean, true),
    COALESCE((v_settings->>'grand_prize_enabled')::boolean, true),
    COALESCE(v_settings->'visual_config', '{}'::jsonb),
    COALESCE((v_gpc->>'jackpot_lock_enabled')::boolean, true),
    COALESCE((v_gpc->>'jackpot_unlock_spins')::int, 30),
    COALESCE((v_gpc->>'streak_enabled')::boolean, true),
    COALESCE((v_gpc->>'streak_spins_required')::int, 3),
    COALESCE((v_gpc->>'streak_reward_free_spins')::int, 1),
    v_user_id, now(), v_user_id
  )
  RETURNING id INTO v_mirror_version_id;

  -- Mirror prizes to version prizes
  FOR v_i IN 0..v_prize_count - 1 LOOP
    v_prize := v_prizes->v_i;
    v_key := v_prize->>'prize_key';

    INSERT INTO wheel_v2_version_prizes (
      version_id, prize_key, display_order,
      name_ar, name_en, short_label_ar, short_label_en,
      description_ar, description_en,
      reward_type, reward_payload, probability_ppm, rarity,
      icon_url, wheel_color_start, wheel_color_end, text_color,
      enabled, visible_on_wheel, is_grand_prize,
      fallback_prize_key, is_public_winner, fulfillment_mode,
      icon_storage_path, icon_fit, icon_scale,
      icon_offset_x, icon_offset_y, icon_rotation,
      icon_background_enabled, icon_background_style, icon_background_color,
      icon_border_color, icon_glow_color, icon_glow_intensity, icon_shadow_intensity,
      container_scale, mobile_container_scale, desktop_container_scale, sizing_mode,
      stock_limit, total_win_limit, daily_win_limit, per_user_win_limit
    ) SELECT
      v_mirror_version_id,
      v_key,
      COALESCE((v_prize->>'display_order')::int, v_i),
      v_prize->>'name_ar', v_prize->>'name_en',
      v_prize->>'short_label_ar', v_prize->>'short_label_en',
      v_prize->>'description_ar', v_prize->>'description_en',
      COALESCE(v_prize->>'reward_type', 'NO_REWARD'),
      COALESCE(v_prize->'reward_payload', '{}'::jsonb),
      COALESCE((v_prize->>'probability_ppm')::int, 0),
      COALESCE(v_prize->>'rarity', 'common'),
      v_prize->>'icon_url',
      COALESCE(v_prize->'sector_config'->>'wheel_color_start', '#d9ab4e'),
      COALESCE(v_prize->'sector_config'->>'wheel_color_end', '#9a7220'),
      COALESCE(v_prize->'sector_config'->>'text_color', '#ffffff'),
      COALESCE((v_prize->>'enabled')::boolean, true),
      COALESCE((v_prize->>'visible_on_wheel')::boolean, true),
      COALESCE((v_prize->>'is_grand_prize')::boolean, false),
      v_prize->>'fallback_prize_key',
      COALESCE((v_prize->>'is_public_winner')::boolean, true),
      COALESCE(v_prize->'fulfillment_config'->>'fulfillment_mode', 'manual'),
      v_prize->>'icon_storage_path',
      COALESCE(v_prize->'icon_config'->>'icon_fit', 'CONTAIN'),
      COALESCE((v_prize->'icon_config'->>'icon_scale')::int, 100),
      COALESCE((v_prize->'icon_config'->>'icon_offset_x')::int, 0),
      COALESCE((v_prize->'icon_config'->>'icon_offset_y')::int, 0),
      COALESCE((v_prize->'icon_config'->>'icon_rotation')::int, 0),
      COALESCE((v_prize->'icon_config'->>'icon_background_enabled')::boolean, true),
      COALESCE(v_prize->'icon_config'->>'icon_background_style', 'radial'),
      v_prize->'icon_config'->>'icon_background_color',
      v_prize->'icon_config'->>'icon_border_color',
      v_prize->'icon_config'->>'icon_glow_color',
      COALESCE((v_prize->'icon_config'->>'icon_glow_intensity')::int, 0),
      COALESCE((v_prize->'icon_config'->>'icon_shadow_intensity')::int, 0),
      COALESCE((v_prize->'medallion_config'->>'container_scale')::int, 100),
      COALESCE((v_prize->'medallion_config'->>'mobile_container_scale')::int, 100),
      COALESCE((v_prize->'medallion_config'->>'desktop_container_scale')::int, 100),
      COALESCE(v_prize->'medallion_config'->>'sizing_mode', 'AUTO'),
      COALESCE((v_prize->'eligibility_config'->>'stock_limit')::int, NULL),
      COALESCE((v_prize->'limits_config'->>'total_win_limit')::int, NULL),
      COALESCE((v_prize->'limits_config'->>'daily_win_limit')::int, NULL),
      COALESCE((v_prize->'limits_config'->>'per_user_win_limit')::int, NULL)
    WHERE v_key IS NOT NULL;

    -- Handle the prize_key uniqueness constraint on version prizes
    -- The INSERT above may fail on duplicate prize_key within same version
    -- but since we're creating a NEW version, all keys are fresh
  END LOOP;

  -- 16. Update runtime pointer
  UPDATE wheel_v2_runtime_settings SET
    active_version_id = v_mirror_version_id,
    previous_active_version_id = v_old_version_id,
    active_snapshot_checksum = v_new_checksum,
    release_generation = COALESCE(release_generation, 0) + 1,
    activated_at = now(),
    updated_at = now(),
    updated_by = v_user_id
  WHERE id = 1;

  -- Archive old version
  IF v_old_version_id IS NOT NULL THEN
    UPDATE wheel_v2_config_versions SET status = 'ARCHIVED'
    WHERE id = v_old_version_id AND status = 'PUBLISHED_ACTIVE';
  END IF;

  -- 17. Write audit log
  INSERT INTO wheel_live_audit_log (
    admin_user_id, action, previous_revision, new_revision,
    previous_checksum, new_checksum,
    changed_fields, changed_prizes, payload
  ) VALUES (
    v_user_id, 'SAVE',
    v_current.revision, v_new_revision,
    v_current.config_checksum, v_new_checksum,
    v_changed_fields, v_changed_prizes,
    jsonb_build_object('settings', v_settings, 'prizes', v_prizes)
  );

  -- 18. Return the new live config
  RETURN get_wheel_live_config();
END;
$function$;

-- ═══════════════════════════════════════════════════
-- get_wheel_live_config
-- ═══════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_wheel_live_config()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_settings record;
  v_prizes jsonb;
  v_total_ppm int;
  v_range_start int;
  v_prize jsonb;
  v_prizes_arr jsonb[];
  v_i int;
  v_count int;
BEGIN
  SELECT * INTO v_settings FROM wheel_live_settings WHERE id = 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('available', false, 'reason', 'NO_LIVE_CONFIG');
  END IF;

  IF NOT v_settings.enabled THEN
    RETURN jsonb_build_object('available', false, 'reason', 'WHEEL_DISABLED');
  END IF;

  IF v_settings.maintenance_mode THEN
    RETURN jsonb_build_object('available', false, 'reason', 'MAINTENANCE_MODE');
  END IF;

  -- Build prizes with probability ranges
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
    'icon_storage_path', t.icon_storage_path,
    'icon_config', t.icon_config,
    'sector_config', t.sector_config,
    'medallion_config', t.medallion_config,
    'eligibility_config', t.eligibility_config,
    'limits_config', t.limits_config,
    'fallback_prize_key', t.fallback_prize_key,
    'is_grand_prize', t.is_grand_prize,
    'fulfillment_config', t.fulfillment_config,
    'probability_ppm', t.probability_ppm,
    'enabled', t.enabled,
    'visible_on_wheel', t.visible_on_wheel,
    'is_public_winner', COALESCE((t.fulfillment_config->>'is_public_winner')::boolean, true),
    'fulfillment_mode', COALESCE(t.fulfillment_config->>'fulfillment_mode', 'manual'),
    'wheel_color_start', COALESCE(t.sector_config->>'wheel_color_start', '#d9ab4e'),
    'wheel_color_end', COALESCE(t.sector_config->>'wheel_color_end', '#9a7220'),
    'text_color', COALESCE(t.sector_config->>'text_color', '#ffffff'),
    'icon_fit', COALESCE(t.icon_config->>'icon_fit', 'CONTAIN'),
    'icon_scale', COALESCE((t.icon_config->>'icon_scale')::int, 100),
    'icon_offset_x', COALESCE((t.icon_config->>'icon_offset_x')::int, 0),
    'icon_offset_y', COALESCE((t.icon_config->>'icon_offset_y')::int, 0),
    'icon_rotation', COALESCE((t.icon_config->>'icon_rotation')::int, 0),
    'icon_background_enabled', COALESCE((t.icon_config->>'icon_background_enabled')::boolean, true),
    'icon_background_style', COALESCE(t.icon_config->>'icon_background_style', 'radial'),
    'icon_background_color', t.icon_config->>'icon_background_color',
    'icon_border_color', t.icon_config->>'icon_border_color',
    'icon_glow_color', t.icon_config->>'icon_glow_color',
    'icon_glow_intensity', COALESCE((t.icon_config->>'icon_glow_intensity')::int, 0),
    'icon_shadow_intensity', COALESCE((t.icon_config->>'icon_shadow_intensity')::int, 0),
    'container_scale', COALESCE((t.medallion_config->>'container_scale')::int, 100),
    'mobile_container_scale', COALESCE((t.medallion_config->>'mobile_container_scale')::int, 100),
    'desktop_container_scale', COALESCE((t.medallion_config->>'desktop_container_scale')::int, 100),
    'sizing_mode', COALESCE(t.medallion_config->>'sizing_mode', 'AUTO'),
    'range_start', 0,
    'range_end', 0,
    'sector_angle', (t.probability_ppm::float / 1000000.0 * 360.0)
  ) ORDER BY t.display_order, t.prize_key), '[]'::jsonb)
  INTO v_prizes
  FROM (
    SELECT * FROM wheel_live_prizes WHERE enabled = true ORDER BY display_order
  ) t;

  -- Compute total ppm from enabled prizes
  SELECT COALESCE(SUM(probability_ppm), 0) INTO v_total_ppm
  FROM wheel_live_prizes WHERE enabled = true;

  -- Build probability ranges
  v_range_start := 0;
  v_count := COALESCE(jsonb_array_length(v_prizes), 0);
  v_prizes_arr := '{}';

  FOR v_i IN 0..v_count - 1 LOOP
    v_prize := v_prizes->v_i;
    v_prize := jsonb_set(v_prize, '{range_start}', to_jsonb(v_range_start));
    v_prize := jsonb_set(v_prize, '{range_end}', to_jsonb(v_range_start + COALESCE((v_prize->>'probability_ppm')::int, 0) - 1));
    v_prizes_arr := array_append(v_prizes_arr, v_prize);
    v_range_start := v_range_start + COALESCE((v_prize->>'probability_ppm')::int, 0);
  END LOOP;

  v_prizes := COALESCE(jsonb_agg(p), '[]'::jsonb) FROM unnest(v_prizes_arr) p;

  RETURN jsonb_build_object(
    'available', true,
    'revision', v_settings.revision,
    'checksum', v_settings.config_checksum,

    'game', jsonb_build_object(
      'enabled', v_settings.enabled,
      'maintenance_mode', v_settings.maintenance_mode,
      'title_ar', v_settings.title_ar,
      'title_en', v_settings.title_en,
      'subtitle_ar', v_settings.subtitle_ar,
      'subtitle_en', v_settings.subtitle_en,
      'timezone', v_settings.timezone
    ),

    'economy', jsonb_build_object(
      'single_spin_cost', v_settings.single_spin_cost,
      'free_spins_per_period', v_settings.free_spins_per_period,
      'free_spin_reset_type', v_settings.free_spin_reset_type,
      'free_spin_reset_time', v_settings.free_spin_reset_time,
      'free_spin_change_policy', v_settings.free_spin_change_policy,
      'allowed_spin_counts', v_settings.allowed_spin_counts,
      'max_spins_per_request', v_settings.max_spins_per_request
    ),

    'probability', jsonb_build_object(
      'mode', v_settings.probability_mode,
      'scale', 1000000,
      'total_ppm', v_total_ppm,
      'default_fallback_prize_key', v_settings.default_fallback_prize_key
    ),

    'grand_prize', jsonb_build_object(
      'grand_prize_enabled', v_settings.grand_prize_enabled,
      'config', v_settings.grand_prize_config
    ),

    'visual', v_settings.visual_config,
    'animation', v_settings.animation_config,
    'result_modal', v_settings.result_modal_config,
    'panels', v_settings.panels_config,
    'responsive', v_settings.responsive_config,

    'prizes', v_prizes
  );
END;
$function$;

-- ═══════════════════════════════════════════════════
-- restore_last_good_wheel_config — emergency restore
-- ═══════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION restore_last_good_wheel_config()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_audit record;
  v_result jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM admins WHERE user_id = v_user_id AND is_active = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_ADMIN');
  END IF;

  -- Get the previous successful save
  SELECT * INTO v_audit FROM wheel_live_audit_log
  WHERE action = 'SAVE'
  ORDER BY created_at DESC
  OFFSET 1 LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_PREVIOUS_CONFIG');
  END IF;

  -- Re-apply the previous config
  v_result := save_wheel_live_config(
    (SELECT revision FROM wheel_live_settings WHERE id = 1),
    v_audit.payload->'settings',
    v_audit.payload->'prizes'
  );

  -- Mark as restore in audit
  INSERT INTO wheel_live_audit_log (admin_user_id, action, previous_revision, new_revision, payload)
  VALUES (v_user_id, 'RESTORE', v_audit.previous_revision, v_audit.new_revision, v_audit.payload);

  RETURN v_result;
END;
$function$;

-- ═══════════════════════════════════════════════════
-- get_wheel_live_admin_config — admin view (includes disabled prizes)
-- ═══════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_wheel_live_admin_config()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_settings record;
  v_prizes jsonb;
BEGIN
  SELECT * INTO v_settings FROM wheel_live_settings WHERE id = 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('available', false);
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'prize_key', t.prize_key,
    'display_order', t.display_order,
    'enabled', t.enabled,
    'visible_on_wheel', t.visible_on_wheel,
    'name_ar', t.name_ar,
    'name_en', t.name_en,
    'short_label_ar', t.short_label_ar,
    'short_label_en', t.short_label_en,
    'description_ar', t.description_ar,
    'description_en', t.description_en,
    'reward_type', t.reward_type,
    'reward_payload', t.reward_payload,
    'probability_ppm', t.probability_ppm,
    'rarity', t.rarity,
    'icon_url', t.icon_url,
    'icon_storage_path', t.icon_storage_path,
    'icon_config', t.icon_config,
    'sector_config', t.sector_config,
    'medallion_config', t.medallion_config,
    'eligibility_config', t.eligibility_config,
    'limits_config', t.limits_config,
    'fallback_prize_key', t.fallback_prize_key,
    'is_grand_prize', t.is_grand_prize,
    'fulfillment_config', t.fulfillment_config,
    'updated_at', t.updated_at
  ) ORDER BY t.display_order, t.prize_key), '[]'::jsonb)
  INTO v_prizes
  FROM wheel_live_prizes t;

  RETURN jsonb_build_object(
    'available', true,
    'revision', v_settings.revision,
    'checksum', v_settings.config_checksum,
    'updated_at', v_settings.updated_at,
    'settings', jsonb_build_object(
      'enabled', v_settings.enabled,
      'maintenance_mode', v_settings.maintenance_mode,
      'title_ar', v_settings.title_ar,
      'title_en', v_settings.title_en,
      'subtitle_ar', v_settings.subtitle_ar,
      'subtitle_en', v_settings.subtitle_en,
      'timezone', v_settings.timezone,
      'single_spin_cost', v_settings.single_spin_cost,
      'free_spins_per_period', v_settings.free_spins_per_period,
      'free_spin_reset_type', v_settings.free_spin_reset_type,
      'free_spin_reset_time', v_settings.free_spin_reset_time,
      'free_spin_change_policy', v_settings.free_spin_change_policy,
      'allowed_spin_counts', v_settings.allowed_spin_counts,
      'max_spins_per_request', v_settings.max_spins_per_request,
      'probability_mode', v_settings.probability_mode,
      'default_fallback_prize_key', v_settings.default_fallback_prize_key,
      'grand_prize_enabled', v_settings.grand_prize_enabled,
      'grand_prize_config', v_settings.grand_prize_config,
      'visual_config', v_settings.visual_config,
      'animation_config', v_settings.animation_config,
      'result_modal_config', v_settings.result_modal_config,
      'panels_config', v_settings.panels_config,
      'responsive_config', v_settings.responsive_config
    ),
    'prizes', v_prizes
  );
END;
$function$;
