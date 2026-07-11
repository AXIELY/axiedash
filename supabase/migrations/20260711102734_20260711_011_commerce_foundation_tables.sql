/*
# Commerce & Payment Operations — Foundation Schema

Uses commerce_orders (not orders) to avoid conflict with existing orders table.
All operations are additive. Existing data/tables preserved.
*/

-- ─── Admin helper ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION is_commerce_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid() AND is_active = true);
$$;

-- ─── commerce_orders ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS commerce_orders (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_code                  text UNIQUE,
  user_id                     uuid NOT NULL REFERENCES users(id),
  order_type                  text NOT NULL CHECK (order_type IN ('POINT_PACKAGE','SERVICE','SUBSCRIPTION','DIGITAL_PRODUCT')),
  source                      text NOT NULL DEFAULT 'STORE',
  order_status                text NOT NULL DEFAULT 'DRAFT',
  payment_status              text NOT NULL DEFAULT 'NOT_SUBMITTED',
  fulfillment_status          text NOT NULL DEFAULT 'NOT_REQUIRED',
  currency                    text NOT NULL DEFAULT 'LYD',
  subtotal_snapshot           numeric(12,2) NOT NULL DEFAULT 0,
  promotion_discount_snapshot numeric(12,2) NOT NULL DEFAULT 0,
  coupon_discount_snapshot    numeric(12,2) NOT NULL DEFAULT 0,
  fees_snapshot               numeric(12,2) NOT NULL DEFAULT 0,
  final_total_snapshot        numeric(12,2) NOT NULL DEFAULT 0,
  promotion_id                uuid,
  coupon_id                   uuid,
  payment_method_id           uuid,
  customer_input_snapshot     jsonb NOT NULL DEFAULT '{}',
  internal_metadata           jsonb NOT NULL DEFAULT '{}',
  idempotency_key             text UNIQUE,
  expires_at                  timestamptz,
  submitted_at                timestamptz,
  paid_at                     timestamptz,
  completed_at                timestamptz,
  cancelled_at                timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_commerce_order_code()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_code text; v_ex boolean;
BEGIN
  IF NEW.order_code IS NULL THEN
    LOOP
      v_code := 'ORD-' || to_char(now(),'YYYY') || '-' || lpad(floor(random()*999999999)::text,9,'0');
      SELECT EXISTS(SELECT 1 FROM commerce_orders WHERE order_code = v_code) INTO v_ex;
      EXIT WHEN NOT v_ex;
    END LOOP;
    NEW.order_code := v_code;
  END IF;
  RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS trg_commerce_order_code ON commerce_orders;
CREATE TRIGGER trg_commerce_order_code BEFORE INSERT ON commerce_orders
  FOR EACH ROW EXECUTE FUNCTION set_commerce_order_code();

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_co_updated_at ON commerce_orders;
CREATE TRIGGER trg_co_updated_at BEFORE UPDATE ON commerce_orders
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_co_user_id    ON commerce_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_co_status     ON commerce_orders(order_status);
CREATE INDEX IF NOT EXISTS idx_co_pay_status ON commerce_orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_co_created_at ON commerce_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_co_idem_key   ON commerce_orders(idempotency_key) WHERE idempotency_key IS NOT NULL;

ALTER TABLE commerce_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "co_select" ON commerce_orders;
DROP POLICY IF EXISTS "co_insert" ON commerce_orders;
DROP POLICY IF EXISTS "co_update" ON commerce_orders;
CREATE POLICY "co_select" ON commerce_orders FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR is_commerce_admin());
CREATE POLICY "co_insert" ON commerce_orders FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "co_update" ON commerce_orders FOR UPDATE TO authenticated
  USING (is_commerce_admin()) WITH CHECK (is_commerce_admin());

-- ─── commerce_order_items ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS commerce_order_items (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                        uuid NOT NULL REFERENCES commerce_orders(id),
  item_type                       text NOT NULL,
  item_id                         uuid,
  item_name_ar_snapshot           text NOT NULL,
  item_name_en_snapshot           text,
  item_description_snapshot       text,
  unit_price_snapshot             numeric(12,2) NOT NULL,
  quantity                        numeric(10,3) NOT NULL DEFAULT 1,
  total_snapshot                  numeric(12,2) NOT NULL,
  base_points_snapshot            integer,
  package_bonus_points_snapshot   integer,
  promotion_bonus_points_snapshot integer DEFAULT 0,
  coupon_bonus_points_snapshot    integer DEFAULT 0,
  total_points_snapshot           integer,
  fulfillment_mode_snapshot       text,
  item_metadata_snapshot          jsonb NOT NULL DEFAULT '{}',
  created_at                      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coi_order ON commerce_order_items(order_id);
ALTER TABLE commerce_order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "coi_select" ON commerce_order_items;
CREATE POLICY "coi_select" ON commerce_order_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM commerce_orders o WHERE o.id = order_id AND (o.user_id = auth.uid() OR is_commerce_admin())));

