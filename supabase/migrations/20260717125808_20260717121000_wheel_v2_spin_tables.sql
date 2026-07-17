/*
# AXIE Wheel V2 — Spin Execution Tables

## Purpose
Creates the spin execution infrastructure: batch parent, child results,
free-spin usage tracking, Grand Prize progress, public winner events,
and leaderboard view.

## New Tables

### wheel_v2_spin_batches
Parent record for every spin request (1X is a batch of 1).
- id, user_id, client_request_id (UNIQUE per user)
- published_version_id (FK → wheel_v2_config_versions)
- requested_spin_count, free_spins_used, paid_spin_count
- single_spin_cost, total_cost
- points_before, points_after_cost, final_points
- status (pending|completed|failed), failure_code, created_at, completed_at
- UNIQUE(user_id, client_request_id) for idempotency

### wheel_v2_spin_results
Child results — one per spin within a batch.
- id, batch_id (FK), sequence_number (UNIQUE per batch)
- user_id, published_version_id
- draw_number (0-999999, secure random)
- probability_range_start, probability_range_end
- original_selected_prize_key, final_awarded_prize_key
- fallback_used, fallback_reason
- reward_grant_id (nullable, FK → reward_grants)
- payment_mode (free|paid), status, created_at

### wheel_v2_free_spin_usage
Persistent free-spin consumption per user per period.
- id, user_id, published_version_id, period_key
- spins_used (int, default 0)
- UNIQUE(user_id, published_version_id, period_key)

### wheel_v2_grand_prize_progress
Per-user Grand Prize progress.
- id, user_id, published_version_id
- completed_spins (int, default 0)
- unlocked (boolean, default false)
- unlocked_at (timestamptz, nullable)
- UNIQUE(user_id, published_version_id)

### wheel_v2_winner_events
Public winner events for the ticker.
- id, user_id, username_masked, prize_key, prize_name_ar, prize_name_en
- prize_rarity, reward_type, reward_display
- published_version_id, spin_result_id
- is_public, created_at

### wheel_v2_leaderboard
Materialized view for leaderboard queries.
- user_id, username, total_spins, total_points_won, rarity_score
- period_key, updated_at

## Security
- RLS on all tables.
- Users can read only their own batches/results/progress.
- Users can INSERT nothing directly — all writes via SECURITY DEFINER RPC.
- Admins can read all for audit.
- Winner events readable by all authenticated users (public ticker).

## Notes
1. Reuses existing `reward_grants` table for non-instant rewards.
2. Reuses existing `fulfillment_cases` pipeline for manual/service prizes.
3. Reuses `users.points` and `users.coins` — no duplicate balances.
4. Reuses `point_transactions` for audit ledger entries.
5. Reuses `economy_logs` for immutable economy audit.
*/

-- ═══════════════════════════════════════════════════════
-- Spin batches (parent)
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS wheel_v2_spin_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_request_id text NOT NULL,
  published_version_id uuid NOT NULL REFERENCES wheel_v2_config_versions(id),

  requested_spin_count int NOT NULL,
  free_spins_used int NOT NULL DEFAULT 0,
  paid_spin_count int NOT NULL DEFAULT 0,
  single_spin_cost int NOT NULL DEFAULT 0,
  total_cost int NOT NULL DEFAULT 0,

  points_before int NOT NULL DEFAULT 0,
  points_after_cost int NOT NULL DEFAULT 0,
  final_points int NOT NULL DEFAULT 0,

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'failed')),
  failure_code text,

  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,

  UNIQUE (user_id, client_request_id)
);

ALTER TABLE wheel_v2_spin_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_read_own_batches" ON wheel_v2_spin_batches;
CREATE POLICY "user_read_own_batches" ON wheel_v2_spin_batches
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "admin_read_all_batches" ON wheel_v2_spin_batches;
CREATE POLICY "admin_read_all_batches" ON wheel_v2_spin_batches
  FOR SELECT TO authenticated USING (is_current_user_admin());

-- No INSERT/UPDATE/DELETE policies for users — all via RPC

-- ═══════════════════════════════════════════════════════
-- Spin results (children)
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS wheel_v2_spin_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES wheel_v2_spin_batches(id) ON DELETE CASCADE,
  sequence_number int NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  published_version_id uuid NOT NULL REFERENCES wheel_v2_config_versions(id),

  draw_number int NOT NULL CHECK (draw_number >= 0 AND draw_number < 1000000),
  probability_range_start int NOT NULL,
  probability_range_end int NOT NULL,

  original_selected_prize_key text NOT NULL,
  final_awarded_prize_key text NOT NULL,
  fallback_used boolean NOT NULL DEFAULT false,
  fallback_reason text,

  reward_grant_id uuid REFERENCES reward_grants(id) ON DELETE SET NULL,

  payment_mode text NOT NULL DEFAULT 'paid'
    CHECK (payment_mode IN ('free', 'paid')),
  status text NOT NULL DEFAULT 'completed'
    CHECK (status IN ('completed', 'failed')),

  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (batch_id, sequence_number)
);

