/*
# Fix admin_adjust_user_points to match actual point_transactions schema

The point_transactions table uses:
  - amount (not points)
  - no performed_by column
  - reference_id for idempotency
*/

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

  v_idem_key := COALESCE('ADM-' || p_reference, 'ADM-' || gen_random_uuid()::text);

  -- Idempotency check
  IF p_reference IS NOT NULL AND EXISTS (
    SELECT 1 FROM point_transactions
    WHERE reference_id = v_idem_key AND user_id = p_user_id
  ) THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;

  -- Lock user row
  SELECT points INTO v_old_points FROM users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'USER_NOT_FOUND'; END IF;

  IF p_amount < 0 AND (v_old_points + p_amount) < 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE';
  END IF;

  v_new_points := v_old_points + p_amount;

  UPDATE users SET points = v_new_points WHERE id = p_user_id;

  -- Ledger entry
  INSERT INTO point_transactions (
    user_id, transaction_type, amount, balance_before, balance_after, reference_id, description
  ) VALUES (
    p_user_id,
    CASE WHEN p_amount > 0 THEN 'admin_credit' ELSE 'admin_debit' END,
    abs(p_amount),
    v_old_points,
    v_new_points,
    v_idem_key,
    p_reason
  );

  INSERT INTO user_admin_audit_log (actor_admin_id, target_user_id, event_type, reason, previous_state, new_state)
  VALUES (v_admin_id, p_user_id, 'USER_POINTS_ADJUSTED', p_reason,
    jsonb_build_object('points', v_old_points),
    jsonb_build_object('points', v_new_points, 'delta', p_amount));

  RETURN jsonb_build_object('ok', true, 'old_points', v_old_points, 'new_points', v_new_points, 'delta', p_amount);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_adjust_user_points(uuid, integer, text, text) TO authenticated;
