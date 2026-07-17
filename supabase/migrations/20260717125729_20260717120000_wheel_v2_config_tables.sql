/*
# AXIE Wheel V2 — Configuration Tables

## Purpose
Creates the versioned Wheel V2 configuration system with DRAFT/PUBLISHED/ARCHIVED
lifecycle, per-version prize definitions with exact integer probabilities (ppm),
and the server-enforced feature flag `wheel_v2_enabled`.

## New Tables

### wheel_v2_config_versions
The main versioned configuration. Admin edits a DRAFT; publishing creates an
immutable PUBLISHED snapshot; old versions are ARCHIVED.
- id (uuid PK)
- version_number (int, auto-incremented per publish)
- status (DRAFT | PUBLISHED | ARCHIVED)
- enabled, maintenance_mode, timezone
- title_ar, title_en, subtitle_ar, subtitle_en
- free_spins_per_period, free_spin_reset_type, free_spin_reset_time
- single_spin_cost, max_spins_per_request, allowed_spin_counts (int[])
- animation_duration_ms, animation_turns, sounds_enabled, confetti_enabled
- ticker_enabled, leaderboard_enabled, grand_prize_enabled
- visual_config (jsonb)
- created_by, created_at, published_at, published_by

### wheel_v2_version_prizes
Ordered prize list per config version. Each prize has exact probability_ppm.
- id, version_id (FK), prize_key, display_order
- name_ar, name_en, short_label_ar, short_label_en, description_ar, description_en
- reward_type (POINTS|COINS|FREE_SPIN|NO_REWARD|MANUAL_SERVICE|VIP_ACCESS|GRAND_PRIZE)
- reward_payload (jsonb), rarity, icon_url
- wheel_color_start, wheel_color_end, text_color
- probability_ppm (integer, 0-1000000)
- enabled, visible_on_wheel, is_grand_prize
- fallback_prize_key (nullable)
- stock_limit, total_win_limit, daily_win_limit, per_user_win_limit (nullable)
- starts_at, ends_at (nullable)
- is_public_winner, fulfillment_mode
- archived_at (nullable)

### wheel_v2_feature_flags
Server-enforced feature flags. `wheel_v2_enabled` starts false.
- key (text PK), value (jsonb), updated_at

## Security
- RLS enabled on all tables.
- Normal users can SELECT only PUBLISHED config versions and their prizes.
- Admins (is_current_user_admin()) can manage DRAFT/PUBLISHED/ARCHIVED.
- Feature flags are admin-only (SELECT + UPDATE).

## Notes
1. Reuses existing `is_current_user_admin()` helper from earlier migration.
2. Does NOT create wheel-specific user points — reuses `users.points`.
3. Does NOT create a separate coins balance — reuses `users.coins`.
4. Does NOT create a separate fulfillment system — reuses `fulfillment_cases`.
5. `wheel_v2_enabled` defaults to false — the Wheel stays unavailable until all
   acceptance tests pass.
*/