-- ─── Extend payment_methods ──────────────────────────────────────────────
ALTER TABLE payment_methods
  ADD COLUMN IF NOT EXISTS description_ar         text,
  ADD COLUMN IF NOT EXISTS description_en         text,
  ADD COLUMN IF NOT EXISTS icon_url               text,
  ADD COLUMN IF NOT EXISTS is_maintenance         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_amount             numeric(12,2),
  ADD COLUMN IF NOT EXISTS max_amount             numeric(12,2),
  ADD COLUMN IF NOT EXISTS fixed_fee              numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percentage_fee         numeric(7,4)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS proof_required         boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reference_required     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payer_phone_required   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allowed_file_types     jsonb NOT NULL DEFAULT '["image/jpeg","image/png","image/webp"]',
  ADD COLUMN IF NOT EXISTS max_file_size_mb       numeric(5,2)  NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS request_expiry_minutes integer NOT NULL DEFAULT 1440,
  ADD COLUMN IF NOT EXISTS supported_item_types   jsonb DEFAULT '["POINT_PACKAGE","SERVICE"]',
  ADD COLUMN IF NOT EXISTS form_schema            jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS archived_at            timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at             timestamptz DEFAULT now();

-- ─── payment_destinations ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_destinations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_method_id uuid NOT NULL REFERENCES payment_methods(id),
  label_ar          text NOT NULL,
  label_en          text,
  account_holder    text,
  bank_name         text,
  account_number    text,
  iban              text,
  wallet_phone      text,
  branch_name       text,
  extra_details     jsonb DEFAULT '{}',
  is_active         boolean NOT NULL DEFAULT true,
  priority          integer NOT NULL DEFAULT 0,
  available_from    timestamptz,
  available_until   timestamptz,
  archived_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pay_dest_method ON payment_destinations(payment_method_id);
ALTER TABLE payment_destinations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pd_admin"  ON payment_destinations;
DROP POLICY IF EXISTS "pd_select" ON payment_destinations;
CREATE POLICY "pd_admin"  ON payment_destinations FOR ALL TO authenticated
  USING (is_commerce_admin()) WITH CHECK (is_commerce_admin());
CREATE POLICY "pd_select" ON payment_destinations FOR SELECT TO authenticated
  USING (is_active = true AND archived_at IS NULL);

-- ─── payment_proofs ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_proofs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_request_id uuid NOT NULL REFERENCES payment_requests(id),
  user_id            uuid NOT NULL REFERENCES users(id),
  storage_path       text NOT NULL,
  original_filename  text,
  mime_type          text,
  size_bytes         bigint,
  sha256_hash        text,
  version            integer NOT NULL DEFAULT 1,
  is_current         boolean NOT NULL DEFAULT true,
  uploaded_at        timestamptz NOT NULL DEFAULT now(),
  replaced_at        timestamptz
);
CREATE INDEX IF NOT EXISTS idx_proofs_req  ON payment_proofs(payment_request_id);
CREATE INDEX IF NOT EXISTS idx_proofs_user ON payment_proofs(user_id);
CREATE INDEX IF NOT EXISTS idx_proofs_hash ON payment_proofs(sha256_hash) WHERE sha256_hash IS NOT NULL;
ALTER TABLE payment_proofs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pp_own"    ON payment_proofs;
DROP POLICY IF EXISTS "pp_insert" ON payment_proofs;
DROP POLICY IF EXISTS "pp_admin"  ON payment_proofs;
CREATE POLICY "pp_own"    ON payment_proofs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "pp_insert" ON payment_proofs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "pp_admin"  ON payment_proofs FOR ALL    TO authenticated USING (is_commerce_admin()) WITH CHECK (is_commerce_admin());

-- ─── Extend payment_requests ─────────────────────────────────────────────
ALTER TABLE payment_requests
  ADD COLUMN IF NOT EXISTS commerce_order_id        uuid REFERENCES commerce_orders(id),
  ADD COLUMN IF NOT EXISTS payment_destination_id   uuid REFERENCES payment_destinations(id),
  ADD COLUMN IF NOT EXISTS payment_method_snapshot  jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS destination_snapshot     jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS review_started_at        timestamptz,
  ADD COLUMN IF NOT EXISTS review_lock_expires_at   timestamptz,
  ADD COLUMN IF NOT EXISTS assigned_reviewer_id     uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS rejection_reason_code    text,
  ADD COLUMN IF NOT EXISTS credited_at              timestamptz,
  ADD COLUMN IF NOT EXISTS risk_score               integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expires_at               timestamptz;

