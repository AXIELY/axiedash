/*
# Create canonical live Wheel configuration tables

## Purpose
Replaces the draft→publish version workflow with one canonical live configuration.
Admin saves settings+prizes atomically; the live tables become the single source
of truth. Existing version tables (wheel_v2_config_versions / wheel_v2_version_prizes)
are kept as a mirror for backward-compatible FK references from spin batches, results,
free-spin usage, grand-prize progress, and winner events.

## New Tables

### wheel_live_settings (singleton, id = 1)
- id integer PRIMARY KEY (always 1)
- enabled boolean — wheel is playable
- maintenance_mode boolean — blocks spins, shows maintenance screen
- title_ar / title_en / subtitle_ar / subtitle_en — display text
- timezone text — for free-spin period calculation
- single_spin_cost integer — points per paid spin
- free_spins_per_period integer — free spins per reset period
- free_spin_reset_type text — DAILY / WEEKLY / MONTHLY
- free_spin_reset_time text — HH:MM reset time
- free_spin_change_policy text — APPLY_TO_CURRENT_PERIOD / APPLY_FROM_NEXT_PERIOD
- allowed_spin_counts integer[] — e.g. [1, 5, 10]
- max_spins_per_request integer — hard cap
- probability_mode text — STRICT / AUTO_FILL_FALLBACK / NORMALIZE_ENABLED
- default_fallback_prize_key text — prize used for auto-fill
- grand_prize_enabled boolean
- grand_prize_config jsonb — threshold, scope, accumulating config
- visual_config jsonb — animation, sounds, confetti, etc.
- animation_config jsonb — duration, turns
- result_modal_config jsonb — result display settings
- panels_config jsonb — ticker, leaderboard toggles
- responsive_config jsonb — mobile/desktop sizing
- revision integer — technical concurrency token (NOT a version workflow)
- config_checksum text — hash of the full config for audit/pinning
- updated_at timestamptz
- updated_by uuid — admin user id

### wheel_live_prizes
- id uuid PRIMARY KEY
- prize_key text UNIQUE NOT NULL — stable key
- display_order integer
- enabled boolean
- visible_on_wheel boolean
- name_ar / name_en / short_label_ar / short_label_en text
- description_ar / description_en text
- reward_type text
- reward_payload jsonb
- probability_ppm integer — parts per million (1,000,000 = 100%)
- rarity text
- icon_storage_path / icon_url text
- icon_config jsonb — fit, scale, offsets, rotation, background, glow, border, shadow
- sector_config jsonb — wheel_color_start, wheel_color_end, text_color
- medallion_config jsonb — container scales, sizing_mode
- eligibility_config jsonb — stock, win limits, date range
- limits_config jsonb — total/daily/per-user limits
- fallback_prize_key text
- is_grand_prize boolean
- fulfillment_config jsonb — fulfillment mode, private case toggle
- updated_at timestamptz

### wheel_live_audit_log
- id bigserial PRIMARY KEY
- admin_user_id uuid
- action text — SAVE / RESTORE
- previous_revision integer
- new_revision integer
- previous_checksum text
- new_checksum text
- changed_fields text[]
- changed_prizes text[]
- payload jsonb — full snapshot for emergency restore
- created_at timestamptz

## Security
- RLS enabled on all three tables.
- wheel_live_settings: SELECT for anon+authenticated (public config), UPDATE for authenticated (admin)
- wheel_live_prizes: SELECT for anon+authenticated, all CRUD for authenticated (admin)
- wheel_live_audit_log: SELECT for authenticated (admin), INSERT for authenticated (admin)

## Seeding
- Seeds from the currently active published version (if any)
- If no active version, seeds sensible defaults

## Notes
1. Existing version tables are NOT dropped — they remain as a mirror target
   for save_wheel_live_config() so existing FK constraints continue to work.
2. revision is a concurrency token, NOT a version number.
3. config_checksum is a deterministic hash for audit pinning.
*/

