/*
# Service Management System — Foundation Tables

## Purpose
Extends the existing services architecture into a fully configurable
Service Catalog with categories, rich service entities, packages, pricing
rules, add-ons, per-service payment method mapping, and quotes.

## New Tables
- service_categories: Configurable categories (replaces hardcoded tabs)
- services (extended): Adds pricing_mode, availability, form schema, fulfillment config
- service_packages (extended): Adds badge, scheduling, fulfillment metadata
- service_pricing_rules: Declarative pricing (tiered, per-unit, base+unit, etc.)
- service_addons: Optional/required add-ons per service
- service_payment_methods: Per-service payment method enablement and overrides
- service_quotes: Quote request lifecycle for QUOTE_REQUIRED services
- service_order_events: Timeline events for service orders

## Important Notes
1. All new columns use IF NOT EXISTS or separate ALTER TABLE — safe to re-run
2. Existing services/service_packages data is preserved
3. New pricing_mode defaults to 'PACKAGES' for backward compatibility
4. RLS follows existing is_admin() helper
*/

-- ─── service_categories ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS service_categories (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text UNIQUE NOT NULL,
  name_ar         text NOT NULL,
  name_en         text,
  description_ar  text,
  description_en  text,
  icon            text,
  banner_url      text,
  accent_color    text DEFAULT '#D6AA62',
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  archived_at     timestamptz
);

ALTER TABLE service_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sc_select_active" ON service_categories;
CREATE POLICY "sc_select_active" ON service_categories FOR SELECT
  TO authenticated USING (is_active = true AND archived_at IS NULL);

DROP POLICY IF EXISTS "sc_select_admin" ON service_categories;
CREATE POLICY "sc_select_admin" ON service_categories FOR SELECT
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "sc_insert_admin" ON service_categories;
CREATE POLICY "sc_insert_admin" ON service_categories FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "sc_update_admin" ON service_categories;
CREATE POLICY "sc_update_admin" ON service_categories FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- trigger
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_service_categories_updated_at') THEN
    CREATE TRIGGER update_service_categories_updated_at
      BEFORE UPDATE ON service_categories
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Seed categories from existing service data
INSERT INTO service_categories (slug, name_ar, name_en, icon, accent_color, sort_order)
VALUES
  ('social-media',  'وسائل التواصل الاجتماعي', 'Social Media',      '🎵', '#ff0050', 1),
  ('marketing',     'التسويق والإعلانات',         'Marketing & Ads',   '📢', '#3b82f6', 2),
  ('streaming',     'اشتراكات البث',               'Streaming',         '📺', '#ef4444', 3),
  ('software',      'البرامج والتطبيقات',           'Software & Apps',   '💻', '#8b5cf6', 4),
  ('design',        'التصميم والإبداع',             'Design & Creative', '🎨', '#ec4899', 5),
  ('other',         'خدمات أخرى',                  'Other Services',    '⚙️', '#6b7280', 99)
ON CONFLICT (slug) DO NOTHING;

-- ─── Extend services table ────────────────────────────────────────────────────

-- Link to categories
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='services' AND column_name='category_id'
  ) THEN
    ALTER TABLE services ADD COLUMN category_id uuid REFERENCES service_categories(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='slug') THEN
    ALTER TABLE services ADD COLUMN slug text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='name_ar') THEN
    ALTER TABLE services ADD COLUMN name_ar text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='short_description_ar') THEN
    ALTER TABLE services ADD COLUMN short_description_ar text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='short_description_en') THEN
    ALTER TABLE services ADD COLUMN short_description_en text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='full_description_ar') THEN
    ALTER TABLE services ADD COLUMN full_description_ar text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='full_description_en') THEN
    ALTER TABLE services ADD COLUMN full_description_en text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='cover_url') THEN
    ALTER TABLE services ADD COLUMN cover_url text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='badge_text_ar') THEN
    ALTER TABLE services ADD COLUMN badge_text_ar text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='pricing_mode') THEN
    ALTER TABLE services ADD COLUMN pricing_mode text NOT NULL DEFAULT 'PACKAGES';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='starting_price') THEN
    ALTER TABLE services ADD COLUMN starting_price numeric;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='currency') THEN
    ALTER TABLE services ADD COLUMN currency text NOT NULL DEFAULT 'LYD';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='fulfillment_mode') THEN
    ALTER TABLE services ADD COLUMN fulfillment_mode text NOT NULL DEFAULT 'MANUAL_FULFILLMENT';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='estimated_delivery_text_ar') THEN
    ALTER TABLE services ADD COLUMN estimated_delivery_text_ar text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='estimated_delivery_text_en') THEN
    ALTER TABLE services ADD COLUMN estimated_delivery_text_en text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='min_quantity') THEN
    ALTER TABLE services ADD COLUMN min_quantity numeric;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='max_quantity') THEN
    ALTER TABLE services ADD COLUMN max_quantity numeric;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='quantity_step') THEN
    ALTER TABLE services ADD COLUMN quantity_step numeric DEFAULT 1;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='daily_capacity') THEN
    ALTER TABLE services ADD COLUMN daily_capacity integer;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='availability_status') THEN
    ALTER TABLE services ADD COLUMN availability_status text NOT NULL DEFAULT 'ACTIVE';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='starts_at') THEN
    ALTER TABLE services ADD COLUMN starts_at timestamptz;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='ends_at') THEN
    ALTER TABLE services ADD COLUMN ends_at timestamptz;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='is_featured') THEN
    ALTER TABLE services ADD COLUMN is_featured boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='is_published') THEN
    ALTER TABLE services ADD COLUMN is_published boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='customer_form_schema') THEN
    ALTER TABLE services ADD COLUMN customer_form_schema jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='terms_ar') THEN
    ALTER TABLE services ADD COLUMN terms_ar text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='internal_instructions') THEN
    ALTER TABLE services ADD COLUMN internal_instructions text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='archived_at') THEN
    ALTER TABLE services ADD COLUMN archived_at timestamptz;
  END IF;
