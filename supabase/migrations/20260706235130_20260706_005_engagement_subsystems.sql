-- Phase 4: Streak, Missions, Badges, Combo
-- Separate spin_activity_streaks from daily_login_streaks
-- Harden player_missions with mission_claim_log
-- Add combo_definitions and user_combo_state

-- ── spin_activity_streaks ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spin_activity_streaks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_streak  int NOT NULL DEFAULT 0,
  longest_streak  int NOT NULL DEFAULT 0,
  last_spin_date  date,
  total_spins     int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT spin_activity_streaks_user_unique UNIQUE (user_id)
);

ALTER TABLE spin_activity_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_spin_streak" ON spin_activity_streaks
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "users_insert_own_spin_streak" ON spin_activity_streaks
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_update_own_spin_streak" ON spin_activity_streaks
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "admin_all_spin_streaks" ON spin_activity_streaks
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true));

-- ── mission_claim_log ─────────────────────────────────────────────────────────
-- Prevents double-claiming; separate from player_missions.claimed_reward
CREATE TABLE IF NOT EXISTS mission_claim_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_mission_id uuid NOT NULL,
  xp_granted       int NOT NULL DEFAULT 0,
  coins_granted    int NOT NULL DEFAULT 0,
  claimed_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mission_claim_log_unique UNIQUE (user_id, player_mission_id)
);

ALTER TABLE mission_claim_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_mission_claims" ON mission_claim_log
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "users_insert_own_mission_claims" ON mission_claim_log
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "admin_all_mission_claims" ON mission_claim_log
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true));

-- ── combo_definitions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS combo_definitions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  required_wins   int NOT NULL UNIQUE,  -- consecutive wins needed
  multiplier      numeric(4,2) NOT NULL DEFAULT 1.0,
  xp_bonus        int NOT NULL DEFAULT 0,
  label_en        text NOT NULL DEFAULT '',
  label_ar        text NOT NULL DEFAULT '',
  is_active       boolean NOT NULL DEFAULT true
);

ALTER TABLE combo_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "all_read_combo_definitions" ON combo_definitions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin_manage_combo_definitions" ON combo_definitions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true));

INSERT INTO combo_definitions (required_wins, multiplier, xp_bonus, label_en, label_ar) VALUES
  (3,  1.25, 10,  'Hot Streak',   'سلسلة ساخنة'),
  (5,  1.50, 25,  'On Fire',      'ملتهب'),
  (7,  2.00, 50,  'Unstoppable',  'لا يُوقف'),
  (10, 2.50, 100, 'LEGENDARY',    'أسطوري')
ON CONFLICT (required_wins) DO NOTHING;

-- ── user_combo_state ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_combo_state (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consecutive_wins    int NOT NULL DEFAULT 0,
  current_multiplier  numeric(4,2) NOT NULL DEFAULT 1.0,
  active_combo_id     uuid REFERENCES combo_definitions(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_combo_state_user_unique UNIQUE (user_id)
);

ALTER TABLE user_combo_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_combo_state" ON user_combo_state
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "users_insert_own_combo_state" ON user_combo_state
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_update_own_combo_state" ON user_combo_state
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "admin_all_combo_state" ON user_combo_state
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true));

-- ── claim_mission_reward() ───────────────────────────────────────────────────
-- Safe server-side claim with idempotency via mission_claim_log
CREATE OR REPLACE FUNCTION claim_mission_reward(p_player_mission_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id       uuid := auth.uid();
  v_pm            player_missions%ROWTYPE;
  v_mission       daily_missions%ROWTYPE;
  v_flag          boolean;
BEGIN
  SELECT enabled INTO v_flag FROM engagement_flags WHERE flag = 'missions';

  -- Load player mission
  SELECT * INTO v_pm FROM player_missions WHERE id = p_player_mission_id AND user_id = v_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'mission_not_found');
  END IF;

  IF NOT v_pm.completed THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_completed');
  END IF;

  -- Idempotency check
  IF EXISTS (SELECT 1 FROM mission_claim_log WHERE user_id = v_user_id AND player_mission_id = p_player_mission_id) THEN
    RETURN jsonb_build_object('success', true, 'already_claimed', true);
  END IF;

  -- Load mission definition
  SELECT * INTO v_mission FROM daily_missions WHERE mission_id = v_pm.mission_id;

  -- Insert claim log (unique constraint guards duplicates)
  INSERT INTO mission_claim_log (user_id, player_mission_id, xp_granted, coins_granted)
  VALUES (v_user_id, p_player_mission_id, COALESCE(v_mission.reward_xp, 0), COALESCE(v_mission.reward_coins, 0))
  ON CONFLICT (user_id, player_mission_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'already_claimed', true);
  END IF;

  -- Mark claimed in player_missions
  UPDATE player_missions SET claimed_reward = true WHERE id = p_player_mission_id;

  -- Grant coins
  IF COALESCE(v_mission.reward_coins, 0) > 0 THEN
    UPDATE users SET coins = COALESCE(coins, 0) + v_mission.reward_coins WHERE id = v_user_id;
  END IF;

  -- Grant XP if progression enabled
  IF COALESCE(v_flag, false) AND COALESCE(v_mission.reward_xp, 0) > 0 THEN
    PERFORM grant_xp_internal(v_user_id, v_mission.reward_xp, 'mission', p_player_mission_id::text);
  ELSIF COALESCE(v_mission.reward_xp, 0) > 0 THEN
    -- Fallback: add directly to users.xp
    UPDATE users SET xp = COALESCE(xp, 0) + v_mission.reward_xp WHERE id = v_user_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'already_claimed', false,
    'xp_granted', COALESCE(v_mission.reward_xp, 0),
    'coins_granted', COALESCE(v_mission.reward_coins, 0)
  );
END;
$$;

-- ── update_spin_streak() ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_spin_streak(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today    date := (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date;
  v_row      spin_activity_streaks%ROWTYPE;
  v_new_streak int;
  v_flag     boolean;
BEGIN
  SELECT enabled INTO v_flag FROM engagement_flags WHERE flag = 'streak';
  IF NOT COALESCE(v_flag, false) THEN RETURN; END IF;

  INSERT INTO spin_activity_streaks (user_id, current_streak, longest_streak, last_spin_date, total_spins)
  VALUES (p_user_id, 0, 0, NULL, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_row FROM spin_activity_streaks WHERE user_id = p_user_id FOR UPDATE;

  -- Already updated today?
  IF v_row.last_spin_date = v_today THEN
    UPDATE spin_activity_streaks SET total_spins = total_spins + 1 WHERE user_id = p_user_id;
    RETURN;
  END IF;

  IF v_row.last_spin_date = v_today - INTERVAL '1 day' THEN
    v_new_streak := v_row.current_streak + 1;
  ELSE
    v_new_streak := 1;
  END IF;

  UPDATE spin_activity_streaks SET
    current_streak = v_new_streak,
    longest_streak = GREATEST(longest_streak, v_new_streak),
    last_spin_date = v_today,
    total_spins    = total_spins + 1,
    updated_at     = now()
  WHERE user_id = p_user_id;
END;
$$;
