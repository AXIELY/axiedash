/*
# Add outbox batch claim RPC

1. New Functions
  - `claim_notification_outbox_batch(p_batch_size, p_worker_id)` — SECURITY DEFINER
    - Claims up to p_batch_size PENDING jobs whose available_at <= now()
    - Uses FOR UPDATE SKIP LOCKED to prevent double-processing
    - Sets locked_at and locked_by on claimed rows
    - Returns claimed rows as JSON array

2. Security
  - SECURITY DEFINER so edge function service-role can call it
*/

CREATE OR REPLACE FUNCTION claim_notification_outbox_batch(
  p_batch_size int DEFAULT 25,
  p_worker_id text DEFAULT 'unknown'
)
RETURNS SETOF notification_outbox
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE notification_outbox
  SET
    status = 'PROCESSING',
    locked_at = now(),
    locked_by = p_worker_id
  WHERE id IN (
    SELECT id FROM notification_outbox
    WHERE status = 'PENDING'
      AND available_at <= now()
      AND attempt_count < 5
      AND (expires_at IS NULL OR expires_at > now())
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT p_batch_size
  )
  RETURNING *;
END;
$$;
