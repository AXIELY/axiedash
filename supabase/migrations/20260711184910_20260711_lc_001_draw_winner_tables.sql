/*
# Lucky Card Draw System — Tables & Schema Extensions

## Summary
Extends the existing Lucky Card system to support N winners per round with a complete
draw lifecycle (determine winning card → eligible pool → random N winners → review → publish).

## Changes

### 1. lucky_card_rounds — extended
- Added `winners_count` (integer, default 1) — how many winners to draw
- Extended `empty_card_policy` constraint to include the new policies:
  NO_WINNER | CHOOSE_ANOTHER_CARD | RANDOM_FROM_NON_EMPTY_CARDS
  (Legacy `redraw_until_nonempty` and `no_winner` remain valid for backward compat)
- `fulfillment_case_id` kept for single-winner legacy compat; per-winner cases live in lucky_card_winners

### 2. lucky_card_draws (NEW)
One draw record per round. Tracks the draw execution metadata and status.

### 3. lucky_card_winners (NEW)
One row per winner selected in a draw. Each winner gets their own fulfillment case.

## Security
- RLS enabled on both new tables
- Users can read published draws/winners only
- All writes happen through protected RPCs only (SECURITY DEFINER)
*/

-- ─── Extend lucky_card_rounds ─────────────────────────────────────────────────

ALTER TABLE lucky_card_rounds
  ADD COLUMN IF NOT EXISTS winners_count integer NOT NULL DEFAULT 1;

-- Drop the old constraint and add an extended one that covers all policy names
ALTER TABLE lucky_card_rounds
  DROP CONSTRAINT IF EXISTS lcr_empty_policy_check;

ALTER TABLE lucky_card_rounds
  ADD CONSTRAINT lcr_empty_policy_check CHECK (
    empty_card_policy IN (
      'redraw_until_nonempty',  -- legacy
      'no_winner',              -- legacy
      'NO_WINNER',
      'CHOOSE_ANOTHER_CARD',
      'RANDOM_FROM_NON_EMPTY_CARDS'
    )
  );

-- ─── lucky_card_draws ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lucky_card_draws (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id                   uuid NOT NULL UNIQUE REFERENCES lucky_card_rounds(id) ON DELETE CASCADE,

  -- Winning card tracking
  original_winning_card_number  integer,
  final_winning_card_number     integer,
  winning_card_mode             text NOT NULL,   -- 'manual_card' | 'random_card'
  empty_card_policy             text NOT NULL,

  -- Winner counts
  requested_winners_count    integer NOT NULL,
  eligible_count             integer NOT NULL,
  selected_winners_count     integer NOT NULL,

  -- Status
  draw_status                text NOT NULL DEFAULT 'DRAWN',
  -- DRAWN | PUBLISHED | VOIDED

  -- Audit
  executed_by                uuid NOT NULL,
  executed_at                timestamptz NOT NULL DEFAULT now(),
  published_at               timestamptz,
  voided_at                  timestamptz,
  voided_by                  uuid,
  void_reason                text,

  candidate_set_hash         text,
  metadata                   jsonb NOT NULL DEFAULT '{}',
  created_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lcd_round_id    ON lucky_card_draws(round_id);
CREATE INDEX IF NOT EXISTS idx_lcd_status      ON lucky_card_draws(draw_status);

ALTER TABLE lucky_card_draws ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lcd_admin_all" ON lucky_card_draws;
CREATE POLICY "lcd_admin_all" ON lucky_card_draws FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true));

DROP POLICY IF EXISTS "lcd_select_published" ON lucky_card_draws;
CREATE POLICY "lcd_select_published" ON lucky_card_draws FOR SELECT
  TO authenticated
  USING (draw_status = 'PUBLISHED');

-- ─── lucky_card_winners ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lucky_card_winners (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id              uuid NOT NULL REFERENCES lucky_card_rounds(id) ON DELETE CASCADE,
  draw_id               uuid REFERENCES lucky_card_draws(id) ON DELETE SET NULL,
  entry_id              uuid NOT NULL REFERENCES lucky_card_entries(id) ON DELETE RESTRICT,
  user_id               uuid NOT NULL,

  winning_card_number   integer NOT NULL,
  winner_position       integer NOT NULL,

  fulfillment_case_id   uuid,
  draw_status           text NOT NULL DEFAULT 'DRAWN',  -- mirrors parent draw_status

  selected_at           timestamptz NOT NULL,   -- when the entry was created
  published_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT lcw_unique_round_user     UNIQUE (round_id, user_id),
  CONSTRAINT lcw_unique_round_position UNIQUE (round_id, winner_position),
  CONSTRAINT lcw_unique_round_entry    UNIQUE (round_id, entry_id)
);

CREATE INDEX IF NOT EXISTS idx_lcw_round_id ON lucky_card_winners(round_id);
CREATE INDEX IF NOT EXISTS idx_lcw_user_id  ON lucky_card_winners(user_id);
CREATE INDEX IF NOT EXISTS idx_lcw_draw_id  ON lucky_card_winners(draw_id);

ALTER TABLE lucky_card_winners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lcw_admin_all" ON lucky_card_winners;
CREATE POLICY "lcw_admin_all" ON lucky_card_winners FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true));

DROP POLICY IF EXISTS "lcw_select_own" ON lucky_card_winners;
CREATE POLICY "lcw_select_own" ON lucky_card_winners FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "lcw_select_published" ON lucky_card_winners;
CREATE POLICY "lcw_select_published" ON lucky_card_winners FOR SELECT
  TO authenticated
  USING (draw_status = 'PUBLISHED');
