/*
  # Add Chat Typing Status Table

  1. New Tables
    - `chat_typing_status`
      - `id` (uuid, primary key) - Unique identifier
      - `user_id` (uuid, references users) - ID of user who is typing
      - `username` (text) - Cached username for faster display
      - `avatar_url` (text) - Cached avatar for faster display
      - `room_id` (uuid, nullable) - Optional room ID for room-specific typing
      - `is_typing` (boolean) - Whether user is currently typing
      - `last_activity` (timestamptz) - Last typing activity timestamp

  2. Security
    - Enable RLS on `chat_typing_status` table
    - Allow all authenticated users to read typing status
    - Allow users to insert/update/delete their own typing status

  3. Indexes
    - Unique index on (user_id, room_id) for upsert operations
    - Index on room_id for filtering
    - Index on last_activity for cleanup queries

  4. Functions
    - Automatic cleanup function to remove stale typing indicators
*/

-- Create chat_typing_status table
CREATE TABLE IF NOT EXISTS chat_typing_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  username text NOT NULL,
  avatar_url text,
  room_id uuid REFERENCES game_rooms(id) ON DELETE CASCADE,
  is_typing boolean DEFAULT false NOT NULL,
  last_activity timestamptz DEFAULT now() NOT NULL
);

-- Create unique constraint for user_id and room_id combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_typing_status_user_room 
  ON chat_typing_status(user_id, COALESCE(room_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Enable Row Level Security
ALTER TABLE chat_typing_status ENABLE ROW LEVEL SECURITY;

-- Typing status policies: anyone can read
CREATE POLICY "Anyone can view typing status"
  ON chat_typing_status FOR SELECT
  TO authenticated
  USING (true);

-- Users can insert their own typing status
CREATE POLICY "Users can insert own typing status"
  ON chat_typing_status FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own typing status
CREATE POLICY "Users can update own typing status"
  ON chat_typing_status FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own typing status
CREATE POLICY "Users can delete own typing status"
  ON chat_typing_status FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_typing_status_room_id 
  ON chat_typing_status(room_id) 
  WHERE room_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_typing_status_activity 
  ON chat_typing_status(last_activity DESC);

-- Function to clean up stale typing indicators (older than 10 seconds)
CREATE OR REPLACE FUNCTION cleanup_stale_typing_status()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM chat_typing_status
  WHERE last_activity < (now() - interval '10 seconds');
END;
$$;