END $$;

-- Backfill: link existing services to categories
UPDATE services SET
  category_id = (SELECT id FROM service_categories WHERE slug = services.category LIMIT 1),
  name_ar = COALESCE(name_ar, name),
  availability_status = CASE WHEN is_active THEN 'ACTIVE' ELSE 'PAUSED' END,
  is_published = is_active
WHERE category_id IS NULL;

-- Make slugs unique for existing services
UPDATE services SET slug = LOWER(REGEXP_REPLACE(name_en, '[^a-zA-Z0-9]+', '-', 'g'))
WHERE slug IS NULL AND name_en IS NOT NULL AND name_en != '';

UPDATE services SET slug = 'service-' || SUBSTRING(id::text, 1, 8)
WHERE slug IS NULL;

-- Add unique constraint on slug (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'services_slug_unique'
  ) THEN
    ALTER TABLE services ADD CONSTRAINT services_slug_unique UNIQUE (slug);
  END IF;
END $$;

-- ─── Extend service_packages table ───────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_packages' AND column_name='name_ar') THEN
    ALTER TABLE service_packages ADD COLUMN name_ar text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_packages' AND column_name='name_en') THEN
    ALTER TABLE service_packages ADD COLUMN name_en text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_packages' AND column_name='description_ar') THEN
    ALTER TABLE service_packages ADD COLUMN description_ar text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_packages' AND column_name='package_code') THEN
    ALTER TABLE service_packages ADD COLUMN package_code text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_packages' AND column_name='compare_at_price') THEN
    ALTER TABLE service_packages ADD COLUMN compare_at_price numeric;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_packages' AND column_name='currency') THEN
    ALTER TABLE service_packages ADD COLUMN currency text NOT NULL DEFAULT 'LYD';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_packages' AND column_name='included_quantity') THEN
    ALTER TABLE service_packages ADD COLUMN included_quantity numeric;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_packages' AND column_name='quantity_label_ar') THEN
    ALTER TABLE service_packages ADD COLUMN quantity_label_ar text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_packages' AND column_name='badge_type') THEN
    ALTER TABLE service_packages ADD COLUMN badge_type text NOT NULL DEFAULT 'NONE';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_packages' AND column_name='badge_text_ar') THEN
    ALTER TABLE service_packages ADD COLUMN badge_text_ar text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_packages' AND column_name='starts_at') THEN
    ALTER TABLE service_packages ADD COLUMN starts_at timestamptz;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_packages' AND column_name='ends_at') THEN
    ALTER TABLE service_packages ADD COLUMN ends_at timestamptz;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_packages' AND column_name='fulfillment_metadata') THEN
    ALTER TABLE service_packages ADD COLUMN fulfillment_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_packages' AND column_name='archived_at') THEN
    ALTER TABLE service_packages ADD COLUMN archived_at timestamptz;
  END IF;
END $$;

-- Backfill name_ar from name
UPDATE service_packages SET
  name_ar = COALESCE(name_ar, name),
  description_ar = COALESCE(description_ar, description),
  compare_at_price = COALESCE(compare_at_price, original_price),
  included_quantity = COALESCE(included_quantity, quantity::numeric),
  badge_type = CASE WHEN is_popular THEN 'POPULAR' ELSE 'NONE' END
WHERE name_ar IS NULL OR name_ar = '';

-- ─── service_pricing_rules ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS service_pricing_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id    uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  mode          text NOT NULL DEFAULT 'FIXED',
  base_fee      numeric,
  unit_price    numeric,
  min_quantity  numeric,
  max_quantity  numeric,
  quantity_step numeric DEFAULT 1,
  minimum_charge numeric,
  maximum_charge numeric,
  rounding_mode text NOT NULL DEFAULT 'NONE',
  rounding_step numeric,
  tiers         jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active     boolean NOT NULL DEFAULT true,
  version       integer NOT NULL DEFAULT 1,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

