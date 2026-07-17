/*
# Wheel V2 Release Safety — Release Snapshots Table

Immutable compiled snapshots for release candidates.
*/
CREATE TABLE IF NOT EXISTS wheel_v2_release_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES wheel_v2_config_versions(id) ON DELETE CASCADE,
  publish_request_id text NOT NULL,
  snapshot_checksum text NOT NULL,
  snapshot_data jsonb NOT NULL,
  required_schema_version integer NOT NULL DEFAULT 2,
  renderer_contract_version integer NOT NULL DEFAULT 1,
  prize_count integer NOT NULL DEFAULT 0,
  total_ppm bigint NOT NULL DEFAULT 0,
  compiled_at timestamptz NOT NULL DEFAULT now(),
  compiled_by uuid,
  CONSTRAINT unique_publish_request UNIQUE (publish_request_id)
);

ALTER TABLE wheel_v2_release_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_manage_snapshots" ON wheel_v2_release_snapshots;
CREATE POLICY "admins_manage_snapshots"
  ON wheel_v2_release_snapshots FOR ALL
  TO authenticated
  USING (is_current_user_admin())
  WITH CHECK (is_current_user_admin());
