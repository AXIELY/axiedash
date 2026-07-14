/*
# Enable realtime on users and user_accounts tables

Adds both tables to the supabase_realtime publication so that
admin panels can subscribe to INSERT/UPDATE/DELETE events
and stay synced in real-time.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'users'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'user_accounts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_accounts;
  END IF;
END $$;
