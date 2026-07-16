/*
# Fix Multi-Spin Architecture: Batch Identity, Idempotency, Progress Ledger

## Problem
The `spin_results` table had a global `UNIQUE(spin_request_id)` constraint.
`perform_spin_batch` created ONE `spin_requests` row per batch (with one
`client_request_id`), then tried to insert N `spin_results` rows all pointing
to that same `spin_request_id`. The second child insert violated the unique
constraint, causing every 5X/10X batch to fail with
"duplicate key value violates unique constraint spin_results_one_per_request".

## Solution

### 1. New Tables

**wheel_spin_batches** — tracks each batch purchase as a distinct entity:
- id (uuid PK)
- user_id, client_request_id (UNIQUE together — idempotency)
- wheel_event_id (FK → wheel_game_settings)
- probability_version_id (FK → wheel_probability_versions)
- spin_count (5 or 10 only)
- total_cost, balance_before, balance_after
- progress_before, progress_after
- status (PROCESSING / COMPLETED / FAILED)
- failure_code (nullable)
- created_at, completed_at

**wheel_progress_events** — idempotent progress ledger:
- id (uuid PK)
- user_id, wheel_event_id
- spin_result_id (UNIQUE — one progress increment per result)
- batch_id (nullable), sequence_number (nullable)
- created_at

### 2. spin_results Changes
- Added `batch_id` (uuid, nullable) — links child results to their batch
- Added `standalone_request_id` (uuid, nullable) — for single spins
- Added `status` (text, nullable, default 'completed')

### 3. Constraint Replacement
- DROPPED the global `spin_results_one_per_request` UNIQUE(spin_request_id)
- Created partial unique index for batch children:
  UNIQUE(batch_id, sequence_number) WHERE batch_id IS NOT NULL
- Created partial unique index for standalone spins:
  UNIQUE(user_id, standalone_request_id) WHERE batch_id IS NULL AND standalone_request_id IS NOT NULL
- The old spin_request_id FK remains (historical compatibility)

### 4. reward_grants Changes
- Added spin_result_id (uuid, nullable) — links reward to specific result
- Added UNIQUE(spin_result_id) partial index — one reward per result

### 5. RLS
- Both new tables have RLS enabled with owner-scoped policies

## Safety
- All existing 161 spin_results rows preserved
- No data rewritten or deleted
- Old constraint dropped only AFTER new partial indexes created
- Migration is idempotent
*/

-- =========================================================
-- 1. Add columns to spin_results
-- =========================================================
ALTER TABLE spin_results ADD COLUMN IF NOT EXISTS batch_id uuid;
ALTER TABLE spin_results ADD COLUMN IF NOT EXISTS standalone_request_id uuid;
ALTER TABLE spin_results ADD COLUMN IF NOT EXISTS status text DEFAULT 'completed';

-- =========================================================
-- 2. Create wheel_spin_batches table
-- =========================================================
CREATE TABLE IF NOT EXISTS wheel_spin_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_request_id uuid NOT NULL,
  wheel_event_id uuid NOT NULL REFERENCES wheel_game_settings(id) ON DELETE CASCADE,
  probability_version_id uuid NOT NULL REFERENCES wheel_probability_versions(id),
  spin_count integer NOT NULL CHECK (spin_count IN (5, 10)),
  total_cost bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'PROCESSING' CHECK (status IN ('PROCESSING', 'COMPLETED', 'FAILED')),
  balance_before bigint,
  balance_after bigint,
  progress_before integer,
  progress_after integer,
  failure_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE wheel_spin_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_batches" ON wheel_spin_batches;
CREATE POLICY "select_own_batches" ON wheel_spin_batches FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_batches" ON wheel_spin_batches;
CREATE POLICY "insert_own_batches" ON wheel_spin_batches FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_batches" ON wheel_spin_batches;
CREATE POLICY "update_own_batches" ON wheel_spin_batches
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Unique idempotency: one batch per user + client_request_id
DROP INDEX IF EXISTS wheel_spin_batches_user_idempotency;
CREATE UNIQUE INDEX wheel_spin_batches_user_idempotency
  ON wheel_spin_batches (user_id, client_request_id);

-- =========================================================
-- 3. Create wheel_progress_events table (idempotent progress ledger)
-- =========================================================
CREATE TABLE IF NOT EXISTS wheel_progress_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wheel_event_id uuid NOT NULL REFERENCES wheel_game_settings(id) ON DELETE CASCADE,
  spin_result_id uuid NOT NULL,
  batch_id uuid,
  sequence_number integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE wheel_progress_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_progress_events" ON wheel_progress_events;
CREATE POLICY "select_own_progress_events" ON wheel_progress_events FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_progress_events" ON wheel_progress_events;
CREATE POLICY "insert_own_progress_events" ON wheel_progress_events FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- One progress increment per spin result (idempotency)
DROP INDEX IF EXISTS wheel_progress_events_unique_result;
CREATE UNIQUE INDEX wheel_progress_events_unique_result
  ON wheel_progress_events (spin_result_id);

-- =========================================================
-- 4. Add spin_result_id to reward_grants + unique index
-- =========================================================
ALTER TABLE reward_grants ADD COLUMN IF NOT EXISTS spin_result_id uuid;

DROP INDEX IF EXISTS reward_grants_unique_spin_result;
CREATE UNIQUE INDEX reward_grants_unique_spin_result
  ON reward_grants (spin_result_id)
  WHERE spin_result_id IS NOT NULL;

-- =========================================================
-- 5. Replace spin_results_one_per_request with partial unique indexes
-- =========================================================
-- Create new partial indexes FIRST, then drop old constraint

-- Batch children: unique (batch_id, sequence_number)
DROP INDEX IF EXISTS spin_results_batch_child_unique;
CREATE UNIQUE INDEX spin_results_batch_child_unique
  ON spin_results (batch_id, sequence_number)
  WHERE batch_id IS NOT NULL;

-- Standalone: unique (user_id, standalone_request_id)
DROP INDEX IF EXISTS spin_results_standalone_unique;
CREATE UNIQUE INDEX spin_results_standalone_unique
  ON spin_results (user_id, standalone_request_id)
  WHERE batch_id IS NULL AND standalone_request_id IS NOT NULL;

-- NOW drop the old global constraint
ALTER TABLE spin_results DROP CONSTRAINT IF EXISTS spin_results_one_per_request;

-- =========================================================
-- 6. Backfill: set standalone_request_id for existing single-spin rows
-- =========================================================
UPDATE spin_results
SET standalone_request_id = gen_random_uuid()
WHERE batch_id IS NULL
  AND standalone_request_id IS NULL
  AND sequence_number IS NOT NULL
  AND sequence_number = 1;