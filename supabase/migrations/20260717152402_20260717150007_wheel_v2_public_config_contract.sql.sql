/*
# Wheel V2 Release Safety — Updated Public Config Contract

Replaces get_published_wheel_v2_config() to:
1. Use the runtime pointer (active_version_id) instead of querying by status.
2. Return the structured public contract with available flag, release_generation,
   schema_version, snapshot_checksum, and organized sections.
3. Not expose draft IDs, internal cost estimates, or private metadata.
*/
CREATE OR REPLACE FUNCTION public.get_published_wheel_v2_config()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_version_id uuid;
  v_config record;
  v_prizes jsonb;
  v_runtime record;
  v_schema_version int;
BEGIN
  -- Get runtime pointer
  SELECT * INTO v_runtime FROM wheel_v2_runtime_settings WHERE id = 1;

  v_version_id := v_runtime.active_version_id;

  IF v_version_id IS NULL THEN
    RETURN jsonb_build_object('available', false, 'reason', 'NO_ACTIVE_VERSION');
  END IF;

  IF v_runtime.maintenance_mode THEN
    RETURN jsonb_build_object('available', false, 'reason', 'MAINTENANCE_MODE');
  END IF;

  SELECT * INTO v_config FROM wheel_v2_config_versions WHERE id = v_version_id;
  IF v_config IS NULL THEN
    RETURN jsonb_build_object('available', false, 'reason', 'NO_ACTIVE_VERSION');
  END IF;

  v_schema_version := get_wheel_v2_schema_version();

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
    'icon_alt_ar', t.icon_alt_ar,
    'icon_alt_en', t.icon_alt_en,
    'icon_fit', t.icon_fit,
    'icon_scale', t.icon_scale,
    'icon_offset_x', t.icon_offset_x,
    'icon_offset_y', t.icon_offset_y,
    'icon_rotation', t.icon_rotation,
    'icon_background_enabled', t.icon_background_enabled,
    'icon_background_style', t.icon_background_style,
    'icon_background_color', t.icon_background_color,
    'icon_border_color', t.icon_border_color,
    'icon_glow_color', t.icon_glow_color,
    'icon_glow_intensity', t.icon_glow_intensity,
    'icon_shadow_intensity', t.icon_shadow_intensity,
    'container_scale', t.container_scale,
    'mobile_container_scale', t.mobile_container_scale,
    'desktop_container_scale', t.desktop_container_scale,
    'sizing_mode', t.sizing_mode,
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
  ) ORDER BY t.display_order, t.prize_key), '[]'::jsonb)
  INTO v_prizes
  FROM build_wheel_v2_probability_ranges(v_version_id) t;

  RETURN jsonb_build_object(
    'available', true,
    'active_version_id', v_version_id,
    'release_generation', v_runtime.release_generation,
    'schema_version', v_schema_version,
    'snapshot_checksum', v_runtime.active_snapshot_checksum,
    'game', jsonb_build_object(
      'version_number', v_config.version_number,
      'title_ar', v_config.title_ar,
      'title_en', v_config.title_en,
      'subtitle_ar', v_config.subtitle_ar,
      'subtitle_en', v_config.subtitle_en,
      'timezone', v_config.timezone
    ),
    'economy', jsonb_build_object(
      'single_spin_cost', v_config.single_spin_cost,
      'max_spins_per_request', v_config.max_spins_per_request,
      'allowed_spin_counts', v_config.allowed_spin_counts
    ),
    'free_spins', jsonb_build_object(
      'free_spins_per_period', v_config.free_spins_per_period,
      'free_spin_reset_type', v_config.free_spin_reset_type,
      'free_spin_reset_time', v_config.free_spin_reset_time
    ),
    'multi_spin', jsonb_build_object(
      'allowed_spin_counts', v_config.allowed_spin_counts,
      'max_spins_per_request', v_config.max_spins_per_request
    ),
    'visual', jsonb_build_object(
      'visual_config', v_config.visual_config,
      'animation_duration_ms', v_config.animation_duration_ms,
      'animation_turns', v_config.animation_turns,
      'sounds_enabled', v_config.sounds_enabled,
      'confetti_enabled', v_config.confetti_enabled
    ),
    'grand_prize', jsonb_build_object(
      'grand_prize_enabled', v_config.grand_prize_enabled
    ),
    'panels', jsonb_build_object(
      'ticker_enabled', v_config.ticker_enabled,
      'leaderboard_enabled', v_config.leaderboard_enabled
    ),
    'prizes', v_prizes
  );
END;
$function$;
