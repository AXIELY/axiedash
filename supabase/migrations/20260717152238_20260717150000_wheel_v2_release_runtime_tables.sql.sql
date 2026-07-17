/*
# Wheel V2 Release Safety — Runtime Tables

1. New Tables
- `wheel_v2_runtime_settings`: Single-row authoritative runtime pointer.
  Contains active_version_id, previous_active_version_id, public_enabled,
  maintenance_mode, release_generation, active_snapshot_checksum,
  circuit breaker counters, and audit timestamps.
- `wheel_v2_release_snapshots`: Immutable compiled snapshots for each
  release candidate. Stores the full JSON snapshot, checksum, schema version,
  and renderer contract version.
- `wheel_v2_release_audits`: Audit log for every release operation including
  validation results, activation, rollback, and failure diagnostics.

2. Security
- RLS enabled on all three tables.
- Runtime settings: admins read/write, users read (for public_enabled + maintenance_mode).
- Release snapshots: admins read/write, users cannot read (private during validation).
- Release audits: admins only.
- All policies use auth.uid() + is_current_user_admin().
*/