-- ═══════════════════════════════════════════════════
-- 1. wheel_live_settings (singleton)
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS wheel_live_settings (
  id integer PRIMARY KEY DEFAULT 1,
  enabled boolean NOT NULL DEFAULT true,
  maintenance_mode boolean NOT NULL DEFAULT false,
  title_ar text NOT NULL DEFAULT 'عجلة أكسي',
  title_en text NOT NULL DEFAULT 'AXIE Wheel',
  subtitle_ar text NOT NULL DEFAULT 'أدر العجلة واربح جوائز فورية',
  subtitle_en text NOT NULL DEFAULT 'Spin the wheel and win instant prizes',
  timezone text NOT NULL DEFAULT 'Africa/Tripoli',
  single_spin_cost integer NOT NULL DEFAULT 100,
  free_spins_per_period integer NOT NULL DEFAULT 3,
  free_spin_reset_type text NOT NULL DEFAULT 'DAILY',
  free_spin_reset_time text,
  free_spin_change_policy text NOT NULL DEFAULT 'APPLY_TO_CURRENT_PERIOD',
  allowed_spin_counts integer[] NOT NULL DEFAULT ARRAY[1, 5, 10],
  max_spins_per_request integer NOT NULL DEFAULT 10,
  probability_mode text NOT NULL DEFAULT 'STRICT',
  default_fallback_prize_key text,
  grand_prize_enabled boolean NOT NULL DEFAULT true,
  grand_prize_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  visual_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  animation_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_modal_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  panels_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  responsive_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision integer NOT NULL DEFAULT 0,
  config_checksum text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT wheel_live_settings_singleton CHECK (id = 1)
);

ALTER TABLE wheel_live_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "live_settings_public_read" ON wheel_live_settings;
CREATE POLICY "live_settings_public_read" ON wheel_live_settings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "live_settings_admin_update" ON wheel_live_settings;
CREATE POLICY "live_settings_admin_update" ON wheel_live_settings FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════
-- 2. wheel_live_prizes
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS wheel_live_prizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prize_key text UNIQUE NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  visible_on_wheel boolean NOT NULL DEFAULT true,
  name_ar text,
  name_en text,
  short_label_ar text,
  short_label_en text,
  description_ar text,
  description_en text,
  reward_type text NOT NULL DEFAULT 'NO_REWARD',
  reward_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  probability_ppm integer NOT NULL DEFAULT 0,
  rarity text NOT NULL DEFAULT 'common',
  icon_storage_path text,
  icon_url text,
  icon_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  sector_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  medallion_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  eligibility_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  limits_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  fallback_prize_key text,
  is_grand_prize boolean NOT NULL DEFAULT false,
  fulfillment_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE wheel_live_prizes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "live_prizes_public_read" ON wheel_live_prizes;
CREATE POLICY "live_prizes_public_read" ON wheel_live_prizes FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "live_prizes_admin_insert" ON wheel_live_prizes;
CREATE POLICY "live_prizes_admin_insert" ON wheel_live_prizes FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "live_prizes_admin_update" ON wheel_live_prizes;
CREATE POLICY "live_prizes_admin_update" ON wheel_live_prizes FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "live_prizes_admin_delete" ON wheel_live_prizes;
CREATE POLICY "live_prizes_admin_delete" ON wheel_live_prizes FOR DELETE
  TO authenticated USING (true);

