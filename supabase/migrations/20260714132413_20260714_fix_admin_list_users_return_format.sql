/*
# Fix admin_list_users RPC return format

1. Changes
   - Rewrites admin_list_users to return { success: true, users: [...], total: N }
     instead of { total, rows } so the frontend component can parse it correctly.
   - Adds fallback: returns { success: false, error: '...' } on permission denied
     instead of raising an exception.
   - Includes deposit stats via LEFT JOINs to payment_requests.
   - Makes risk_level default 'LOW' instead of 'NORMAL' to match frontend enum.

2. Security
   - Keeps is_admin_role() guard.
   - Returns structured error on unauthorized instead of throwing.
*/

CREATE OR REPLACE FUNCTION public.admin_list_users(
  p_search    text    DEFAULT NULL,
  p_status    text    DEFAULT NULL,
  p_risk_level text   DEFAULT NULL,
  p_has_phone boolean DEFAULT NULL,
  p_limit     integer DEFAULT 20,
  p_offset    integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total  bigint;
  v_users  jsonb;
BEGIN
  IF NOT public.is_admin_role() THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN', 'users', '[]'::jsonb, 'total', 0);
  END IF;

  -- Count total matching
  SELECT COUNT(*) INTO v_total
  FROM users u
  LEFT JOIN user_accounts ua ON ua.user_id = u.id
  WHERE
    (p_search IS NULL OR
     u.username ILIKE '%' || p_search || '%' OR
     u.email    ILIKE '%' || p_search || '%' OR
     ua.phone_e164 = p_search OR
     ua.phone_national = p_search)
    AND (p_status IS NULL OR COALESCE(ua.account_status, 'ACTIVE') = p_status)
    AND (p_risk_level IS NULL OR COALESCE(ua.risk_level, 'LOW') = p_risk_level)
    AND (p_has_phone IS NULL OR
         (p_has_phone = true  AND ua.phone_e164 IS NOT NULL) OR
         (p_has_phone = false AND ua.phone_e164 IS NULL));

  -- Fetch page
  SELECT COALESCE(jsonb_agg(row_obj ORDER BY created_at DESC), '[]'::jsonb)
  INTO v_users
  FROM (
    SELECT jsonb_build_object(
      'id',                    u.id,
      'username',              u.username,
      'email',                 u.email,
      'avatar_url',            u.avatar_url,
      'level',                 u.level,
      'rank',                  u.rank,
      'points',                COALESCE(u.points, 0),
      'xp',                    COALESCE(u.xp, 0),
      'coins',                 COALESCE(u.coins, 0),
      'games_played',          COALESCE(u.games_played, 0),
      'games_won',             COALESCE(u.games_won, 0),
      'created_at',            u.created_at,
      'last_login',            u.last_login,
      'phone_e164',            ua.phone_e164,
      'phone_verified',        (ua.phone_verified_at IS NOT NULL),
      'account_status',        COALESCE(ua.account_status, 'ACTIVE'),
      'risk_level',            COALESCE(ua.risk_level, 'LOW'),
      'suspension_reason',     ua.suspension_reason,
      'suspended_until',       ua.suspended_until,
      'ban_reason',            NULL,
      'total_deposits',        COALESCE(dep.total_deposits, 0),
      'deposit_count',         COALESCE(dep.deposit_count, 0),
      'pending_payment_count', COALESCE(pend.pending_count, 0),
      'fraud_flag_count',      0,
      'note_count',            COALESCE(nc.note_count, 0)
    ) AS row_obj,
    u.created_at
    FROM users u
    LEFT JOIN user_accounts ua ON ua.user_id = u.id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(amount), 0) AS total_deposits, COUNT(*) AS deposit_count
      FROM payment_requests pr
      WHERE pr.user_id = u.id AND pr.status = 'APPROVED'
    ) dep ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS pending_count
      FROM payment_requests pr
      WHERE pr.user_id = u.id AND pr.status = 'PENDING'
    ) pend ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS note_count
      FROM admin_user_notes aun
      WHERE aun.user_id = u.id
    ) nc ON true
    WHERE
      (p_search IS NULL OR
       u.username ILIKE '%' || p_search || '%' OR
       u.email    ILIKE '%' || p_search || '%' OR
       ua.phone_e164 = p_search OR
       ua.phone_national = p_search)
      AND (p_status IS NULL OR COALESCE(ua.account_status, 'ACTIVE') = p_status)
      AND (p_risk_level IS NULL OR COALESCE(ua.risk_level, 'LOW') = p_risk_level)
      AND (p_has_phone IS NULL OR
           (p_has_phone = true  AND ua.phone_e164 IS NOT NULL) OR
           (p_has_phone = false AND ua.phone_e164 IS NULL))
    ORDER BY u.created_at DESC
    LIMIT p_limit OFFSET p_offset
  ) sub;

  RETURN jsonb_build_object('success', true, 'users', v_users, 'total', v_total);
END;
$$;
