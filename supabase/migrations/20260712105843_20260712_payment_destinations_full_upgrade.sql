/*
# Payment Destinations Full Upgrade

## Summary
Extends payment_destinations with all type-specific fields, adds a complete
server-side destination selection RPC, adds destination validation, adds audit
events for destination changes, and fixes RLS so customers never see raw
destination rows while admins can manage them.

## Changes

### payment_destinations
- Added receiver_phone (for LIBYANA / ALMADAR / MOBILE_WALLET)
- Added receiver_name (display name for mobile methods)
- Added wallet_provider (MOBILE_WALLET)
- Added swift_code (BANK_TRANSFER)
- Added transfer_service_name (LIBYANA/ALMADAR)
- Added confirmation_instructions (LIBYANA/ALMADAR specific note)
- Added depositor_reference_instructions (CASH_DEPOSIT)
- Added public_notes_ar / public_notes_en (customer-visible notes)
- Added internal_notes (admin-only)
- Added is_maintenance (per-destination maintenance flag)
- Added daily_capacity (nullable integer — max transactions per day)
- Added min_amount / max_amount (per-destination amount limits)
- Added bank_name_en (bilingual bank name)

### payment_methods — extended snapshot field
- Added required_fields_schema (jsonb) — dynamic form schema per method
- Added short_notice_ar / short_notice_en
- Added warning_notice_ar / warning_notice_en
- Added confirmation_note_ar / confirmation_note_en
- Added support_contact_ar / support_contact_en
- Added display_order (alias for sort_order with clearer semantics)

### payment_requests — snapshot fields
- Added required_fields_snapshot (jsonb) — snapshot of what fields were required
- Added proof_rules_snapshot (jsonb) — proof upload rules at time of request

### New RPC: select_payment_destination(p_method_id, p_amount)
- Server-side: selects best available active destination
- Validates method availability (active, not maintenance, amount limits)
- Validates destination availability (active, not maintenance, capacity, amount, schedule)
- Returns safe customer-facing snapshot (no internal fields)
- Used by create_payment_request

### RLS
- Customers: zero direct select on payment_destinations (only via RPC snapshots)
- Admins: full CRUD via is_commerce_admin() check

### Audit
- destination_changes table for tracking admin edits
*/

