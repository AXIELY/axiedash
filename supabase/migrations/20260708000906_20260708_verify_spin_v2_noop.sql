-- Verification only: confirm spin_v2 is enabled (no-op if already correct)
DO $$
DECLARE v_enabled boolean;
BEGIN
  SELECT enabled INTO v_enabled FROM engagement_flags WHERE flag = 'spin_v2';
  IF NOT COALESCE(v_enabled, false) THEN
    UPDATE engagement_flags SET enabled = true WHERE flag = 'spin_v2';
  END IF;
END $$;