ALTER TABLE service_pricing_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "spr_select_user" ON service_pricing_rules;
CREATE POLICY "spr_select_user" ON service_pricing_rules FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "spr_all_admin" ON service_pricing_rules;
CREATE POLICY "spr_all_admin" ON service_pricing_rules FOR ALL
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_service_pricing_rules_updated_at') THEN
    CREATE TRIGGER update_service_pricing_rules_updated_at
      BEFORE UPDATE ON service_pricing_rules
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ─── service_addons ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS service_addons (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id      uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  name_ar         text NOT NULL,
  name_en         text,
  description_ar  text,
  price_type      text NOT NULL DEFAULT 'FIXED',
  price_value     numeric NOT NULL DEFAULT 0,
  is_required     boolean NOT NULL DEFAULT false,
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE service_addons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sa_select_user" ON service_addons;
CREATE POLICY "sa_select_user" ON service_addons FOR SELECT
  TO authenticated USING (is_active = true);

DROP POLICY IF EXISTS "sa_all_admin" ON service_addons;
CREATE POLICY "sa_all_admin" ON service_addons FOR ALL
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_service_addons_updated_at') THEN
    CREATE TRIGGER update_service_addons_updated_at
      BEFORE UPDATE ON service_addons
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ─── service_payment_methods ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS service_payment_methods (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id                uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  payment_method_id         uuid NOT NULL REFERENCES payment_methods(id) ON DELETE CASCADE,
  is_enabled                boolean NOT NULL DEFAULT true,
  min_amount_override       numeric,
  max_amount_override       numeric,
  fixed_fee_override        numeric,
  percentage_fee_override   numeric,
  discount_percent          numeric DEFAULT 0,
  instructions_override_ar  text,
  sort_order                integer NOT NULL DEFAULT 0,
  created_at                timestamptz DEFAULT now(),
  updated_at                timestamptz DEFAULT now(),
  UNIQUE (service_id, payment_method_id)
);

ALTER TABLE service_payment_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "spm_select_user" ON service_payment_methods;
CREATE POLICY "spm_select_user" ON service_payment_methods FOR SELECT
  TO authenticated USING (is_enabled = true);

DROP POLICY IF EXISTS "spm_all_admin" ON service_payment_methods;
CREATE POLICY "spm_all_admin" ON service_payment_methods FOR ALL
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_service_payment_methods_updated_at') THEN
    CREATE TRIGGER update_service_payment_methods_updated_at
      BEFORE UPDATE ON service_payment_methods
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ─── service_quotes ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS service_quotes (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_code                text UNIQUE NOT NULL,
  order_id                  uuid REFERENCES commerce_orders(id),
  service_id                uuid NOT NULL REFERENCES services(id),
  user_id                   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status                    text NOT NULL DEFAULT 'REQUESTED',
  requested_input_snapshot  jsonb NOT NULL DEFAULT '{}'::jsonb,
  proposed_amount           numeric,
  currency                  text NOT NULL DEFAULT 'LYD',
  price_breakdown           jsonb NOT NULL DEFAULT '{}'::jsonb,
  customer_message          text,
  internal_note             text,
  valid_until               timestamptz,
  version                   integer NOT NULL DEFAULT 1,
  created_by                uuid REFERENCES auth.users(id),
  requested_at              timestamptz DEFAULT now(),
  quoted_at                 timestamptz,
  accepted_at               timestamptz,
  rejected_at               timestamptz,
  expired_at                timestamptz,
  created_at                timestamptz DEFAULT now(),
  updated_at                timestamptz DEFAULT now()
);

ALTER TABLE service_quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sq_select_own" ON service_quotes;
CREATE POLICY "sq_select_own" ON service_quotes FOR SELECT
  TO authenticated USING (user_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "sq_insert_own" ON service_quotes;
CREATE POLICY "sq_insert_own" ON service_quotes FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "sq_update_admin" ON service_quotes;
CREATE POLICY "sq_update_admin" ON service_quotes FOR UPDATE
  TO authenticated USING (is_admin() OR user_id = auth.uid()) WITH CHECK (is_admin() OR user_id = auth.uid());

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_service_quotes_updated_at') THEN
    CREATE TRIGGER update_service_quotes_updated_at
      BEFORE UPDATE ON service_quotes
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_services_category_id ON services(category_id);
CREATE INDEX IF NOT EXISTS idx_services_availability ON services(availability_status, is_published, archived_at);
CREATE INDEX IF NOT EXISTS idx_service_packages_service ON service_packages(service_id, is_active);
CREATE INDEX IF NOT EXISTS idx_service_pricing_rules_service ON service_pricing_rules(service_id, is_active);
CREATE INDEX IF NOT EXISTS idx_service_addons_service ON service_addons(service_id, is_active);
CREATE INDEX IF NOT EXISTS idx_service_payment_methods_service ON service_payment_methods(service_id, is_enabled);
CREATE INDEX IF NOT EXISTS idx_service_quotes_user ON service_quotes(user_id, status);
CREATE INDEX IF NOT EXISTS idx_service_quotes_service ON service_quotes(service_id, status);

-- Publish existing active services
UPDATE services SET is_published = true WHERE is_active = true AND is_published = false;
