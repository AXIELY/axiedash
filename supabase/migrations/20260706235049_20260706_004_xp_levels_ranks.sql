-- Phase 3: XP, Levels, Ranks
-- xp_log: idempotent via UNIQUE(user_id, source_type, source_id)
-- level_definitions: 50 numeric levels with xp thresholds
-- rank_definitions: 7 named rank tiers
-- grant_xp_internal(): SECURITY DEFINER RPC for safe XP grants

-- ── xp_log ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS xp_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type text NOT NULL, -- 'spin', 'mission', 'streak', 'badge', 'daily_login', 'legacy'
  source_id   text NOT NULL, -- the triggering entity's ID
  xp_granted  int NOT NULL CHECK (xp_granted > 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT xp_log_idempotency UNIQUE (user_id, source_type, source_id)
);

ALTER TABLE xp_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_xp_log" ON xp_log
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "admin_all_xp_log" ON xp_log
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true));

CREATE INDEX IF NOT EXISTS idx_xp_log_user ON xp_log (user_id, created_at DESC);

-- ── level_definitions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS level_definitions (
  level         int PRIMARY KEY CHECK (level BETWEEN 1 AND 100),
  xp_required   int NOT NULL, -- cumulative XP needed to REACH this level
  title_ar      text NOT NULL DEFAULT '',
  title_en      text NOT NULL DEFAULT ''
);

ALTER TABLE level_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "all_read_level_definitions" ON level_definitions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin_manage_level_definitions" ON level_definitions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true));

-- Seed 50 levels: XP per level scales quadratically (level * 200 + level^2 * 10)
INSERT INTO level_definitions (level, xp_required, title_en, title_ar)
SELECT
  l,
  (l * 200 + l * l * 10)::int,
  CASE
    WHEN l <= 5   THEN 'Rookie'
    WHEN l <= 10  THEN 'Apprentice'
    WHEN l <= 15  THEN 'Explorer'
    WHEN l <= 20  THEN 'Contender'
    WHEN l <= 25  THEN 'Fighter'
    WHEN l <= 30  THEN 'Warrior'
    WHEN l <= 35  THEN 'Elite'
    WHEN l <= 40  THEN 'Champion'
    WHEN l <= 45  THEN 'Master'
    ELSE               'Legend'
  END,
  CASE
    WHEN l <= 5   THEN 'مبتدئ'
    WHEN l <= 10  THEN 'متدرب'
    WHEN l <= 15  THEN 'مستكشف'
    WHEN l <= 20  THEN 'متنافس'
    WHEN l <= 25  THEN 'مقاتل'
    WHEN l <= 30  THEN 'محارب'
    WHEN l <= 35  THEN 'نخبة'
    WHEN l <= 40  THEN 'بطل'
    WHEN l <= 45  THEN 'أستاذ'
    ELSE               'أسطورة'
  END
FROM generate_series(1, 50) AS l
ON CONFLICT (level) DO NOTHING;

-- ── rank_definitions ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rank_definitions (
  rank_order    int PRIMARY KEY,
  name_en       text NOT NULL,
  name_ar       text NOT NULL,
  min_level     int NOT NULL,
  color_hex     text NOT NULL DEFAULT '#888888',
  icon          text NOT NULL DEFAULT 'star'
);

ALTER TABLE rank_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "all_read_rank_definitions" ON rank_definitions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin_manage_rank_definitions" ON rank_definitions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true));

INSERT INTO rank_definitions (rank_order, name_en, name_ar, min_level, color_hex, icon) VALUES
  (1, 'Bronze',   'برونزي',   1,  '#CD7F32', 'shield'),
  (2, 'Silver',   'فضي',      6,  '#A8A9AD', 'shield-half'),
  (3, 'Gold',     'ذهبي',     11, '#FFD700', 'crown'),
  (4, 'Platinum', 'بلاتيني',  21, '#E5E4E2', 'gem'),
  (5, 'Diamond',  'ألماسي',   31, '#B9F2FF', 'diamond'),
  (6, 'Master',   'أستاذ',    41, '#9B59B6', 'zap'),
  (7, 'Legend',   'أسطورة',   46, '#E74C3C', 'star')
ON CONFLICT (rank_order) DO NOTHING;

-- ── grant_xp_internal() ───────────────────────────────────────────────────────
-- Called internally by other RPCs; also callable directly for admin tooling
-- Idempotent: duplicate (source_type, source_id) pairs are silently ignored
CREATE OR REPLACE FUNCTION grant_xp_internal(
  p_user_id    uuid,
  p_xp         int,
  p_source_type text,
  p_source_id  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_flag_enabled  boolean;
  v_old_xp        int;
  v_new_xp        int;
  v_old_level     int;
  v_new_level     int;
  v_old_rank      text;
  v_new_rank      text;
  v_leveled_up    boolean := false;
  v_ranked_up     boolean := false;
BEGIN
  SELECT enabled INTO v_flag_enabled FROM engagement_flags WHERE flag = 'progression';
  IF NOT COALESCE(v_flag_enabled, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'progression_disabled');
  END IF;

  IF p_xp <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'xp_must_be_positive');
  END IF;

  -- Idempotent insert (do nothing on duplicate)
  INSERT INTO xp_log (user_id, source_type, source_id, xp_granted)
  VALUES (p_user_id, p_source_type, p_source_id, p_xp)
  ON CONFLICT (user_id, source_type, source_id) DO NOTHING;

  IF NOT FOUND THEN
    -- Already processed
    RETURN jsonb_build_object('success', true, 'already_granted', true);
  END IF;

  -- Apply XP to user
  UPDATE users SET xp = COALESCE(xp, 0) + p_xp WHERE id = p_user_id
  RETURNING xp - p_xp, xp INTO v_old_xp, v_new_xp;

  -- Recalculate level
  SELECT COALESCE(level, 1) INTO v_old_level FROM users WHERE id = p_user_id;

  SELECT COALESCE(MAX(level), 1) INTO v_new_level
  FROM level_definitions
  WHERE xp_required <= v_new_xp;

  -- Recalculate rank
  SELECT name_en INTO v_old_rank FROM rank_definitions
  WHERE min_level <= v_old_level ORDER BY rank_order DESC LIMIT 1;

  SELECT name_en INTO v_new_rank FROM rank_definitions
  WHERE min_level <= v_new_level ORDER BY rank_order DESC LIMIT 1;

  IF v_new_level <> v_old_level OR v_new_level > COALESCE(v_old_level, 1) THEN
    v_leveled_up := true;
    UPDATE users SET level = v_new_level WHERE id = p_user_id;
  END IF;

  IF COALESCE(v_new_rank, '') <> COALESCE(v_old_rank, '') THEN
    v_ranked_up := true;
    UPDATE users SET rank = v_new_rank WHERE id = p_user_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'already_granted', false,
    'xp_granted', p_xp,
    'old_xp', v_old_xp,
    'new_xp', v_new_xp,
    'old_level', v_old_level,
    'new_level', v_new_level,
    'leveled_up', v_leveled_up,
    'old_rank', v_old_rank,
    'new_rank', v_new_rank,
    'ranked_up', v_ranked_up
  );
END;
$$;
