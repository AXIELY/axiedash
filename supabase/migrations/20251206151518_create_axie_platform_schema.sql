/*
  # AXIE Gaming Platform - Complete Database Schema

  ## Overview
  This migration creates the complete database structure for the AXIE Gaming Platform,
  including user management, game sessions, achievements, rankings, and real-time chat.

  ## New Tables

  ### 1. `users`
  Core user profile with gaming statistics
  - `id` (uuid, primary key) - matches auth.users.id
  - `username` (text, unique) - display name
  - `email` (text, unique) - user email
  - `avatar_url` (text) - profile picture URL
  - `xp` (integer) - experience points
  - `level` (integer) - current level
  - `rank` (text) - Bronze/Silver/Gold/Diamond/Legend
  - `coins` (integer) - total coins collected
  - `points` (integer) - currency for purchases
  - `boosters` (integer) - owned boosters count
  - `games_played` (integer) - total games
  - `games_won` (integer) - total wins
  - `total_score` (integer) - cumulative score
  - `last_login` (timestamptz) - last login date
  - `created_at` (timestamptz) - registration date

  ### 2. `achievements`
  Predefined achievements for the platform
  - `id` (uuid, primary key)
  - `name` (text) - achievement name
  - `description` (text) - achievement details
  - `icon` (text) - icon identifier
  - `category` (text) - achievement category
  - `threshold` (integer) - requirement to unlock
  - `xp_reward` (integer) - XP bonus on unlock
  - `rarity` (text) - common/rare/epic/legendary

  ### 3. `user_achievements`
  Tracks unlocked achievements per user
  - `id` (uuid, primary key)
  - `user_id` (uuid, foreign key)
  - `achievement_id` (uuid, foreign key)
  - `unlocked_at` (timestamptz)

  ### 4. `xp_log`
  Experience points transaction history
  - `id` (uuid, primary key)
  - `user_id` (uuid, foreign key)
  - `source` (text) - win/daily/achievement/game
  - `xp_value` (integer) - XP amount
  - `created_at` (timestamptz)

  ### 5. `game_rooms`
  Multiplayer game sessions
  - `id` (uuid, primary key)
  - `game_type` (text) - coin_rush/wheel/ai_battle
  - `status` (text) - waiting/active/finished
  - `max_players` (integer)
  - `current_players` (integer)
  - `started_at` (timestamptz)
  - `finished_at` (timestamptz)
  - `created_at` (timestamptz)

  ### 6. `room_players`
  Players in each game room with scores
  - `id` (uuid, primary key)
  - `room_id` (uuid, foreign key)
  - `user_id` (uuid, foreign key)
  - `score` (integer)
  - `rank` (integer) - final position
  - `booster_active` (boolean)
  - `xp_earned` (integer)
  - `joined_at` (timestamptz)

  ### 7. `leaderboards`
  Global and game-specific rankings
  - `id` (uuid, primary key)
  - `user_id` (uuid, foreign key)
  - `game_type` (text)
  - `score` (integer)
  - `rank` (integer)
  - `period` (text) - daily/weekly/all_time
  - `date` (date)
  - `created_at` (timestamptz)

  ### 8. `chat_messages`
  Real-time chat system
  - `id` (uuid, primary key)
  - `user_id` (uuid, foreign key)
  - `room_id` (uuid, foreign key, nullable) - null for global chat
  - `message` (text)
  - `message_type` (text) - user/system/achievement
  - `created_at` (timestamptz)

  ### 9. `transactions`
  Points and booster purchase history
  - `id` (uuid, primary key)
  - `user_id` (uuid, foreign key)
  - `transaction_type` (text) - earn/spend
  - `amount` (integer)
  - `item` (text) - booster/points
  - `description` (text)
  - `created_at` (timestamptz)

  ## Security
  - Enable RLS on all tables
  - Authenticated users can read their own data
  - Authenticated users can insert their own records
  - Public read access for leaderboards and achievements
  - Restricted write access with ownership validation
*/

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  email text UNIQUE NOT NULL,
  avatar_url text DEFAULT 'https://api.dicebear.com/7.x/avataaars/svg?seed=default',
  xp integer DEFAULT 0,
  level integer DEFAULT 1,
  rank text DEFAULT 'Bronze',
  coins integer DEFAULT 0,
  points integer DEFAULT 100,
  boosters integer DEFAULT 0,
  games_played integer DEFAULT 0,
  games_won integer DEFAULT 0,
  total_score integer DEFAULT 0,
  last_login timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Create achievements table
CREATE TABLE IF NOT EXISTS achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL,
  icon text NOT NULL,
  category text DEFAULT 'general',
  threshold integer DEFAULT 1,
  xp_reward integer DEFAULT 75,
  rarity text DEFAULT 'common',
  created_at timestamptz DEFAULT now()
);

