/*
  # Create Lucky Card Game Settings and Pity Tracking Tables

  1. New Tables
    - `lucky_card_game_settings` - Central configuration for Lucky Card game
      - Stores game rules, reward configurations, rarity odds, pity settings
    - `player_pity_tracking` - Per-player pity/luck system tracking
      - Tracks loss streaks and reset counts for each player

  2. Features
    - Game enable/disable toggle
    - Configurable daily play limits and cooldown
    - Reward list with drop chances and rarity tiers
    - Pity system for boosting odds after dry streaks
    - Economy output limits (max daily coins/gems)
    - Visual effects intensity control

  3. Security
    - Enable RLS on both tables
    - Admin-only access to game_settings (read/update)
    - User access to pity_tracking (read own, insert/update own)
*/

-- Create lucky_card_game_settings table
CREATE TABLE IF NOT EXISTS lucky_card_game_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  active boolean DEFAULT true,
  title_ar text NOT NULL DEFAULT 'أكسي الحظ',
  title_en text NOT NULL DEFAULT 'Axie Fortune',
  min_bet integer DEFAULT 0,
  max_bet integer DEFAULT 100,
  win_rate integer DEFAULT 85,
  daily_play_limit integer DEFAULT 10,
  cooldown_seconds integer DEFAULT 0,
  rewards jsonb NOT NULL DEFAULT '[]',
  rarity_chances jsonb NOT NULL DEFAULT '{"common": 45, "rare": 27, "epic": 18, "legendary": 8, "mythic": 1.5, "divine": 0.5}',
  pity_settings jsonb NOT NULL DEFAULT '{"epicPityThreshold": 20, "epicPityBoost": 15, "legendaryPityThreshold": 50, "legendaryPityGuarantee": true, "resetAfterLegendary": true}',
  max_daily_coins_output integer DEFAULT 10000,
  max_daily_gems_output integer DEFAULT 500,
  visual_effects_level integer DEFAULT 2,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create player_pity_tracking table
CREATE TABLE IF NOT EXISTS player_pity_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  loss_streak integer DEFAULT 0,
  last_win_rarity text,
  epic_pity_count integer DEFAULT 0,
  legendary_pity_count integer DEFAULT 0,
  last_play_time bigint DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE lucky_card_game_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_pity_tracking ENABLE ROW LEVEL SECURITY;

-- Policies for lucky_card_game_settings (read-only for all authenticated users)
CREATE POLICY "Authenticated users can read game settings"
  ON lucky_card_game_settings FOR SELECT
  TO authenticated
  USING (true);

-- Policies for player_pity_tracking
CREATE POLICY "Users can read their own pity data"
  ON player_pity_tracking FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own pity data"
  ON player_pity_tracking FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own pity data"
  ON player_pity_tracking FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_lucky_card_settings_active ON lucky_card_game_settings(active);
CREATE INDEX IF NOT EXISTS idx_player_pity_tracking_user_id ON player_pity_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_player_pity_tracking_updated ON player_pity_tracking(updated_at);
