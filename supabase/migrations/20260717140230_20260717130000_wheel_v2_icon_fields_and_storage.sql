/*
# AXIE Wheel V2 — Prize Icon Fields & Storage Bucket

## Purpose
Adds comprehensive icon/visual configuration fields to wheel_v2_version_prizes
and creates a storage bucket for prize icon uploads.

## New Columns on wheel_v2_version_prizes
- icon_storage_path (text) — storage path for uploaded icon
- icon_alt_ar, icon_alt_en (text) — alt text for accessibility
- icon_fit (text) — CONTAIN | COVER, default CONTAIN
- icon_scale (int) — 50-180, default 100 (percentage)
- icon_offset_x (int) — -50 to +50, default 0 (percentage)
- icon_offset_y (int) — -50 to +50, default 0 (percentage)
- icon_rotation (int) — -30 to +30, default 0 (degrees)
- icon_background_enabled (boolean, default true)
- icon_background_style (text) — solid | radial | none, default radial
- icon_background_color (text)
- icon_border_color (text)
- icon_glow_color (text)
- icon_glow_intensity (int) — 0-100, default 0
- icon_shadow_intensity (int) — 0-100, default 0
- container_scale (int) — 70-140, default 100
- mobile_container_scale (int) — 70-140, default 100
- desktop_container_scale (int) — 70-140, default 100
- sizing_mode (text) — AUTO | CUSTOM, default AUTO

## Storage
- Creates bucket "wheel-v2-prizes" (public read, admin write)
- Storage policies: admin upload/replace/remove, public read

## Security
- RLS policies for storage bucket
- Admin-only writes via is_current_user_admin()
*/

-- ═══════════════════════════════════════════════════════
-- Add icon fields to wheel_v2_version_prizes
-- ═══════════════════════════════════════════════════════
ALTER TABLE wheel_v2_version_prizes 
  ADD COLUMN IF NOT EXISTS icon_storage_path text,
  ADD COLUMN IF NOT EXISTS icon_alt_ar text,
  ADD COLUMN IF NOT EXISTS icon_alt_en text,
  ADD COLUMN IF NOT EXISTS icon_fit text NOT NULL DEFAULT 'CONTAIN'
    CHECK (icon_fit IN ('CONTAIN', 'COVER')),
  ADD COLUMN IF NOT EXISTS icon_scale int NOT NULL DEFAULT 100
    CHECK (icon_scale >= 50 AND icon_scale <= 180),
  ADD COLUMN IF NOT EXISTS icon_offset_x int NOT NULL DEFAULT 0
    CHECK (icon_offset_x >= -50 AND icon_offset_x <= 50),
  ADD COLUMN IF NOT EXISTS icon_offset_y int NOT NULL DEFAULT 0
    CHECK (icon_offset_y >= -50 AND icon_offset_y <= 50),
  ADD COLUMN IF NOT EXISTS icon_rotation int NOT NULL DEFAULT 0
    CHECK (icon_rotation >= -30 AND icon_rotation <= 30),
  ADD COLUMN IF NOT EXISTS icon_background_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS icon_background_style text NOT NULL DEFAULT 'radial'
    CHECK (icon_background_style IN ('solid', 'radial', 'none')),
  ADD COLUMN IF NOT EXISTS icon_background_color text,
  ADD COLUMN IF NOT EXISTS icon_border_color text,
  ADD COLUMN IF NOT EXISTS icon_glow_color text,
  ADD COLUMN IF NOT EXISTS icon_glow_intensity int NOT NULL DEFAULT 0
    CHECK (icon_glow_intensity >= 0 AND icon_glow_intensity <= 100),
  ADD COLUMN IF NOT EXISTS icon_shadow_intensity int NOT NULL DEFAULT 0
    CHECK (icon_shadow_intensity >= 0 AND icon_shadow_intensity <= 100),
  ADD COLUMN IF NOT EXISTS container_scale int NOT NULL DEFAULT 100
    CHECK (container_scale >= 70 AND container_scale <= 140),
  ADD COLUMN IF NOT EXISTS mobile_container_scale int NOT NULL DEFAULT 100
    CHECK (mobile_container_scale >= 70 AND mobile_container_scale <= 140),
  ADD COLUMN IF NOT EXISTS desktop_container_scale int NOT NULL DEFAULT 100
    CHECK (desktop_container_scale >= 70 AND desktop_container_scale <= 140),
  ADD COLUMN IF NOT EXISTS sizing_mode text NOT NULL DEFAULT 'AUTO'
    CHECK (sizing_mode IN ('AUTO', 'CUSTOM'));

