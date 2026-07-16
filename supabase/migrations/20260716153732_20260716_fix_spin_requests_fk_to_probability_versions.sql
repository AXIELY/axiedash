/*
# Fix spin_requests FK to reference wheel_probability_versions

1. Problem
   - `spin_requests.config_version_id` has a FK pointing to `wheel_config_versions`
   - The new `perform_spin_batch` RPC inserts `v_version.id` from `wheel_probability_versions`
   - This causes FK violation error 23503 on every spin

2. Fix
   - Drop the old FK constraint on `spin_requests.config_version_id`
   - Add a new FK referencing `wheel_probability_versions(id)` instead

3. Important
   - This is non-destructive: no data is dropped or altered
   - Existing rows with old config_version_id values will not be re-validated (NOT VALID)
*/

-- Drop old FK
ALTER TABLE spin_requests
  DROP CONSTRAINT IF EXISTS spin_requests_config_version_id_fkey;

-- Add correct FK to wheel_probability_versions
ALTER TABLE spin_requests
  ADD CONSTRAINT spin_requests_config_version_id_fkey
  FOREIGN KEY (config_version_id) REFERENCES wheel_probability_versions(id)
  NOT VALID;
