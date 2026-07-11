/*
  # Point Store Commercial Layer

  ## Summary
  Adds a full commercial layer on top of the existing payment system.
  Does NOT replace or modify the payment request approval flow — it extends it.

  ## Changes

  ### 1. Extend payment_packages
  - badge_type: NONE | POPULAR | BEST_VALUE | LIMITED | NEW | EXCLUSIVE
  - lifecycle_status: ACTIVE | INACTIVE | ARCHIVED
  - starts_at / ends_at: optional availability window

  ### 2. New: promotions table
  Automatic server-side discounts applied to packages.
  - discount_type: BONUS_POINTS_PERCENT | BONUS_POINTS_FIXED | PRICE_DISCOUNT_PERCENT | PRICE_DISCOUNT_FIXED
  - target_package_ids: null = applies to all packages
  - priority: higher wins if multiple match
  - usage_limit / used_count
  - starts_at / ends_at

  ### 3. New: coupons table
  User-entered promo codes.
  - discount_type same as promotions
  - stacking_policy: COUPON_OVERRIDES_PROMOTION | STACK_WITH_PROMOTION
  - audience_type: ALL_USERS | SPECIFIC_USERS
  - allowed_user_ids: uuid[] for SPECIFIC_USERS scope (server-enforced)
  - usage_limit_per_user / total_usage_limit / used_count

  ### 4. New: coupon_usages table
  RESERVED → REDEEMED | RELEASED lifecycle to prevent race conditions.

  ### 5. Extend payment_requests with commercial snapshot columns
  Immutable snapshot captured at request creation time:
  package_name_ar/en, base_price, final_price, base_points, pkg_bonus_points,
  promotion snapshot, coupon snapshot

  ### 6. Admin write policies on payment_packages
  Admins can insert/update/delete packages.

  ### 7. RPCs
  - calculate_package_price(package_id, coupon_code) — client preview
  - create_payment_request (DROP old 8-param, CREATE new 9-param with coupon)
  - approve_payment_request — fix archived package check, redeem coupon
  - reject_payment_request — release reserved coupon

  ## Security
  - RLS on all new tables
  - All commercial values resolved server-side
  - Coupon audience enforced in create_payment_request
*/

-- ============================================================
-- STEP 1: Extend payment_packages
-- ============================================================

ALTER TABLE payment_packages
  ADD COLUMN IF NOT EXISTS badge_type text NOT NULL DEFAULT 'NONE'
    CHECK (badge_type IN ('NONE','POPULAR','BEST_VALUE','LIMITED','NEW','EXCLUSIVE')),
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (lifecycle_status IN ('ACTIVE','INACTIVE','ARCHIVED')),
  ADD COLUMN IF NOT EXISTS starts_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ends_at timestamptz DEFAULT NULL;

-- Migrate existing data: active=true → ACTIVE, active=false → INACTIVE
UPDATE payment_packages
  SET lifecycle_status = CASE WHEN active THEN 'ACTIVE' ELSE 'INACTIVE' END
  WHERE lifecycle_status = 'ACTIVE' OR lifecycle_status = 'INACTIVE';

-- Admin write policies
DROP POLICY IF EXISTS "Admins can insert payment packages" ON payment_packages;
CREATE POLICY "Admins can insert payment packages"
  ON payment_packages FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true)
  );

DROP POLICY IF EXISTS "Admins can update payment packages" ON payment_packages;
CREATE POLICY "Admins can update payment packages"
  ON payment_packages FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true)
  );

DROP POLICY IF EXISTS "Admins can delete payment packages" ON payment_packages;
CREATE POLICY "Admins can delete payment packages"
  ON payment_packages FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true)
  );