-- ═══════════════════════════════════════════════════════
-- Create storage bucket for prize icons
-- ═══════════════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'wheel-v2-prizes',
  'wheel-v2-prizes',
  true,
  5242880, -- 5 MB
  ARRAY['image/png', 'image/webp', 'image/jpeg', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════
-- Storage policies
-- ═══════════════════════════════════════════════════════

-- Public read (for published icon URLs)
DROP POLICY IF EXISTS "public_read_wheel_v2_prize_icons" ON storage.objects;
CREATE POLICY "public_read_wheel_v2_prize_icons" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'wheel-v2-prizes');

-- Admin upload/replace
DROP POLICY IF EXISTS "admin_write_wheel_v2_prize_icons" ON storage.objects;
CREATE POLICY "admin_write_wheel_v2_prize_icons" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'wheel-v2-prizes' AND is_current_user_admin());

-- Admin update
DROP POLICY IF EXISTS "admin_update_wheel_v2_prize_icons" ON storage.objects;
CREATE POLICY "admin_update_wheel_v2_prize_icons" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'wheel-v2-prizes' AND is_current_user_admin())
  WITH CHECK (bucket_id = 'wheel-v2-prizes' AND is_current_user_admin());

-- Admin delete
DROP POLICY IF EXISTS "admin_delete_wheel_v2_prize_icons" ON storage.objects;
CREATE POLICY "admin_delete_wheel_v2_prize_icons" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'wheel-v2-prizes' AND is_current_user_admin());

-- ═══════════════════════════════════════════════════════
-- Update get_published_wheel_v2_config to include icon fields
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_published_wheel_v2_config()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version_id uuid;
  v_config record;
  v_prizes jsonb;
BEGIN
  v_version_id := get_published_wheel_v2();
  IF v_version_id IS NULL THEN
    RETURN jsonb_build_object('error', 'NO_PUBLISHED_VERSION');
  END IF;

  SELECT * INTO v_config FROM wheel_v2_config_versions WHERE id = v_version_id;

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
  ) ORDER BY t.display_order), '[]'::jsonb)
  INTO v_prizes
  FROM build_wheel_v2_probability_ranges(v_version_id) t;

  RETURN jsonb_build_object(
    'version_id', v_version_id,
    'version_number', v_config.version_number,
    'title_ar', v_config.title_ar,
    'title_en', v_config.title_en,
    'subtitle_ar', v_config.subtitle_ar,
    'subtitle_en', v_config.subtitle_en,
    'single_spin_cost', v_config.single_spin_cost,
    'free_spins_per_period', v_config.free_spins_per_period,
    'free_spin_reset_type', v_config.free_spin_reset_type,
    'allowed_spin_counts', v_config.allowed_spin_counts,
    'max_spins_per_request', v_config.max_spins_per_request,
    'animation_duration_ms', v_config.animation_duration_ms,
    'animation_turns', v_config.animation_turns,
    'sounds_enabled', v_config.sounds_enabled,
    'confetti_enabled', v_config.confetti_enabled,
    'ticker_enabled', v_config.ticker_enabled,
    'leaderboard_enabled', v_config.leaderboard_enabled,
    'grand_prize_enabled', v_config.grand_prize_enabled,
    'visual_config', v_config.visual_config,
    'prizes', v_prizes
  );
END;
$$;

