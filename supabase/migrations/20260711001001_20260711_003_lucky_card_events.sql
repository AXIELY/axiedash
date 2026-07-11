-- ─────────────────────────────────────────────────
-- Lucky Card Events  (audit log)
-- ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lucky_card_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id        uuid NOT NULL REFERENCES lucky_card_rounds(id) ON DELETE CASCADE,
  event_type      text NOT NULL,
  actor_user_id   uuid,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lcev_round_id   ON lucky_card_events(round_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lcev_event_type ON lucky_card_events(event_type);

ALTER TABLE lucky_card_events ENABLE ROW LEVEL SECURITY;

-- Admins can read/write all
CREATE POLICY "lcev_admin_all" ON lucky_card_events FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
  );

-- No public read of audit events (intentional)
