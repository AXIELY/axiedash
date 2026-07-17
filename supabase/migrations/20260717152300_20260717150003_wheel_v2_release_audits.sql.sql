/*
# Wheel V2 Release Safety — Release Audits Table

Audit log for every release operation.
*/
CREATE TABLE IF NOT EXISTS wheel_v2_release_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publish_request_id text,
  action text NOT NULL,
  version_id uuid,
  candidate_version_id uuid,
  active_version_id uuid,
  previous_active_version_id uuid,
  release_generation integer,
  snapshot_checksum text,
  validation_result jsonb,
  error_code text,
  error_details jsonb,
  admin_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE wheel_v2_release_audits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_read_release_audits" ON wheel_v2_release_audits;
CREATE POLICY "admins_read_release_audits"
  ON wheel_v2_release_audits FOR SELECT
  TO authenticated USING (is_current_user_admin());

DROP POLICY IF EXISTS "admins_insert_release_audits" ON wheel_v2_release_audits;
CREATE POLICY "admins_insert_release_audits"
  ON wheel_v2_release_audits FOR INSERT
  TO authenticated WITH CHECK (is_current_user_admin());
