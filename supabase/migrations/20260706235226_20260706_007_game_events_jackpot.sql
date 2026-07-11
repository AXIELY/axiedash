-- Phase 6 + 8: Game Events (Lucky Hour / Golden Wheel) + Jackpot

-- ── game_events ───────────────────────────────────────────────────────────────
-- Status is derived from published + starts_at + ends_at — never stored
CREATE TABLE IF NOT EXISTS game_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      text NOT NULL CHECK (event_type IN ('lucky_hour', 'golden_wheel', 'double_xp', 'bonus_spins')),
  name_en         text NOT NULL,
  name_ar         text NOT NULL,
  description_en  text NOT NULL DEFAULT '',
  description_ar  text NOT NULL DEFAULT '',
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz NOT NULL,
  published       boolean NOT NULL DEFAULT false,
  config          jsonb NOT NULL DEFAULT '{}',  -- event-specific params (multiplier, etc.)
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

ALTER TABLE game_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "all_read_published_events" ON game_events
  FOR SELECT TO authenticated
  USING (published = true);

CREATE POLICY "admin_manage_game_events" ON game_events
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true));

CREATE INDEX IF NOT EXISTS idx_game_events_active ON game_events (starts_at, ends_at)
  WHERE published = true;

-- ── jackpot_rounds ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jackpot_rounds (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_amount      int NOT NULL DEFAULT 1000,
  current_amount   int NOT NULL DEFAULT 1000,
  contribution_pct numeric(5,4) NOT NULL DEFAULT 0.02,  -- 2% of each paid spin
  trigger_min      int NOT NULL DEFAULT 5000,           -- floor for random trigger check
  trigger_max      int NOT NULL DEFAULT 50000,
  settled          boolean NOT NULL DEFAULT false,
  winner_id        uuid REFERENCES auth.users(id),
  winner_spin_id   uuid REFERENCES spin_requests(id),
  won_at           timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE jackpot_rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "all_read_jackpot_rounds" ON jackpot_rounds
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin_manage_jackpot_rounds" ON jackpot_rounds
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true));

-- ── jackpot_contributions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jackpot_contributions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id     uuid NOT NULL REFERENCES jackpot_rounds(id) ON DELETE CASCADE,
  spin_id      uuid NOT NULL REFERENCES spin_requests(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount       int NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT jackpot_contributions_spin_unique UNIQUE (spin_id)
);

ALTER TABLE jackpot_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "all_read_jackpot_contributions" ON jackpot_contributions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin_manage_jackpot_contributions" ON jackpot_contributions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true));

-- Seed first jackpot round
INSERT INTO jackpot_rounds (seed_amount, current_amount)
VALUES (1000, 1000)
ON CONFLICT DO NOTHING;

-- ── contribute_to_jackpot() ───────────────────────────────────────────────────
-- Lightweight — only atomic increment, no lock
CREATE OR REPLACE FUNCTION contribute_to_jackpot(
  p_spin_id    uuid,
  p_user_id    uuid,
  p_spin_cost  int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_flag    boolean;
  v_round   jackpot_rounds%ROWTYPE;
  v_contrib int;
BEGIN
  SELECT enabled INTO v_flag FROM engagement_flags WHERE flag = 'jackpot';
  IF NOT COALESCE(v_flag, false) THEN RETURN; END IF;

  SELECT * INTO v_round FROM jackpot_rounds WHERE settled = false ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

  v_contrib := GREATEST(1, FLOOR(p_spin_cost * v_round.contribution_pct)::int);

  INSERT INTO jackpot_contributions (round_id, spin_id, user_id, amount)
  VALUES (v_round.id, p_spin_id, p_user_id, v_contrib)
  ON CONFLICT (spin_id) DO NOTHING;

  IF FOUND THEN
    -- Atomic increment — no row lock needed
    UPDATE jackpot_rounds SET current_amount = current_amount + v_contrib
    WHERE id = v_round.id;
  END IF;
END;
$$;

-- ── settle_jackpot() ─────────────────────────────────────────────────────────
-- Heavy settlement with FOR UPDATE lock; called only when jackpot triggers
CREATE OR REPLACE FUNCTION settle_jackpot(p_winner_spin_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round   jackpot_rounds%ROWTYPE;
  v_req     spin_requests%ROWTYPE;
  v_payout  int;
BEGIN
  SELECT * INTO v_round FROM jackpot_rounds WHERE settled = false ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_active_round');
  END IF;

  -- Guard: already settled between the lock acquisition and here? (race)
  IF v_round.settled THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_settled');
  END IF;

  SELECT * INTO v_req FROM spin_requests WHERE id = p_winner_spin_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'spin_not_found');
  END IF;

  v_payout := v_round.current_amount;

  -- Award jackpot to winner
  UPDATE users SET points = points + v_payout WHERE id = v_req.user_id;

  -- Settle round
  UPDATE jackpot_rounds SET
    settled      = true,
    winner_id    = v_req.user_id,
    winner_spin_id = p_winner_spin_id,
    won_at       = now()
  WHERE id = v_round.id;

  -- Seed next round
  INSERT INTO jackpot_rounds (seed_amount, current_amount)
  VALUES (v_round.seed_amount, v_round.seed_amount);

  RETURN jsonb_build_object(
    'success', true,
    'payout', v_payout,
    'winner_id', v_req.user_id
  );
END;
$$;

-- ── get_active_game_events() ──────────────────────────────────────────────────
-- Returns currently active events; status derived from timestamps
CREATE OR REPLACE FUNCTION get_active_game_events()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  RETURN (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', id,
        'event_type', event_type,
        'name_en', name_en,
        'name_ar', name_ar,
        'description_en', description_en,
        'description_ar', description_ar,
        'starts_at', starts_at,
        'ends_at', ends_at,
        'config', config,
        'status',
          CASE
            WHEN v_now < starts_at THEN 'upcoming'
            WHEN v_now BETWEEN starts_at AND ends_at THEN 'active'
            ELSE 'ended'
          END,
        'seconds_remaining',
          CASE
            WHEN v_now < starts_at THEN EXTRACT(EPOCH FROM (starts_at - v_now))::int
            WHEN v_now BETWEEN starts_at AND ends_at THEN EXTRACT(EPOCH FROM (ends_at - v_now))::int
            ELSE 0
          END
      )
    )
    FROM game_events
    WHERE published = true
      AND ends_at > v_now - INTERVAL '1 hour'  -- include recently ended for UI fade
    ORDER BY starts_at
  );
END;
$$;
