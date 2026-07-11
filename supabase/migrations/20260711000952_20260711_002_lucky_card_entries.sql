-- ─────────────────────────────────────────────────
-- Lucky Card Entries  (one per user per round)
-- ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lucky_card_entries (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  round_id              uuid NOT NULL REFERENCES lucky_card_rounds(id) ON DELETE CASCADE,
  user_id               uuid NOT NULL,

  selected_card_number  integer NOT NULL,

  username_snapshot     text,
  avatar_url_snapshot   text,

  created_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT lce_unique_user_round UNIQUE (round_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_lce_round_id    ON lucky_card_entries(round_id);
CREATE INDEX IF NOT EXISTS idx_lce_user_id     ON lucky_card_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_lce_round_card  ON lucky_card_entries(round_id, selected_card_number);
CREATE INDEX IF NOT EXISTS idx_lce_created_at  ON lucky_card_entries(created_at DESC);

ALTER TABLE lucky_card_entries ENABLE ROW LEVEL SECURITY;

-- Users can read entries for active/published rounds (but NOT selected_card_number for other users)
-- We expose a safe view instead; the policy here just allows basic read for own entry
CREATE POLICY "lce_select_own" ON lucky_card_entries FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- After round is published, allow read of all entries (identity only — card number visible too after close)
CREATE POLICY "lce_select_published" ON lucky_card_entries FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM lucky_card_rounds
      WHERE id = round_id AND status IN ('published','drawn','closed')
    )
  );

-- Admin can see everything
CREATE POLICY "lce_admin_all" ON lucky_card_entries FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
  );

-- No direct INSERT from client — enforced via RPC only
-- (policy intentionally has no INSERT grant to anon/authenticated)
