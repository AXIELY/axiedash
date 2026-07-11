/*
  # Fix RPC Security + Users Update Policy for Admin Approval

  ## Problems Fixed
  1. approve_payment_request RPC uses SECURITY DEFINER but users table RLS
     only allows users to update their OWN row (auth.uid() = id).
     When admin approves, the RPC runs as the calling user, not the row owner.
     Fix: add explicit admin UPDATE policy on users table.

  2. RPC functions need explicit search_path = public to avoid schema issues.

  3. Add missing WITH CHECK clause to Admins can update payment_requests policy.
*/

-- ── 1. Allow admins to update any user's points ───────────────────────────────
CREATE POLICY "Admins can update user points"
  ON users FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.user_id = auth.uid() AND admins.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.user_id = auth.uid() AND admins.is_active = true
    )
  );

-- ── 2. Fix UPDATE policy on payment_requests to include WITH CHECK ─────────────
DROP POLICY IF EXISTS "Admins can update payment requests" ON payment_requests;

CREATE POLICY "Admins can update payment requests"
  ON payment_requests FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.user_id = auth.uid() AND admins.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.user_id = auth.uid() AND admins.is_active = true
    )
  );

-- ── 3. Allow admins to insert payment_logs ────────────────────────────────────
DROP POLICY IF EXISTS "System can insert payment logs" ON payment_logs;

CREATE POLICY "Admins can insert payment logs"
  ON payment_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.user_id = auth.uid() AND admins.is_active = true
    )
  );

-- ── 4. Allow authenticated users to insert economy_logs ──────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'economy_logs' AND policyname = 'Authenticated can insert economy logs'
  ) THEN
    CREATE POLICY "Authenticated can insert economy logs"
      ON economy_logs FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;
END $$;

-- ── 5. Rebuild approve_payment_request with SET search_path ──────────────────
CREATE OR REPLACE FUNCTION approve_payment_request(
  p_request_id  uuid,
  p_admin_id    uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request     payment_requests%ROWTYPE;
  v_pkg         payment_packages%ROWTYPE;
  v_user_points integer;
  v_new_points  integer;
BEGIN
  -- 1. Lock and fetch request
  SELECT * INTO v_request
  FROM payment_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment request not found');
  END IF;

  -- 2. Guard: must be pending
  IF v_request.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot approve — status is ' || v_request.status
    );
  END IF;

  -- 3. Verify package is still active
  SELECT * INTO v_pkg
  FROM payment_packages
  WHERE id = v_request.package_id AND active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Package not found or inactive');
  END IF;

  -- 4. Get and lock user row
  SELECT points INTO v_user_points
  FROM users
  WHERE id = v_request.user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  v_new_points := COALESCE(v_user_points, 0) + v_request.total_points;

  -- 5. Credit points to user
  UPDATE users
  SET
    points                 = v_new_points,
    total_points_purchased = COALESCE(total_points_purchased, 0) + v_request.total_points
  WHERE id = v_request.user_id;

  -- 6. Mark request approved
  UPDATE payment_requests
  SET
    status      = 'approved',
    reviewed_by = p_admin_id,
    reviewed_at = now(),
    updated_at  = now()
  WHERE id = p_request_id;

  -- 7. Write payment log
  INSERT INTO payment_logs
    (payment_request_id, user_id, admin_id, action, old_status, new_status, points_added, note)
  VALUES
    (p_request_id, v_request.user_id, p_admin_id,
     'approved', 'pending', 'approved',
     v_request.total_points, 'Points credited to user');

  -- 8. Write economy log
  INSERT INTO economy_logs (user_id, action, points_change, balance_change, metadata)
  VALUES (
    v_request.user_id,
    'payment_approved',
    v_request.total_points,
    v_request.total_points,
    jsonb_build_object(
      'request_code', v_request.request_code,
      'package_id',   v_request.package_id,
      'approved_by',  p_admin_id
    )
  );

  RETURN jsonb_build_object(
    'success',       true,
    'points_added',  v_request.total_points,
    'new_balance',   v_new_points,
    'request_code',  v_request.request_code
  );
END;
$$;

-- ── 6. Rebuild reject_payment_request with SET search_path ───────────────────
CREATE OR REPLACE FUNCTION reject_payment_request(
  p_request_id uuid,
  p_admin_id   uuid,
  p_reason     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request payment_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_request
  FROM payment_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment request not found');
  END IF;

  IF v_request.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot reject — status is ' || v_request.status
    );
  END IF;

  UPDATE payment_requests
  SET
    status           = 'rejected',
    rejection_reason = p_reason,
    reviewed_by      = p_admin_id,
    reviewed_at      = now(),
    updated_at       = now()
  WHERE id = p_request_id;

  INSERT INTO payment_logs
    (payment_request_id, user_id, admin_id, action, old_status, new_status, points_added, note)
  VALUES
    (p_request_id, v_request.user_id, p_admin_id,
     'rejected', 'pending', 'rejected', 0, p_reason);

  RETURN jsonb_build_object('success', true, 'request_code', v_request.request_code);
END;
$$;

-- ── 7. Re-grant execute ───────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION approve_payment_request(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION reject_payment_request(uuid, uuid, text) TO authenticated;
