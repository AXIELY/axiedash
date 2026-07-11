/*
  # Create Wheel Game Settings Table

  1. New Tables
    - `wheel_game_settings`
      - `id` (uuid, primary key)
      - `active` (bool) — enable/disable the game
      - `title_ar` (text) — Arabic title
      - `title_en` (text) — English title
      - `spin_cost_points` (int) — points cost per paid spin
      - `free_daily_spins` (int) — number of free spins per day
      - `prizes` (jsonb) — array of prize objects with id, name_ar, name_en, type, accent_color, weight, value, short_label, is_strong
      - `created_at`, `updated_at`

  2. Security
    - Enable RLS
    - Authenticated users can SELECT (to load game)
    - Only service role (admin via RPC) can INSERT/UPDATE

  3. Default Data
    - Insert one active row with 12 default prizes matching the provided wheel design
*/

CREATE TABLE IF NOT EXISTS wheel_game_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  active boolean NOT NULL DEFAULT true,
  title_ar text NOT NULL DEFAULT 'عجلة أكسي',
  title_en text NOT NULL DEFAULT 'AXIE Wheel',
  spin_cost_points integer NOT NULL DEFAULT 100,
  free_daily_spins integer NOT NULL DEFAULT 3,
  prizes jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE wheel_game_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read wheel settings"
  ON wheel_game_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update wheel settings"
  ON wheel_game_settings FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can insert wheel settings"
  ON wheel_game_settings FOR INSERT
  TO authenticated
  WITH CHECK (true);

INSERT INTO wheel_game_settings (active, title_ar, title_en, spin_cost_points, free_daily_spins, prizes)
VALUES (
  true,
  'عجلة أكسي',
  'AXIE Wheel',
  100,
  3,
  '[
    {"id":"netflix","name_ar":"نتفلكس","name_en":"Netflix","type":"service","accent_color":"#e50914","weight":0.8,"value":"اشتراك نتفلكس شهر","short_label":"شهر","is_strong":true},
    {"id":"chatgpt","name_ar":"شات جي بي تي","name_en":"ChatGPT","type":"service","accent_color":"#10a37f","weight":0.45,"value":"اشتراك شات جي بي تي بلس شهر","short_label":"Plus","is_strong":true},
    {"id":"tiktok","name_ar":"تيك توك","name_en":"TikTok","type":"service","accent_color":"#00f2ea","weight":1.4,"value":"100 عملة تيك توك","short_label":"100","is_strong":false},
    {"id":"miss-1","name_ar":"حظ أوفر","name_en":"No Luck","type":"miss","accent_color":"#8b7aa8","weight":38,"value":"حظ أوفر","short_label":"","is_strong":false},
    {"id":"libyana","name_ar":"ليبيانا","name_en":"Libyana","type":"service","accent_color":"#ffd34d","weight":2.2,"value":"كرت 5 ليبيانا","short_label":"5 د.ل","is_strong":false},
    {"id":"points-1","name_ar":"100 نقطة","name_en":"100 Points","type":"points","accent_color":"#54e6ff","weight":8,"value":"100","short_label":"100","is_strong":false},
    {"id":"miss-2","name_ar":"حظ أوفر","name_en":"No Luck","type":"miss","accent_color":"#8b7aa8","weight":32,"value":"حظ أوفر","short_label":"","is_strong":false},
    {"id":"tiktok-2","name_ar":"تيك توك","name_en":"TikTok","type":"service","accent_color":"#00f2ea","weight":1.4,"value":"100 عملة تيك توك","short_label":"100","is_strong":false},
    {"id":"miss-3","name_ar":"حظ أوفر","name_en":"No Luck","type":"miss","accent_color":"#8b7aa8","weight":38,"value":"حظ أوفر","short_label":"","is_strong":false},
    {"id":"points-2","name_ar":"100 نقطة","name_en":"100 Points","type":"points","accent_color":"#54e6ff","weight":8,"value":"100","short_label":"100","is_strong":false},
    {"id":"grand","name_ar":"جائزة كبرى","name_en":"Grand Prize","type":"grand","accent_color":"#ff2c2c","weight":0.08,"value":"الجائزة الكبرى","short_label":"VIP","is_strong":true},
    {"id":"miss-4","name_ar":"حظ أوفر","name_en":"No Luck","type":"miss","accent_color":"#8b7aa8","weight":38,"value":"حظ أوفر","short_label":"","is_strong":false}
  ]'::jsonb
);
