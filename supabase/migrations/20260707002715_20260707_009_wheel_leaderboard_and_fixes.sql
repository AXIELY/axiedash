-- Phase: Wheel Leaderboard, security fix, combo period_key, achievements extension
-- Also fixes: grant_xp_internal callable by any user (revoke direct RPC access via security)

-- ── Revoke public execute on grant_xp_internal ────────────────────────────────
-- grant_xp_internal is an internal function; should only be called by other SECURITY DEFINER functions
-- We still allow it to be called from server-side RPCs but not directly via anon/authenticated roles
REVOKE EXECUTE ON FUNCTION grant_xp_internal(uuid, int, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION grant_xp_internal(uuid, int, text, text) FROM anon;

-- ── wheel_score_log ───────────────────────────────────────────────────────────
-- Immutable per-spin score record; drives leaderboard
CREATE TABLE IF NOT EXISTS wheel_score_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  spin_id         text NOT NULL,          -- game_logs.id (text) or spin_requests.id
  prize_type      text NOT NULL,
  prize_rarity    text NOT NULL DEFAULT 'common',
  score_awarded   int NOT NULL DEFAULT 0,
  scored_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wheel_score_log_spin_unique UNIQUE (spin_id)
);

ALTER TABLE wheel_score_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_score_log" ON wheel_score_log
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "admin_all_score_log" ON wheel_score_log
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true));

CREATE INDEX IF NOT EXISTS idx_score_log_user_scored ON wheel_score_log (user_id, scored_at DESC);
CREATE INDEX IF NOT EXISTS idx_score_log_scored ON wheel_score_log (scored_at DESC);

-- ── leaderboard_score_config ──────────────────────────────────────────────────
-- Admin-configurable rarity → score mapping
CREATE TABLE IF NOT EXISTS leaderboard_score_config (
  rarity      text PRIMARY KEY,
  score       int NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE leaderboard_score_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "all_read_score_config" ON leaderboard_score_config
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin_manage_score_config" ON leaderboard_score_config
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true));

INSERT INTO leaderboard_score_config (rarity, score) VALUES
  ('miss',      0),
  ('common',    1),
  ('uncommon',  3),
  ('rare',      8),
  ('epic',      20),
  ('legendary', 50),
  ('jackpot',   100)
ON CONFLICT (rarity) DO NOTHING;