-- ═══════════════════════════════════════════════════════
-- Feature flags table
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS wheel_v2_feature_flags (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE wheel_v2_feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_feature_flags" ON wheel_v2_feature_flags;
CREATE POLICY "admin_read_feature_flags" ON wheel_v2_feature_flags
  FOR SELECT TO authenticated USING (is_current_user_admin());

DROP POLICY IF EXISTS "admin_update_feature_flags" ON wheel_v2_feature_flags;
CREATE POLICY "admin_update_feature_flags" ON wheel_v2_feature_flags
  FOR UPDATE TO authenticated USING (is_current_user_admin()) WITH CHECK (is_current_user_admin());

-- Seed the wheel_v2_enabled flag as false
INSERT INTO wheel_v2_feature_flags (key, value)
VALUES ('wheel_v2_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ═══════════════════════════════════════════════════════
-- Config versions table
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS wheel_v2_config_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_number int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  enabled boolean NOT NULL DEFAULT true,
  maintenance_mode boolean NOT NULL DEFAULT false,
  timezone text NOT NULL DEFAULT 'Africa/Tripoli',

  title_ar text NOT NULL DEFAULT 'عجلة أكسي',
  title_en text NOT NULL DEFAULT 'AXIE Wheel',
  subtitle_ar text NOT NULL DEFAULT 'أدر العجلة واربح جوائز فورية',
  subtitle_en text NOT NULL DEFAULT 'Spin the wheel and win instant prizes',

  free_spins_per_period int NOT NULL DEFAULT 3,
  free_spin_reset_type text NOT NULL DEFAULT 'DAILY'
    CHECK (free_spin_reset_type IN ('DAILY', 'WEEKLY', 'EVENT', 'NEVER')),
  free_spin_reset_time text,

  single_spin_cost int NOT NULL DEFAULT 100,
  max_spins_per_request int NOT NULL DEFAULT 10,
  allowed_spin_counts int[] NOT NULL DEFAULT ARRAY[1, 5, 10],

  animation_duration_ms int NOT NULL DEFAULT 5600,
  animation_turns int NOT NULL DEFAULT 6,
  sounds_enabled boolean NOT NULL DEFAULT true,
  confetti_enabled boolean NOT NULL DEFAULT true,
  ticker_enabled boolean NOT NULL DEFAULT true,
  leaderboard_enabled boolean NOT NULL DEFAULT true,
  grand_prize_enabled boolean NOT NULL DEFAULT true,

  visual_config jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE wheel_v2_config_versions ENABLE ROW LEVEL SECURITY;

-- Users can read only PUBLISHED versions
DROP POLICY IF EXISTS "user_read_published_versions" ON wheel_v2_config_versions;
CREATE POLICY "user_read_published_versions" ON wheel_v2_config_versions
  FOR SELECT TO authenticated USING (status = 'PUBLISHED' AND enabled = true);

-- Admins can read all versions
DROP POLICY IF EXISTS "admin_read_all_versions" ON wheel_v2_config_versions;
CREATE POLICY "admin_read_all_versions" ON wheel_v2_config_versions
  FOR SELECT TO authenticated USING (is_current_user_admin());

-- Admins can insert
DROP POLICY IF EXISTS "admin_insert_versions" ON wheel_v2_config_versions;
CREATE POLICY "admin_insert_versions" ON wheel_v2_config_versions
  FOR INSERT TO authenticated WITH CHECK (is_current_user_admin());

-- Admins can update
DROP POLICY IF EXISTS "admin_update_versions" ON wheel_v2_config_versions;
CREATE POLICY "admin_update_versions" ON wheel_v2_config_versions
  FOR UPDATE TO authenticated USING (is_current_user_admin()) WITH CHECK (is_current_user_admin());

-- Admins can delete (only DRAFT)
DROP POLICY IF EXISTS "admin_delete_draft_versions" ON wheel_v2_config_versions;
CREATE POLICY "admin_delete_draft_versions" ON wheel_v2_config_versions
  FOR DELETE TO authenticated USING (is_current_user_admin() AND status = 'DRAFT');

-- ═══════════════════════════════════════════════════════
-- Version prizes table
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS wheel_v2_version_prizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES wheel_v2_config_versions(id) ON DELETE CASCADE,

  prize_key text NOT NULL,
  display_order int NOT NULL DEFAULT 0,

  name_ar text NOT NULL DEFAULT '',
  name_en text NOT NULL DEFAULT '',
  short_label_ar text NOT NULL DEFAULT '',
  short_label_en text NOT NULL DEFAULT '',
  description_ar text,
  description_en text,

  reward_type text NOT NULL DEFAULT 'NO_REWARD'
    CHECK (reward_type IN ('POINTS', 'COINS', 'FREE_SPIN', 'NO_REWARD', 'MANUAL_SERVICE', 'VIP_ACCESS', 'GRAND_PRIZE')),
  reward_payload jsonb NOT NULL DEFAULT '{}'::jsonb,

  rarity text NOT NULL DEFAULT 'common'
    CHECK (rarity IN ('common', 'uncommon', 'rare', 'epic', 'legendary')),

  icon_url text,

  wheel_color_start text NOT NULL DEFAULT '#f2e3bd',
  wheel_color_end text NOT NULL DEFAULT '#d6ba82',
  text_color text NOT NULL DEFAULT '#241705',

  probability_ppm int NOT NULL DEFAULT 0
    CHECK (probability_ppm >= 0 AND probability_ppm <= 1000000),

  enabled boolean NOT NULL DEFAULT true,
  visible_on_wheel boolean NOT NULL DEFAULT true,
  is_grand_prize boolean NOT NULL DEFAULT false,

  fallback_prize_key text,

  stock_limit int,
  total_win_limit int,
  daily_win_limit int,
  per_user_win_limit int,

  starts_at timestamptz,
  ends_at timestamptz,

  is_public_winner boolean NOT NULL DEFAULT true,
  fulfillment_mode text NOT NULL DEFAULT 'instant'
    CHECK (fulfillment_mode IN ('instant', 'manual', 'service')),

  archived_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (version_id, prize_key)
);

ALTER TABLE wheel_v2_version_prizes ENABLE ROW LEVEL SECURITY;

-- Users can read prizes from PUBLISHED versions only
DROP POLICY IF EXISTS "user_read_published_prizes" ON wheel_v2_version_prizes;
CREATE POLICY "user_read_published_prizes" ON wheel_v2_version_prizes
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM wheel_v2_config_versions v
      WHERE v.id = wheel_v2_version_prizes.version_id
      AND v.status = 'PUBLISHED' AND v.enabled = true
    )
  );

