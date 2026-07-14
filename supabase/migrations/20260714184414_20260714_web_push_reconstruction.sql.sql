-- ────────────────────────────────────────────────────────────────
-- Web Push Reconstruction — Additive migration only
-- Adds: origin, last_seen_at, deactivated_at, deactivation_reason
-- Repairs: register_push_subscription RPC to accept p_origin + p_auth
-- Adds: push_delivery_log table
-- ────────────────────────────────────────────────────────────────

-- ── 1. Add missing columns to push_subscriptions ──────────────────
ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS origin text,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivation_reason text;

-- Backfill origin for existing rows (best-effort)
UPDATE push_subscriptions
  SET origin = 'unknown'
  WHERE origin IS NULL;

-- ── 2. Add UNIQUE constraint on endpoint (not endpoint_hash) ──────
-- endpoint_hash already has unique constraint; endpoint itself
-- should also be unique to prevent duplicates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'push_subscriptions_endpoint_key'
  ) THEN
    ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);
  END IF;
END $$;

-- ── 3. Replace register_push_subscription RPC ────────────────────
-- Drop old version, create new with p_origin and p_auth params
DROP FUNCTION IF EXISTS register_push_subscription(
  text, text, text, text, text, text, text, text
);

CREATE OR REPLACE FUNCTION register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_origin text DEFAULT NULL,
  p_platform text DEFAULT NULL,
  p_browser text DEFAULT NULL,
  p_device_label text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      uuid := auth.uid();
  v_hash         text;
  v_existing     push_subscriptions%ROWTYPE;
  v_sub_id       uuid;
  v_status       text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'AUTH_SESSION_MISSING');
  END IF;

  IF p_endpoint IS NULL OR btrim(p_endpoint) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_ENDPOINT');
  END IF;

  IF p_p256dh IS NULL OR btrim(p_p256dh) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'SUBSCRIPTION_KEYS_MISSING');
  END IF;

  IF p_auth IS NULL OR btrim(p_auth) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'SUBSCRIPTION_KEYS_MISSING');
  END IF;

  -- Validate HTTPS push endpoint (allow fcm.googleapis.com etc)
  IF p_endpoint NOT LIKE 'https://%' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INSECURE_ORIGIN');
  END IF;

  v_hash := encode(digest(p_endpoint, 'sha256'), 'hex');

  -- Check for existing subscription with this endpoint
  SELECT * INTO v_existing FROM push_subscriptions WHERE endpoint_hash = v_hash;

  IF FOUND THEN
    -- Rebind to current user (handles account switching on same device)
    UPDATE push_subscriptions SET
      user_id = v_user_id,
      p256dh = p_p256dh,
      auth_key = p_auth,
      origin = COALESCE(p_origin, origin),
      user_agent = COALESCE(p_user_agent, user_agent),
      platform = COALESCE(p_platform, platform),
      browser_family = COALESCE(p_browser, browser_family),
      device_label = COALESCE(p_device_label, device_label),
      is_active = true,
      failure_count = 0,
      permission_state = 'granted',
      deactivated_at = NULL,
      deactivation_reason = NULL,
      last_seen_at = now(),
      updated_at = now()
    WHERE endpoint_hash = v_hash
    RETURNING id INTO v_sub_id;

    v_status := CASE WHEN v_existing.is_active THEN 'updated'
                    WHEN v_existing.user_id = v_user_id THEN 'reactivated'
                    ELSE 'reactivated' END;
  ELSE
    INSERT INTO push_subscriptions (
      user_id, endpoint, endpoint_hash, p256dh, auth_key,
      origin, user_agent, platform, browser_family, device_label
    ) VALUES (
      v_user_id, p_endpoint, v_hash, p_p256dh, p_auth,
      p_origin, p_user_agent, p_platform, p_browser, p_device_label
    )
    RETURNING id INTO v_sub_id;

    v_status := 'created';
  END IF;

  -- Ensure preferences exist
  PERFORM ensure_notification_preferences(v_user_id);

  RETURN jsonb_build_object(
    'success', true,
    'subscriptionId', v_sub_id,
    'status', v_status,
    'active', true
  );
END;
$$;

-- ── 4. Replace deactivate_push_subscription RPC ──────────────────
DROP FUNCTION IF EXISTS deactivate_push_subscription(text);

CREATE OR REPLACE FUNCTION deactivate_push_subscription(
  p_endpoint text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_hash    text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'AUTH_SESSION_MISSING');
  END IF;

  IF p_endpoint IS NULL OR btrim(p_endpoint) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_ENDPOINT');
  END IF;

  v_hash := encode(digest(p_endpoint, 'sha256'), 'hex');

  UPDATE push_subscriptions SET
    is_active = false,
    deactivated_at = now(),
    deactivation_reason = 'USER_DISABLED',
    updated_at = now()
  WHERE endpoint_hash = v_hash AND user_id = v_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── 5. Add get_my_push_diagnostics RPC ───────────────────────────
-- Safe self-diagnostic for the current user's push state
CREATE OR REPLACE FUNCTION get_my_push_diagnostics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_count  int;
  v_active int;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'AUTH_SESSION_MISSING');
  END IF;

  SELECT count(*), count(*) FILTER (WHERE is_active = true)
    INTO v_count, v_active
    FROM push_subscriptions
    WHERE user_id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'total_devices', v_count,
    'active_devices', v_active
  );
END;
$$;

-- ── 6. Add push_delivery_log table ────────────────────────────────
CREATE TABLE IF NOT EXISTS push_delivery_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id  uuid,
  target_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id  uuid REFERENCES push_subscriptions(id) ON DELETE SET NULL,
  channel          text NOT NULL DEFAULT 'WEB_PUSH',
  status           text NOT NULL DEFAULT 'QUEUED',
  safe_error_code  text,
  provider_status  integer,
  attempted_at     timestamptz NOT NULL DEFAULT now(),
  sent_at          timestamptz
);

ALTER TABLE push_delivery_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_log_select_own"
  ON push_delivery_log FOR SELECT
  TO authenticated
  USING (auth.uid() = target_user_id);

-- Admins can see all delivery logs via service role (RLS bypass)
-- No INSERT/UPDATE/DELETE policies for authenticated — only SECURITY DEFINER functions write

CREATE INDEX IF NOT EXISTS idx_push_log_user
  ON push_delivery_log (target_user_id, attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_push_log_status
  ON push_delivery_log (status, attempted_at DESC);

-- ── 7. Grant execute on new RPCs ──────────────────────────────────
GRANT EXECUTE ON FUNCTION register_push_subscription TO authenticated;
GRANT EXECUTE ON FUNCTION deactivate_push_subscription TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_push_diagnostics TO authenticated;
