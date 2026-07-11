-- Phase 1: Spin Core V2 Tables
-- Replaces client-side weightedPick with server-authoritative perform_spin() RPC

-- ── wheel_config_versions ──────────────────────────────────────────────────────
-- Immutable snapshot of wheel settings at the time of each spin
CREATE TABLE IF NOT EXISTS wheel_config_versions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settings_id uuid NOT NULL,  -- references wheel_game_settings.id (loose FK, settings may change)
  prizes      jsonb NOT NULL,
  spin_cost   int NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE wheel_config_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manage_wheel_config_versions" ON wheel_config_versions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true));

CREATE POLICY "users_read_wheel_config_versions" ON wheel_config_versions
  FOR SELECT TO authenticated USING (true);

-- ── spin_requests ──────────────────────────────────────────────────────────────
-- One row per spin attempt; client_request_id makes spins idempotent
CREATE TABLE IF NOT EXISTS spin_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_request_id uuid NOT NULL,
  config_version_id uuid REFERENCES wheel_config_versions(id),
  spin_type         text NOT NULL DEFAULT 'free' CHECK (spin_type IN ('free', 'paid', 'credit')),
  points_deducted   int NOT NULL DEFAULT 0,
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT spin_requests_user_idempotency UNIQUE (user_id, client_request_id)
);

ALTER TABLE spin_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_spin_requests" ON spin_requests
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "users_insert_own_spin_requests" ON spin_requests
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "admin_all_spin_requests" ON spin_requests
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true));

-- ── spin_results ───────────────────────────────────────────────────────────────
-- One row per completed spin; prize selected server-side
CREATE TABLE IF NOT EXISTS spin_results (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spin_request_id uuid NOT NULL REFERENCES spin_requests(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prize_id        text NOT NULL,
  prize_type      text NOT NULL,
  prize_value     text NOT NULL DEFAULT '0',
  prize_name_ar   text NOT NULL DEFAULT '',
  prize_name_en   text NOT NULL DEFAULT '',
  points_awarded  int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT spin_results_one_per_request UNIQUE (spin_request_id)
);

ALTER TABLE spin_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_spin_results" ON spin_results
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "admin_all_spin_results" ON spin_results
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true));

-- ── reward_grants ──────────────────────────────────────────────────────────────
-- Tracks non-instant rewards (service prizes, grand prizes) pending fulfillment
CREATE TABLE IF NOT EXISTS reward_grants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  spin_request_id uuid REFERENCES spin_requests(id),
  grant_type      text NOT NULL, -- 'points' | 'service' | 'grand' | 'xp' | 'coins'
  grant_value     text NOT NULL,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'cancelled')),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reward_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_reward_grants" ON reward_grants
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "admin_all_reward_grants" ON reward_grants
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true));

-- ── spin_credits ───────────────────────────────────────────────────────────────
-- Explicit spin credit ledger (bonus spins from events, promos, etc.)
CREATE TABLE IF NOT EXISTS spin_credits (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  balance     int NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT spin_credits_user_unique UNIQUE (user_id)
);

ALTER TABLE spin_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_spin_credits" ON spin_credits
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "admin_all_spin_credits" ON spin_credits
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true));

-- ── game_event_outbox ──────────────────────────────────────────────────────────
-- Transactional outbox for async engagement event processing
CREATE TABLE IF NOT EXISTS game_event_outbox (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      text NOT NULL, -- 'spin_completed' | 'mission_progress' | etc.
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payload         jsonb NOT NULL DEFAULT '{}',
  processed       boolean NOT NULL DEFAULT false,
  processed_at    timestamptz,
  attempts        int NOT NULL DEFAULT 0,
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE game_event_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_outbox" ON game_event_outbox
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true));

-- Index for outbox processor polling
CREATE INDEX IF NOT EXISTS idx_outbox_unprocessed ON game_event_outbox (created_at)
  WHERE processed = false;
CREATE INDEX IF NOT EXISTS idx_spin_requests_user ON spin_requests (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_spin_results_user ON spin_results (user_id, created_at DESC);