CREATE INDEX IF NOT EXISTS idx_pr_co_id ON payment_requests(commerce_order_id) WHERE commerce_order_id IS NOT NULL;

-- ─── payment_review_claims ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_review_claims (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_request_id uuid NOT NULL UNIQUE REFERENCES payment_requests(id),
  claimed_by         uuid NOT NULL REFERENCES users(id),
  claimed_at         timestamptz NOT NULL DEFAULT now(),
  lock_expires_at    timestamptz NOT NULL DEFAULT now() + interval '30 minutes',
  released_at        timestamptz
);
ALTER TABLE payment_review_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "prc_admin" ON payment_review_claims;
CREATE POLICY "prc_admin" ON payment_review_claims FOR ALL TO authenticated
  USING (is_commerce_admin()) WITH CHECK (is_commerce_admin());

-- ─── payment_approvals ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_approvals (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_request_id uuid NOT NULL REFERENCES payment_requests(id),
  admin_user_id      uuid NOT NULL REFERENCES users(id),
  approval_role      text NOT NULL CHECK (approval_role IN ('FIRST_APPROVER','SECOND_APPROVER')),
  decision           text NOT NULL CHECK (decision IN ('APPROVE','REJECT')),
  note               text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_request_id, admin_user_id, approval_role)
);
ALTER TABLE payment_approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pa_admin" ON payment_approvals;
CREATE POLICY "pa_admin" ON payment_approvals FOR ALL TO authenticated
  USING (is_commerce_admin()) WITH CHECK (is_commerce_admin());

-- ─── commerce_events (audit log) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS commerce_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type    text NOT NULL,
  entity_id      uuid,
  event_type     text NOT NULL,
  actor_user_id  uuid REFERENCES users(id),
  actor_role     text,
  previous_state jsonb,
  new_state      jsonb,
  metadata       jsonb DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ce_entity ON commerce_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_ce_time   ON commerce_events(created_at DESC);
ALTER TABLE commerce_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ce_insert" ON commerce_events;
DROP POLICY IF EXISTS "ce_admin"  ON commerce_events;
CREATE POLICY "ce_insert" ON commerce_events FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ce_admin"  ON commerce_events FOR SELECT TO authenticated USING (is_commerce_admin());

-- ─── rejection_reasons ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rejection_reasons (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code               text UNIQUE NOT NULL,
  label_ar           text NOT NULL,
  label_en           text,
  category           text NOT NULL DEFAULT 'PAYMENT',
  is_active          boolean NOT NULL DEFAULT true,
  allow_resubmit     boolean NOT NULL DEFAULT true,
  default_message_ar text,
  sort_order         integer NOT NULL DEFAULT 0,
  created_at         timestamptz DEFAULT now()
);
ALTER TABLE rejection_reasons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rr_admin"  ON rejection_reasons;
DROP POLICY IF EXISTS "rr_select" ON rejection_reasons;
CREATE POLICY "rr_admin"  ON rejection_reasons FOR ALL    TO authenticated USING (is_commerce_admin()) WITH CHECK (is_commerce_admin());
CREATE POLICY "rr_select" ON rejection_reasons FOR SELECT TO authenticated USING (is_active = true);

-- ─── commerce_settings ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS commerce_settings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key        text UNIQUE NOT NULL,
  value      jsonb NOT NULL,
  label_ar   text,
  category   text NOT NULL DEFAULT 'GENERAL',
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE commerce_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cs_admin"  ON commerce_settings;
DROP POLICY IF EXISTS "cs_select" ON commerce_settings;
CREATE POLICY "cs_admin"  ON commerce_settings FOR ALL    TO authenticated USING (is_commerce_admin()) WITH CHECK (is_commerce_admin());
CREATE POLICY "cs_select" ON commerce_settings FOR SELECT TO authenticated USING (true);

-- ─── Extend fulfillment_cases ────────────────────────────────────────────
ALTER TABLE fulfillment_cases
  ADD COLUMN IF NOT EXISTS commerce_order_id    uuid REFERENCES commerce_orders(id),
  ADD COLUMN IF NOT EXISTS commerce_payment_id  uuid REFERENCES payment_requests(id),
  ADD COLUMN IF NOT EXISTS source               text DEFAULT 'GAME_PRIZE';

CREATE INDEX IF NOT EXISTS idx_fc_co ON fulfillment_cases(commerce_order_id) WHERE commerce_order_id IS NOT NULL;