-- Create user_achievements table
CREATE TABLE IF NOT EXISTS user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  achievement_id uuid REFERENCES achievements(id) ON DELETE CASCADE NOT NULL,
  unlocked_at timestamptz DEFAULT now(),
  UNIQUE(user_id, achievement_id)
);

-- Create xp_log table
CREATE TABLE IF NOT EXISTS xp_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  source text NOT NULL,
  xp_value integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create game_rooms table
CREATE TABLE IF NOT EXISTS game_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_type text DEFAULT 'coin_rush',
  status text DEFAULT 'waiting',
  max_players integer DEFAULT 5,
  current_players integer DEFAULT 0,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Create room_players table
CREATE TABLE IF NOT EXISTS room_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid REFERENCES game_rooms(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  score integer DEFAULT 0,
  rank integer,
  booster_active boolean DEFAULT false,
  xp_earned integer DEFAULT 0,
  joined_at timestamptz DEFAULT now(),
  UNIQUE(room_id, user_id)
);

-- Create leaderboards table
CREATE TABLE IF NOT EXISTS leaderboards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  game_type text DEFAULT 'coin_rush',
  score integer DEFAULT 0,
  rank integer,
  period text DEFAULT 'all_time',
  date date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

-- Create chat_messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  room_id uuid REFERENCES game_rooms(id) ON DELETE CASCADE,
  message text NOT NULL,
  message_type text DEFAULT 'user',
  created_at timestamptz DEFAULT now()
);

-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  transaction_type text NOT NULL,
  amount integer NOT NULL,
  item text,
  description text,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE xp_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can view other profiles"
  ON users FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Achievements policies (public read)
CREATE POLICY "Anyone can view achievements"
  ON achievements FOR SELECT
  TO authenticated
  USING (true);

-- User achievements policies
CREATE POLICY "Users can view own achievements"
  ON user_achievements FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view others' achievements"
  ON user_achievements FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can unlock achievements"
  ON user_achievements FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- XP log policies
CREATE POLICY "Users can view own XP log"
  ON xp_log FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert XP log"
  ON xp_log FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Game rooms policies
CREATE POLICY "Anyone can view game rooms"
  ON game_rooms FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create game rooms"
  ON game_rooms FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "System can update game rooms"
  ON game_rooms FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Room players policies
CREATE POLICY "Anyone can view room players"
  ON room_players FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can join rooms"
  ON room_players FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own room score"
  ON room_players FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Leaderboards policies (public read)
CREATE POLICY "Anyone can view leaderboards"
  ON leaderboards FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System can insert leaderboard entries"
  ON leaderboards FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Chat messages policies
CREATE POLICY "Users can view chat messages"
  ON chat_messages FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can send chat messages"
  ON chat_messages FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Transactions policies
CREATE POLICY "Users can view own transactions"
  ON transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert transactions"
  ON transactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_level ON users(level);
CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_xp_log_user_id ON xp_log(user_id);
CREATE INDEX IF NOT EXISTS idx_game_rooms_status ON game_rooms(status);
CREATE INDEX IF NOT EXISTS idx_room_players_room_id ON room_players(room_id);
CREATE INDEX IF NOT EXISTS idx_room_players_user_id ON room_players(user_id);
CREATE INDEX IF NOT EXISTS idx_leaderboards_period ON leaderboards(period);
CREATE INDEX IF NOT EXISTS idx_leaderboards_rank ON leaderboards(rank);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);

-- Insert default achievements
INSERT INTO achievements (name, description, icon, category, threshold, xp_reward, rarity)
VALUES
  ('First Win', 'Win your first multiplayer match', '🥇', 'gameplay', 1, 75, 'common'),
  ('Coin Collector', 'Collect 10,000 coins total', '💰', 'collection', 10000, 150, 'rare'),
  ('Speed Demon', 'Click 500 times in one game', '⚡', 'gameplay', 500, 100, 'rare'),
  ('AXIE Champion', 'Reach top of leaderboard 3 times', '👑', 'competitive', 3, 300, 'legendary'),
  ('Big Spender', 'Use 10 boosters', '💸', 'items', 10, 75, 'common'),
  ('Strategist', 'Win 5 games in a row', '🧠', 'competitive', 5, 200, 'epic'),
  ('Social Butterfly', 'Send 100 chat messages', '💬', 'social', 100, 50, 'common'),
  ('Bronze Master', 'Reach Bronze rank', '🥉', 'progression', 1, 50, 'common'),
  ('Silver Warrior', 'Reach Silver rank', '🥈', 'progression', 6, 100, 'rare'),
  ('Golden Legend', 'Reach Gold rank', '🥇', 'progression', 11, 200, 'epic'),
  ('Diamond Elite', 'Reach Diamond rank', '💎', 'progression', 21, 400, 'legendary'),
  ('AXIE Legend', 'Reach Legend rank', '🦁', 'progression', 41, 1000, 'legendary')
ON CONFLICT DO NOTHING;