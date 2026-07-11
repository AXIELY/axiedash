-- ─────────────────────────────────────────────────
-- Lucky Card Rounds  (production round-based game)
-- ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lucky_card_rounds (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                  text UNIQUE,

  title                 text NOT NULL,
  description           text,
  prize_title           text NOT NULL,
  prize_description     text,
  prize_image_url       text,

  total_cards           integer NOT NULL DEFAULT 5,

  starts_at             timestamptz NOT NULL,
  closes_at             timestamptz NOT NULL,
  draw_at               timestamptz,

  status                text NOT NULL DEFAULT 'draft',

  winning_card_number   integer,
  winner_user_id        uuid,

  draw_mode             text NOT NULL DEFAULT 'manual_card',
  empty_card_policy     text NOT NULL DEFAULT 'redraw_until_nonempty',

  fulfillment_required  boolean NOT NULL DEFAULT true,
  fulfillment_case_id   uuid,

  drawn_at              timestamptz,
  published_at          timestamptz,
  created_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT lcr_status_check         CHECK (status IN ('draft','active','closed','drawn','published','cancelled')),
  CONSTRAINT lcr_draw_mode_check      CHECK (draw_mode IN ('manual_card','random_card')),
  CONSTRAINT lcr_empty_policy_check   CHECK (empty_card_policy IN ('redraw_until_nonempty','no_winner')),
  CONSTRAINT lcr_total_cards_min      CHECK (total_cards >= 2),
  CONSTRAINT lcr_winning_card_valid   CHECK (winning_card_number IS NULL OR (winning_card_number >= 1 AND winning_card_number <= total_cards)),
  CONSTRAINT lcr_dates_valid          CHECK (starts_at < closes_at)
);

CREATE INDEX IF NOT EXISTS idx_lcr_status      ON lucky_card_rounds(status);
CREATE INDEX IF NOT EXISTS idx_lcr_starts_at   ON lucky_card_rounds(starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_lcr_created_at  ON lucky_card_rounds(created_at DESC);

ALTER TABLE lucky_card_rounds ENABLE ROW LEVEL SECURITY;

-- Public can read active/published/closed/drawn rounds
CREATE POLICY "lcr_select_public" ON lucky_card_rounds FOR SELECT
  TO authenticated
  USING (status IN ('active','closed','drawn','published'));

-- Admin full access
CREATE POLICY "lcr_admin_all" ON lucky_card_rounds FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true)
  );

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION lcr_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_lcr_updated_at ON lucky_card_rounds;
CREATE TRIGGER trg_lcr_updated_at
  BEFORE UPDATE ON lucky_card_rounds
  FOR EACH ROW EXECUTE FUNCTION lcr_set_updated_at();
