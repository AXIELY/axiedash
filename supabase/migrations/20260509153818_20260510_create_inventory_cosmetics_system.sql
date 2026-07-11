/*
  # Create Player Inventory and Cosmetics System

  1. New Tables
    - `player_inventory` - Track items owned by players (cards, cosmetics, etc)
    - `cosmetic_items` - Catalog of all cosmetic items (skins, frames, effects, etc)
    - `daily_missions` - Daily missions configuration
    - `player_missions` - Player mission progress
    - `activity_feed` - Live activity log of player actions

  2. Features
    - Item rarity tiers (common→divine)
    - Cosmetic customization (avatar, banner, border, effects)
    - Seasonal items and limited editions
    - Mission progress tracking
    - Social activity feed

  3. Security
    - Enable RLS on all tables
    - Users can only read/modify their own inventory
    - Public read-only access to activity feed
*/

-- Player Inventory Table
CREATE TABLE IF NOT EXISTS player_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_type text NOT NULL,
  item_id text NOT NULL,
  quantity integer DEFAULT 1,
  rarity text DEFAULT 'common',
  equipped boolean DEFAULT false,
  obtained_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT unique_inventory UNIQUE(user_id, item_type, item_id)
);

-- Cosmetic Items Catalog
CREATE TABLE IF NOT EXISTS cosmetic_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  description_ar text,
  description_en text,
  category text NOT NULL,
  rarity text DEFAULT 'common',
  source text DEFAULT 'gameplay',
  season text,
  is_limited boolean DEFAULT false,
  drop_chance numeric DEFAULT 0,
  price_coins integer,
  price_gems integer,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Daily Missions
CREATE TABLE IF NOT EXISTS daily_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  description_ar text,
  description_en text,
  objective_type text NOT NULL,
  objective_target integer DEFAULT 1,
  reward_xp integer DEFAULT 50,
  reward_coins integer DEFAULT 0,
  tier text DEFAULT 'normal',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Player Mission Progress
CREATE TABLE IF NOT EXISTS player_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_id text NOT NULL,
  progress integer DEFAULT 0,
  completed boolean DEFAULT false,
  completed_at timestamptz,
  claimed_reward boolean DEFAULT false,
  date date DEFAULT CURRENT_DATE,
  CONSTRAINT unique_mission_per_user UNIQUE(user_id, mission_id, date)
);

-- Activity Feed
CREATE TABLE IF NOT EXISTS activity_feed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_type text NOT NULL,
  activity_data jsonb DEFAULT '{}',
  is_public boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE player_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE cosmetic_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_feed ENABLE ROW LEVEL SECURITY;

-- Player Inventory Policies
CREATE POLICY "Users can read their own inventory"
  ON player_inventory FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert into their inventory"
  ON player_inventory FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own inventory"
  ON player_inventory FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Cosmetic Items Policies (read-only for all)
CREATE POLICY "Authenticated users can read cosmetic items"
  ON cosmetic_items FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Daily Missions Policies (read-only for all)
CREATE POLICY "Authenticated users can read missions"
  ON daily_missions FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Player Missions Policies
CREATE POLICY "Users can read their own missions"
  ON player_missions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert missions"
  ON player_missions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their missions"
  ON player_missions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Activity Feed Policies
CREATE POLICY "Users can read public activity feed"
  ON activity_feed FOR SELECT
  TO authenticated
  USING (is_public = true);

CREATE POLICY "Users can read their own activity"
  ON activity_feed FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own activity"
  ON activity_feed FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_player_inventory_user ON player_inventory(user_id);
CREATE INDEX IF NOT EXISTS idx_player_inventory_equipped ON player_inventory(equipped);
CREATE INDEX IF NOT EXISTS idx_player_missions_user ON player_missions(user_id);
CREATE INDEX IF NOT EXISTS idx_player_missions_date ON player_missions(date);
CREATE INDEX IF NOT EXISTS idx_activity_feed_user ON activity_feed(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_feed_created ON activity_feed(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cosmetic_items_rarity ON cosmetic_items(rarity);
