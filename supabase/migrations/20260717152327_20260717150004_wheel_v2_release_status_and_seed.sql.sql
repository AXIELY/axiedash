/*
# Wheel V2 Release Safety — Status Constraint + Seed Runtime Settings

1. Replaces the status CHECK constraint to include both old and new status values
   for safe transition.
2. Migrates existing PUBLISHED rows to PUBLISHED_ACTIVE.
3. Seeds the single runtime_settings row with the existing active version.
4. Tightens the constraint to only allow new status values.
*/
ALTER TABLE wheel_v2_config_versions DROP CONSTRAINT IF EXISTS wheel_v2_config_versions_status_check;

-- Add constraint allowing both old and new values for transition
ALTER TABLE wheel_v2_config_versions
ADD CONSTRAINT wheel_v2_config_versions_status_check
CHECK (status IN ('DRAFT', 'PUBLISHED', 'PUBLISHED_ACTIVE', 'RELEASE_CANDIDATE', 'ARCHIVED', 'RELEASE_FAILED'));

-- Migrate existing PUBLISHED rows to PUBLISHED_ACTIVE
UPDATE wheel_v2_config_versions
SET status = 'PUBLISHED_ACTIVE'
WHERE status = 'PUBLISHED';

-- Seed runtime settings
INSERT INTO wheel_v2_runtime_settings (id, active_version_id, public_enabled, maintenance_mode, release_generation)
SELECT 1,
  (SELECT id FROM wheel_v2_config_versions WHERE status = 'PUBLISHED_ACTIVE' ORDER BY published_at DESC LIMIT 1),
  false,
  false,
  0
ON CONFLICT (id) DO NOTHING;

-- Now tighten constraint to only new values
ALTER TABLE wheel_v2_config_versions DROP CONSTRAINT wheel_v2_config_versions_status_check;

ALTER TABLE wheel_v2_config_versions
ADD CONSTRAINT wheel_v2_config_versions_status_check
CHECK (status IN ('DRAFT', 'RELEASE_CANDIDATE', 'PUBLISHED_ACTIVE', 'ARCHIVED', 'RELEASE_FAILED'));
