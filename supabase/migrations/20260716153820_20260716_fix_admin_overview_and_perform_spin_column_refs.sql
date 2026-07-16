/*
# Fix column reference: game_logs.created_at -> game_logs.played_at

1. Problem
   - `get_wheel_admin_overview` references `game_logs.created_at` which does not exist
   - The correct column is `game_logs.played_at`

2. Fix
   - Recreate `get_wheel_admin_overview` with `played_at` references
*/

CREATE OR REPLACE FUNCTION get_wheel_admin_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today_start timestamptz := date_trunc('day', now() AT TIME ZONE 'Africa/Tripoli') AT TIME ZONE 'Africa/Tripoli';
  v_yesterday_start timestamptz;
  v_spins_today bigint := 0;
  v_spins_yesterday bigint := 0;
  v_active_users_today bigint := 0;
  v_prizes_today bigint := 0;
  v_prizes_yesterday bigint := 0;
  v_rare_wins_today bigint := 0;
  v_pending_fulfillments bigint := 0;
  v_settings jsonb;
  v_flags jsonb;
BEGIN
  IF NOT is_current_user_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin authorization required');
  END IF;

  v_yesterday_start := v_today_start - interval '1 day';

  SELECT COUNT(*) INTO v_spins_today
  FROM game_logs WHERE game_type = 'wheel' AND played_at >= v_today_start;

  SELECT COUNT(*) INTO v_spins_yesterday
  FROM game_logs WHERE game_type = 'wheel'
  AND played_at >= v_yesterday_start AND played_at < v_today_start;

  SELECT COUNT(DISTINCT user_id) INTO v_active_users_today
  FROM game_logs WHERE game_type = 'wheel' AND played_at >= v_today_start;

  SELECT COUNT(*) INTO v_prizes_today
  FROM game_logs WHERE game_type = 'wheel' AND result = 'win' AND played_at >= v_today_start;

  SELECT COUNT(*) INTO v_prizes_yesterday
  FROM game_logs WHERE game_type = 'wheel' AND result = 'win'
  AND played_at >= v_yesterday_start AND played_at < v_today_start;

  SELECT COUNT(*) INTO v_rare_wins_today
  FROM game_logs
  WHERE game_type = 'wheel' AND result = 'win' AND played_at >= v_today_start
  AND (result_data->>'type') NOT IN ('miss', 'points');

  SELECT COUNT(*) INTO v_pending_fulfillments
  FROM wheel_fulfillment_queue WHERE status IN ('granted', 'claimed', 'processing');

  SELECT to_jsonb(w) INTO v_settings FROM wheel_game_settings w LIMIT 1;
  SELECT jsonb_object_agg(flag_name, enabled) INTO v_flags FROM engagement_flags;

  RETURN jsonb_build_object(
    'success', true,
    'spins_today', v_spins_today,
    'spins_yesterday', v_spins_yesterday,
    'active_users_today', v_active_users_today,
    'prizes_today', v_prizes_today,
    'prizes_yesterday', v_prizes_yesterday,
    'rare_wins_today', v_rare_wins_today,
    'rare_rate_today', CASE WHEN v_spins_today > 0
      THEN ROUND((v_rare_wins_today::numeric / v_spins_today) * 100, 2) ELSE 0 END,
    'pending_fulfillments', v_pending_fulfillments,
    'settings', v_settings,
    'flags', COALESCE(v_flags, '{}'::jsonb)
  );
END;
$$;
