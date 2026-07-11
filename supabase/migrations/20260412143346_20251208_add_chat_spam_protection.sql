/*
  # Chat Spam Protection and Reporting System

  ## Overview
  This migration adds comprehensive spam protection and reporting features to the chat system.

  ## New Tables

  ### 1. `chat_rate_limits`
  Tracks user message frequency for rate limiting
  - `id` (uuid, primary key)
  - `user_id` (uuid, foreign key)
  - `message_count` (integer) - messages in current window
  - `window_start` (timestamptz) - when the window started
  - `created_at` (timestamptz)

  ### 2. `chat_reports`
  Stores reported messages with admin actions
  - `id` (uuid, primary key)
  - `message_id` (uuid, foreign key)
  - `reported_by` (uuid, foreign key)
  - `reason` (text) - spam/inappropriate/other
  - `details` (text, nullable) - additional details
  - `status` (text) - pending/approved/rejected/actioned
  - `created_at` (timestamptz)

  ### 3. `chat_bans`
  Tracks banned users and their ban periods
  - `id` (uuid, primary key)
  - `user_id` (uuid, foreign key)
  - `banned_until` (timestamptz)
  - `reason` (text)
  - `banned_by` (uuid, foreign key) - admin who banned
  - `created_at` (timestamptz)

  ## Security
  - Enable RLS on all new tables
  - Users can view reports they made
  - Only admins can manage bans and reports
  - Rate limiting enforced at database level
  - Comprehensive trigger system for validation
*/

CREATE TABLE IF NOT EXISTS chat_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_count integer DEFAULT 0,
  window_start timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS chat_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  reported_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  details text,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  UNIQUE(message_id, reported_by)
);

CREATE TABLE IF NOT EXISTS chat_bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  banned_until timestamptz NOT NULL,
  reason text NOT NULL,
  banned_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE chat_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_bans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own rate limits"
  ON chat_rate_limits FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own reports"
  ON chat_reports FOR SELECT
  TO authenticated
  USING (auth.uid() = reported_by);

CREATE POLICY "Admins can view all reports"
  ON chat_reports FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true
  ));

CREATE POLICY "Users can create reports"
  ON chat_reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reported_by);

CREATE POLICY "Admins can update reports"
  ON chat_reports FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true
  ));

CREATE POLICY "Users can view their own bans"
  ON chat_bans FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all bans"
  ON chat_bans FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true
  ));

CREATE POLICY "Admins can create bans"
  ON chat_bans FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true
  ));

CREATE POLICY "Admins can delete bans"
  ON chat_bans FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true
  ));

CREATE INDEX IF NOT EXISTS idx_chat_rate_limits_user_id ON chat_rate_limits(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_rate_limits_window_start ON chat_rate_limits(window_start);
CREATE INDEX IF NOT EXISTS idx_chat_reports_message_id ON chat_reports(message_id);
CREATE INDEX IF NOT EXISTS idx_chat_reports_reported_by ON chat_reports(reported_by);
CREATE INDEX IF NOT EXISTS idx_chat_reports_status ON chat_reports(status);
CREATE INDEX IF NOT EXISTS idx_chat_bans_user_id ON chat_bans(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_bans_banned_until ON chat_bans(banned_until);

CREATE OR REPLACE FUNCTION check_chat_ban()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM chat_bans
    WHERE user_id = NEW.user_id
    AND banned_until > now()
  ) THEN
    RAISE EXCEPTION 'User is banned from chat';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER chat_ban_check_trigger
BEFORE INSERT ON chat_messages
FOR EACH ROW
EXECUTE FUNCTION check_chat_ban();

CREATE OR REPLACE FUNCTION check_chat_rate_limit()
RETURNS TRIGGER AS $$
DECLARE
  message_count integer;
BEGIN
  SELECT COUNT(*) INTO message_count
  FROM chat_messages
  WHERE user_id = NEW.user_id
  AND created_at > now() - interval '1 minute'
  AND room_id IS NULL;

  IF message_count >= 10 THEN
    RAISE EXCEPTION 'Rate limit exceeded: maximum 10 messages per minute';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER chat_rate_limit_check_trigger
BEFORE INSERT ON chat_messages
FOR EACH ROW
EXECUTE FUNCTION check_chat_rate_limit();