-- ============================================================
-- 1. Extend payment_destinations with missing type-specific fields
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_destinations' AND column_name='receiver_phone') THEN
    ALTER TABLE payment_destinations ADD COLUMN receiver_phone text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_destinations' AND column_name='receiver_name') THEN
    ALTER TABLE payment_destinations ADD COLUMN receiver_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_destinations' AND column_name='wallet_provider') THEN
    ALTER TABLE payment_destinations ADD COLUMN wallet_provider text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_destinations' AND column_name='swift_code') THEN
    ALTER TABLE payment_destinations ADD COLUMN swift_code text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_destinations' AND column_name='transfer_service_name') THEN
    ALTER TABLE payment_destinations ADD COLUMN transfer_service_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_destinations' AND column_name='confirmation_instructions') THEN
    ALTER TABLE payment_destinations ADD COLUMN confirmation_instructions text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_destinations' AND column_name='depositor_reference_instructions') THEN
    ALTER TABLE payment_destinations ADD COLUMN depositor_reference_instructions text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_destinations' AND column_name='public_notes_ar') THEN
    ALTER TABLE payment_destinations ADD COLUMN public_notes_ar text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_destinations' AND column_name='public_notes_en') THEN
    ALTER TABLE payment_destinations ADD COLUMN public_notes_en text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_destinations' AND column_name='internal_notes') THEN
    ALTER TABLE payment_destinations ADD COLUMN internal_notes text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_destinations' AND column_name='is_maintenance') THEN
    ALTER TABLE payment_destinations ADD COLUMN is_maintenance boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_destinations' AND column_name='daily_capacity') THEN
    ALTER TABLE payment_destinations ADD COLUMN daily_capacity integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_destinations' AND column_name='min_amount') THEN
    ALTER TABLE payment_destinations ADD COLUMN min_amount numeric(12,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_destinations' AND column_name='max_amount') THEN
    ALTER TABLE payment_destinations ADD COLUMN max_amount numeric(12,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_destinations' AND column_name='bank_name_en') THEN
    ALTER TABLE payment_destinations ADD COLUMN bank_name_en text;
  END IF;
END $$;

-- ============================================================
-- 2. Extend payment_methods with presentation/UX fields
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_methods' AND column_name='required_fields_schema') THEN
    ALTER TABLE payment_methods ADD COLUMN required_fields_schema jsonb DEFAULT '[]';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_methods' AND column_name='short_notice_ar') THEN
    ALTER TABLE payment_methods ADD COLUMN short_notice_ar text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_methods' AND column_name='short_notice_en') THEN
    ALTER TABLE payment_methods ADD COLUMN short_notice_en text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_methods' AND column_name='warning_notice_ar') THEN
    ALTER TABLE payment_methods ADD COLUMN warning_notice_ar text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_methods' AND column_name='warning_notice_en') THEN
    ALTER TABLE payment_methods ADD COLUMN warning_notice_en text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_methods' AND column_name='confirmation_note_ar') THEN
    ALTER TABLE payment_methods ADD COLUMN confirmation_note_ar text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_methods' AND column_name='confirmation_note_en') THEN
    ALTER TABLE payment_methods ADD COLUMN confirmation_note_en text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_methods' AND column_name='support_contact_ar') THEN
    ALTER TABLE payment_methods ADD COLUMN support_contact_ar text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_methods' AND column_name='support_contact_en') THEN
    ALTER TABLE payment_methods ADD COLUMN support_contact_en text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_methods' AND column_name='supported_order_types') THEN
    ALTER TABLE payment_methods ADD COLUMN supported_order_types jsonb DEFAULT '["POINT_PACKAGE","SERVICE","SUBSCRIPTION","DIGITAL_PRODUCT"]';
  END IF;
END $$;

-- ============================================================
-- 3. Extend payment_requests with snapshot fields
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_requests' AND column_name='required_fields_snapshot') THEN
    ALTER TABLE payment_requests ADD COLUMN required_fields_snapshot jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_requests' AND column_name='proof_rules_snapshot') THEN
    ALTER TABLE payment_requests ADD COLUMN proof_rules_snapshot jsonb;
  END IF;
END $$;

-- ============================================================
-- 4. destination_changes audit table
-- ============================================================
CREATE TABLE IF NOT EXISTS destination_changes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_id  uuid NOT NULL REFERENCES payment_destinations(id),
  admin_id        uuid NOT NULL REFERENCES auth.users(id),
  action          text NOT NULL, -- CREATED, UPDATED, ARCHIVED, ACTIVATED, DEACTIVATED
  old_state       jsonb,
  new_state       jsonb,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE destination_changes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins_read_destination_changes" ON destination_changes;
CREATE POLICY "admins_read_destination_changes" ON destination_changes
  FOR SELECT TO authenticated
  USING (public.is_commerce_admin());
DROP POLICY IF EXISTS "admins_insert_destination_changes" ON destination_changes;
CREATE POLICY "admins_insert_destination_changes" ON destination_changes
  FOR INSERT TO authenticated
  WITH CHECK (public.is_commerce_admin());

-- ============================================================
-- 5. RLS on payment_destinations
--    Customers: no direct read access (receive only via RPC snapshots)
--    Admins: full management
-- ============================================================
ALTER TABLE payment_destinations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_select_destinations" ON payment_destinations;
CREATE POLICY "admins_select_destinations" ON payment_destinations
  FOR SELECT TO authenticated
  USING (public.is_commerce_admin());

DROP POLICY IF EXISTS "admins_insert_destinations" ON payment_destinations;
CREATE POLICY "admins_insert_destinations" ON payment_destinations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_commerce_admin());

DROP POLICY IF EXISTS "admins_update_destinations" ON payment_destinations;
CREATE POLICY "admins_update_destinations" ON payment_destinations
  FOR UPDATE TO authenticated
  USING (public.is_commerce_admin())
  WITH CHECK (public.is_commerce_admin());

DROP POLICY IF EXISTS "admins_delete_destinations" ON payment_destinations;
CREATE POLICY "admins_delete_destinations" ON payment_destinations
  FOR DELETE TO authenticated
  USING (public.is_commerce_admin());

-- ============================================================
-- 6. RLS on payment_methods — allow admins to manage
-- ============================================================
DROP POLICY IF EXISTS "admins_insert_payment_methods" ON payment_methods;
CREATE POLICY "admins_insert_payment_methods" ON payment_methods
  FOR INSERT TO authenticated
  WITH CHECK (public.is_commerce_admin());

DROP POLICY IF EXISTS "admins_update_payment_methods" ON payment_methods;
CREATE POLICY "admins_update_payment_methods" ON payment_methods
  FOR UPDATE TO authenticated
  USING (public.is_commerce_admin())
  WITH CHECK (public.is_commerce_admin());

-- ============================================================
-- 7. RPC: get_payment_methods_admin — full data for admin editor
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_payment_methods_admin()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_commerce_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT jsonb_agg(row_to_json(q) ORDER BY q.sort_order) INTO v_result
  FROM (
    SELECT
      pm.*,
      COALESCE((
        SELECT jsonb_agg(row_to_json(pd) ORDER BY pd.priority, pd.created_at)
        FROM payment_destinations pd
        WHERE pd.payment_method_id = pm.id AND pd.archived_at IS NULL
      ), '[]'::jsonb) AS destinations,
      (SELECT COUNT(*) FROM payment_destinations pd WHERE pd.payment_method_id = pm.id AND pd.archived_at IS NULL) AS total_destinations,
      (SELECT COUNT(*) FROM payment_destinations pd WHERE pd.payment_method_id = pm.id AND pd.is_active = true AND pd.archived_at IS NULL AND pd.is_maintenance = false) AS active_destinations
    FROM payment_methods pm
    WHERE pm.archived_at IS NULL
  ) q;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_payment_methods_admin() TO authenticated;

-- ============================================================
-- 8. RPC: upsert_payment_method — admin creates/updates a method
-- ============================================================
CREATE OR REPLACE FUNCTION public.upsert_payment_method(
  p_id                    uuid DEFAULT NULL,
  p_code                  text DEFAULT NULL,
  p_name_ar               text DEFAULT NULL,
  p_name_en               text DEFAULT NULL,
  p_description_ar        text DEFAULT NULL,
  p_description_en        text DEFAULT NULL,
  p_type                  text DEFAULT NULL,
  p_icon_url              text DEFAULT NULL,
  p_active                boolean DEFAULT NULL,
  p_is_maintenance        boolean DEFAULT NULL,
  p_sort_order            integer DEFAULT NULL,
  p_min_amount            numeric DEFAULT NULL,
  p_max_amount            numeric DEFAULT NULL,
  p_fixed_fee             numeric DEFAULT NULL,
  p_percentage_fee        numeric DEFAULT NULL,
  p_proof_required        boolean DEFAULT NULL,
  p_reference_required    boolean DEFAULT NULL,
  p_payer_phone_required  boolean DEFAULT NULL,
  p_allowed_file_types    jsonb DEFAULT NULL,
  p_max_file_size_mb      numeric DEFAULT NULL,
  p_request_expiry_minutes integer DEFAULT NULL,
  p_supported_order_types jsonb DEFAULT NULL,
  p_required_fields_schema jsonb DEFAULT NULL,
  p_instructions_ar       text DEFAULT NULL,
  p_instructions_en       text DEFAULT NULL,
  p_short_notice_ar       text DEFAULT NULL,
  p_short_notice_en       text DEFAULT NULL,
  p_warning_notice_ar     text DEFAULT NULL,
  p_warning_notice_en     text DEFAULT NULL,
  p_confirmation_note_ar  text DEFAULT NULL,
  p_confirmation_note_en  text DEFAULT NULL,
  p_support_contact_ar    text DEFAULT NULL,
  p_support_contact_en    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_method_id uuid;
  v_is_new boolean := false;
  v_old_state jsonb;
BEGIN
  IF NOT public.is_commerce_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF p_id IS NULL THEN
    -- Create new
    IF p_code IS NULL OR p_name_ar IS NULL THEN
      RAISE EXCEPTION 'CODE_AND_NAME_REQUIRED';
    END IF;
    INSERT INTO payment_methods (
      code, name_ar, name_en, description_ar, description_en, type, icon_url,
      active, is_maintenance, sort_order, min_amount, max_amount,
      fixed_fee, percentage_fee, proof_required, reference_required, payer_phone_required,
      allowed_file_types, max_file_size_mb, request_expiry_minutes, supported_order_types,
      required_fields_schema, instructions_ar, instructions_en,
      short_notice_ar, short_notice_en, warning_notice_ar, warning_notice_en,
      confirmation_note_ar, confirmation_note_en, support_contact_ar, support_contact_en
    ) VALUES (
      p_code, COALESCE(p_name_ar,''), p_name_en, p_description_ar, p_description_en,
      COALESCE(p_type,'BANK_TRANSFER'), p_icon_url,
      COALESCE(p_active,true), COALESCE(p_is_maintenance,false), COALESCE(p_sort_order,0),
      p_min_amount, p_max_amount,
      COALESCE(p_fixed_fee,0), COALESCE(p_percentage_fee,0),
      COALESCE(p_proof_required,false), COALESCE(p_reference_required,false), COALESCE(p_payer_phone_required,false),
      COALESCE(p_allowed_file_types,'["image/jpeg","image/png","image/webp"]'),
      COALESCE(p_max_file_size_mb,5),
      COALESCE(p_request_expiry_minutes,1440),
      COALESCE(p_supported_order_types,'["POINT_PACKAGE","SERVICE","SUBSCRIPTION","DIGITAL_PRODUCT"]'),
      COALESCE(p_required_fields_schema,'[]'), p_instructions_ar, p_instructions_en,
      p_short_notice_ar, p_short_notice_en, p_warning_notice_ar, p_warning_notice_en,
      p_confirmation_note_ar, p_confirmation_note_en, p_support_contact_ar, p_support_contact_en
    )
    RETURNING id INTO v_method_id;
    v_is_new := true;
  ELSE
    -- Update existing
    SELECT row_to_json(pm)::jsonb INTO v_old_state FROM payment_methods pm WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'METHOD_NOT_FOUND'; END IF;

    UPDATE payment_methods SET
      name_ar               = COALESCE(p_name_ar, name_ar),
      name_en               = COALESCE(p_name_en, name_en),
      description_ar        = COALESCE(p_description_ar, description_ar),
      description_en        = COALESCE(p_description_en, description_en),
      type                  = COALESCE(p_type, type),
      icon_url              = COALESCE(p_icon_url, icon_url),
      active                = COALESCE(p_active, active),
      is_maintenance        = COALESCE(p_is_maintenance, is_maintenance),
      sort_order            = COALESCE(p_sort_order, sort_order),
      min_amount            = COALESCE(p_min_amount, min_amount),
      max_amount            = COALESCE(p_max_amount, max_amount),
      fixed_fee             = COALESCE(p_fixed_fee, fixed_fee),
      percentage_fee        = COALESCE(p_percentage_fee, percentage_fee),
      proof_required        = COALESCE(p_proof_required, proof_required),
      reference_required    = COALESCE(p_reference_required, reference_required),
      payer_phone_required  = COALESCE(p_payer_phone_required, payer_phone_required),
      allowed_file_types    = COALESCE(p_allowed_file_types, allowed_file_types),
      max_file_size_mb      = COALESCE(p_max_file_size_mb, max_file_size_mb),
      request_expiry_minutes= COALESCE(p_request_expiry_minutes, request_expiry_minutes),
      supported_order_types = COALESCE(p_supported_order_types, supported_order_types),
      required_fields_schema= COALESCE(p_required_fields_schema, required_fields_schema),
      instructions_ar       = COALESCE(p_instructions_ar, instructions_ar),
      instructions_en       = COALESCE(p_instructions_en, instructions_en),
      short_notice_ar       = COALESCE(p_short_notice_ar, short_notice_ar),
      short_notice_en       = COALESCE(p_short_notice_en, short_notice_en),
      warning_notice_ar     = COALESCE(p_warning_notice_ar, warning_notice_ar),
      warning_notice_en     = COALESCE(p_warning_notice_en, warning_notice_en),
      confirmation_note_ar  = COALESCE(p_confirmation_note_ar, confirmation_note_ar),
      confirmation_note_en  = COALESCE(p_confirmation_note_en, confirmation_note_en),
      support_contact_ar    = COALESCE(p_support_contact_ar, support_contact_ar),
      support_contact_en    = COALESCE(p_support_contact_en, support_contact_en),
      updated_at            = now()
    WHERE id = p_id;
    v_method_id := p_id;
  END IF;

  INSERT INTO commerce_events (entity_type, entity_id, event_type, actor_user_id, new_state)
  VALUES ('payment_method', v_method_id, CASE WHEN v_is_new THEN 'CREATED' ELSE 'UPDATED' END,
          v_admin_id, jsonb_build_object('method_id', v_method_id));

  RETURN jsonb_build_object('ok', true, 'method_id', v_method_id, 'created', v_is_new);
END;
$$;
GRANT EXECUTE ON FUNCTION public.upsert_payment_method TO authenticated;

-- ============================================================
-- 9. RPC: upsert_payment_destination — admin CRUD for destinations
-- ============================================================
CREATE OR REPLACE FUNCTION public.upsert_payment_destination(
  p_payment_method_id             uuid,
  p_id                            uuid DEFAULT NULL,
  p_label_ar                      text DEFAULT NULL,
  p_label_en                      text DEFAULT NULL,
  p_account_holder                text DEFAULT NULL,
  p_bank_name                     text DEFAULT NULL,
  p_bank_name_en                  text DEFAULT NULL,
  p_account_number                text DEFAULT NULL,
  p_iban                          text DEFAULT NULL,
  p_branch_name                   text DEFAULT NULL,
  p_swift_code                    text DEFAULT NULL,
  p_receiver_phone                text DEFAULT NULL,
  p_receiver_name                 text DEFAULT NULL,
  p_wallet_phone                  text DEFAULT NULL,
  p_wallet_provider               text DEFAULT NULL,
  p_transfer_service_name         text DEFAULT NULL,
  p_confirmation_instructions     text DEFAULT NULL,
  p_depositor_reference_instructions text DEFAULT NULL,
  p_public_notes_ar               text DEFAULT NULL,
  p_public_notes_en               text DEFAULT NULL,
  p_internal_notes                text DEFAULT NULL,
  p_is_active                     boolean DEFAULT NULL,
  p_is_maintenance                boolean DEFAULT NULL,
  p_priority                      integer DEFAULT NULL,
  p_min_amount                    numeric DEFAULT NULL,
  p_max_amount                    numeric DEFAULT NULL,
  p_daily_capacity                integer DEFAULT NULL,
  p_available_from                timestamptz DEFAULT NULL,
  p_available_until               timestamptz DEFAULT NULL,
  p_extra_details                 jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_dest_id  uuid;
  v_old      jsonb;
  v_new      jsonb;
  v_action   text;
BEGIN
  IF NOT public.is_commerce_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF p_id IS NULL THEN
    -- Insert
    INSERT INTO payment_destinations (
      payment_method_id, label_ar, label_en, account_holder,
      bank_name, bank_name_en, account_number, iban, branch_name, swift_code,
      receiver_phone, receiver_name, wallet_phone, wallet_provider,
      transfer_service_name, confirmation_instructions, depositor_reference_instructions,
      public_notes_ar, public_notes_en, internal_notes,
      is_active, is_maintenance, priority,
      min_amount, max_amount, daily_capacity,
      available_from, available_until, extra_details
    ) VALUES (
      p_payment_method_id,
      COALESCE(p_label_ar, 'حساب جديد'), p_label_en,
      p_account_holder, p_bank_name, p_bank_name_en, p_account_number, p_iban,
      p_branch_name, p_swift_code, p_receiver_phone, p_receiver_name,
      p_wallet_phone, p_wallet_provider, p_transfer_service_name,
      p_confirmation_instructions, p_depositor_reference_instructions,
      p_public_notes_ar, p_public_notes_en, p_internal_notes,
      COALESCE(p_is_active, true), COALESCE(p_is_maintenance, false),
      COALESCE(p_priority, 0), p_min_amount, p_max_amount, p_daily_capacity,
      p_available_from, p_available_until, COALESCE(p_extra_details, '{}')
    )
    RETURNING id INTO v_dest_id;
    v_action := 'CREATED';
  ELSE
    SELECT row_to_json(pd)::jsonb INTO v_old FROM payment_destinations pd WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'DESTINATION_NOT_FOUND'; END IF;

    UPDATE payment_destinations SET
      label_ar                       = COALESCE(p_label_ar, label_ar),
      label_en                       = COALESCE(p_label_en, label_en),
      account_holder                 = COALESCE(p_account_holder, account_holder),
      bank_name                      = COALESCE(p_bank_name, bank_name),
      bank_name_en                   = COALESCE(p_bank_name_en, bank_name_en),
      account_number                 = COALESCE(p_account_number, account_number),
      iban                           = COALESCE(p_iban, iban),
      branch_name                    = COALESCE(p_branch_name, branch_name),
      swift_code                     = COALESCE(p_swift_code, swift_code),
      receiver_phone                 = COALESCE(p_receiver_phone, receiver_phone),
      receiver_name                  = COALESCE(p_receiver_name, receiver_name),
      wallet_phone                   = COALESCE(p_wallet_phone, wallet_phone),
      wallet_provider                = COALESCE(p_wallet_provider, wallet_provider),
      transfer_service_name          = COALESCE(p_transfer_service_name, transfer_service_name),
      confirmation_instructions      = COALESCE(p_confirmation_instructions, confirmation_instructions),
      depositor_reference_instructions = COALESCE(p_depositor_reference_instructions, depositor_reference_instructions),
      public_notes_ar                = COALESCE(p_public_notes_ar, public_notes_ar),
      public_notes_en                = COALESCE(p_public_notes_en, public_notes_en),
      internal_notes                 = COALESCE(p_internal_notes, internal_notes),
      is_active                      = COALESCE(p_is_active, is_active),
      is_maintenance                 = COALESCE(p_is_maintenance, is_maintenance),
      priority                       = COALESCE(p_priority, priority),
      min_amount                     = COALESCE(p_min_amount, min_amount),
      max_amount                     = COALESCE(p_max_amount, max_amount),
      daily_capacity                 = COALESCE(p_daily_capacity, daily_capacity),
      available_from                 = COALESCE(p_available_from, available_from),
      available_until                = COALESCE(p_available_until, available_until),
      extra_details                  = COALESCE(p_extra_details, extra_details),
      updated_at                     = now()
    WHERE id = p_id;
    v_dest_id := p_id;
    v_action := 'UPDATED';
  END IF;

  SELECT row_to_json(pd)::jsonb INTO v_new FROM payment_destinations pd WHERE id = v_dest_id;

  INSERT INTO destination_changes (destination_id, admin_id, action, old_state, new_state)
  VALUES (v_dest_id, v_admin_id, v_action, v_old, v_new);

  RETURN jsonb_build_object('ok', true, 'destination_id', v_dest_id, 'action', v_action);
END;
$$;
GRANT EXECUTE ON FUNCTION public.upsert_payment_destination TO authenticated;

-- ============================================================
-- 10. RPC: archive_payment_destination
-- ============================================================
CREATE OR REPLACE FUNCTION public.archive_payment_destination(p_destination_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_old      jsonb;
BEGIN
  IF NOT public.is_commerce_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  SELECT row_to_json(pd)::jsonb INTO v_old FROM payment_destinations pd WHERE id = p_destination_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'DESTINATION_NOT_FOUND'; END IF;

  UPDATE payment_destinations SET archived_at = now(), is_active = false, updated_at = now()
  WHERE id = p_destination_id;

  INSERT INTO destination_changes (destination_id, admin_id, action, old_state, new_state)
  VALUES (p_destination_id, v_admin_id, 'ARCHIVED', v_old, jsonb_build_object('archived_at', now()));

  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.archive_payment_destination(uuid) TO authenticated;

-- ============================================================
-- 11. RPC: get_available_payment_methods (customer-facing, safe)
--     Returns methods with enough info to display the selector,
--     but NO raw destination credentials (those come via snapshot on order creation)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_available_payment_methods(
  p_order_type text DEFAULT 'POINT_PACKAGE',
  p_amount     numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_agg(row_to_json(q) ORDER BY q.sort_order) INTO v_result
  FROM (
    SELECT
      pm.id,
      pm.code,
      pm.name_ar,
      pm.name_en,
      pm.description_ar,
      pm.description_en,
      pm.type,
      pm.icon_url,
      pm.active,
      pm.is_maintenance,
      pm.sort_order,
      pm.min_amount,
      pm.max_amount,
      pm.fixed_fee,
      pm.percentage_fee,
      pm.proof_required,
      pm.reference_required,
      pm.payer_phone_required,
      pm.allowed_file_types,
      pm.max_file_size_mb,
      pm.request_expiry_minutes,
      pm.instructions_ar,
      pm.instructions_en,
      pm.short_notice_ar,
      pm.short_notice_en,
      pm.warning_notice_ar,
      pm.warning_notice_en,
      pm.required_fields_schema,
      pm.support_contact_ar,
      -- Availability flags
      CASE
        WHEN pm.active = false THEN 'INACTIVE'
        WHEN pm.is_maintenance = true THEN 'MAINTENANCE'
        WHEN p_amount IS NOT NULL AND pm.min_amount IS NOT NULL AND p_amount < pm.min_amount THEN 'BELOW_MIN'
        WHEN p_amount IS NOT NULL AND pm.max_amount IS NOT NULL AND p_amount > pm.max_amount THEN 'ABOVE_MAX'
        WHEN NOT (pm.supported_order_types IS NULL OR pm.supported_order_types @> to_jsonb(p_order_type)) THEN 'UNSUPPORTED_TYPE'
        WHEN NOT EXISTS (
          SELECT 1 FROM payment_destinations pd
          WHERE pd.payment_method_id = pm.id
            AND pd.is_active = true
            AND pd.archived_at IS NULL
            AND pd.is_maintenance = false
            AND (pd.available_from IS NULL OR pd.available_from <= now())
            AND (pd.available_until IS NULL OR pd.available_until >= now())
            AND (p_amount IS NULL OR pd.min_amount IS NULL OR p_amount >= pd.min_amount)
            AND (p_amount IS NULL OR pd.max_amount IS NULL OR p_amount <= pd.max_amount)
        ) THEN 'NO_DESTINATION'
        ELSE 'AVAILABLE'
      END AS availability_status
    FROM payment_methods pm
    WHERE pm.archived_at IS NULL
      AND pm.active = true
    ORDER BY pm.sort_order
  ) q;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_available_payment_methods(text, numeric) TO authenticated, anon;

-- ============================================================
-- 12. RPC: resolve_payment_destination — server selects best destination
--     Called internally during order/request creation
--     Returns safe customer-facing snapshot (no internal_notes)
-- ============================================================
CREATE OR REPLACE FUNCTION public.resolve_payment_destination(
  p_method_id uuid,
  p_amount    numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_dest   RECORD;
  v_method RECORD;
  v_snap   jsonb;
BEGIN
  SELECT * INTO v_method FROM payment_methods WHERE id = p_method_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'METHOD_NOT_FOUND'); END IF;
  IF v_method.active = false THEN RETURN jsonb_build_object('ok', false, 'error', 'METHOD_INACTIVE'); END IF;
  IF v_method.is_maintenance = true THEN RETURN jsonb_build_object('ok', false, 'error', 'METHOD_MAINTENANCE'); END IF;

  SELECT * INTO v_dest
  FROM payment_destinations
  WHERE payment_method_id = p_method_id
    AND is_active = true
    AND archived_at IS NULL
    AND is_maintenance = false
    AND (available_from IS NULL OR available_from <= now())
    AND (available_until IS NULL OR available_until >= now())
    AND (p_amount IS NULL OR min_amount IS NULL OR p_amount >= min_amount)
    AND (p_amount IS NULL OR max_amount IS NULL OR p_amount <= max_amount)
    AND (
      daily_capacity IS NULL OR
      (SELECT COUNT(*) FROM payment_requests pr
       WHERE pr.payment_destination_id = payment_destinations.id
         AND pr.created_at >= date_trunc('day', now())
         AND pr.status NOT IN ('rejected','cancelled')
      ) < daily_capacity
    )
  ORDER BY priority ASC, created_at ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NO_DESTINATION_AVAILABLE');
  END IF;

  -- Build safe customer-facing snapshot (exclude internal_notes)
  v_snap := jsonb_build_object(
    'destination_id',    v_dest.id,
    'label_ar',          v_dest.label_ar,
    'label_en',          v_dest.label_en,
    'account_holder',    v_dest.account_holder,
    'bank_name',         v_dest.bank_name,
    'bank_name_en',      v_dest.bank_name_en,
    'account_number',    v_dest.account_number,
    'iban',              v_dest.iban,
    'branch_name',       v_dest.branch_name,
    'swift_code',        v_dest.swift_code,
    'receiver_phone',    v_dest.receiver_phone,
    'receiver_name',     v_dest.receiver_name,
    'wallet_phone',      v_dest.wallet_phone,
    'wallet_provider',   v_dest.wallet_provider,
    'transfer_service_name', v_dest.transfer_service_name,
    'confirmation_instructions', v_dest.confirmation_instructions,
    'depositor_reference_instructions', v_dest.depositor_reference_instructions,
    'public_notes_ar',   v_dest.public_notes_ar,
    'public_notes_en',   v_dest.public_notes_en,
    'method_type',       v_method.type
  );

  RETURN jsonb_build_object('ok', true, 'destination_id', v_dest.id, 'snapshot', v_snap);
END;
$$;
GRANT EXECUTE ON FUNCTION public.resolve_payment_destination(uuid, numeric) TO authenticated;