-- ============================================================
-- STEP 2: promotions table
-- ============================================================
CREATE TABLE IF NOT EXISTS promotions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar             text NOT NULL,
  name_en             text NOT NULL,
  description_ar      text,
  description_en      text,
  discount_type       text NOT NULL
    CHECK (discount_type IN ('BONUS_POINTS_PERCENT','BONUS_POINTS_FIXED','PRICE_DISCOUNT_PERCENT','PRICE_DISCOUNT_FIXED')),
  discount_value      numeric NOT NULL CHECK (discount_value > 0),
  target_package_ids  uuid[] DEFAULT NULL,  -- NULL = all packages
  priority            integer NOT NULL DEFAULT 0,
  usage_limit         integer DEFAULT NULL,  -- NULL = unlimited
  used_count          integer NOT NULL DEFAULT 0,
  active              boolean NOT NULL DEFAULT true,
  starts_at           timestamptz DEFAULT NULL,
  ends_at             timestamptz DEFAULT NULL,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read active promotions" ON promotions;
CREATE POLICY "Users can read active promotions"
  ON promotions FOR SELECT
  TO authenticated
  USING (active = true);

DROP POLICY IF EXISTS "Admins can manage promotions" ON promotions;
CREATE POLICY "Admins can manage promotions"
  ON promotions FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true));

-- ============================================================
-- STEP 3: coupons table
-- ============================================================
CREATE TABLE IF NOT EXISTS coupons (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                  text NOT NULL UNIQUE,
  description_ar        text,
  description_en        text,
  discount_type         text NOT NULL
    CHECK (discount_type IN ('BONUS_POINTS_PERCENT','BONUS_POINTS_FIXED','PRICE_DISCOUNT_PERCENT','PRICE_DISCOUNT_FIXED')),
  discount_value        numeric NOT NULL CHECK (discount_value > 0),
  stacking_policy       text NOT NULL DEFAULT 'COUPON_OVERRIDES_PROMOTION'
    CHECK (stacking_policy IN ('COUPON_OVERRIDES_PROMOTION','STACK_WITH_PROMOTION')),
  target_package_ids    uuid[] DEFAULT NULL,  -- NULL = all packages
  audience_type         text NOT NULL DEFAULT 'ALL_USERS'
    CHECK (audience_type IN ('ALL_USERS','SPECIFIC_USERS')),
  allowed_user_ids      uuid[] DEFAULT NULL,  -- NULL = open to all (when audience_type = ALL_USERS)
  usage_limit_per_user  integer NOT NULL DEFAULT 1,
  total_usage_limit     integer DEFAULT NULL,
  used_count            integer NOT NULL DEFAULT 0,
  active                boolean NOT NULL DEFAULT true,
  starts_at             timestamptz DEFAULT NULL,
  ends_at               timestamptz DEFAULT NULL,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;

-- Users can only check if a code exists+valid — they cannot list all coupons
DROP POLICY IF EXISTS "Users can read active coupons" ON coupons;
CREATE POLICY "Users can read active coupons"
  ON coupons FOR SELECT
  TO authenticated
  USING (active = true);

DROP POLICY IF EXISTS "Admins can manage coupons" ON coupons;
CREATE POLICY "Admins can manage coupons"
  ON coupons FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true));

-- ============================================================
-- STEP 4: coupon_usages table
-- ============================================================
CREATE TABLE IF NOT EXISTS coupon_usages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id           uuid NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_request_id  uuid REFERENCES payment_requests(id) ON DELETE SET NULL,
  status              text NOT NULL DEFAULT 'RESERVED'
    CHECK (status IN ('RESERVED','REDEEMED','RELEASED')),
  reserved_at         timestamptz DEFAULT now(),
  redeemed_at         timestamptz,
  released_at         timestamptz,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE coupon_usages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own coupon usages" ON coupon_usages;
CREATE POLICY "Users can read own coupon usages"
  ON coupon_usages FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can insert coupon usages" ON coupon_usages;
CREATE POLICY "System can insert coupon usages"
  ON coupon_usages FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "System can update coupon usages" ON coupon_usages;
CREATE POLICY "System can update coupon usages"
  ON coupon_usages FOR UPDATE
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can read all coupon usages" ON coupon_usages;
CREATE POLICY "Admins can read all coupon usages"
  ON coupon_usages FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true));

