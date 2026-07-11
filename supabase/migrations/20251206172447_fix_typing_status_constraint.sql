/*
  # Fix chat_typing_status unique constraint
  
  1. Changes
    - Drop the existing partial unique index that uses COALESCE
    - Create a proper unique constraint on (user_id, room_id) to support upsert operations
    - Since room_id is nullable, we create the constraint to handle NULL values correctly
  
  2. Notes
    - PostgreSQL treats NULL values as distinct, so multiple rows with same user_id but NULL room_id are allowed by default
    - We need to explicitly handle this to allow proper upsert behavior
*/

-- Drop the old index that used COALESCE
DROP INDEX IF EXISTS idx_typing_status_user_room;

-- Create a unique constraint that allows upsert on (user_id, room_id)
-- This handles NULL room_id correctly for general chat
ALTER TABLE chat_typing_status 
  DROP CONSTRAINT IF EXISTS chat_typing_status_user_room_key;

-- Create unique constraint using NULLS NOT DISTINCT (PostgreSQL 15+)
-- This treats NULL values as equal for uniqueness
DO $$
BEGIN
  -- Try to create with NULLS NOT DISTINCT (PG 15+)
  BEGIN
    EXECUTE 'ALTER TABLE chat_typing_status ADD CONSTRAINT chat_typing_status_user_room_key UNIQUE NULLS NOT DISTINCT (user_id, room_id)';
  EXCEPTION
    WHEN syntax_error THEN
      -- Fallback for older PostgreSQL versions
      -- Use a unique partial index for non-NULL room_id
      CREATE UNIQUE INDEX IF NOT EXISTS idx_typing_status_user_room_not_null 
        ON chat_typing_status(user_id, room_id) 
        WHERE room_id IS NOT NULL;
      
      -- And a separate unique index for NULL room_id
      CREATE UNIQUE INDEX IF NOT EXISTS idx_typing_status_user_room_null 
        ON chat_typing_status(user_id) 
        WHERE room_id IS NULL;
  END;
END $$;
