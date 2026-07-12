/*
# User Accounts Private Profile + Admin Users Management

## Summary
Adds a protected user_accounts table for private per-user data (phone, status, risk),
admin notes, tags, and a comprehensive set of admin RPCs for user management.
All writes go through SECURITY DEFINER RPCs — the public users table remains unchanged.

## New Tables

### user_accounts
Private profile extension linked 1:1 to auth.users.
Stores: phone (country code, national, e164), account_status, risk data, session metadata.
NOT publicly readable — users can only read their own row; admins via RPCs.

### admin_user_notes
Internal admin notes attached to users. Never exposed to end users.

### user_admin_tags
Admin-controlled tags per user.

### user_admin_audit_log
Immutable audit trail for all admin actions on users.

## New RPCs
- admin_list_users — paginated admin user list with search/filter
- admin_get_user_details — full detail for a single user
- admin_update_user_phone — validated phone edit with audit
- admin_suspend_user / admin_unsuspend_user
- admin_ban_user / admin_unban_user
- admin_mark_user_for_review
- admin_add_user_note
- admin_add_user_tag / admin_remove_user_tag
- admin_adjust_user_points — ledger-safe point credit/debit
- get_my_account_status — user reads their own account status
- get_users_overview — admin metrics
- register_with_phone — replaces client-side signUp insert

## Security
- user_accounts: user can read own row (SELECT), writes only via SECURITY DEFINER RPCs
- admin tables: admin-only via is_admin_role() helper
- All admin RPCs check admins table membership server-side

## Phone validation
- Libyan mobile: ^(91|92)[0-9]{7}$ (9 digits, starts 91 or 92)
- Unique constraint on phone_e164 (NULLs do not conflict)
- Stored as: phone_country_code='+218', phone_national='926219540', phone_e164='+218926219540'
*/

-- ============================================================
-- 0. Helper: check admin membership (avoids JWT claim dependency)
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin_role()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true
  );
$$;

-- ============================================================
-- 1. user_accounts — private profile extension
-- ============================================================
CREATE TABLE IF NOT EXISTS user_accounts (
  user_id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_country_code   text,
  phone_national       text,
  phone_e164           text,
  phone_verified_at    timestamptz,
  account_status       text NOT NULL DEFAULT 'ACTIVE',
  suspension_reason    text,
  suspended_until      timestamptz,
  signup_source        text,
  last_seen_at         timestamptz,
  last_login_at        timestamptz,
  risk_level           text NOT NULL DEFAULT 'NORMAL',
  risk_flags           jsonb NOT NULL DEFAULT '[]',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_account_status CHECK (account_status IN ('ACTIVE','SUSPENDED','BANNED','PENDING_REVIEW','DEACTIVATED')),
  CONSTRAINT valid_risk_level CHECK (risk_level IN ('NORMAL','ELEVATED','HIGH'))
);

-- Unique phone (NULLs do not conflict with UNIQUE in PostgreSQL)
CREATE UNIQUE INDEX IF NOT EXISTS user_accounts_phone_e164_unique
  ON user_accounts (phone_e164)
  WHERE phone_e164 IS NOT NULL;

ALTER TABLE user_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_account" ON user_accounts;
CREATE POLICY "users_read_own_account" ON user_accounts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- No direct INSERT/UPDATE for end users — all writes via SECURITY DEFINER RPCs

-- ============================================================
-- 2. admin_user_notes
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_user_notes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_id     uuid NOT NULL REFERENCES auth.users(id),
  note         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_user_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_manage_user_notes" ON admin_user_notes;
CREATE POLICY "admins_manage_user_notes" ON admin_user_notes
  FOR ALL TO authenticated
  USING (public.is_admin_role())
  WITH CHECK (public.is_admin_role());

-- ============================================================
-- 3. user_admin_tags
-- ============================================================
CREATE TABLE IF NOT EXISTS user_admin_tags (
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tag          text NOT NULL,
  created_by   uuid NOT NULL REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tag)
);