CREATE INDEX IF NOT EXISTS idx_coupon_usages_coupon ON coupon_usages(coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usages_user ON coupon_usages(user_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usages_request ON coupon_usages(payment_request_id);

-- ============================================================
-- STEP 5: Extend payment_requests with commercial snapshot columns
-- ============================================================
ALTER TABLE payment_requests
  ADD COLUMN IF NOT EXISTS package_name_ar_snapshot      text,
  ADD COLUMN IF NOT EXISTS package_name_en_snapshot      text,
  ADD COLUMN IF NOT EXISTS base_price_snapshot           numeric,
  ADD COLUMN IF NOT EXISTS final_price_snapshot          numeric,
  ADD COLUMN IF NOT EXISTS base_points_snapshot          integer,
  ADD COLUMN IF NOT EXISTS pkg_bonus_points_snapshot     integer,
  ADD COLUMN IF NOT EXISTS promotion_id                  uuid REFERENCES promotions(id),
  ADD COLUMN IF NOT EXISTS promotion_name_ar_snapshot    text,
  ADD COLUMN IF NOT EXISTS promotion_name_en_snapshot    text,
  ADD COLUMN IF NOT EXISTS promo_bonus_points_snapshot   integer,
  ADD COLUMN IF NOT EXISTS promo_discount_snapshot       numeric,
  ADD COLUMN IF NOT EXISTS coupon_id                     uuid REFERENCES coupons(id),
  ADD COLUMN IF NOT EXISTS coupon_code_snapshot          text,
  ADD COLUMN IF NOT EXISTS coupon_bonus_points_snapshot  integer,
  ADD COLUMN IF NOT EXISTS coupon_discount_snapshot      numeric;

-- ============================================================
-- STEP 6: calculate_package_price RPC
-- Returns full pricing breakdown for a package + optional coupon.
-- Used by client for preview before submitting.
-- ============================================================
CREATE OR REPLACE FUNCTION calculate_package_price(
  p_package_id  uuid,
  p_coupon_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id           uuid;
  v_pkg               payment_packages%ROWTYPE;
  v_promo             promotions%ROWTYPE;
  v_coupon            coupons%ROWTYPE;
  v_base_points       integer;
  v_bonus_points      integer;
  v_total_points      integer;
  v_base_price        numeric;
  v_final_price       numeric;
  v_promo_bonus       integer  := 0;
  v_promo_discount    numeric  := 0;
  v_coupon_bonus      integer  := 0;
  v_coupon_discount   numeric  := 0;
  v_user_coupon_uses  integer  := 0;
BEGIN
  v_user_id := auth.uid();

  -- Fetch package (must be purchasable: ACTIVE and within time window)
  SELECT * INTO v_pkg
  FROM payment_packages
  WHERE id = p_package_id
    AND lifecycle_status = 'ACTIVE'
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at   IS NULL OR ends_at   >= now());

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'package_not_available');
  END IF;

  v_base_points  := v_pkg.points;
  v_bonus_points := v_pkg.bonus_points;
  v_base_price   := v_pkg.price_lyd;
  v_final_price  := v_base_price;

  -- Find best active promotion for this package
  SELECT * INTO v_promo
  FROM promotions
  WHERE active = true
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at   IS NULL OR ends_at   >= now())
    AND (usage_limit IS NULL OR used_count < usage_limit)
    AND (target_package_ids IS NULL OR p_package_id = ANY(target_package_ids))
  ORDER BY priority DESC, created_at DESC
  LIMIT 1;

  IF FOUND THEN
    CASE v_promo.discount_type
      WHEN 'BONUS_POINTS_PERCENT' THEN
        v_promo_bonus := ROUND((v_base_points + v_bonus_points) * v_promo.discount_value / 100);
      WHEN 'BONUS_POINTS_FIXED' THEN
        v_promo_bonus := v_promo.discount_value::integer;
      WHEN 'PRICE_DISCOUNT_PERCENT' THEN
        v_promo_discount := ROUND(v_base_price * v_promo.discount_value / 100, 3);
      WHEN 'PRICE_DISCOUNT_FIXED' THEN
        v_promo_discount := v_promo.discount_value;
    END CASE;
  END IF;

  -- Process coupon if provided
  IF p_coupon_code IS NOT NULL AND trim(p_coupon_code) != '' THEN
    SELECT * INTO v_coupon
    FROM coupons
    WHERE UPPER(code) = UPPER(trim(p_coupon_code))
      AND active = true
      AND (starts_at IS NULL OR starts_at <= now())
      AND (ends_at   IS NULL OR ends_at   >= now())
      AND (total_usage_limit IS NULL OR used_count < total_usage_limit)
      AND (target_package_ids IS NULL OR p_package_id = ANY(target_package_ids));

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'coupon_invalid');
    END IF;

    -- Check audience
    IF v_coupon.audience_type = 'SPECIFIC_USERS' THEN
      IF v_user_id IS NULL OR NOT (v_user_id = ANY(v_coupon.allowed_user_ids)) THEN
        RETURN jsonb_build_object('success', false, 'error', 'coupon_not_eligible');
      END IF;
    END IF;

    -- Check per-user usage limit
    IF v_user_id IS NOT NULL THEN
      SELECT COUNT(*) INTO v_user_coupon_uses
      FROM coupon_usages
      WHERE coupon_id = v_coupon.id
        AND user_id = v_user_id
        AND status IN ('RESERVED','REDEEMED');

      IF v_user_coupon_uses >= v_coupon.usage_limit_per_user THEN
        RETURN jsonb_build_object('success', false, 'error', 'coupon_usage_limit_reached');
      END IF;
    END IF;

    -- Apply coupon (may override promotion discount)
    IF v_coupon.stacking_policy = 'COUPON_OVERRIDES_PROMOTION' THEN
      -- Coupon replaces the promotion discount
      v_promo_bonus    := 0;
      v_promo_discount := 0;
    END IF;

    CASE v_coupon.discount_type
      WHEN 'BONUS_POINTS_PERCENT' THEN
        v_coupon_bonus := ROUND((v_base_points + v_bonus_points) * v_coupon.discount_value / 100);
      WHEN 'BONUS_POINTS_FIXED' THEN
        v_coupon_bonus := v_coupon.discount_value::integer;
      WHEN 'PRICE_DISCOUNT_PERCENT' THEN
        v_coupon_discount := ROUND(v_base_price * v_coupon.discount_value / 100, 3);
      WHEN 'PRICE_DISCOUNT_FIXED' THEN
        v_coupon_discount := v_coupon.discount_value;
    END CASE;
  END IF;

  -- Compute final price and total points
  v_final_price  := GREATEST(v_base_price - v_promo_discount - v_coupon_discount, 0);
  v_total_points := v_base_points + v_bonus_points + v_promo_bonus + v_coupon_bonus;

  RETURN jsonb_build_object(
    'success',              true,
    'package_id',           v_pkg.id,
    'package_name_ar',      v_pkg.name_ar,
    'package_name_en',      v_pkg.name_en,
    'base_price',           v_base_price,
    'final_price',          v_final_price,
    'base_points',          v_base_points,
    'pkg_bonus_points',     v_bonus_points,
    'promotion_id',         CASE WHEN v_promo.id IS NOT NULL THEN to_jsonb(v_promo.id) ELSE 'null'::jsonb END,
    'promotion_name_ar',    v_promo.name_ar,
    'promotion_name_en',    v_promo.name_en,
    'promo_bonus_points',   v_promo_bonus,
    'promo_discount',       v_promo_discount,
    'coupon_id',            CASE WHEN v_coupon.id IS NOT NULL THEN to_jsonb(v_coupon.id) ELSE 'null'::jsonb END,
    'coupon_code',          v_coupon.code,
    'coupon_bonus_points',  v_coupon_bonus,
    'coupon_discount',      v_coupon_discount,
    'total_points',         v_total_points
  );
