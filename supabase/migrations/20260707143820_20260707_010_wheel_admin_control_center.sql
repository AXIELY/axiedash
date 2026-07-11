/*
# Wheel Admin Control Center — Supporting Tables & RPCs

## Purpose
Adds backend tables and RPCs for the AXIE Lucky Spin Admin Control Center.
Admin authorization uses: EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)

## New Tables
- wheel_fulfillment_queue: manual prize delivery tracking (granted→processing→fulfilled)
- wheel_fulfillment_status_log: append-only status transition audit trail
- wheel_admin_audit_log: append-only admin action log with old/new value diffs

## New RPCs
- get_wheel_admin_overview(): KPI dashboard data (admin-only)
- log_admin_action(): writes to audit log, verifies admin identity server-side

## Security
- All tables: RLS enabled, admin-only write, users see own fulfillment records only
- Audit log: INSERT only (no UPDATE/DELETE policies), immutable once written
*/

-- ── Helper function ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION is_current_user_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
$$;

-- ── Fulfillment Queue ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wheel_fulfillment_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spin_reference text,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL DEFAULT '',
  prize_id text NOT NULL DEFAULT '',
  prize_name_ar text NOT NULL DEFAULT '',
  prize_name_en text NOT NULL DEFAULT '',
  prize_type text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'granted'
    CHECK (status IN ('granted', 'claimed', 'processing', 'fulfilled', 'cancelled')),
  assigned_admin_id uuid REFERENCES auth.users(id),
  assigned_admin_name text,
  fulfillment_note text,
  internal_note text,
  expected_delivery_hours int NOT NULL DEFAULT 24,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE wheel_fulfillment_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_all_fulfillment" ON wheel_fulfillment_queue;
CREATE POLICY "admins_all_fulfillment" ON wheel_fulfillment_queue
  FOR ALL TO authenticated
  USING (is_current_user_admin())
  WITH CHECK (is_current_user_admin());

DROP POLICY IF EXISTS "users_view_own_fulfillment" ON wheel_fulfillment_queue;
CREATE POLICY "users_view_own_fulfillment" ON wheel_fulfillment_queue
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_fulfillment_queue_user ON wheel_fulfillment_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_fulfillment_queue_status ON wheel_fulfillment_queue(status);
CREATE INDEX IF NOT EXISTS idx_fulfillment_queue_created ON wheel_fulfillment_queue(created_at DESC);

-- ── Fulfillment Status Log ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wheel_fulfillment_status_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fulfillment_id uuid NOT NULL REFERENCES wheel_fulfillment_queue(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL REFERENCES auth.users(id),
  admin_name text,
  from_status text,
  to_status text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE wheel_fulfillment_status_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_select_fulfillment_log" ON wheel_fulfillment_status_log;
CREATE POLICY "admins_select_fulfillment_log" ON wheel_fulfillment_status_log
  FOR SELECT TO authenticated USING (is_current_user_admin());

DROP POLICY IF EXISTS "admins_insert_fulfillment_log" ON wheel_fulfillment_status_log;
CREATE POLICY "admins_insert_fulfillment_log" ON wheel_fulfillment_status_log
  FOR INSERT TO authenticated WITH CHECK (is_current_user_admin());

CREATE INDEX IF NOT EXISTS idx_fulfillment_log_fid ON wheel_fulfillment_status_log(fulfillment_id, created_at DESC);

-- ── Admin Audit Log ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wheel_admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES auth.users(id),
  admin_username text NOT NULL DEFAULT '',
  action_type text NOT NULL,
  entity_type text,
  entity_id text,
  change_summary text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE wheel_admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_select_audit" ON wheel_admin_audit_log;
CREATE POLICY "admins_select_audit" ON wheel_admin_audit_log
  FOR SELECT TO authenticated USING (is_current_user_admin());

DROP POLICY IF EXISTS "admins_insert_audit" ON wheel_admin_audit_log;
CREATE POLICY "admins_insert_audit" ON wheel_admin_audit_log
  FOR INSERT TO authenticated WITH CHECK (is_current_user_admin());

CREATE INDEX IF NOT EXISTS idx_audit_log_created ON wheel_admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON wheel_admin_audit_log(action_type);

-- ── log_admin_action RPC ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION log_admin_action(
  p_action_type text,
  p_entity_type text DEFAULT NULL,
  p_entity_id text DEFAULT NULL,
  p_change_summary text DEFAULT NULL,
  p_old_value jsonb DEFAULT NULL,
  p_new_value jsonb DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin_username text;
BEGIN
  IF NOT is_current_user_admin() THEN
    RAISE EXCEPTION 'Admin authorization required';
  END IF;
  SELECT username INTO v_admin_username FROM users WHERE id = auth.uid();
  INSERT INTO wheel_admin_audit_log (
    admin_id, admin_username, action_type, entity_type, entity_id,
    change_summary, old_value, new_value
  ) VALUES (
    auth.uid(), COALESCE(v_admin_username, 'admin'),
    p_action_type, p_entity_type, p_entity_id,
    p_change_summary, p_old_value, p_new_value
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION log_admin_action FROM anon;
GRANT EXECUTE ON FUNCTION log_admin_action TO authenticated;

-- ── get_wheel_admin_overview RPC ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_wheel_admin_overview()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    FROM game_logs WHERE game_type = 'wheel' AND created_at >= v_today_start;
  SELECT COUNT(*) INTO v_spins_yesterday
    FROM game_logs WHERE game_type = 'wheel'
    AND created_at >= v_yesterday_start AND created_at < v_today_start;

  SELECT COUNT(DISTINCT user_id) INTO v_active_users_today
    FROM game_logs WHERE game_type = 'wheel' AND created_at >= v_today_start;

  SELECT COUNT(*) INTO v_prizes_today
    FROM game_logs WHERE game_type = 'wheel' AND result = 'win' AND created_at >= v_today_start;
  SELECT COUNT(*) INTO v_prizes_yesterday
    FROM game_logs WHERE game_type = 'wheel' AND result = 'win'
    AND created_at >= v_yesterday_start AND created_at < v_today_start;

  SELECT COUNT(*) INTO v_rare_wins_today
    FROM game_logs
    WHERE game_type = 'wheel' AND result = 'win' AND created_at >= v_today_start
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

REVOKE EXECUTE ON FUNCTION get_wheel_admin_overview FROM anon;
GRANT EXECUTE ON FUNCTION get_wheel_admin_overview TO authenticated;