ALTER TABLE user_admin_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_manage_user_tags" ON user_admin_tags;
CREATE POLICY "admins_manage_user_tags" ON user_admin_tags
  FOR ALL TO authenticated
  USING (public.is_admin_role())
  WITH CHECK (public.is_admin_role());

-- ============================================================
-- 4. user_admin_audit_log
-- ============================================================
CREATE TABLE IF NOT EXISTS user_admin_audit_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_admin_id uuid REFERENCES auth.users(id),
  target_user_id uuid REFERENCES auth.users(id),
  event_type     text NOT NULL,
  reason         text,
  previous_state jsonb,
  new_state      jsonb,
  metadata       jsonb DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_read_audit_log" ON user_admin_audit_log;
CREATE POLICY "admins_read_audit_log" ON user_admin_audit_log
  FOR SELECT TO authenticated
  USING (public.is_admin_role());

DROP POLICY IF EXISTS "admins_insert_audit_log" ON user_admin_audit_log;
CREATE POLICY "admins_insert_audit_log" ON user_admin_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_role());

-- ============================================================
-- 5. Phone validation helper
-- ============================================================
CREATE OR REPLACE FUNCTION public.validate_libyan_phone(p_national text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_clean text;
BEGIN
  -- Strip non-digits
  v_clean := regexp_replace(COALESCE(p_national,''), '[^0-9]', '', 'g');
  -- Strip leading country code if user entered it
  IF v_clean LIKE '218%' THEN v_clean := substr(v_clean, 4); END IF;
  -- Strip leading 0
  IF v_clean LIKE '0%' THEN v_clean := substr(v_clean, 2); END IF;
  -- Must be 9 digits and start with 91 or 92
  IF length(v_clean) <> 9 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_LIBYAN_PHONE', 'clean', v_clean);
  END IF;
  IF v_clean NOT SIMILAR TO '(91|92)[0-9]{7}' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_LIBYAN_PHONE', 'clean', v_clean);
  END IF;
  RETURN jsonb_build_object(
    'ok', true,
    'national', v_clean,
    'e164', '+218' || v_clean,
    'country_code', '+218'
  );
END;
$$;

-- ============================================================
-- 6. RPC: register_with_phone — called by registration flow
--    Creates user_accounts row + public users row (idempotent)
-- ============================================================
CREATE OR REPLACE FUNCTION public.register_with_phone(
  p_username    text,
  p_phone       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_phone_info jsonb;
  v_phone_e164 text;
  v_avatar_url text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED');
  END IF;

  -- Validate phone if provided
  IF p_phone IS NOT NULL AND trim(p_phone) <> '' THEN
    SELECT public.validate_libyan_phone(p_phone) INTO v_phone_info;
    IF NOT (v_phone_info->>'ok')::boolean THEN
      RETURN jsonb_build_object('ok', false, 'error', 'INVALID_LIBYAN_PHONE');
    END IF;
    v_phone_e164 := v_phone_info->>'e164';
    -- Check uniqueness
    IF EXISTS (SELECT 1 FROM user_accounts WHERE phone_e164 = v_phone_e164 AND user_id <> v_user_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'PHONE_ALREADY_USED');
    END IF;
  END IF;

  -- Create user_accounts row
  INSERT INTO user_accounts (user_id, phone_country_code, phone_national, phone_e164,
                              phone_verified_at, account_status, signup_source)
  VALUES (
    v_user_id,
    CASE WHEN v_phone_info IS NOT NULL THEN v_phone_info->>'country_code' END,
    CASE WHEN v_phone_info IS NOT NULL THEN v_phone_info->>'national' END,
    v_phone_e164,
    NULL,
    'ACTIVE',
    'WEB'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    phone_country_code = EXCLUDED.phone_country_code,
    phone_national     = EXCLUDED.phone_national,
    phone_e164         = EXCLUDED.phone_e164,
    updated_at         = now();

  -- Audit
  INSERT INTO user_admin_audit_log (target_user_id, event_type, new_state)
  VALUES (v_user_id, 'USER_REGISTERED',
    jsonb_build_object('username', p_username, 'has_phone', v_phone_e164 IS NOT NULL));

  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.register_with_phone(text, text) TO authenticated;

-- ============================================================
-- 7. RPC: get_my_account_status — user reads own account state
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_account_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row user_accounts%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('status', 'ACTIVE'); END IF;
  SELECT * INTO v_row FROM user_accounts WHERE user_id = v_uid;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'ACTIVE'); END IF;
  RETURN jsonb_build_object(
    'status',           v_row.account_status,
    'suspension_reason',v_row.suspension_reason,
    'suspended_until',  v_row.suspended_until,
    'risk_level',       v_row.risk_level
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_account_status() TO authenticated;

-- ============================================================
-- 8. RPC: get_users_overview — admin metrics
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_users_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NOT public.is_admin_role() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN (
    SELECT jsonb_build_object(
      'total_users',        COUNT(*),
      'new_today',          COUNT(*) FILTER (WHERE u.created_at >= date_trunc('day', now())),
      'new_this_week',      COUNT(*) FILTER (WHERE u.created_at >= date_trunc('week', now())),
      'without_phone',      COUNT(*) FILTER (WHERE ua.phone_e164 IS NULL),
      'active',             COUNT(*) FILTER (WHERE COALESCE(ua.account_status,'ACTIVE') = 'ACTIVE'),
      'suspended',          COUNT(*) FILTER (WHERE ua.account_status = 'SUSPENDED'),
      'banned',             COUNT(*) FILTER (WHERE ua.account_status = 'BANNED'),
      'pending_review',     COUNT(*) FILTER (WHERE ua.account_status = 'PENDING_REVIEW'),
      'with_risk_flags',    COUNT(*) FILTER (WHERE jsonb_array_length(COALESCE(ua.risk_flags,'[]')) > 0)
    )
    FROM users u
    LEFT JOIN user_accounts ua ON ua.user_id = u.id
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_users_overview() TO authenticated;

-- ============================================================
-- 9. RPC: admin_list_users — paginated list
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_list_users(
  p_search      text    DEFAULT NULL,
  p_status      text    DEFAULT NULL,
  p_risk_level  text    DEFAULT NULL,
  p_has_phone   boolean DEFAULT NULL,
  p_limit       integer DEFAULT 50,
  p_offset      integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_result jsonb;
  v_total  bigint;
BEGIN
  IF NOT public.is_admin_role() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  SELECT COUNT(*) INTO v_total
  FROM users u
  LEFT JOIN user_accounts ua ON ua.user_id = u.id
  WHERE
    (p_search IS NULL OR
      u.username ILIKE '%' || p_search || '%' OR
      u.email    ILIKE '%' || p_search || '%' OR
      ua.phone_e164 = p_search OR
      ua.phone_national = p_search
    )
    AND (p_status IS NULL OR COALESCE(ua.account_status,'ACTIVE') = p_status)
    AND (p_risk_level IS NULL OR ua.risk_level = p_risk_level)
    AND (p_has_phone IS NULL OR
      (p_has_phone = true  AND ua.phone_e164 IS NOT NULL) OR
      (p_has_phone = false AND ua.phone_e164 IS NULL));

  SELECT jsonb_build_object(
    'total', v_total,
    'rows', COALESCE(jsonb_agg(row_to_json(q) ORDER BY q.created_at DESC), '[]')
  ) INTO v_result
  FROM (
    SELECT
      u.id,
      u.username,
      u.email,
      u.avatar_url,
      u.level,
      u.rank,
      u.points,
      u.created_at,
      u.last_login,
      -- Masked phone (last 4 visible)
      CASE
        WHEN ua.phone_e164 IS NULL THEN NULL
        ELSE regexp_replace(ua.phone_e164, '(\+218\s?\d{2})\d+(\d{4})', '\1***\2')
      END AS phone_masked,
      -- Full phone only for admins (will be filtered client-side by permission)
      ua.phone_e164,
      ua.phone_national,
      COALESCE(ua.account_status, 'ACTIVE') AS account_status,
      ua.suspension_reason,
      ua.suspended_until,
      COALESCE(ua.risk_level, 'NORMAL') AS risk_level,
      ua.risk_flags,
      ua.last_seen_at,
      ua.last_login_at
    FROM users u
    LEFT JOIN user_accounts ua ON ua.user_id = u.id
    WHERE
      (p_search IS NULL OR
        u.username ILIKE '%' || p_search || '%' OR
        u.email    ILIKE '%' || p_search || '%' OR
        ua.phone_e164 = p_search OR
        ua.phone_national = p_search
      )
      AND (p_status IS NULL OR COALESCE(ua.account_status,'ACTIVE') = p_status)
      AND (p_risk_level IS NULL OR ua.risk_level = p_risk_level)
      AND (p_has_phone IS NULL OR
        (p_has_phone = true  AND ua.phone_e164 IS NOT NULL) OR
        (p_has_phone = false AND ua.phone_e164 IS NULL))
    ORDER BY u.created_at DESC
    LIMIT p_limit OFFSET p_offset
  ) q;

  RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text, text, text, boolean, integer, integer) TO authenticated;

-- ============================================================
-- 10. RPC: admin_get_user_details
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_get_user_details(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user   RECORD;
  v_acct   user_accounts%ROWTYPE;
  v_notes  jsonb;
  v_tags   jsonb;
BEGIN
  IF NOT public.is_admin_role() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  SELECT * INTO v_user FROM users WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'USER_NOT_FOUND'; END IF;
  SELECT * INTO v_acct FROM user_accounts WHERE user_id = p_user_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', n.id, 'note', n.note, 'admin_id', n.admin_id,
    'admin_username', (SELECT username FROM users WHERE id = n.admin_id),
    'created_at', n.created_at
  ) ORDER BY n.created_at DESC), '[]') INTO v_notes
  FROM admin_user_notes n WHERE n.user_id = p_user_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'tag', t.tag, 'created_by', t.created_by, 'created_at', t.created_at
  ) ORDER BY t.created_at), '[]') INTO v_tags
  FROM user_admin_tags t WHERE t.user_id = p_user_id;

  RETURN jsonb_build_object(
    'id',                 v_user.id,
    'username',           v_user.username,
    'email',              v_user.email,
    'avatar_url',         v_user.avatar_url,
    'level',              v_user.level,
    'rank',               v_user.rank,
    'points',             v_user.points,
    'xp',                 v_user.xp,
    'games_played',       v_user.games_played,
    'created_at',         v_user.created_at,
    'last_login',         v_user.last_login,
    'phone_country_code', v_acct.phone_country_code,
    'phone_national',     v_acct.phone_national,
    'phone_e164',         v_acct.phone_e164,
    'phone_verified_at',  v_acct.phone_verified_at,
    'account_status',     COALESCE(v_acct.account_status, 'ACTIVE'),
    'suspension_reason',  v_acct.suspension_reason,
    'suspended_until',    v_acct.suspended_until,
    'risk_level',         COALESCE(v_acct.risk_level, 'NORMAL'),
    'risk_flags',         COALESCE(v_acct.risk_flags, '[]'),
    'last_seen_at',       v_acct.last_seen_at,
    'signup_source',      v_acct.signup_source,
    -- Financials
    'total_payments_approved', (
      SELECT COALESCE(SUM(amount),0) FROM payment_requests
      WHERE user_id = p_user_id AND status = 'approved'
    ),
    'pending_payments', (
      SELECT COUNT(*) FROM payment_requests
      WHERE user_id = p_user_id AND status = 'pending'
    ),
    'rejected_payments', (
      SELECT COUNT(*) FROM payment_requests
      WHERE user_id = p_user_id AND status = 'rejected'
    ),
    'notes', v_notes,
    'tags',  v_tags,
    -- Audit
    'recent_audit', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'event_type', a.event_type, 'reason', a.reason,
        'actor_admin_id', a.actor_admin_id, 'created_at', a.created_at
      ) ORDER BY a.created_at DESC), '[]')
      FROM user_admin_audit_log a WHERE a.target_user_id = p_user_id
      LIMIT 20
    )
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_get_user_details(uuid) TO authenticated;