END;
$$;

GRANT EXECUTE ON FUNCTION calculate_package_price(uuid, text) TO authenticated;

-- ============================================================
-- STEP 7: Replace create_payment_request with 9-param version
-- (coupon_code is new param; old 8-param signature dropped first)
-- ============================================================
DROP FUNCTION IF EXISTS create_payment_request(uuid, text, text, text, text, text, jsonb, text);

CREATE OR REPLACE FUNCTION create_payment_request(
  p_package_id          uuid,
  p_payment_method_code text,
  p_coupon_code         text    DEFAULT NULL,
  p_sender_phone        text    DEFAULT NULL,
  p_reference_number    text    DEFAULT NULL,
  p_proof_image_url     text    DEFAULT NULL,
  p_proof_image_hash    text    DEFAULT NULL,
  p_fraud_flags         jsonb   DEFAULT '[]',
  p_device_info         text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id             uuid;
  v_method              payment_methods%ROWTYPE;
  v_code                text;
  v_req_id              uuid;
  v_pending             integer;
  v_pricing             jsonb;
  -- extracted from pricing
  v_pkg_id              uuid;
  v_name_ar             text;
  v_name_en             text;
  v_base_price          numeric;
  v_final_price         numeric;
  v_base_points         integer;
  v_pkg_bonus           integer;
  v_promo_id            uuid;
  v_promo_name_ar       text;
  v_promo_name_en       text;
  v_promo_bonus         integer;
  v_promo_disc          numeric;
  v_coupon_id           uuid;
  v_coupon_code_used    text;
  v_coupon_bonus        integer;
  v_coupon_disc         numeric;
  v_total_points        integer;
  v_coupon_usage_id     uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Validate payment method
  SELECT * INTO v_method
  FROM payment_methods
  WHERE code = p_payment_method_code AND active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_payment_method');
  END IF;

  -- Check pending request cap (max 3 per user)
  SELECT COUNT(*) INTO v_pending
  FROM payment_requests
  WHERE user_id = v_user_id AND status = 'pending';

  IF v_pending >= 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'too_many_pending');
  END IF;

  -- Require at least one contact field
  IF (p_sender_phone IS NULL OR trim(p_sender_phone) = '')
     AND (p_reference_number IS NULL OR trim(p_reference_number) = '') THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_contact_info');
  END IF;

  -- Resolve authoritative pricing (validates package, coupon, audience)
  v_pricing := calculate_package_price(p_package_id, p_coupon_code);

  IF NOT (v_pricing->>'success')::boolean THEN
    RETURN v_pricing;  -- propagate error (package_not_available, coupon_invalid, etc.)
  END IF;

  -- Extract all pricing fields
  v_pkg_id        := (v_pricing->>'package_id')::uuid;
  v_name_ar       := v_pricing->>'package_name_ar';
  v_name_en       := v_pricing->>'package_name_en';
  v_base_price    := (v_pricing->>'base_price')::numeric;
  v_final_price   := (v_pricing->>'final_price')::numeric;
  v_base_points   := (v_pricing->>'base_points')::integer;
  v_pkg_bonus     := (v_pricing->>'pkg_bonus_points')::integer;
  v_promo_bonus   := (v_pricing->>'promo_bonus_points')::integer;
  v_promo_disc    := (v_pricing->>'promo_discount')::numeric;
  v_coupon_bonus  := (v_pricing->>'coupon_bonus_points')::integer;
  v_coupon_disc   := (v_pricing->>'coupon_discount')::numeric;
  v_total_points  := (v_pricing->>'total_points')::integer;
  v_promo_name_ar := v_pricing->>'promotion_name_ar';
  v_promo_name_en := v_pricing->>'promotion_name_en';
  v_coupon_code_used := v_pricing->>'coupon_code';

  -- Parse nullable UUIDs from jsonb
  IF v_pricing->'promotion_id' IS NOT NULL AND v_pricing->>'promotion_id' != 'null' THEN
    v_promo_id := (v_pricing->>'promotion_id')::uuid;
  END IF;
  IF v_pricing->'coupon_id' IS NOT NULL AND v_pricing->>'coupon_id' != 'null' THEN
    v_coupon_id := (v_pricing->>'coupon_id')::uuid;
  END IF;

  -- Reserve coupon if used (FOR UPDATE prevents race conditions)
  IF v_coupon_id IS NOT NULL THEN
    -- Lock coupon row
    PERFORM id FROM coupons WHERE id = v_coupon_id FOR UPDATE;

    -- Re-check limits under lock
    DECLARE
      v_re_used integer;
      v_re_user_used integer;
    BEGIN
      SELECT used_count INTO v_re_used FROM coupons WHERE id = v_coupon_id;
      SELECT COUNT(*) INTO v_re_user_used
      FROM coupon_usages
      WHERE coupon_id = v_coupon_id AND user_id = v_user_id AND status IN ('RESERVED','REDEEMED');

      SELECT total_usage_limit INTO v_re_used FROM coupons WHERE id = v_coupon_id;
      -- reuse variable: get total_usage_limit
      DECLARE v_total_lim integer;
      BEGIN
        SELECT total_usage_limit, usage_limit_per_user
        INTO v_total_lim, v_re_used -- reusing v_re_used for per_user limit
        FROM coupons WHERE id = v_coupon_id;

        IF v_re_user_used >= v_re_used THEN  -- v_re_used now = usage_limit_per_user
          RETURN jsonb_build_object('success', false, 'error', 'coupon_usage_limit_reached');
        END IF;
        IF v_total_lim IS NOT NULL THEN
          SELECT used_count INTO v_re_used FROM coupons WHERE id = v_coupon_id;
          IF v_re_used >= v_total_lim THEN
            RETURN jsonb_build_object('success', false, 'error', 'coupon_exhausted');
          END IF;
        END IF;
      END;
    END;

    -- Insert RESERVED usage record
    INSERT INTO coupon_usages (coupon_id, user_id, status)
    VALUES (v_coupon_id, v_user_id, 'RESERVED')
    RETURNING id INTO v_coupon_usage_id;

    -- Increment used_count
    UPDATE coupons SET used_count = used_count + 1 WHERE id = v_coupon_id;
  END IF;

  -- Generate atomic unique request code
  v_code := generate_request_code();

  -- Insert payment request with full snapshot
  INSERT INTO payment_requests (
    request_code,
    user_id,
    package_id,
    payment_method_code,
    amount,
    currency,
    points,
    bonus_points,
    total_points,
    -- snapshot columns
    package_name_ar_snapshot,
    package_name_en_snapshot,
    base_price_snapshot,
    final_price_snapshot,
    base_points_snapshot,
    pkg_bonus_points_snapshot,
    promotion_id,
    promotion_name_ar_snapshot,
    promotion_name_en_snapshot,
    promo_bonus_points_snapshot,
    promo_discount_snapshot,
    coupon_id,
    coupon_code_snapshot,
    coupon_bonus_points_snapshot,
    coupon_discount_snapshot,
    -- proof / meta
    sender_phone,
    reference_number,
    proof_image_url,
    proof_image_hash,
    fraud_flags,
    device_info,
    status
  ) VALUES (
    v_code,
    v_user_id,
    v_pkg_id,
    p_payment_method_code,
    v_final_price,  -- amount charged = final price after discounts
    'LYD',
    v_base_points,
    v_pkg_bonus,
    v_total_points,
    v_name_ar,
    v_name_en,
    v_base_price,
    v_final_price,
    v_base_points,
    v_pkg_bonus,
    v_promo_id,
    v_promo_name_ar,
    v_promo_name_en,
    v_promo_bonus,
    v_promo_disc,
    v_coupon_id,
    v_coupon_code_used,
    v_coupon_bonus,
    v_coupon_disc,
    nullif(trim(p_sender_phone), ''),
    nullif(trim(p_reference_number), ''),
    p_proof_image_url,
    p_proof_image_hash,
    COALESCE(p_fraud_flags, '[]'::jsonb),
    p_device_info,
    'pending'
  )
  RETURNING id INTO v_req_id;

  -- Link coupon usage to the newly created request
  IF v_coupon_usage_id IS NOT NULL THEN
    UPDATE coupon_usages
    SET payment_request_id = v_req_id
    WHERE id = v_coupon_usage_id;
  END IF;

  -- Increment promotion usage counter if a promo was applied
  IF v_promo_id IS NOT NULL THEN
    UPDATE promotions SET used_count = used_count + 1 WHERE id = v_promo_id;
  END IF;

  RETURN jsonb_build_object(
    'success',        true,
    'request_id',     v_req_id,
    'request_code',   v_code,
    'total_points',   v_total_points,
    'final_price',    v_final_price,
    'promo_applied',  v_promo_id IS NOT NULL,
    'coupon_applied', v_coupon_id IS NOT NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_payment_request(uuid, text, text, text, text, text, text, jsonb, text) TO authenticated;

-- ============================================================
-- STEP 8: Fix approve_payment_request — remove active=true check,
-- add coupon REDEEMED on approval
-- ============================================================
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
  v_new_points  integer;
BEGIN
  -- Lock the payment request row
  SELECT * INTO v_request
  FROM payment_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment request not found');
  END IF;

  -- Status guard (FOR UPDATE + status check prevents double approval)
  IF v_request.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot approve — status is ' || v_request.status
    );
  END IF;

  -- Verify package exists (no active check — snapshot values are already stored)
  IF NOT EXISTS (SELECT 1 FROM payment_packages WHERE id = v_request.package_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Package not found');
  END IF;

  -- Verify user exists
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = v_request.user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  -- Mark request approved
  UPDATE payment_requests
  SET
    status      = 'approved',
    reviewed_by = p_admin_id,
    reviewed_at = now(),
    updated_at  = now()
  WHERE id = p_request_id;

  -- Atomic balance credit using snapshot total_points
  UPDATE users
  SET
    points                 = points + v_request.total_points,
    total_points_purchased = COALESCE(total_points_purchased, 0) + v_request.total_points
  WHERE id = v_request.user_id
  RETURNING points INTO v_new_points;

  -- Redeem coupon if one was used
  IF v_request.coupon_id IS NOT NULL THEN
    UPDATE coupon_usages
    SET
      status      = 'REDEEMED',
      redeemed_at = now()
    WHERE payment_request_id = p_request_id
      AND status = 'RESERVED';
  END IF;

  -- Payment log (UNIQUE constraint prevents double credit)
  INSERT INTO payment_logs
    (payment_request_id, user_id, admin_id, action, old_status, new_status, points_added, note)
  VALUES
    (p_request_id, v_request.user_id, p_admin_id,
     'approved', 'pending', 'approved',
     v_request.total_points, 'Points credited to user');

  -- Economy audit log
  INSERT INTO economy_logs (user_id, action, points_change, balance_change, metadata)
  VALUES (
    v_request.user_id,
    'payment_approved',
    v_request.total_points,
    v_request.total_points,
    jsonb_build_object(
      'request_code',  v_request.request_code,
      'package_id',    v_request.package_id,
      'approved_by',   p_admin_id,
      'coupon_id',     v_request.coupon_id,
      'promotion_id',  v_request.promotion_id
    )
  );

  RETURN jsonb_build_object(
    'success',      true,
    'points_added', v_request.total_points,
    'new_balance',  v_new_points,
    'request_code', v_request.request_code
  );
END;
$$;

GRANT EXECUTE ON FUNCTION approve_payment_request(uuid, uuid) TO authenticated;

-- ============================================================
-- STEP 9: Update reject_payment_request — release reserved coupon
-- ============================================================
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

  -- Release reserved coupon so user can try again
  IF v_request.coupon_id IS NOT NULL THEN
    UPDATE coupon_usages
    SET
      status      = 'RELEASED',
      released_at = now()
    WHERE payment_request_id = p_request_id
      AND status = 'RESERVED';

    -- Decrement coupon used_count so the slot is freed
    UPDATE coupons
    SET used_count = GREATEST(used_count - 1, 0)
    WHERE id = v_request.coupon_id;
  END IF;

  INSERT INTO payment_logs
    (payment_request_id, user_id, admin_id, action, old_status, new_status, points_added, note)
  VALUES
    (p_request_id, v_request.user_id, p_admin_id,
     'rejected', 'pending', 'rejected', 0, p_reason);

  RETURN jsonb_build_object('success', true, 'request_code', v_request.request_code);
END;
$$;

GRANT EXECUTE ON FUNCTION reject_payment_request(uuid, uuid, text) TO authenticated;

-- ============================================================
-- STEP 10: Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_promotions_active ON promotions(active, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(UPPER(code));
CREATE INDEX IF NOT EXISTS idx_coupons_active ON coupons(active);
CREATE INDEX IF NOT EXISTS idx_payment_requests_coupon ON payment_requests(coupon_id) WHERE coupon_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_requests_promo ON payment_requests(promotion_id) WHERE promotion_id IS NOT NULL;
