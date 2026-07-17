/*
# Wheel V2 Release Safety — Runtime Tables (DDL)

Creates the three core tables for the release pipeline.
*/
CREATE TABLE IF NOT EXISTS wheel_v2_runtime_settings (
  id integer PRIMARY KEY DEFAULT 1,
  active_version_id uuid,
  previous_active_version_id uuid,
  public_enabled boolean NOT NULL DEFAULT false,
  maintenance_mode boolean NOT NULL DEFAULT false,
  release_generation integer NOT NULL DEFAULT 0,
  active_snapshot_checksum text,
  activated_at timestamptz,
  last_health_check_at timestamptz,
  consecutive_critical_failures integer NOT NULL DEFAULT 0,
  circuit_breaker_threshold integer NOT NULL DEFAULT 5,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT single_row_only CHECK (id = 1)
);

ALTER TABLE wheel_v2_runtime_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_manage_runtime_settings" ON wheel_v2_runtime_settings;
CREATE POLICY "admins_manage_runtime_settings"
  ON wheel_v2_runtime_settings FOR ALL
  TO authenticated
  USING (is_current_user_admin())
  WITH CHECK (is_current_user_admin());

DROP POLICY IF EXISTS "users_read_runtime_status" ON wheel_v2_runtime_settings;
CREATE POLICY "users_read_runtime_status"
  ON wheel_v2_runtime_settings FOR SELECT
  TO authenticated USING (true);
