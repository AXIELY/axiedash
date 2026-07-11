-- Phase 9: Consolidated get_game_home_state() RPC
-- Single round-trip read model for the game home page
-- Returns: user profile, progression, spin state, active events, jackpot, combo, streak

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
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthenticated');
  END IF;

  -- Load user
  SELECT * INTO v_user FROM users WHERE id = v_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  -- Load feature flags
  SELECT jsonb_object_agg(flag, enabled) INTO v_flags FROM engagement_flags;

  -- Load wheel settings
  SELECT * INTO v_settings FROM wheel_game_settings WHERE active = true LIMIT 1;

  -- Count spins today
  SELECT COUNT(*) INTO v_spins_today
  FROM spin_requests
  WHERE user_id = v_user_id AND status = 'completed'
    AND created_at >= (v_today::timestamptz AT TIME ZONE 'UTC');

  -- Spin credits
  SELECT COALESCE(balance, 0) INTO v_spin_credits FROM spin_credits WHERE user_id = v_user_id;

  -- Spin streak
  SELECT * INTO v_streak FROM spin_activity_streaks WHERE user_id = v_user_id;

  -- Combo state
  SELECT * INTO v_combo FROM user_combo_state WHERE user_id = v_user_id;

  -- Jackpot
  SELECT * INTO v_jackpot FROM jackpot_rounds WHERE settled = false ORDER BY created_at DESC LIMIT 1;

  -- Progression
  SELECT * INTO v_level_def FROM level_definitions WHERE level = COALESCE(v_user.level, 1);
  SELECT * INTO v_next_level FROM level_definitions WHERE level = COALESCE(v_user.level, 1) + 1;
  SELECT * INTO v_rank_def FROM rank_definitions
  WHERE min_level <= COALESCE(v_user.level, 1) ORDER BY rank_order DESC LIMIT 1;

  -- Active events
  SELECT get_active_game_events() INTO v_events;

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
      'rank_color', COALESCE(v_rank_def.color_hex, '#888888'),
      'rank_icon', COALESCE(v_rank_def.icon, 'star'),
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
    'active_events', COALESCE(v_events, '[]'::jsonb)
  );
END;
$$;