ALTER TABLE wheel_v2_spin_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_read_own_results" ON wheel_v2_spin_results;
CREATE POLICY "user_read_own_results" ON wheel_v2_spin_results
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "admin_read_all_results" ON wheel_v2_spin_results;
CREATE POLICY "admin_read_all_results" ON wheel_v2_spin_results
  FOR SELECT TO authenticated USING (is_current_user_admin());

-- ═══════════════════════════════════════════════════════
-- Free-spin usage
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS wheel_v2_free_spin_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  published_version_id uuid NOT NULL REFERENCES wheel_v2_config_versions(id),
  period_key text NOT NULL,
  spins_used int NOT NULL DEFAULT 0 CHECK (spins_used >= 0),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, published_version_id, period_key)
);

ALTER TABLE wheel_v2_free_spin_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_read_own_free_spins" ON wheel_v2_free_spin_usage;
CREATE POLICY "user_read_own_free_spins" ON wheel_v2_free_spin_usage
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "admin_read_all_free_spins" ON wheel_v2_free_spin_usage;
CREATE POLICY "admin_read_all_free_spins" ON wheel_v2_free_spin_usage
  FOR SELECT TO authenticated USING (is_current_user_admin());

-- ═══════════════════════════════════════════════════════
-- Grand Prize progress
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS wheel_v2_grand_prize_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  published_version_id uuid NOT NULL REFERENCES wheel_v2_config_versions(id),
  completed_spins int NOT NULL DEFAULT 0 CHECK (completed_spins >= 0),
  unlocked boolean NOT NULL DEFAULT false,
  unlocked_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, published_version_id)
);

ALTER TABLE wheel_v2_grand_prize_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_read_own_grand_prize" ON wheel_v2_grand_prize_progress;
CREATE POLICY "user_read_own_grand_prize" ON wheel_v2_grand_prize_progress
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "admin_read_all_grand_prize" ON wheel_v2_grand_prize_progress;
CREATE POLICY "admin_read_all_grand_prize" ON wheel_v2_grand_prize_progress
  FOR SELECT TO authenticated USING (is_current_user_admin());

-- ═══════════════════════════════════════════════════════
-- Public winner events (ticker)
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS wheel_v2_winner_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username_masked text NOT NULL,
  prize_key text NOT NULL,
  prize_name_ar text,
  prize_name_en text,
  prize_rarity text,
  reward_type text,
  reward_display text,

  published_version_id uuid NOT NULL REFERENCES wheel_v2_config_versions(id),
  spin_result_id uuid REFERENCES wheel_v2_spin_results(id) ON DELETE SET NULL,

  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE wheel_v2_winner_events ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read public winner events
DROP POLICY IF EXISTS "user_read_public_winners" ON wheel_v2_winner_events;
CREATE POLICY "user_read_public_winners" ON wheel_v2_winner_events
  FOR SELECT TO authenticated USING (is_public = true);

DROP POLICY IF EXISTS "admin_read_all_winners" ON wheel_v2_winner_events;
CREATE POLICY "admin_read_all_winners" ON wheel_v2_winner_events
  FOR SELECT TO authenticated USING (is_current_user_admin());

-- ═══════════════════════════════════════════════════════
-- Indexes
-- ═══════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_wv2_batches_user ON wheel_v2_spin_batches(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wv2_batches_version ON wheel_v2_spin_batches(published_version_id);
CREATE INDEX IF NOT EXISTS idx_wv2_results_user ON wheel_v2_spin_results(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wv2_results_batch ON wheel_v2_spin_results(batch_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_wv2_free_spin_user ON wheel_v2_free_spin_usage(user_id, published_version_id);
CREATE INDEX IF NOT EXISTS idx_wv2_grand_prize_user ON wheel_v2_grand_prize_progress(user_id, published_version_id);
CREATE INDEX IF NOT EXISTS idx_wv2_winners_public ON wheel_v2_winner_events(is_public, created_at DESC);

-- ═══════════════════════════════════════════════════════
-- Realtime for winner events
-- ═══════════════════════════════════════════════════════
ALTER PUBLICATION supabase_realtime ADD TABLE wheel_v2_winner_events;
ALTER PUBLICATION supabase_realtime ADD TABLE wheel_v2_spin_batches;
