/*
  # Create Collection Progress Tracking System

  1. New Tables
    - `collection_progress`: Tracks each player's collection completion metrics
      - `id` (uuid, primary key)
      - `user_id` (uuid, references users)
      - `total_items_collected` (integer)
      - `completion_percentage` (numeric, 0-100)
      - `rarity_score` (integer, weighted sum of rarities)
      - `common_count`, `rare_count`, `epic_count`, `legendary_count`, `mythic_count`, `divine_count`
      - `collection_rank` (integer, calculated based on overall progress)
      - `last_updated` (timestamp)
    
    - `collection_leaderboard`: Cached leaderboard for performance
      - `id` (uuid, primary key)
      - `user_id` (uuid, references users)
      - `username` (text)
      - `avatar_url` (text)
      - `rank` (integer)
      - `completion_percentage` (numeric)
      - `total_items` (integer)
      - `rarity_score` (integer)
      - `updated_at` (timestamp)
    
    - `collection_achievements`: Special achievements for collection milestones
      - `id` (uuid, primary key)
      - `user_id` (uuid, references users)
      - `achievement_type` (text: 'completion_25', 'completion_50', 'completion_100', 'rarity_milestone', 'first_divine')
      - `milestone_value` (integer)
      - `unlocked_at` (timestamp)

  2. Security
    - Enable RLS on all tables
    - collection_progress: Users can view own + public leaderboard
    - collection_leaderboard: Public read access
    - collection_achievements: Users can view own achievements

  3. Indexes
    - collection_progress (user_id, completion_percentage, rarity_score)
    - collection_leaderboard (rank, completion_percentage)
    - collection_achievements (user_id, achievement_type)
*/

-- Create collection_progress table
CREATE TABLE IF NOT EXISTS collection_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id),
  total_items_collected integer DEFAULT 0,
  completion_percentage numeric DEFAULT 0,
  rarity_score integer DEFAULT 0,
  common_count integer DEFAULT 0,
  rare_count integer DEFAULT 0,
  epic_count integer DEFAULT 0,
  legendary_count integer DEFAULT 0,
  mythic_count integer DEFAULT 0,
  divine_count integer DEFAULT 0,
  collection_rank integer,
  last_updated timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE collection_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own collection progress"
  ON collection_progress FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own collection progress"
  ON collection_progress FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create collection_leaderboard table
CREATE TABLE IF NOT EXISTS collection_leaderboard (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id),
  username text NOT NULL,
  avatar_url text,
  rank integer,
  completion_percentage numeric,
  total_items integer,
  rarity_score integer,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE collection_leaderboard ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view collection leaderboard"
  ON collection_leaderboard FOR SELECT
  TO authenticated
  USING (true);

-- Create collection_achievements table
CREATE TABLE IF NOT EXISTS collection_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  achievement_type text NOT NULL,
  milestone_value integer,
  unlocked_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE collection_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own collection achievements"
  ON collection_achievements FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own achievements"
  ON collection_achievements FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_collection_progress_user_id ON collection_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_collection_progress_completion ON collection_progress(completion_percentage DESC);
CREATE INDEX IF NOT EXISTS idx_collection_progress_rarity_score ON collection_progress(rarity_score DESC);
CREATE INDEX IF NOT EXISTS idx_collection_leaderboard_rank ON collection_leaderboard(rank);
CREATE INDEX IF NOT EXISTS idx_collection_leaderboard_completion ON collection_leaderboard(completion_percentage DESC);
CREATE INDEX IF NOT EXISTS idx_collection_achievements_user ON collection_achievements(user_id, achievement_type);
