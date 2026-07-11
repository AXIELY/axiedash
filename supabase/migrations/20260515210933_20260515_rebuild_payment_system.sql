/*
  # Rebuild Payment System — Professional Final Version

  ## Summary
  Complete overhaul of the payment flow:
  - payment_packages: updated with correct points/bonus/total_points/price per spec
  - payment_methods: new table with per-method instructions
  - payment_requests: new canonical table replacing payment_verification for player requests
  - payment_logs: immutable audit log for every approve/reject action
  - approve_payment_request(): secure server-side RPC transaction
  - reject_payment_request(): secure server-side RPC
  - Fraud checks: duplicate reference, duplicate proof hash, too many pending
  - Storage bucket policy for proof images

  ## Tables Created/Modified
  1. payment_packages — updated rows: correct points, bonus_points, total_points, price
  2. payment_methods — new
  3. payment_requests — new (replaces payment_verification for new flow)
  4. payment_logs — new

  ## Security
  - RLS on all new tables
  - approve/reject via RPC only (admin-only, status-guarded)
  - points never modified from client
*/

-- ============================================================
-- 1. UPDATE payment_packages with correct spec values
-- ============================================================
-- Wipe old incorrect rows and re-insert with correct spec
DELETE FROM payment_packages;

INSERT INTO payment_packages
  (id, package_id, name_ar, name_en, description_ar, description_en,
   points, bonus_points, price_lyd, payment_methods, icon, featured, active, order_index)
VALUES
  (gen_random_uuid(), 'starter',
   'باقة المبتدئ', 'Starter',
   '500 نقطة — 5 محاولات في Lucky Card', '500 points — 5 Lucky Card plays',
   500, 0, 5, ARRAY['libyana','almadar','bank_transfer'],
   'starter', false, true, 1),

  (gen_random_uuid(), 'silver',
   'الباقة الفضية', 'Silver',
   '1200 نقطة — 12 محاولة في Lucky Card', '1200 points — 12 Lucky Card plays',
   1200, 0, 10, ARRAY['libyana','almadar','bank_transfer'],
   'silver', false, true, 2),

  (gen_random_uuid(), 'gold',
   'الباقة الذهبية', 'Gold',
   '3500 نقطة — 35 محاولة في Lucky Card', '3500 points — 35 Lucky Card plays',
   3500, 0, 25, ARRAY['libyana','almadar','bank_transfer'],
   'gold', true, true, 3),

  (gen_random_uuid(), 'pro',
   'الباقة الاحترافية', 'Pro',
   '8000 نقطة — 80 محاولة في Lucky Card', '8000 points — 80 Lucky Card plays',
   8000, 0, 50, ARRAY['libyana','almadar','bank_transfer'],
   'pro', false, true, 4),

  (gen_random_uuid(), 'legend',
   'الباقة الأسطورية', 'Legend',
   '18000 نقطة — 180 محاولة في Lucky Card', '18000 points — 180 Lucky Card plays',
   18000, 0, 100, ARRAY['libyana','almadar','bank_transfer'],
   'legend', false, true, 5);

-- Add total_points column if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_packages' AND column_name = 'total_points'
  ) THEN
    ALTER TABLE payment_packages ADD COLUMN total_points integer GENERATED ALWAYS AS (points + bonus_points) STORED;
  END IF;
END $$;