-- Admins can read all prizes
DROP POLICY IF EXISTS "admin_read_all_prizes" ON wheel_v2_version_prizes;
CREATE POLICY "admin_read_all_prizes" ON wheel_v2_version_prizes
  FOR SELECT TO authenticated USING (is_current_user_admin());

-- Admins can insert
DROP POLICY IF EXISTS "admin_insert_prizes" ON wheel_v2_version_prizes;
CREATE POLICY "admin_insert_prizes" ON wheel_v2_version_prizes
  FOR INSERT TO authenticated WITH CHECK (is_current_user_admin());

-- Admins can update
DROP POLICY IF EXISTS "admin_update_prizes" ON wheel_v2_version_prizes;
CREATE POLICY "admin_update_prizes" ON wheel_v2_version_prizes
  FOR UPDATE TO authenticated USING (is_current_user_admin()) WITH CHECK (is_current_user_admin());

-- Admins can delete (only from DRAFT versions)
DROP POLICY IF EXISTS "admin_delete_draft_prizes" ON wheel_v2_version_prizes;
CREATE POLICY "admin_delete_draft_prizes" ON wheel_v2_version_prizes
  FOR DELETE TO authenticated USING (
    is_current_user_admin() AND
    EXISTS (
      SELECT 1 FROM wheel_v2_config_versions v
      WHERE v.id = wheel_v2_version_prizes.version_id AND v.status = 'DRAFT'
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wheel_v2_prizes_version ON wheel_v2_version_prizes(version_id);
CREATE INDEX IF NOT EXISTS idx_wheel_v2_prizes_order ON wheel_v2_version_prizes(version_id, display_order);
CREATE INDEX IF NOT EXISTS idx_wheel_v2_versions_status ON wheel_v2_config_versions(status);

-- ═══════════════════════════════════════════════════════
-- Helper: get current published version
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_published_wheel_v2()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM wheel_v2_config_versions
  WHERE status = 'PUBLISHED' AND enabled = true
  ORDER BY published_at DESC NULLS LAST
  LIMIT 1;
$$;

-- ═══════════════════════════════════════════════════════
-- Helper: check wheel_v2_enabled flag
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION is_wheel_v2_enabled()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (value->>'value')::boolean,
    false
  ) FROM wheel_v2_feature_flags
  WHERE key = 'wheel_v2_enabled'
  UNION ALL
  SELECT false
  LIMIT 1;
$$;

-- ═══════════════════════════════════════════════════════
-- Helper: validate probability sum for a version
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION validate_wheel_v2_probability(p_version_id uuid)
RETURNS TABLE(total_ppm int, is_valid boolean, remaining_ppm int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int;
BEGIN
  SELECT COALESCE(SUM(probability_ppm), 0)
  INTO v_total
  FROM wheel_v2_version_prizes
  WHERE version_id = p_version_id AND enabled = true;

  total_ppm := v_total;
  is_valid := (v_total = 1000000);
  remaining_ppm := 1000000 - v_total;
  RETURN NEXT;
END;
$$;

-- ═══════════════════════════════════════════════════════
-- Helper: compute period key for free-spin reset
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_wheel_v2_period_key(
  p_reset_type text,
  p_timezone text DEFAULT 'Africa/Tripoli'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz;
  v_date text;
BEGIN
  v_now := now() AT TIME ZONE COALESCE(p_timezone, 'Africa/Tripoli');

  CASE p_reset_type
    WHEN 'DAILY' THEN
      v_date := to_char(v_now, 'YYYY-MM-DD');
    WHEN 'WEEKLY' THEN
      -- ISO week
      v_date := to_char(v_now, 'IYYY-IW');
    WHEN 'EVENT' THEN
      v_date := 'event';
    WHEN 'NEVER' THEN
      v_date := 'never';
    ELSE
      v_date := to_char(v_now, 'YYYY-MM-DD');
  END CASE;

  RETURN v_date;
END;
$$;
