/*
# Create Magic Chest Settings Table

## Purpose
Stores configuration for the "Magic Chest" (الصندوق السحري) feature — a limited-time
event banner shown on the dashboard home page. The chest is currently locked and the
game logic is not yet implemented; this table only holds display/admin settings.

## New Tables
- `magic_chest_settings` (single-row settings table, same pattern as `wheel_game_settings`)
  - `id` uuid PK
  - `show_banner` boolean — whether the banner appears on the dashboard
  - `status` text — one of: 'locked', 'coming_soon', 'active', 'ended'
  - `title` text — banner headline
  - `description` text — banner subtext
  - `badge_text` text — small badge label (e.g. "حدث محدود")
  - `button_text` text — CTA button label
  - `countdown_enabled` boolean — whether the countdown timer is visible
  - `countdown_end_date` timestamptz — target date for the countdown
  - `chest_image_url` text — URL of the chest image (null = show placeholder)
  - `theme_color` text — one of: 'purple', 'gold', 'cyan', 'red'
  - `order_index` integer — sort order for future banner support
  - `rewards` jsonb — array of {name, value, icon, color} prize objects
  - `created_at` / `updated_at` timestamptz

## Storage
- Creates a public storage bucket `magic-chest-images` for chest image uploads.

## Security
- RLS enabled on `magic_chest_settings`.
- Policies: authenticated users can SELECT, INSERT, UPDATE (matches existing
  `wheel_game_settings` pattern — admin-only in practice because only admins
  access the management UI, but the policy itself is permissive to authenticated).
- Storage bucket policies allow authenticated users to upload/read/delete in
  `magic-chest-images`.
*/

-- ─── Table ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS magic_chest_settings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_banner         boolean NOT NULL DEFAULT true,
  status              text NOT NULL DEFAULT 'locked',
  title               text NOT NULL DEFAULT 'حدث الصندوق السحري',
  description         text NOT NULL DEFAULT 'افتح الصندوق واربح جوائز أسطورية!',
  badge_text          text NOT NULL DEFAULT 'حدث محدود',
  button_text         text NOT NULL DEFAULT 'قريبًا',
  countdown_enabled   boolean NOT NULL DEFAULT true,
  countdown_end_date  timestamptz,
  chest_image_url     text,
  theme_color         text NOT NULL DEFAULT 'purple',
  order_index         integer NOT NULL DEFAULT 0,
  rewards             jsonb NOT NULL DEFAULT '[
    {"name":"نقاط","value":"10,000","icon":"crown","color":"gold"},
    {"name":"عملات","value":"5,000","icon":"diamond","color":"cyan"},
    {"name":"بطاقة نادرة","value":"1","icon":"star","color":"purple"}
  ]'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE magic_chest_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies (idempotent)
DROP POLICY IF EXISTS "Authenticated can read magic chest settings" ON magic_chest_settings;
DROP POLICY IF EXISTS "Authenticated can insert magic chest settings" ON magic_chest_settings;
DROP POLICY IF EXISTS "Authenticated can update magic chest settings" ON magic_chest_settings;

CREATE POLICY "Authenticated can read magic chest settings"
  ON magic_chest_settings FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated can insert magic chest settings"
  ON magic_chest_settings FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update magic chest settings"
  ON magic_chest_settings FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- ─── Seed default row ───────────────────────────────────────────
INSERT INTO magic_chest_settings (status, countdown_end_date)
SELECT 'locked', (now() + interval '7 days')
WHERE NOT EXISTS (SELECT 1 FROM magic_chest_settings);

-- ─── Storage bucket ─────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('magic-chest-images', 'magic-chest-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: authenticated can upload/read/delete
DROP POLICY IF EXISTS "Authenticated can upload magic chest images" ON storage.objects;
CREATE POLICY "Authenticated can upload magic chest images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'magic-chest-images');

DROP POLICY IF EXISTS "Public can read magic chest images" ON storage.objects;
CREATE POLICY "Public can read magic chest images"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'magic-chest-images');

DROP POLICY IF EXISTS "Authenticated can delete magic chest images" ON storage.objects;
CREATE POLICY "Authenticated can delete magic chest images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'magic-chest-images');
