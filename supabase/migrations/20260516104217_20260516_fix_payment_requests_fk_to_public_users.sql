/*
  # Fix payment_requests FK to point to public.users

  ## Problem
  payment_requests.user_id references auth.users(id) which means
  PostgREST cannot auto-join to public.users for username lookups.
  The admin panel query `users:user_id(username)` fails silently.

  ## Fix
  1. Drop the FK constraint pointing to auth.users
  2. Re-add it pointing to public.users(id)
  3. Same for reviewed_by column

  ## Safety
  No data is lost — only the constraint target changes.
  public.users.id = auth.users.id (same UUID, by design)
*/

-- Drop old FK to auth.users
ALTER TABLE payment_requests
  DROP CONSTRAINT IF EXISTS payment_requests_user_id_fkey;

ALTER TABLE payment_requests
  DROP CONSTRAINT IF EXISTS payment_requests_reviewed_by_fkey;

-- Re-add FK to public.users
ALTER TABLE payment_requests
  ADD CONSTRAINT payment_requests_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE payment_requests
  ADD CONSTRAINT payment_requests_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES users(id);

-- Also fix payment_logs to reference public.users
ALTER TABLE payment_logs
  DROP CONSTRAINT IF EXISTS payment_logs_user_id_fkey;

ALTER TABLE payment_logs
  DROP CONSTRAINT IF EXISTS payment_logs_admin_id_fkey;

ALTER TABLE payment_logs
  ADD CONSTRAINT payment_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE payment_logs
  ADD CONSTRAINT payment_logs_admin_id_fkey
  FOREIGN KEY (admin_id) REFERENCES users(id);
