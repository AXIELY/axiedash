-- Clear all public chat messages (room_id IS NULL = global chat)
DELETE FROM chat_messages WHERE room_id IS NULL;