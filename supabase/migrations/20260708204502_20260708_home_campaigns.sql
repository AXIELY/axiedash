/*
# Home Campaigns System

## Overview
Adds a dynamic hero campaign banner system for the home page, admin-controlled.

## New Tables

### home_campaigns
Stores campaign definitions for the home page hero banner slot.

Columns:
- id (uuid, PK)
- internal_name (text) — admin-only label
- campaign_type (text) — EVENT | PROMOTION | GAME_LAUNCH | FLASH_OFFER | ANNOUNCEMENT | TOURNAMENT | SEASONAL
- title_ar (text)
- title_en (text)
- subtitle_ar (text)
- subtitle_en (text)
- badge_ar (text, nullable)
- badge_en (text, nullable)
- desktop_image_url (text, nullable)
- mobile_image_url (text, nullable)
- content_alignment (text) — RIGHT | LEFT | CENTER, default RIGHT
- overlay_strength (text) — NONE | LIGHT | MEDIUM | STRONG, default MEDIUM
- image_position_x (int) — 0–100, default 50
- image_position_y (int) — 0–100, default 50
- cta_enabled (boolean, default true)
- cta_label_ar (text, nullable)
- cta_label_en (text, nullable)
- cta_action_type (text) — INTERNAL_ROUTE | EXTERNAL_URL | NO_ACTION
- cta_target (text, nullable)
- countdown_mode (text) — NONE | COUNTDOWN_TO_START | COUNTDOWN_TO_END | AUTO
- starts_at (timestamptz, nullable)
- ends_at (timestamptz, nullable)
- priority (int, default 0) — higher wins eligibility tie-break
- status (text) — DRAFT | SCHEDULED | ACTIVE | PAUSED | EXPIRED
- created_at, updated_at

### campaign_chips
Up to 3 highlight chips per campaign.

Columns:
- id (uuid, PK)
- campaign_id (uuid, FK → home_campaigns)
- chip_type (text) — POINTS | COINS | RARE_REWARD | DISCOUNT | CUSTOM
- label_ar (text)
- label_en (text)
- value (text)
- icon_type (text, nullable)
- display_order (int, default 0)
- created_at

## Security
- RLS enabled on both tables
- Public (anon + authenticated) can SELECT eligible campaigns only
- Only admin role can INSERT/UPDATE/DELETE (enforced via admins table join)

## Notes
- Server-side eligibility: status=ACTIVE AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now())
- A Postgres view `active_home_campaign` picks the single highest-priority eligible campaign
*/

-- ── home_campaigns ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS home_campaigns (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  internal_name     text NOT NULL,
  campaign_type     text NOT NULL DEFAULT 'EVENT'
                      CHECK (campaign_type IN ('EVENT','PROMOTION','GAME_LAUNCH','FLASH_OFFER','ANNOUNCEMENT','TOURNAMENT','SEASONAL')),
  title_ar          text NOT NULL DEFAULT '',
  title_en          text NOT NULL DEFAULT '',
  subtitle_ar       text NOT NULL DEFAULT '',
  subtitle_en       text NOT NULL DEFAULT '',
  badge_ar          text,
  badge_en          text,
  desktop_image_url text,
  mobile_image_url  text,
  content_alignment text NOT NULL DEFAULT 'RIGHT'
                      CHECK (content_alignment IN ('RIGHT','LEFT','CENTER')),
  overlay_strength  text NOT NULL DEFAULT 'MEDIUM'
                      CHECK (overlay_strength IN ('NONE','LIGHT','MEDIUM','STRONG')),
  image_position_x  int  NOT NULL DEFAULT 50 CHECK (image_position_x BETWEEN 0 AND 100),
  image_position_y  int  NOT NULL DEFAULT 50 CHECK (image_position_y BETWEEN 0 AND 100),
  cta_enabled       boolean NOT NULL DEFAULT true,
  cta_label_ar      text,
  cta_label_en      text,
  cta_action_type   text NOT NULL DEFAULT 'NO_ACTION'
                      CHECK (cta_action_type IN ('INTERNAL_ROUTE','EXTERNAL_URL','NO_ACTION')),
  cta_target        text,
  countdown_mode    text NOT NULL DEFAULT 'NONE'
                      CHECK (countdown_mode IN ('NONE','COUNTDOWN_TO_START','COUNTDOWN_TO_END','AUTO')),
  starts_at         timestamptz,
  ends_at           timestamptz,
  priority          int  NOT NULL DEFAULT 0,
  status            text NOT NULL DEFAULT 'DRAFT'
                      CHECK (status IN ('DRAFT','SCHEDULED','ACTIVE','PAUSED','EXPIRED')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE home_campaigns ENABLE ROW LEVEL SECURITY;

-- Public can read eligible campaigns (status+schedule filtering in query/view)
DROP POLICY IF EXISTS "public_read_campaigns" ON home_campaigns;
CREATE POLICY "public_read_campaigns" ON home_campaigns
  FOR SELECT TO anon, authenticated
  USING (
    status = 'ACTIVE'
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at   IS NULL OR ends_at   >  now())
  );

-- Admin-only mutations
DROP POLICY IF EXISTS "admin_all_campaigns" ON home_campaigns;
CREATE POLICY "admin_all_campaigns" ON home_campaigns
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true)
  );

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_home_campaigns_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_home_campaigns_updated_at ON home_campaigns;
CREATE TRIGGER trg_home_campaigns_updated_at
  BEFORE UPDATE ON home_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_home_campaigns_updated_at();

-- ── campaign_chips ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS campaign_chips (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   uuid NOT NULL REFERENCES home_campaigns(id) ON DELETE CASCADE,
  chip_type     text NOT NULL DEFAULT 'CUSTOM'
                  CHECK (chip_type IN ('POINTS','COINS','RARE_REWARD','DISCOUNT','CUSTOM')),
  label_ar      text NOT NULL DEFAULT '',
  label_en      text NOT NULL DEFAULT '',
  value         text NOT NULL DEFAULT '',
  icon_type     text,
  display_order int  NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE campaign_chips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_chips" ON campaign_chips;
CREATE POLICY "public_read_chips" ON campaign_chips
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM home_campaigns c
      WHERE c.id = campaign_chips.campaign_id
        AND c.status = 'ACTIVE'
        AND (c.starts_at IS NULL OR c.starts_at <= now())
        AND (c.ends_at   IS NULL OR c.ends_at   >  now())
    )
  );

DROP POLICY IF EXISTS "admin_all_chips" ON campaign_chips;
CREATE POLICY "admin_all_chips" ON campaign_chips
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true)
  );

-- Index for efficient eligibility queries
CREATE INDEX IF NOT EXISTS idx_home_campaigns_eligibility
  ON home_campaigns (status, priority DESC, starts_at, ends_at);