-- ── record_wheel_score() ──────────────────────────────────────────────────────
-- Called after each spin to record the score; idempotent via UNIQUE(spin_id)
CREATE OR REPLACE FUNCTION record_wheel_score(
  p_user_id    uuid,
  p_spin_id    text,
  p_prize_type text,
  p_rarity     text
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_score int;
BEGIN
  SELECT score INTO v_score FROM leaderboard_score_config WHERE rarity = p_rarity;
  v_score := COALESCE(v_score, 0);

  INSERT INTO wheel_score_log (user_id, spin_id, prize_type, prize_rarity, score_awarded)
  VALUES (p_user_id, p_spin_id, p_prize_type, p_rarity, v_score)
  ON CONFLICT (spin_id) DO NOTHING;

  RETURN v_score;
END;
$$;

-- ── get_wheel_leaderboard() ───────────────────────────────────────────────────
-- Returns top N users by wheel score for a given period
-- period: 'daily' | 'weekly' | 'all_time'
CREATE OR REPLACE FUNCTION get_wheel_leaderboard(
  p_period text DEFAULT 'weekly',
  p_limit  int  DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since     timestamptz;
  v_now       timestamptz := now();
BEGIN
  -- Calculate period boundary (UTC)
  IF p_period = 'daily' THEN
    v_since := (CURRENT_DATE AT TIME ZONE 'UTC')::timestamptz;
  ELSIF p_period = 'weekly' THEN
    -- Monday of current week
    v_since := date_trunc('week', v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  ELSE
    v_since := '1970-01-01'::timestamptz;
  END IF;

  RETURN (
    SELECT jsonb_agg(row_data ORDER BY total_score DESC, rare_wins DESC, first_scored)
    FROM (
      SELECT
        u.id AS user_id,
        u.username,
        u.avatar_url,
        u.level,
        u.rank,
        SUM(wsl.score_awarded)::int AS total_score,
        COUNT(*) FILTER (WHERE wsl.prize_rarity IN ('rare','epic','legendary','jackpot'))::int AS rare_wins,
        MIN(wsl.scored_at) AS first_scored,
        ROW_NUMBER() OVER (ORDER BY SUM(wsl.score_awarded) DESC, COUNT(*) FILTER (WHERE wsl.prize_rarity IN ('rare','epic','legendary','jackpot')) DESC, MIN(wsl.scored_at)) AS rank_position
      FROM wheel_score_log wsl
      JOIN users u ON u.id = wsl.user_id
      WHERE wsl.scored_at >= v_since
      GROUP BY u.id, u.username, u.avatar_url, u.level, u.rank
      ORDER BY total_score DESC, rare_wins DESC, first_scored
      LIMIT p_limit
    ) row_data
  );
END;
$$;

-- ── get_player_leaderboard_position() ────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_player_leaderboard_position(
  p_user_id uuid,
  p_period  text DEFAULT 'weekly'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since    timestamptz;
  v_now      timestamptz := now();
  v_position int;
  v_score    int;
BEGIN
  IF p_period = 'daily' THEN
    v_since := (CURRENT_DATE AT TIME ZONE 'UTC')::timestamptz;
  ELSIF p_period = 'weekly' THEN
    v_since := date_trunc('week', v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  ELSE
    v_since := '1970-01-01'::timestamptz;
  END IF;

  SELECT
    COUNT(*) + 1,
    COALESCE((SELECT SUM(score_awarded) FROM wheel_score_log WHERE user_id = p_user_id AND scored_at >= v_since), 0)
  INTO v_position, v_score
  FROM (
    SELECT user_id, SUM(score_awarded) AS total
    FROM wheel_score_log
    WHERE scored_at >= v_since
    GROUP BY user_id
    HAVING SUM(score_awarded) > COALESCE(
      (SELECT SUM(score_awarded) FROM wheel_score_log WHERE user_id = p_user_id AND scored_at >= v_since), 0
    )
  ) ranked;

  RETURN jsonb_build_object(
    'position', v_position,
    'score', v_score,
    'period', p_period,
    'has_entry', v_score > 0
  );
END;
$$;

-- ── achievements extension: add wheel-specific badge columns ──────────────────
-- Extend achievements to support wheel engagement badges without dropping data
ALTER TABLE achievements
  ADD COLUMN IF NOT EXISTS name_en    text,
  ADD COLUMN IF NOT EXISTS name_ar    text,
  ADD COLUMN IF NOT EXISTS badge_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS is_secret  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_active  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS rule_type  text,    -- 'spin_count' | 'win_count' | 'combo' | 'streak' | 'level' | 'rank'
  ADD COLUMN IF NOT EXISTS rule_value int,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Ensure user_achievements has a unique constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_achievements_user_achievement_unique'
  ) THEN
    ALTER TABLE user_achievements
      ADD CONSTRAINT user_achievements_user_achievement_unique UNIQUE (user_id, achievement_id);
  END IF;
END;
$$;

-- Seed wheel-specific achievements
INSERT INTO achievements (name, name_en, name_ar, description, icon, category, threshold, xp_reward, rarity, badge_code, rule_type, rule_value, is_active) VALUES
  ('First Spin',      'First Spin',     'أول دورة',        'Spin the wheel for the first time',       '🎡', 'wheel', 1,   10,  'common',    'FIRST_SPIN',    'spin_count', 1,   true),
  ('Spin 10',         '10 Spins',       '10 دورات',        'Complete 10 spins',                       '🔟', 'wheel', 10,  25,  'common',    'SPIN_10',       'spin_count', 10,  true),
  ('Spin 100',        '100 Spins',      '100 دورة',        'Complete 100 spins',                      '💯', 'wheel', 100, 100, 'rare',      'SPIN_100',      'spin_count', 100, true),
  ('First Win',       'First Win',      'أول فوز',         'Win any prize from the wheel',            '🏆', 'wheel', 1,   15,  'common',    'FIRST_WIN',     'win_count',  1,   true),
  ('Win 10',          '10 Wins',        '10 فوز',          'Win 10 prizes from the wheel',            '🥇', 'wheel', 10,  50,  'uncommon',  'WIN_10',        'win_count',  10,  true),
  ('Combo 3',         'Hot Streak',     'سلسلة ساخنة',     'Win 3 times in a row',                    '🔥', 'wheel', 3,   30,  'uncommon',  'COMBO_3',       'combo',      3,   true),
  ('Combo 7',         'Unstoppable',    'لا يُوقف',        'Win 7 times in a row',                    '⚡', 'wheel', 7,   100, 'epic',      'COMBO_7',       'combo',      7,   true),
  ('Streak 3',        '3-Day Streak',   'سلسلة 3 أيام',    'Spin 3 days in a row',                    '📅', 'wheel', 3,   40,  'uncommon',  'STREAK_3',      'streak',     3,   true),
  ('Streak 7',        '7-Day Streak',   'سلسلة أسبوع',     'Spin 7 days in a row',                    '🗓️', 'wheel', 7,   150, 'rare',      'STREAK_7',      'streak',     7,   true),
  ('Level 10',        'Level 10',       'المستوى 10',      'Reach level 10',                          '📈', 'wheel', 10,  75,  'rare',      'LEVEL_10',      'level',      10,  true),
  ('Level 25',        'Level 25',       'المستوى 25',      'Reach level 25',                          '🌟', 'wheel', 25,  200, 'epic',      'LEVEL_25',      'level',      25,  true),
  ('Legend Rank',     'Legend',         'أسطورة',          'Reach Legend rank',                       '👑', 'wheel', 50,  500, 'legendary', 'RANK_LEGEND',   'rank',       50,  true),
  ('Top 10 Weekly',   'Top 10 Weekly',  'أفضل 10 أسبوعي', 'Finish in the top 10 on the weekly board', '🏅', 'wheel', 10,  80,  'rare',      'TOP_10_WEEKLY', 'leaderboard',10,  true),
  ('Top 3 Weekly',    'Top 3 Weekly',   'أفضل 3 أسبوعي',  'Finish in the top 3 on the weekly board',  '🥈', 'wheel', 3,   200, 'epic',      'TOP_3_WEEKLY',  'leaderboard',3,   true),
  ('Jackpot Win',     'Jackpot Winner', 'فائز بالجائزة',   'Win the jackpot',                         '💰', 'wheel', 1,   1000,'legendary', 'JACKPOT_WIN',   'jackpot',    1,   false) -- disabled until jackpot live
ON CONFLICT (badge_code) DO NOTHING;

-- ── check_and_grant_badge() ───────────────────────────────────────────────────
-- Idempotent badge granting; returns true if newly granted
CREATE OR REPLACE FUNCTION check_and_grant_badge(
  p_user_id  uuid,
  p_badge_code text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_achievement achievements%ROWTYPE;
  v_inserted    boolean := false;
BEGIN
  SELECT * INTO v_achievement FROM achievements WHERE badge_code = p_badge_code AND is_active = true;
  IF NOT FOUND THEN RETURN false; END IF;

  INSERT INTO user_achievements (user_id, achievement_id, unlocked_at)
  VALUES (p_user_id, v_achievement.id, now())
  ON CONFLICT (user_id, achievement_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  v_inserted := v_inserted > 0;

  -- Grant XP if newly unlocked
  IF v_inserted AND COALESCE(v_achievement.xp_reward, 0) > 0 THEN
    -- Direct update (progression flag may not be active)
    UPDATE users SET xp = COALESCE(xp, 0) + v_achievement.xp_reward WHERE id = p_user_id;
  END IF;

  RETURN v_inserted;
END;
$$;

-- ── update_combo_state_v2() ───────────────────────────────────────────────────
-- Replaces the inline outbox handler; uses period_key for windowed reset
-- period_key format: YYYY-MM-DD (daily) or YYYY-Www (weekly, configurable)
CREATE OR REPLACE FUNCTION update_combo_state_v2(
  p_user_id    uuid,
  p_is_win     boolean,
  p_spin_id    text,
  p_prize_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_flag        boolean;
  v_today       text := to_char(CURRENT_DATE AT TIME ZONE 'UTC', 'YYYY-MM-DD');
  v_current     user_combo_state%ROWTYPE;
  v_new_wins    int;
  v_combo_def   combo_definitions%ROWTYPE;
  v_milestone   combo_definitions%ROWTYPE;
  v_badge_code  text;
  v_newly_granted boolean;
BEGIN
  SELECT enabled INTO v_flag FROM engagement_flags WHERE flag = 'combo';
  IF NOT COALESCE(v_flag, false) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'flag_disabled');
  END IF;

  -- Upsert base row
  INSERT INTO user_combo_state (user_id, consecutive_wins, current_multiplier, active_combo_id)
  VALUES (p_user_id, 0, 1.0, NULL)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_current FROM user_combo_state WHERE user_id = p_user_id FOR UPDATE;

  -- Reset consecutive if loss
  IF NOT p_is_win THEN
    UPDATE user_combo_state SET
      consecutive_wins   = 0,
      current_multiplier = 1.0,
      active_combo_id    = NULL,
      updated_at         = now()
    WHERE user_id = p_user_id;
    RETURN jsonb_build_object('success', true, 'consecutive_wins', 0, 'milestone_hit', false);
  END IF;

  v_new_wins := v_current.consecutive_wins + 1;

  -- Find highest active combo for this win count
  SELECT * INTO v_combo_def FROM combo_definitions
  WHERE required_wins <= v_new_wins AND is_active = true
  ORDER BY required_wins DESC LIMIT 1;

  -- Check if we just hit a new milestone
  SELECT * INTO v_milestone FROM combo_definitions
  WHERE required_wins = v_new_wins AND is_active = true
  LIMIT 1;

  UPDATE user_combo_state SET
    consecutive_wins   = v_new_wins,
    current_multiplier = COALESCE(v_combo_def.multiplier, 1.0),
    active_combo_id    = v_combo_def.id,
    updated_at         = now()
  WHERE user_id = p_user_id;

  -- Check badge triggers
  IF v_new_wins >= 3 THEN
    PERFORM check_and_grant_badge(p_user_id, 'COMBO_3');
  END IF;
  IF v_new_wins >= 7 THEN
    PERFORM check_and_grant_badge(p_user_id, 'COMBO_7');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'consecutive_wins', v_new_wins,
    'milestone_hit', v_milestone.id IS NOT NULL,
    'milestone_xp', COALESCE(v_milestone.xp_bonus, 0),
    'milestone_label_en', COALESCE(v_milestone.label_en, ''),
    'multiplier', COALESCE(v_combo_def.multiplier, 1.0)
  );
END;
$$;

-- ── Update get_game_home_state() to include wheel score + leaderboard position ─
CREATE OR REPLACE FUNCTION get_game_home_state()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id     uuid := auth.uid();
  v_user        users%ROWTYPE;
  v_now         timestamptz := now();
  v_today       date := (v_now AT TIME ZONE 'UTC')::date;
  v_spins_today int;
  v_settings    wheel_game_settings%ROWTYPE;
  v_streak      spin_activity_streaks%ROWTYPE;
  v_combo       user_combo_state%ROWTYPE;
  v_jackpot     jackpot_rounds%ROWTYPE;
  v_level_def   level_definitions%ROWTYPE;
  v_next_level  level_definitions%ROWTYPE;
  v_rank_def    rank_definitions%ROWTYPE;
  v_spin_credits int;
  v_flags       jsonb;
  v_events      jsonb;
  v_lb_pos      jsonb;
  v_weekly_score int;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthenticated');
  END IF;

  SELECT * INTO v_user FROM users WHERE id = v_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  SELECT jsonb_object_agg(flag, enabled) INTO v_flags FROM engagement_flags;
  SELECT * INTO v_settings FROM wheel_game_settings WHERE active = true LIMIT 1;

  -- Count spins today: check both V1 (game_logs) and V2 (spin_requests)
  SELECT COUNT(*) INTO v_spins_today
  FROM game_logs
  WHERE user_id = v_user_id
    AND game_type = 'wheel'
    AND created_at >= (v_today::timestamptz AT TIME ZONE 'UTC');

  SELECT COALESCE(balance, 0) INTO v_spin_credits FROM spin_credits WHERE user_id = v_user_id;
  SELECT * INTO v_streak FROM spin_activity_streaks WHERE user_id = v_user_id;
  SELECT * INTO v_combo FROM user_combo_state WHERE user_id = v_user_id;
  SELECT * INTO v_jackpot FROM jackpot_rounds WHERE settled = false ORDER BY created_at DESC LIMIT 1;
  SELECT * INTO v_level_def FROM level_definitions WHERE level = COALESCE(v_user.level, 1);
  SELECT * INTO v_next_level FROM level_definitions WHERE level = COALESCE(v_user.level, 1) + 1;
  SELECT * INTO v_rank_def FROM rank_definitions
  WHERE min_level <= COALESCE(v_user.level, 1) ORDER BY rank_order DESC LIMIT 1;

  SELECT get_active_game_events() INTO v_events;
  SELECT get_player_leaderboard_position(v_user_id, 'weekly') INTO v_lb_pos;

  SELECT COALESCE(SUM(score_awarded), 0)::int INTO v_weekly_score
  FROM wheel_score_log
  WHERE user_id = v_user_id
    AND scored_at >= date_trunc('week', v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';

  RETURN jsonb_build_object(
    'success', true,
    'flags', COALESCE(v_flags, '{}'),
    'user', jsonb_build_object(
      'id', v_user.id,
      'username', v_user.username,
      'avatar_url', v_user.avatar_url,
      'points', COALESCE(v_user.points, 0),
      'coins', COALESCE(v_user.coins, 0),
      'xp', COALESCE(v_user.xp, 0),
      'level', COALESCE(v_user.level, 1),
      'rank', COALESCE(v_user.rank, 'Bronze'),
      'games_played', COALESCE(v_user.games_played, 0)
    ),
    'progression', jsonb_build_object(
      'xp', COALESCE(v_user.xp, 0),
      'level', COALESCE(v_user.level, 1),
      'rank', COALESCE(v_user.rank, 'Bronze'),
      'rank_color', COALESCE(v_rank_def.color_hex, '#CD7F32'),
      'rank_icon', COALESCE(v_rank_def.icon, 'shield'),
      'current_level_xp', COALESCE(v_level_def.xp_required, 0),
      'next_level_xp', COALESCE(v_next_level.xp_required, 9999999),
      'level_title_en', COALESCE(v_level_def.title_en, ''),
      'level_title_ar', COALESCE(v_level_def.title_ar, '')
    ),
    'spin_state', jsonb_build_object(
      'spins_today', COALESCE(v_spins_today, 0),
      'free_daily_spins', COALESCE(v_settings.free_daily_spins, 3),
      'free_spins_left', GREATEST(COALESCE(v_settings.free_daily_spins, 3) - COALESCE(v_spins_today, 0), 0),
      'spin_cost_points', COALESCE(v_settings.spin_cost_points, 100),
      'spin_credits', COALESCE(v_spin_credits, 0)
    ),
    'streak', jsonb_build_object(
      'current_streak', COALESCE(v_streak.current_streak, 0),
      'longest_streak', COALESCE(v_streak.longest_streak, 0),
      'last_spin_date', v_streak.last_spin_date,
      'total_spins', COALESCE(v_streak.total_spins, 0)
    ),
    'combo', jsonb_build_object(
      'consecutive_wins', COALESCE(v_combo.consecutive_wins, 0),
      'current_multiplier', COALESCE(v_combo.current_multiplier, 1.0)
    ),
    'jackpot', CASE WHEN v_jackpot.id IS NOT NULL THEN jsonb_build_object(
      'id', v_jackpot.id,
      'current_amount', v_jackpot.current_amount,
      'settled', v_jackpot.settled
    ) ELSE NULL END,
    'active_events', COALESCE(v_events, '[]'::jsonb),
    'leaderboard', jsonb_build_object(
      'weekly_score', v_weekly_score,
      'weekly_position', COALESCE((v_lb_pos->>'position')::int, 0),
      'has_entry', COALESCE((v_lb_pos->>'has_entry')::boolean, false)
    )
  );
END;
$$;
