/*
# Wheel V2 Release Safety — Snapshot Compiler

compile_wheel_v2_snapshot(p_version_id)
Compiles a DRAFT into an immutable JSON snapshot with deterministic ordering
and a canonical checksum. Returns jsonb with snapshot_data, checksum, prize_count, total_ppm.
*/
CREATE OR REPLACE FUNCTION public.compile_wheel_v2_snapshot(p_version_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_config record;
  v_prizes jsonb;
  v_snapshot jsonb;
  v_checksum text;
  v_prize_count int;
  v_total_ppm bigint;
BEGIN
  SELECT * INTO v_config FROM wheel_v2_config_versions WHERE id = p_version_id;
  IF v_config IS NULL THEN
    RETURN jsonb_build_object('error', 'VERSION_NOT_FOUND');
  END IF;

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
    'fallback_prize_key', t.fallback_prize_key,
    'is_public_winner', t.is_public_winner,
    'fulfillment_mode', t.fulfillment_mode,
    'range_start', t.range_start,
    'range_end', t.range_end,
    'sector_angle', (t.probability_ppm::float / 1000000.0 * 360.0)
  ) ORDER BY t.display_order, t.prize_key), '[]'::jsonb)
  INTO v_prizes
  FROM build_wheel_v2_probability_ranges(p_version_id) t;

  SELECT COUNT(*) INTO v_prize_count
  FROM wheel_v2_version_prizes
  WHERE version_id = p_version_id AND enabled = true AND visible_on_wheel = true;

  SELECT COALESCE(SUM(probability_ppm), 0) INTO v_total_ppm
  FROM wheel_v2_version_prizes
  WHERE version_id = p_version_id AND enabled = true AND visible_on_wheel = true;

  v_snapshot := jsonb_build_object(
    'version_id', p_version_id,
    'version_number', v_config.version_number,
    'title_ar', v_config.title_ar,
    'title_en', v_config.title_en,
    'subtitle_ar', v_config.subtitle_ar,
    'subtitle_en', v_config.subtitle_en,
    'timezone', v_config.timezone,
    'single_spin_cost', v_config.single_spin_cost,
    'free_spins_per_period', v_config.free_spins_per_period,
    'free_spin_reset_type', v_config.free_spin_reset_type,
    'free_spin_reset_time', v_config.free_spin_reset_time,
    'max_spins_per_request', v_config.max_spins_per_request,
    'allowed_spin_counts', v_config.allowed_spin_counts,
    'animation_duration_ms', v_config.animation_duration_ms,
    'animation_turns', v_config.animation_turns,
    'sounds_enabled', v_config.sounds_enabled,
    'confetti_enabled', v_config.confetti_enabled,
    'ticker_enabled', v_config.ticker_enabled,
    'leaderboard_enabled', v_config.leaderboard_enabled,
    'grand_prize_enabled', v_config.grand_prize_enabled,
    'visual_config', v_config.visual_config,
    'prizes', v_prizes,
    'required_schema_version', get_wheel_v2_schema_version(),
    'renderer_contract_version', 1,
    'compiled_at', now()::text
  );

  -- Canonical checksum: md5 of the canonical JSON text
  v_checksum := md5(v_snapshot::text);

  RETURN jsonb_build_object(
    'snapshot_data', v_snapshot,
    'snapshot_checksum', v_checksum,
    'prize_count', v_prize_count,
    'total_ppm', v_total_ppm
  );
END;
$function$;