-- ═══════════════════════════════════════════════════════
-- Detailed publish validation RPC
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION validate_wheel_v2_publish(p_version_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_version record;
  v_total int;
  v_prize_count int;
  v_dup_keys int;
  v_zero_prob int;
  v_bad_fallback int;
  v_missing_keys int;
  v_bad_display_order int;
  v_bad_payload int;
  v_errors text[] := '{}'::text[];
  v_warnings text[] := '{}'::text[];
  v_missing_icons int;
BEGIN
  IF v_admin_id IS NULL OR NOT is_current_user_admin() THEN
    RETURN jsonb_build_object('error', 'UNAUTHORIZED');
  END IF;

  SELECT * INTO v_version FROM wheel_v2_config_versions WHERE id = p_version_id;
  IF v_version IS NULL THEN
    RETURN jsonb_build_object('error', 'VERSION_NOT_FOUND');
  END IF;

  -- Probability total
  SELECT COALESCE(SUM(probability_ppm), 0), COUNT(*)
  INTO v_total, v_prize_count
  FROM wheel_v2_version_prizes WHERE version_id = p_version_id AND enabled = true;

  IF v_prize_count < 1 THEN
    v_errors := array_append(v_errors, 'NO_ENABLED_PRIZES');
  END IF;

  IF v_prize_count > 20 THEN
    v_errors := array_append(v_errors, 'TOO_MANY_PRIZES');
  END IF;

  IF v_total != 1000000 THEN
    v_errors := array_append(v_errors, 'PROBABILITY_SUM_INVALID: expected 1000000, got ' || v_total);
  END IF;

  -- Duplicate prize keys
  SELECT COUNT(*) INTO v_dup_keys FROM (
    SELECT prize_key FROM wheel_v2_version_prizes WHERE version_id = p_version_id
    GROUP BY prize_key HAVING COUNT(*) > 1
  ) t;
  IF v_dup_keys > 0 THEN
    v_errors := array_append(v_errors, 'DUPLICATE_PRIZE_KEYS');
  END IF;

  -- Zero-probability awardable prizes
  SELECT COUNT(*) INTO v_zero_prob
  FROM wheel_v2_version_prizes
  WHERE version_id = p_version_id AND enabled = true AND reward_type != 'NO_REWARD' AND probability_ppm = 0;
  IF v_zero_prob > 0 THEN
    v_errors := array_append(v_errors, 'ZERO_PROBABILITY_AWARDABLE');
  END IF;

  -- Missing prize keys
  SELECT COUNT(*) INTO v_missing_keys
  FROM wheel_v2_version_prizes
  WHERE version_id = p_version_id AND (prize_key IS NULL OR prize_key = '');
  IF v_missing_keys > 0 THEN
    v_errors := array_append(v_errors, 'MISSING_PRIZE_KEYS');
  END IF;

  -- Bad display order (gaps or duplicates)
  SELECT COUNT(*) INTO v_bad_display_order FROM (
    SELECT display_order FROM wheel_v2_version_prizes WHERE version_id = p_version_id
    GROUP BY display_order HAVING COUNT(*) > 1
  ) t;
  IF v_bad_display_order > 0 THEN
    v_errors := array_append(v_errors, 'DUPLICATE_DISPLAY_ORDER');
  END IF;

  -- Bad fallback references
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

  -- Missing icons (warning, not error)
  SELECT COUNT(*) INTO v_missing_icons
  FROM wheel_v2_version_prizes
  WHERE version_id = p_version_id AND enabled = true AND visible_on_wheel = true
    AND (icon_url IS NULL OR icon_url = '');
  IF v_missing_icons > 0 THEN
    v_warnings := array_append(v_warnings, 'MISSING_ICONS: ' || v_missing_icons || ' prizes have no custom icon');
  END IF;

  RETURN jsonb_build_object(
    'valid', array_length(v_errors, 1) IS NULL,
    'errors', v_errors,
    'warnings', v_warnings,
    'prize_count', v_prize_count,
    'total_ppm', v_total,
    'version_status', v_version.status
  );
END;
$$;
