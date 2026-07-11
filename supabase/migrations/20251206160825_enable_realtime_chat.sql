/*
  # Enable Realtime for Chat Messages

  ## Overview
  This migration enables Supabase Realtime functionality for the chat_messages table,
  allowing instant message synchronization across all connected users without page refresh.

  ## Changes Made

  1. **Realtime Publication**
     - Adds `chat_messages` table to the `supabase_realtime` publication
     - Enables broadcasting of INSERT, UPDATE, and DELETE events
     - Allows all authenticated users to receive real-time updates

  ## How It Works

  Once this migration is applied:
  - When any user sends a message (INSERT), all connected clients receive the event
  - Message updates (UPDATE) are broadcast in real-time
  - Message deletions (DELETE) are broadcast in real-time
  - The frontend subscription in ChatPanel.tsx will start receiving events immediately

  ## Security Notes

  - RLS policies on chat_messages still apply
  - Only authenticated users can receive realtime events
  - Users can only see messages they have permission to view based on RLS policies
*/

-- Enable realtime for chat_messages table
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;