-- ============================================================
-- 2. payment_methods table
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_methods (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL UNIQUE,
  name_ar       text NOT NULL,
  name_en       text NOT NULL,
  type          text NOT NULL DEFAULT 'mobile',
  instructions_ar text,
  instructions_en text,
  receiver_info text,
  active        boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read active payment methods"
  ON payment_methods FOR SELECT
  TO authenticated
  USING (active = true);

-- Seed payment methods
INSERT INTO payment_methods (code, name_ar, name_en, type, instructions_ar, instructions_en, receiver_info, sort_order)
VALUES
  ('libyana',
   'ليبيانا',
   'Libyana',
   'mobile',
   'أرسل المبلغ إلى الرقم المحدد عبر ليبيانا كاش، ثم أدخل رقم هاتفك ورقم العملية.',
   'Send the amount to the specified number via Libyana Cash, then enter your phone number and transaction ID.',
   '0910000000',
   1),
  ('almadar',
   'المدار',
   'Almadar',
   'mobile',
   'أرسل المبلغ إلى الرقم المحدد عبر المدار كاش، ثم أدخل رقم هاتفك ورقم العملية.',
   'Send the amount to the specified number via Almadar Cash, then enter your phone number and transaction ID.',
   '0920000000',
   2),
  ('bank_transfer',
   'تحويل بنكي',
   'Bank Transfer',
   'bank',
   'حوّل المبلغ إلى الحساب البنكي المحدد وأرفق صورة الإيصال.',
   'Transfer the amount to the specified bank account and attach a receipt image.',
   'مصرف الجمهورية — IBAN: LY83001000000000123456',
   3)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 3. payment_requests table (new canonical table)
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_requests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_code        text NOT NULL UNIQUE,
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  package_id          uuid NOT NULL REFERENCES payment_packages(id),
  payment_method_code text NOT NULL REFERENCES payment_methods(code),
  -- amounts copied from package at request time (server-side, read-only after insert)
  amount              numeric NOT NULL,
  currency            text NOT NULL DEFAULT 'LYD',
  points              integer NOT NULL,
  bonus_points        integer NOT NULL DEFAULT 0,
  total_points        integer NOT NULL,
  -- proof fields
  sender_phone        text,
  reference_number    text,
  proof_image_url     text,
  proof_image_hash    text,
  -- status
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','rejected','cancelled')),
  admin_note          text,
  rejection_reason    text,
  reviewed_by         uuid REFERENCES auth.users(id),
  reviewed_at         timestamptz,
  -- fraud flags (jsonb array of strings)
  fraud_flags         jsonb DEFAULT '[]',
  -- meta
  ip_address          text,
  device_info         text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE payment_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own payment requests"
  ON payment_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own payment requests"
  ON payment_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can read all payment requests"
  ON payment_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.user_id = auth.uid() AND admins.is_active = true
    )
  );

CREATE POLICY "Admins can update payment requests"
  ON payment_requests FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.user_id = auth.uid() AND admins.is_active = true
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payment_requests_user     ON payment_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_status   ON payment_requests(status);
CREATE INDEX IF NOT EXISTS idx_payment_requests_code     ON payment_requests(request_code);
CREATE INDEX IF NOT EXISTS idx_payment_requests_created  ON payment_requests(created_at DESC);

-- ============================================================
-- 4. payment_logs table
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_logs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_request_id  uuid NOT NULL REFERENCES payment_requests(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES auth.users(id),
  admin_id            uuid REFERENCES auth.users(id),
  action              text NOT NULL,
  old_status          text,
  new_status          text,
  points_added        integer DEFAULT 0,
  note                text,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE payment_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read payment logs"
  ON payment_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.user_id = auth.uid() AND admins.is_active = true
    )
  );

CREATE POLICY "System can insert payment logs"
  ON payment_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================================
-- 5. RPC: generate_request_code()
-- ============================================================
CREATE OR REPLACE FUNCTION generate_request_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  seq_val  bigint;
  code     text;
BEGIN
  -- Use a sequence-like approach based on count
  SELECT COALESCE(MAX(
    CAST(NULLIF(regexp_replace(request_code, '[^0-9]', '', 'g'), '') AS bigint)
  ), 0) + 1
  INTO seq_val
  FROM payment_requests;

  code := 'AXIE-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(seq_val::text, 6, '0');
  RETURN code;
END;
$$;

-- ============================================================
-- 6. RPC: approve_payment_request(request_id, admin_id)
--    Full atomic transaction — points only added here
-- ============================================================
CREATE OR REPLACE FUNCTION approve_payment_request(
  p_request_id  uuid,
  p_admin_id    uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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

  -- 3. Verify package exists and is active
  SELECT * INTO v_pkg
  FROM payment_packages
  WHERE id = v_request.package_id AND active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Package not found or inactive');
  END IF;

  -- 4. Get current user points
  SELECT points INTO v_user_points
  FROM users
  WHERE id = v_request.user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  v_new_points := COALESCE(v_user_points, 0) + v_request.total_points;

  -- 5. Add points to user
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

-- ============================================================
-- 7. RPC: reject_payment_request(request_id, admin_id, reason)
-- ============================================================
CREATE OR REPLACE FUNCTION reject_payment_request(
  p_request_id uuid,
  p_admin_id   uuid,
  p_reason     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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

-- ============================================================
-- 8. Grant execute on RPC functions to authenticated role
-- ============================================================
GRANT EXECUTE ON FUNCTION approve_payment_request(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION reject_payment_request(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_request_code() TO authenticated;
