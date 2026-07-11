-- Home Campaigns v2: add content_width, text_alignment, published_at; simplify status model

-- 1. Add new columns
ALTER TABLE home_campaigns
  ADD COLUMN IF NOT EXISTS content_width text NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN IF NOT EXISTS text_alignment text NOT NULL DEFAULT 'RIGHT',
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

-- 2. Remap existing status values before changing constraint
UPDATE home_campaigns SET status = 'PUBLISHED' WHERE status IN ('ACTIVE', 'SCHEDULED');
UPDATE home_campaigns SET status = 'DRAFT'     WHERE status = 'EXPIRED';

-- 3. Set published_at for already-published campaigns
UPDATE home_campaigns
  SET published_at = updated_at
  WHERE status = 'PUBLISHED' AND published_at IS NULL;

-- 4. Drop old status check constraint and add new 3-value one
ALTER TABLE home_campaigns DROP CONSTRAINT IF EXISTS home_campaigns_status_check;
ALTER TABLE home_campaigns ADD CONSTRAINT home_campaigns_status_check
  CHECK (status IN ('DRAFT','PUBLISHED','PAUSED'));

-- 5. Add check constraints for new columns
ALTER TABLE home_campaigns DROP CONSTRAINT IF EXISTS home_campaigns_content_width_check;
ALTER TABLE home_campaigns ADD CONSTRAINT home_campaigns_content_width_check
  CHECK (content_width IN ('NARROW','NORMAL','WIDE'));

ALTER TABLE home_campaigns DROP CONSTRAINT IF EXISTS home_campaigns_text_alignment_check;
ALTER TABLE home_campaigns ADD CONSTRAINT home_campaigns_text_alignment_check
  CHECK (text_alignment IN ('RIGHT','LEFT','CENTER'));

-- 6. Update RLS SELECT policy for public users (ACTIVE -> PUBLISHED)
DROP POLICY IF EXISTS "public_read_campaigns" ON home_campaigns;
CREATE POLICY "public_read_campaigns" ON home_campaigns
  FOR SELECT TO anon, authenticated
  USING (
    status = 'PUBLISHED'
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at   IS NULL OR ends_at   >  now())
  );

-- 7. Update campaign_chips RLS SELECT policy to match
DROP POLICY IF EXISTS "public_read_chips" ON campaign_chips;
CREATE POLICY "public_read_chips" ON campaign_chips
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM home_campaigns c
      WHERE c.id = campaign_chips.campaign_id
        AND c.status = 'PUBLISHED'
        AND (c.starts_at IS NULL OR c.starts_at <= now())
        AND (c.ends_at   IS NULL OR c.ends_at   >  now())
    )
  );

-- 8. Update eligibility index
DROP INDEX IF EXISTS idx_home_campaigns_eligibility;
CREATE INDEX idx_home_campaigns_eligibility
  ON home_campaigns (status, priority DESC, starts_at, ends_at);