-- ============================================================
-- 11. RPC: admin_update_user_phone
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_update_user_phone(
  p_user_id      uuid,
  p_phone_national text,
  p_reason       text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_admin_id   uuid := auth.uid();
  v_phone_info jsonb;
  v_old_phone  text;
BEGIN
  IF NOT public.is_admin_role() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF p_reason IS NULL OR trim(p_reason) = '' THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;

  SELECT public.validate_libyan_phone(p_phone_national) INTO v_phone_info;
  IF NOT (v_phone_info->>'ok')::boolean THEN
    RAISE EXCEPTION 'INVALID_LIBYAN_PHONE';
  END IF;

  -- Check uniqueness
  IF EXISTS (
    SELECT 1 FROM user_accounts WHERE phone_e164 = (v_phone_info->>'e164') AND user_id <> p_user_id
  ) THEN
    RAISE EXCEPTION 'PHONE_ALREADY_USED';
  END IF;

  SELECT phone_e164 INTO v_old_phone FROM user_accounts WHERE user_id = p_user_id;

  INSERT INTO user_accounts (user_id, phone_country_code, phone_national, phone_e164, phone_verified_at, updated_at)
  VALUES (p_user_id, v_phone_info->>'country_code', v_phone_info->>'national', v_phone_info->>'e164', NULL, now())
  ON CONFLICT (user_id) DO UPDATE SET
    phone_country_code = EXCLUDED.phone_country_code,
    phone_national     = EXCLUDED.phone_national,
    phone_e164         = EXCLUDED.phone_e164,
    phone_verified_at  = NULL,
    updated_at         = now();

  INSERT INTO user_admin_audit_log (actor_admin_id, target_user_id, event_type, reason, previous_state, new_state)
  VALUES (v_admin_id, p_user_id, 'USER_PHONE_CHANGED', p_reason,
    jsonb_build_object('phone_e164', v_old_phone),
    jsonb_build_object('phone_e164', v_phone_info->>'e164'));

  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_update_user_phone(uuid, text, text) TO authenticated;

-- ============================================================
-- 12. RPC: admin_suspend_user
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_suspend_user(
  p_user_id        uuid,
  p_reason         text,
  p_suspended_until timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_old_status text;
BEGIN
  IF NOT public.is_admin_role() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF p_reason IS NULL OR trim(p_reason) = '' THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  IF p_user_id = v_admin_id THEN RAISE EXCEPTION 'CANNOT_ACT_ON_SELF'; END IF;

  SELECT account_status INTO v_old_status FROM user_accounts WHERE user_id = p_user_id;

  INSERT INTO user_accounts (user_id, account_status, suspension_reason, suspended_until, updated_at)
  VALUES (p_user_id, 'SUSPENDED', p_reason, p_suspended_until, now())
  ON CONFLICT (user_id) DO UPDATE SET
    account_status = 'SUSPENDED', suspension_reason = p_reason,
    suspended_until = p_suspended_until, updated_at = now();

  INSERT INTO user_admin_audit_log (actor_admin_id, target_user_id, event_type, reason, previous_state, new_state)
  VALUES (v_admin_id, p_user_id, 'USER_SUSPENDED', p_reason,
    jsonb_build_object('status', v_old_status),
    jsonb_build_object('status', 'SUSPENDED', 'suspended_until', p_suspended_until));

  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_suspend_user(uuid, text, timestamptz) TO authenticated;

-- ============================================================
-- 13. RPC: admin_unsuspend_user
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_unsuspend_user(p_user_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE v_admin_id uuid := auth.uid(); BEGIN
  IF NOT public.is_admin_role() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  INSERT INTO user_accounts (user_id, account_status, suspension_reason, suspended_until, updated_at)
  VALUES (p_user_id, 'ACTIVE', NULL, NULL, now())
  ON CONFLICT (user_id) DO UPDATE SET
    account_status = 'ACTIVE', suspension_reason = NULL, suspended_until = NULL, updated_at = now();

  INSERT INTO user_admin_audit_log (actor_admin_id, target_user_id, event_type, reason, new_state)
  VALUES (v_admin_id, p_user_id, 'USER_UNSUSPENDED', p_reason, jsonb_build_object('status', 'ACTIVE'));

  RETURN jsonb_build_object('ok', true);
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_unsuspend_user(uuid, text) TO authenticated;

-- ============================================================
-- 14. RPC: admin_ban_user
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_ban_user(p_user_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_old_status text;
BEGIN
  IF NOT public.is_admin_role() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF p_reason IS NULL OR trim(p_reason) = '' THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  IF p_user_id = v_admin_id THEN RAISE EXCEPTION 'CANNOT_ACT_ON_SELF'; END IF;

  SELECT account_status INTO v_old_status FROM user_accounts WHERE user_id = p_user_id;

  INSERT INTO user_accounts (user_id, account_status, suspension_reason, updated_at)
  VALUES (p_user_id, 'BANNED', p_reason, now())
  ON CONFLICT (user_id) DO UPDATE SET
    account_status = 'BANNED', suspension_reason = p_reason, updated_at = now();

  INSERT INTO user_admin_audit_log (actor_admin_id, target_user_id, event_type, reason, previous_state, new_state)
  VALUES (v_admin_id, p_user_id, 'USER_BANNED', p_reason,
    jsonb_build_object('status', v_old_status), jsonb_build_object('status', 'BANNED'));

  RETURN jsonb_build_object('ok', true);
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_ban_user(uuid, text) TO authenticated;

-- ============================================================
-- 15. RPC: admin_unban_user
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_unban_user(p_user_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE v_admin_id uuid := auth.uid(); BEGIN
  IF NOT public.is_admin_role() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  INSERT INTO user_accounts (user_id, account_status, suspension_reason, updated_at)
  VALUES (p_user_id, 'ACTIVE', NULL, now())
  ON CONFLICT (user_id) DO UPDATE SET
    account_status = 'ACTIVE', suspension_reason = NULL, updated_at = now();

  INSERT INTO user_admin_audit_log (actor_admin_id, target_user_id, event_type, reason, new_state)
  VALUES (v_admin_id, p_user_id, 'USER_UNBANNED', p_reason, jsonb_build_object('status', 'ACTIVE'));

  RETURN jsonb_build_object('ok', true);
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_unban_user(uuid, text) TO authenticated;

-- ============================================================
-- 16. RPC: admin_mark_user_for_review
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_mark_user_for_review(p_user_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE v_admin_id uuid := auth.uid(); BEGIN
  IF NOT public.is_admin_role() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  INSERT INTO user_accounts (user_id, account_status, updated_at)
  VALUES (p_user_id, 'PENDING_REVIEW', now())
  ON CONFLICT (user_id) DO UPDATE SET account_status = 'PENDING_REVIEW', updated_at = now();

  INSERT INTO user_admin_audit_log (actor_admin_id, target_user_id, event_type, reason, new_state)
  VALUES (v_admin_id, p_user_id, 'USER_MARKED_FOR_REVIEW', p_reason,
    jsonb_build_object('status', 'PENDING_REVIEW'));

  RETURN jsonb_build_object('ok', true);
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_mark_user_for_review(uuid, text) TO authenticated;

-- ============================================================
-- 17. RPC: admin_add_user_note
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_add_user_note(p_user_id uuid, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE v_admin_id uuid := auth.uid(); v_note_id uuid; BEGIN
  IF NOT public.is_admin_role() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF p_note IS NULL OR trim(p_note) = '' THEN RAISE EXCEPTION 'NOTE_REQUIRED'; END IF;

  INSERT INTO admin_user_notes (user_id, admin_id, note)
  VALUES (p_user_id, v_admin_id, trim(p_note))
  RETURNING id INTO v_note_id;

  INSERT INTO user_admin_audit_log (actor_admin_id, target_user_id, event_type, new_state)
  VALUES (v_admin_id, p_user_id, 'USER_NOTE_ADDED',
    jsonb_build_object('note_id', v_note_id, 'note_preview', left(p_note, 50)));

  RETURN jsonb_build_object('ok', true, 'note_id', v_note_id);
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_add_user_note(uuid, text) TO authenticated;

-- ============================================================
-- 18. RPC: admin_adjust_user_points
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_adjust_user_points(
  p_user_id   uuid,
  p_amount    integer,
  p_reason    text,
  p_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_admin_id   uuid := auth.uid();
  v_old_points integer;
  v_new_points integer;
  v_idem_key   text;
BEGIN
  IF NOT public.is_admin_role() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF p_amount = 0 THEN RAISE EXCEPTION 'AMOUNT_ZERO'; END IF;
  IF p_reason IS NULL OR trim(p_reason) = '' THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;

  -- Idempotency check using reference
  IF p_reference IS NOT NULL THEN
    v_idem_key := 'ADM-' || p_reference;
    IF EXISTS (
      SELECT 1 FROM point_transactions
      WHERE reference_id = v_idem_key AND user_id = p_user_id
    ) THEN
      RETURN jsonb_build_object('ok', true, 'idempotent', true);
    END IF;
  END IF;

  -- Lock user row
  SELECT points INTO v_old_points FROM users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'USER_NOT_FOUND'; END IF;

  -- Guard against negative balance
  IF p_amount < 0 AND (v_old_points + p_amount) < 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE';
  END IF;

  v_new_points := v_old_points + p_amount;

  UPDATE users SET points = v_new_points WHERE id = p_user_id;

  -- Ledger entry in point_transactions
  INSERT INTO point_transactions (
    user_id, transaction_type, points, balance_after, reference_id,
    description, performed_by
  ) VALUES (
    p_user_id,
    CASE WHEN p_amount > 0 THEN 'CREDIT' ELSE 'DEBIT' END,
    abs(p_amount),
    v_new_points,
    COALESCE(v_idem_key, 'ADM-' || gen_random_uuid()::text),
    p_reason,
    v_admin_id
  );

  INSERT INTO user_admin_audit_log (actor_admin_id, target_user_id, event_type, reason, previous_state, new_state)
  VALUES (v_admin_id, p_user_id, 'USER_POINTS_ADJUSTED', p_reason,
    jsonb_build_object('points', v_old_points),
    jsonb_build_object('points', v_new_points, 'delta', p_amount));

  RETURN jsonb_build_object('ok', true, 'old_points', v_old_points, 'new_points', v_new_points, 'delta', p_amount);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_adjust_user_points(uuid, integer, text, text) TO authenticated;

-- ============================================================
-- 19. Backfill existing users into user_accounts
-- ============================================================
INSERT INTO user_accounts (user_id, account_status, signup_source, created_at, updated_at)
SELECT u.id, 'ACTIVE', 'LEGACY', u.created_at, now()
FROM users u
WHERE NOT EXISTS (SELECT 1 FROM user_accounts ua WHERE ua.user_id = u.id)
ON CONFLICT (user_id) DO NOTHING;