-- ═══════════════════════════════════════════════════
-- 3. wheel_live_audit_log
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS wheel_live_audit_log (
  id bigserial PRIMARY KEY,
  admin_user_id uuid,
  action text NOT NULL DEFAULT 'SAVE',
  previous_revision integer,
  new_revision integer,
  previous_checksum text,
  new_checksum text,
  changed_fields text[] NOT NULL DEFAULT '{}',
  changed_prizes text[] NOT NULL DEFAULT '{}',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE wheel_live_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "live_audit_admin_read" ON wheel_live_audit_log;
CREATE POLICY "live_audit_admin_read" ON wheel_live_audit_log FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "live_audit_admin_insert" ON wheel_live_audit_log;
CREATE POLICY "live_audit_admin_insert" ON wheel_live_audit_log FOR INSERT
  TO authenticated WITH CHECK (true);

-- ═══════════════════════════════════════════════════
-- 4. Seed from currently active published version
-- ═══════════════════════════════════════════════════
DO $$
DECLARE
  v_active_version_id uuid;
  v_config record;
BEGIN
  SELECT active_version_id INTO v_active_version_id FROM wheel_v2_runtime_settings WHERE id = 1;

  IF v_active_version_id IS NOT NULL THEN
    SELECT * INTO v_config FROM wheel_v2_config_versions WHERE id = v_active_version_id;

    INSERT INTO wheel_live_settings (id, enabled, maintenance_mode, title_ar, title_en,
      subtitle_ar, subtitle_en, timezone, single_spin_cost, free_spins_per_period,
      free_spin_reset_type, free_spin_reset_time, allowed_spin_counts, max_spins_per_request,
      probability_mode, grand_prize_enabled, grand_prize_config, visual_config,
      animation_config, panels_config, revision, updated_at)
    VALUES (
      1,
      COALESCE(v_config.enabled, true),
      COALESCE(v_config.maintenance_mode, false),
      COALESCE(v_config.title_ar, 'عجلة أكسي'),
      COALESCE(v_config.title_en, 'AXIE Wheel'),
      COALESCE(v_config.subtitle_ar, 'أدر العجلة واربح جوائز فورية'),
      COALESCE(v_config.subtitle_en, 'Spin the wheel and win instant prizes'),
      COALESCE(v_config.timezone, 'Africa/Tripoli'),
      COALESCE(v_config.single_spin_cost, 100),
      COALESCE(v_config.free_spins_per_period, 3),
      COALESCE(v_config.free_spin_reset_type, 'DAILY'),
      v_config.free_spin_reset_time,
      COALESCE(v_config.allowed_spin_counts, ARRAY[1, 5, 10]),
      COALESCE(v_config.max_spins_per_request, 10),
      'STRICT',
      COALESCE(v_config.grand_prize_enabled, true),
      jsonb_build_object(
        'jackpot_lock_enabled', COALESCE(v_config.jackpot_lock_enabled, true),
        'jackpot_unlock_spins', COALESCE(v_config.jackpot_unlock_spins, 30),
        'streak_enabled', COALESCE(v_config.streak_enabled, true),
        'streak_spins_required', COALESCE(v_config.streak_spins_required, 3),
        'streak_reward_free_spins', COALESCE(v_config.streak_reward_free_spins, 1)
      ),
      COALESCE(v_config.visual_config, '{}'::jsonb),
      jsonb_build_object(
        'animation_duration_ms', COALESCE(v_config.animation_duration_ms, 5600),
        'animation_turns', COALESCE(v_config.animation_turns, 6),
        'sounds_enabled', COALESCE(v_config.sounds_enabled, true),
        'confetti_enabled', COALESCE(v_config.confetti_enabled, true)
      ),
      jsonb_build_object(
        'ticker_enabled', COALESCE(v_config.ticker_enabled, true),
        'leaderboard_enabled', COALESCE(v_config.leaderboard_enabled, true)
      ),
      1,
      now()
    )
    ON CONFLICT (id) DO NOTHING;

    -- Seed prizes
    INSERT INTO wheel_live_prizes (prize_key, display_order, enabled, visible_on_wheel,
      name_ar, name_en, short_label_ar, short_label_en, description_ar, description_en,
      reward_type, reward_payload, probability_ppm, rarity, icon_url, icon_storage_path,
      icon_config, sector_config, medallion_config, eligibility_config, limits_config,
      fallback_prize_key, is_grand_prize, fulfillment_config, updated_at)
    SELECT
      p.prize_key, p.display_order, p.enabled, p.visible_on_wheel,
      p.name_ar, p.name_en, p.short_label_ar, p.short_label_en,
      p.description_ar, p.description_en,
      p.reward_type, p.reward_payload, p.probability_ppm, p.rarity,
      p.icon_url, p.icon_storage_path,
      jsonb_build_object(
        'icon_fit', p.icon_fit, 'icon_scale', p.icon_scale,
        'icon_offset_x', p.icon_offset_x, 'icon_offset_y', p.icon_offset_y,
        'icon_rotation', p.icon_rotation,
        'icon_background_enabled', p.icon_background_enabled,
        'icon_background_style', p.icon_background_style,
        'icon_background_color', p.icon_background_color,
        'icon_border_color', p.icon_border_color,
        'icon_glow_color', p.icon_glow_color,
        'icon_glow_intensity', p.icon_glow_intensity,
        'icon_shadow_intensity', p.icon_shadow_intensity
      ),
      jsonb_build_object(
        'wheel_color_start', p.wheel_color_start,
        'wheel_color_end', p.wheel_color_end,
        'text_color', p.text_color
      ),
      jsonb_build_object(
        'container_scale', p.container_scale,
        'mobile_container_scale', p.mobile_container_scale,
        'desktop_container_scale', p.desktop_container_scale,
        'sizing_mode', p.sizing_mode
      ),
      jsonb_build_object(
        'stock_limit', p.stock_limit,
        'starts_at', p.starts_at,
        'ends_at', p.ends_at
      ),
      jsonb_build_object(
        'total_win_limit', p.total_win_limit,
        'daily_win_limit', p.daily_win_limit,
        'per_user_win_limit', p.per_user_win_limit
      ),
      p.fallback_prize_key, p.is_grand_prize,
      jsonb_build_object('fulfillment_mode', p.fulfillment_mode),
      now()
    FROM wheel_v2_version_prizes p
    WHERE p.version_id = v_active_version_id
    ON CONFLICT (prize_key) DO NOTHING;
  ELSE
    -- No active version — seed defaults
    INSERT INTO wheel_live_settings (id, enabled, maintenance_mode, revision, updated_at)
    VALUES (1, true, false, 0, now())
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- Enable realtime on wheel_live_settings for change notifications
ALTER TABLE wheel_live_settings REPLICA IDENTITY FULL;
