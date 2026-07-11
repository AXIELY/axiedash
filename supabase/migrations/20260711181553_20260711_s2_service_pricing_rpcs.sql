/*
# Service Pricing Engine and Order Creation RPCs

## RPCs Created
- calculate_service_price: Server-authoritative price preview
- create_service_order: Atomic service order with commerce_order + item + payment_request
- generate_quote_code: Helper for unique quote codes
- submit_service_quote_request: Create a quote request order
- issue_service_quote: Admin issues a quote
- accept_service_quote: User accepts a quote (creates payment request)
- reject_service_quote: User/admin rejects a quote
- get_service_catalog: Public service listing with packages
- get_service_detail: Full service detail with packages, addons, pricing rules

## Security
- All RPCs use SECURITY DEFINER with SET search_path = public, pg_catalog
- Price is calculated server-side; client-provided prices are ignored
- auth.uid() is resolved server-side
*/

-- ─── Helper: generate_quote_code ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION generate_quote_code()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE v_code text;
BEGIN
  LOOP
    v_code := 'QT-' || TO_CHAR(now(), 'YYMM') || '-' || UPPER(SUBSTRING(gen_random_uuid()::text, 1, 5));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM service_quotes WHERE quote_code = v_code);
  END LOOP;
  RETURN v_code;
END $$;

-- ─── calculate_service_price ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION calculate_service_price(
  p_service_id        uuid,
  p_package_id        uuid    DEFAULT NULL,
  p_quantity          numeric DEFAULT NULL,
  p_addon_ids         uuid[]  DEFAULT NULL,
  p_customer_input    jsonb   DEFAULT '{}',
  p_payment_method_id uuid    DEFAULT NULL,
  p_coupon_code       text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  v_service           record;
  v_package           record;
  v_pricing_rule      record;
  v_base_price        numeric := 0;
  v_quantity_amount   numeric := 0;
  v_addons_amount     numeric := 0;
  v_payment_fee       numeric := 0;
  v_payment_pct_fee   numeric := 0;
  v_discount          numeric := 0;
  v_coupon_discount   numeric := 0;
  v_final_amount      numeric := 0;
  v_tier              jsonb;
  v_addon             record;
  v_svc_pm            record;
  v_err               text;
BEGIN
  -- Load service
  SELECT * INTO v_service FROM services
  WHERE id = p_service_id AND archived_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'SERVICE_NOT_FOUND'); END IF;
  IF v_service.availability_status NOT IN ('ACTIVE','SCHEDULED') THEN
    RETURN jsonb_build_object('error', 'SERVICE_UNAVAILABLE', 'status', v_service.availability_status);
  END IF;
  IF NOT v_service.is_published THEN
    RETURN jsonb_build_object('error', 'SERVICE_NOT_PUBLISHED');
  END IF;

  -- Package-based pricing
  IF v_service.pricing_mode = 'PACKAGES' AND p_package_id IS NOT NULL THEN
    SELECT * INTO v_package FROM service_packages
    WHERE id = p_package_id AND service_id = p_service_id AND is_active = true AND archived_at IS NULL;
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'PACKAGE_NOT_FOUND'); END IF;
    v_base_price := v_package.price;

  -- Fixed pricing
  ELSIF v_service.pricing_mode = 'FIXED' THEN
    SELECT * INTO v_pricing_rule FROM service_pricing_rules
    WHERE service_id = p_service_id AND is_active = true ORDER BY version DESC LIMIT 1;
    IF FOUND THEN v_base_price := COALESCE(v_pricing_rule.base_fee, 0);
    ELSE v_base_price := COALESCE(v_service.starting_price, 0); END IF;

  -- Per-unit pricing
  ELSIF v_service.pricing_mode = 'PER_UNIT' THEN
    IF p_quantity IS NULL THEN RETURN jsonb_build_object('error', 'QUANTITY_REQUIRED'); END IF;
    SELECT * INTO v_pricing_rule FROM service_pricing_rules
    WHERE service_id = p_service_id AND is_active = true ORDER BY version DESC LIMIT 1;
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'NO_PRICING_RULE'); END IF;
    IF p_quantity < COALESCE(v_pricing_rule.min_quantity, 1) THEN
      RETURN jsonb_build_object('error', 'QUANTITY_TOO_LOW', 'min', v_pricing_rule.min_quantity);
    END IF;
    IF v_pricing_rule.max_quantity IS NOT NULL AND p_quantity > v_pricing_rule.max_quantity THEN
      RETURN jsonb_build_object('error', 'QUANTITY_TOO_HIGH', 'max', v_pricing_rule.max_quantity);
    END IF;
    v_quantity_amount := p_quantity * COALESCE(v_pricing_rule.unit_price, 0);

  -- Tiered pricing
  ELSIF v_service.pricing_mode = 'TIERED' THEN
    IF p_quantity IS NULL THEN RETURN jsonb_build_object('error', 'QUANTITY_REQUIRED'); END IF;
    SELECT * INTO v_pricing_rule FROM service_pricing_rules
    WHERE service_id = p_service_id AND is_active = true ORDER BY version DESC LIMIT 1;
    IF NOT FOUND OR jsonb_array_length(v_pricing_rule.tiers) = 0 THEN
      RETURN jsonb_build_object('error', 'NO_TIERS_CONFIGURED');
    END IF;
    FOR v_tier IN SELECT * FROM jsonb_array_elements(v_pricing_rule.tiers) LOOP
      IF p_quantity >= (v_tier->>'min')::numeric AND
         (v_tier->>'max' IS NULL OR p_quantity <= (v_tier->>'max')::numeric) THEN
        v_quantity_amount := p_quantity * (v_tier->>'unit_price')::numeric;
        EXIT;
      END IF;
    END LOOP;
    IF v_quantity_amount = 0 AND p_quantity > 0 THEN
      RETURN jsonb_build_object('error', 'NO_TIER_MATCHED', 'quantity', p_quantity);
    END IF;

  -- Base plus unit pricing
  ELSIF v_service.pricing_mode = 'BASE_PLUS_UNIT' THEN
    IF p_quantity IS NULL THEN RETURN jsonb_build_object('error', 'QUANTITY_REQUIRED'); END IF;
    SELECT * INTO v_pricing_rule FROM service_pricing_rules
    WHERE service_id = p_service_id AND is_active = true ORDER BY version DESC LIMIT 1;
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'NO_PRICING_RULE'); END IF;
    v_base_price     := COALESCE(v_pricing_rule.base_fee, 0);
    v_quantity_amount := p_quantity * COALESCE(v_pricing_rule.unit_price, 0);

  ELSIF v_service.pricing_mode IN ('STARTING_FROM','QUOTE_REQUIRED','FREE_REQUEST') THEN
    -- These don't produce a calculable price here
    RETURN jsonb_build_object(
      'pricing_mode', v_service.pricing_mode,
      'requires_quote', true,
      'starting_price', v_service.starting_price,
      'currency', v_service.currency
    );
  END IF;

  -- Add-ons
  IF p_addon_ids IS NOT NULL AND array_length(p_addon_ids, 1) > 0 THEN
    FOR v_addon IN
      SELECT * FROM service_addons
      WHERE id = ANY(p_addon_ids) AND service_id = p_service_id AND is_active = true
    LOOP
      IF v_addon.price_type = 'FIXED' THEN
        v_addons_amount := v_addons_amount + v_addon.price_value;
      ELSIF v_addon.price_type = 'PER_UNIT' AND p_quantity IS NOT NULL THEN
        v_addons_amount := v_addons_amount + (p_quantity * v_addon.price_value);
      ELSIF v_addon.price_type = 'PERCENTAGE' THEN
        v_addons_amount := v_addons_amount + ((v_base_price + v_quantity_amount) * v_addon.price_value / 100);
      END IF;
    END LOOP;
  END IF;

  -- Payment method fee
  IF p_payment_method_id IS NOT NULL THEN
    SELECT spm.*, pm.fixed_fee, pm.percentage_fee INTO v_svc_pm
    FROM service_payment_methods spm
    JOIN payment_methods pm ON pm.id = spm.payment_method_id
    WHERE spm.service_id = p_service_id AND spm.payment_method_id = p_payment_method_id AND spm.is_enabled = true;
    IF FOUND THEN
      v_payment_fee := COALESCE(v_svc_pm.fixed_fee_override, v_svc_pm.fixed_fee, 0);
      v_payment_pct_fee := COALESCE(v_svc_pm.percentage_fee_override, v_svc_pm.percentage_fee, 0);
      IF v_svc_pm.discount_percent > 0 THEN
        v_discount := (v_base_price + v_quantity_amount + v_addons_amount) * v_svc_pm.discount_percent / 100;
      END IF;
    END IF;
  END IF;

  -- Apply pricing rule min/max charge
  IF v_pricing_rule IS NOT NULL THEN
    IF v_pricing_rule.minimum_charge IS NOT NULL AND
       (v_base_price + v_quantity_amount) < v_pricing_rule.minimum_charge THEN
      v_quantity_amount := v_pricing_rule.minimum_charge - v_base_price;
    END IF;
    IF v_pricing_rule.maximum_charge IS NOT NULL AND
       (v_base_price + v_quantity_amount) > v_pricing_rule.maximum_charge THEN
      v_quantity_amount := v_pricing_rule.maximum_charge - v_base_price;
    END IF;
  END IF;

  -- Final amount
  v_final_amount := GREATEST(0,
    v_base_price + v_quantity_amount + v_addons_amount
    + v_payment_fee
    + ((v_base_price + v_quantity_amount + v_addons_amount) * v_payment_pct_fee / 100)
    - v_discount
    - v_coupon_discount
  );

  RETURN jsonb_build_object(
    'success',           true,
    'pricing_mode',      v_service.pricing_mode,
    'currency',          v_service.currency,
    'base_price',        v_base_price,
    'quantity_amount',   v_quantity_amount,
    'addons_amount',     v_addons_amount,
    'payment_fee',       v_payment_fee + ((v_base_price + v_quantity_amount + v_addons_amount) * v_payment_pct_fee / 100),
    'promotion_discount',v_discount,
    'coupon_discount',   v_coupon_discount,
    'final_amount',      v_final_amount,
    'package_id',        p_package_id,
    'quantity',          p_quantity
  );
END $$;

-- ─── create_service_order ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_service_order(
  p_service_id        uuid,
  p_package_id        uuid    DEFAULT NULL,
  p_quantity          numeric DEFAULT NULL,
  p_addon_ids         uuid[]  DEFAULT NULL,
  p_customer_input    jsonb   DEFAULT '{}',
  p_payment_method_id uuid    DEFAULT NULL,
  p_coupon_code       text    DEFAULT NULL,
  p_idempotency_key   text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  v_user_id           uuid := auth.uid();
  v_service           record;
  v_package           record;
  v_pm                record;
  v_pm_svc            record;
  v_dest              record;
  v_pricing           jsonb;
  v_order_id          uuid;
  v_order_code        text;
  v_item_id           uuid;
  v_pr_id             uuid;
  v_pr_code           text;
  v_final_amount      numeric;
  v_base_price        numeric;
  v_addons_amount     numeric;
  v_payment_fee       numeric;
  v_discount          numeric;
  v_name_ar           text;
  v_name_en           text;
  v_idem_key          text;
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('error', 'UNAUTHENTICATED'); END IF;

  v_idem_key := COALESCE(p_idempotency_key, 'so_' || v_user_id::text || '_' || p_service_id::text || '_' || COALESCE(p_package_id::text,'') || '_' || EXTRACT(EPOCH FROM DATE_TRUNC('minute', now()))::text);

  -- Idempotency check
  SELECT co.id, co.order_code, pr.id, pr.request_code
  INTO v_order_id, v_order_code, v_pr_id, v_pr_code
  FROM commerce_orders co
  LEFT JOIN payment_requests pr ON pr.commerce_order_id = co.id
  WHERE co.idempotency_key = v_idem_key AND co.user_id = v_user_id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true, 'idempotent', true,
      'order_id', v_order_id, 'order_code', v_order_code,
      'payment_request_id', v_pr_id, 'request_code', v_pr_code
    );
  END IF;

  -- Validate service
  SELECT * INTO v_service FROM services
  WHERE id = p_service_id AND archived_at IS NULL AND is_published = true;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'SERVICE_NOT_FOUND'); END IF;
  IF v_service.availability_status NOT IN ('ACTIVE','SCHEDULED') THEN
    RETURN jsonb_build_object('error', 'SERVICE_UNAVAILABLE');
  END IF;

  -- Quote-required: redirect
  IF v_service.pricing_mode IN ('QUOTE_REQUIRED','STARTING_FROM') THEN
    RETURN jsonb_build_object('error', 'USE_QUOTE_FLOW', 'pricing_mode', v_service.pricing_mode);
  END IF;

  -- Validate payment method
  IF p_payment_method_id IS NULL THEN RETURN jsonb_build_object('error', 'PAYMENT_METHOD_REQUIRED'); END IF;
  SELECT pm.* INTO v_pm FROM payment_methods pm
  WHERE pm.id = p_payment_method_id AND pm.active = true;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'PAYMENT_METHOD_INVALID'); END IF;

  -- Calculate price (server-side)
  v_pricing := calculate_service_price(p_service_id, p_package_id, p_quantity, p_addon_ids, p_customer_input, p_payment_method_id, p_coupon_code);
  IF v_pricing ? 'error' THEN RETURN v_pricing; END IF;

  v_final_amount  := (v_pricing->>'final_amount')::numeric;
  v_base_price    := (v_pricing->>'base_price')::numeric + (v_pricing->>'quantity_amount')::numeric;
  v_addons_amount := (v_pricing->>'addons_amount')::numeric;
  v_payment_fee   := (v_pricing->>'payment_fee')::numeric;
  v_discount      := (v_pricing->>'promotion_discount')::numeric + (v_pricing->>'coupon_discount')::numeric;

  -- Name
  IF p_package_id IS NOT NULL THEN
    SELECT * INTO v_package FROM service_packages WHERE id = p_package_id;
    v_name_ar := COALESCE(v_package.name_ar, v_package.name, v_service.name_ar, v_service.name);
    v_name_en := COALESCE(v_package.name_en, v_service.name_en);
  ELSE
    v_name_ar := COALESCE(v_service.name_ar, v_service.name);
    v_name_en := v_service.name_en;
  END IF;

  -- Choose payment destination
  SELECT pd.* INTO v_dest FROM payment_destinations pd
  WHERE pd.payment_method_id = p_payment_method_id AND pd.is_active = true
    AND (pd.available_from IS NULL OR pd.available_from <= now())
    AND (pd.available_until IS NULL OR pd.available_until >= now())
  ORDER BY pd.priority ASC LIMIT 1;

  -- Generate codes
  v_order_code := 'SV-' || TO_CHAR(now(), 'YYMM') || '-' || UPPER(SUBSTRING(gen_random_uuid()::text, 1, 6));
  LOOP
    EXIT WHEN NOT EXISTS (SELECT 1 FROM commerce_orders WHERE order_code = v_order_code);
    v_order_code := 'SV-' || TO_CHAR(now(), 'YYMM') || '-' || UPPER(SUBSTRING(gen_random_uuid()::text, 1, 6));
  END LOOP;

  -- Create commerce_order
  INSERT INTO commerce_orders (
    order_code, user_id, order_type, source,
    order_status, payment_status, fulfillment_status, currency,
    subtotal_snapshot, promotion_discount_snapshot, coupon_discount_snapshot,
    fees_snapshot, final_total_snapshot,
    customer_input_snapshot, internal_metadata, idempotency_key
  ) VALUES (
    v_order_code, v_user_id, 'SERVICE', 'SERVICE_STOREFRONT',
    'AWAITING_PAYMENT', 'NOT_SUBMITTED', 'PENDING', v_service.currency,
    v_base_price + v_addons_amount, v_discount, 0,
    v_payment_fee, v_final_amount,
    p_customer_input,
    jsonb_build_object('service_id', p_service_id, 'package_id', p_package_id, 'quantity', p_quantity, 'addon_ids', p_addon_ids),
    v_idem_key
  ) RETURNING id INTO v_order_id;

  -- Create order item
  INSERT INTO commerce_order_items (
    order_id, item_type, item_id,
    item_name_ar_snapshot, item_name_en_snapshot,
    unit_price_snapshot, quantity, total_snapshot,
    fulfillment_mode_snapshot, item_metadata_snapshot
  ) VALUES (
    v_order_id, 'SERVICE', COALESCE(p_package_id, p_service_id),
    v_name_ar, v_name_en,
    COALESCE((v_pricing->>'base_price')::numeric, v_final_amount),
    COALESCE(p_quantity, 1),
    v_final_amount,
    v_service.fulfillment_mode,
    jsonb_build_object('service_id', p_service_id, 'package_id', p_package_id, 'pricing', v_pricing)
  ) RETURNING id INTO v_item_id;

  -- Create payment_request
  v_pr_code := 'PR-' || TO_CHAR(now(), 'YYMM') || '-' || UPPER(SUBSTRING(gen_random_uuid()::text, 1, 6));
  LOOP
    EXIT WHEN NOT EXISTS (SELECT 1 FROM payment_requests WHERE request_code = v_pr_code);
    v_pr_code := 'PR-' || TO_CHAR(now(), 'YYMM') || '-' || UPPER(SUBSTRING(gen_random_uuid()::text, 1, 6));
  END LOOP;

  INSERT INTO payment_requests (
    request_code, user_id, payment_method_code, amount, currency,
    status, package_name_ar_snapshot, package_name_en_snapshot,
    base_price_snapshot, final_price_snapshot,
    commerce_order_id, payment_destination_id,
    payment_method_snapshot, destination_snapshot
  ) VALUES (
    v_pr_code, v_user_id, v_pm.code, v_final_amount, v_service.currency,
    'pending', v_name_ar, v_name_en,
    v_base_price, v_final_amount,
    v_order_id, v_dest.id,
    to_jsonb(v_pm),
    CASE WHEN v_dest.id IS NOT NULL THEN to_jsonb(v_dest) ELSE '{}'::jsonb END
  ) RETURNING id INTO v_pr_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_code', v_order_code,
    'payment_request_id', v_pr_id,
    'request_code', v_pr_code,
    'final_amount', v_final_amount,
    'currency', v_service.currency,
    'pricing', v_pricing
  );
END $$;

-- ─── get_service_catalog ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_service_catalog(
  p_category_slug text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'categories', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', sc.id, 'slug', sc.slug,
        'name_ar', sc.name_ar, 'name_en', sc.name_en,
        'icon', sc.icon, 'accent_color', sc.accent_color, 'sort_order', sc.sort_order
      ) ORDER BY sc.sort_order)
      FROM service_categories sc
      WHERE sc.is_active = true AND sc.archived_at IS NULL
    ),
    'services', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'slug', s.slug,
        'category_id', s.category_id,
        'name_ar', COALESCE(s.name_ar, s.name),
        'name_en', s.name_en,
        'icon', s.icon,
        'short_description_ar', COALESCE(s.short_description_ar, s.description),
        'pricing_mode', s.pricing_mode,
        'starting_price', s.starting_price,
        'currency', s.currency,
        'estimated_delivery_text_ar', s.estimated_delivery_text_ar,
        'availability_status', s.availability_status,
        'is_featured', s.is_featured,
        'badge_text_ar', s.badge_text_ar,
        'sort_order', s.order_index,
        'packages', (
          SELECT jsonb_agg(jsonb_build_object(
            'id', sp.id,
            'name_ar', COALESCE(sp.name_ar, sp.name),
            'price', sp.price,
            'compare_at_price', sp.compare_at_price,
            'currency', sp.currency,
            'included_quantity', sp.included_quantity,
            'badge_type', sp.badge_type,
            'badge_text_ar', sp.badge_text_ar,
            'is_popular', sp.is_popular
          ) ORDER BY sp.order_index)
          FROM service_packages sp
          WHERE sp.service_id = s.id AND sp.is_active = true AND sp.archived_at IS NULL
            AND (sp.starts_at IS NULL OR sp.starts_at <= now())
            AND (sp.ends_at IS NULL OR sp.ends_at >= now())
        )
      ) ORDER BY s.order_index)
      FROM services s
      WHERE s.is_published = true AND s.archived_at IS NULL
        AND s.availability_status IN ('ACTIVE','SCHEDULED')
        AND (p_category_slug IS NULL OR s.category_id = (
          SELECT sc2.id FROM service_categories sc2 WHERE sc2.slug = p_category_slug LIMIT 1
        ))
    )
  ) INTO v_result;
  RETURN v_result;
END $$;

-- ─── get_service_detail ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_service_detail(p_service_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE v_service record; v_result jsonb;
BEGIN
  SELECT * INTO v_service FROM services
  WHERE id = p_service_id AND archived_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'NOT_FOUND'); END IF;

  SELECT jsonb_build_object(
    'id', v_service.id,
    'slug', v_service.slug,
    'name_ar', COALESCE(v_service.name_ar, v_service.name),
    'name_en', v_service.name_en,
    'short_description_ar', COALESCE(v_service.short_description_ar, v_service.description),
    'full_description_ar', v_service.full_description_ar,
    'icon', v_service.icon,
    'cover_url', v_service.cover_url,
    'pricing_mode', v_service.pricing_mode,
    'starting_price', v_service.starting_price,
    'currency', v_service.currency,
    'min_quantity', v_service.min_quantity,
    'max_quantity', v_service.max_quantity,
    'quantity_step', v_service.quantity_step,
    'estimated_delivery_text_ar', v_service.estimated_delivery_text_ar,
    'terms_ar', v_service.terms_ar,
    'availability_status', v_service.availability_status,
    'customer_form_schema', v_service.customer_form_schema,
    'fulfillment_mode', v_service.fulfillment_mode,
    'packages', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', sp.id,
        'name_ar', COALESCE(sp.name_ar, sp.name),
        'name_en', sp.name_en,
        'description_ar', COALESCE(sp.description_ar, sp.description),
        'price', sp.price,
        'compare_at_price', sp.compare_at_price,
        'currency', sp.currency,
        'included_quantity', sp.included_quantity,
        'quantity_label_ar', sp.quantity_label_ar,
        'features', sp.features,
        'duration_days', sp.duration_days,
        'badge_type', sp.badge_type,
        'badge_text_ar', sp.badge_text_ar,
        'is_popular', sp.is_popular
      ) ORDER BY sp.order_index)
      FROM service_packages sp
      WHERE sp.service_id = v_service.id AND sp.is_active = true AND sp.archived_at IS NULL
    ),
    'addons', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', sa.id,
        'name_ar', sa.name_ar,
        'description_ar', sa.description_ar,
        'price_type', sa.price_type,
        'price_value', sa.price_value,
        'is_required', sa.is_required
      ) ORDER BY sa.sort_order)
      FROM service_addons sa
      WHERE sa.service_id = v_service.id AND sa.is_active = true
    ),
    'pricing_rule', (
      SELECT jsonb_build_object(
        'mode', spr.mode,
        'base_fee', spr.base_fee,
        'unit_price', spr.unit_price,
        'min_quantity', spr.min_quantity,
        'max_quantity', spr.max_quantity,
        'quantity_step', spr.quantity_step,
        'minimum_charge', spr.minimum_charge,
        'maximum_charge', spr.maximum_charge,
        'tiers', spr.tiers
      )
      FROM service_pricing_rules spr
      WHERE spr.service_id = v_service.id AND spr.is_active = true
      ORDER BY spr.version DESC LIMIT 1
    ),
    'payment_methods', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', pm.id,
        'code', pm.code,
        'name_ar', pm.name_ar,
        'type', pm.type,
        'instructions_ar', COALESCE(spm.instructions_override_ar, pm.instructions_ar),
        'fixed_fee', COALESCE(spm.fixed_fee_override, pm.fixed_fee, 0),
        'percentage_fee', COALESCE(spm.percentage_fee_override, pm.percentage_fee, 0),
        'discount_percent', COALESCE(spm.discount_percent, 0),
        'sort_order', spm.sort_order
      ) ORDER BY spm.sort_order)
      FROM service_payment_methods spm
      JOIN payment_methods pm ON pm.id = spm.payment_method_id
      WHERE spm.service_id = v_service.id AND spm.is_enabled = true AND pm.active = true
    )
  ) INTO v_result;
  RETURN v_result;
END $$;

-- ─── submit_service_quote_request ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION submit_service_quote_request(
  p_service_id     uuid,
  p_customer_input jsonb DEFAULT '{}',
  p_customer_message text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  v_user_id   uuid := auth.uid();
  v_service   record;
  v_order_id  uuid;
  v_order_code text;
  v_quote_id  uuid;
  v_quote_code text;
  v_idem_key  text;
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('error', 'UNAUTHENTICATED'); END IF;

  SELECT * INTO v_service FROM services WHERE id = p_service_id AND archived_at IS NULL AND is_published = true;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'SERVICE_NOT_FOUND'); END IF;

  v_idem_key := COALESCE(p_idempotency_key, 'sqr_' || v_user_id || '_' || p_service_id || '_' || EXTRACT(EPOCH FROM DATE_TRUNC('hour', now())));

  -- Idempotency
  SELECT sq.id, sq.quote_code INTO v_quote_id, v_quote_code
  FROM service_quotes sq WHERE sq.order_id IN (
    SELECT co.id FROM commerce_orders co WHERE co.idempotency_key = v_idem_key AND co.user_id = v_user_id
  );
  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true, 'quote_id', v_quote_id, 'quote_code', v_quote_code);
  END IF;

  -- Generate order code
  v_order_code := 'QO-' || TO_CHAR(now(), 'YYMM') || '-' || UPPER(SUBSTRING(gen_random_uuid()::text, 1, 6));

  -- Create commerce_order as AWAITING_QUOTE
  INSERT INTO commerce_orders (
    order_code, user_id, order_type, source,
    order_status, payment_status, fulfillment_status, currency,
    subtotal_snapshot, final_total_snapshot,
    customer_input_snapshot, idempotency_key
  ) VALUES (
    v_order_code, v_user_id, 'SERVICE', 'QUOTE_REQUEST',
    'AWAITING_PAYMENT', 'NOT_SUBMITTED', 'PENDING', v_service.currency,
    0, 0, p_customer_input, v_idem_key
  ) RETURNING id INTO v_order_id;

  v_quote_code := generate_quote_code();

  INSERT INTO service_quotes (
    quote_code, order_id, service_id, user_id, status,
    requested_input_snapshot, customer_message, currency
  ) VALUES (
    v_quote_code, v_order_id, p_service_id, v_user_id, 'REQUESTED',
    p_customer_input, p_customer_message, v_service.currency
  ) RETURNING id INTO v_quote_id;

  RETURN jsonb_build_object(
    'success', true,
    'quote_id', v_quote_id,
    'quote_code', v_quote_code,
    'order_id', v_order_id,
    'order_code', v_order_code
  );
END $$;

-- ─── issue_service_quote ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION issue_service_quote(
  p_quote_id        uuid,
  p_proposed_amount numeric,
  p_price_breakdown jsonb DEFAULT '{}',
  p_internal_note   text DEFAULT NULL,
  p_valid_hours     integer DEFAULT 48
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE v_admin_id uuid := auth.uid();
BEGIN
  IF NOT is_admin() THEN RETURN jsonb_build_object('error', 'UNAUTHORIZED'); END IF;
  IF p_proposed_amount <= 0 THEN RETURN jsonb_build_object('error', 'INVALID_AMOUNT'); END IF;

  UPDATE service_quotes SET
    status = 'QUOTED',
    proposed_amount = p_proposed_amount,
    price_breakdown = p_price_breakdown,
    internal_note = p_internal_note,
    valid_until = now() + (p_valid_hours || ' hours')::interval,
    quoted_at = now(),
    created_by = v_admin_id,
    version = version + 1
  WHERE id = p_quote_id AND status IN ('REQUESTED','UNDER_REVIEW','NEEDS_INFO');
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'QUOTE_NOT_FOUND_OR_WRONG_STATUS'); END IF;

  RETURN jsonb_build_object('success', true, 'quote_id', p_quote_id);
END $$;

-- ─── accept_service_quote ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION accept_service_quote(
  p_quote_id          uuid,
  p_payment_method_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_quote   record;
  v_order   record;
  v_pm      record;
  v_dest    record;
  v_pr_id   uuid;
  v_pr_code text;
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('error', 'UNAUTHENTICATED'); END IF;

  SELECT * INTO v_quote FROM service_quotes WHERE id = p_quote_id AND user_id = v_user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'QUOTE_NOT_FOUND'); END IF;
  IF v_quote.status != 'QUOTED' THEN RETURN jsonb_build_object('error', 'QUOTE_NOT_ACTIVE', 'status', v_quote.status); END IF;
  IF v_quote.valid_until IS NOT NULL AND v_quote.valid_until < now() THEN
    UPDATE service_quotes SET status = 'EXPIRED', expired_at = now() WHERE id = p_quote_id;
    RETURN jsonb_build_object('error', 'QUOTE_EXPIRED');
  END IF;
  IF v_quote.proposed_amount IS NULL THEN RETURN jsonb_build_object('error', 'NO_AMOUNT'); END IF;

  SELECT * INTO v_pm FROM payment_methods WHERE id = p_payment_method_id AND active = true;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'INVALID_PAYMENT_METHOD'); END IF;

  SELECT pd.* INTO v_dest FROM payment_destinations pd
  WHERE pd.payment_method_id = p_payment_method_id AND pd.is_active = true
  ORDER BY pd.priority ASC LIMIT 1;

  -- Mark quote accepted
  UPDATE service_quotes SET status = 'ACCEPTED', accepted_at = now() WHERE id = p_quote_id;

  -- Update commerce_order final amount
  UPDATE commerce_orders SET
    final_total_snapshot = v_quote.proposed_amount,
    subtotal_snapshot = v_quote.proposed_amount,
    payment_method_id = p_payment_method_id
  WHERE id = v_quote.order_id;

  -- Create payment request
  v_pr_code := 'PR-' || TO_CHAR(now(), 'YYMM') || '-' || UPPER(SUBSTRING(gen_random_uuid()::text, 1, 6));
  INSERT INTO payment_requests (
    request_code, user_id, payment_method_code, amount, currency,
    status, commerce_order_id, payment_destination_id,
    payment_method_snapshot, destination_snapshot
  ) VALUES (
    v_pr_code, v_user_id, v_pm.code, v_quote.proposed_amount, v_quote.currency,
    'pending', v_quote.order_id, v_dest.id,
    to_jsonb(v_pm),
    CASE WHEN v_dest.id IS NOT NULL THEN to_jsonb(v_dest) ELSE '{}'::jsonb END
  ) RETURNING id INTO v_pr_id;

  RETURN jsonb_build_object(
    'success', true,
    'payment_request_id', v_pr_id,
    'request_code', v_pr_code,
    'amount', v_quote.proposed_amount,
    'currency', v_quote.currency
  );
END $$;

-- ─── reject_service_quote ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION reject_service_quote(p_quote_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE v_user_id uuid := auth.uid();
BEGIN
  UPDATE service_quotes SET
    status = 'REJECTED',
    rejected_at = now(),
    customer_message = COALESCE(p_reason, customer_message)
  WHERE id = p_quote_id AND (user_id = v_user_id OR is_admin())
    AND status IN ('REQUESTED','UNDER_REVIEW','QUOTED','NEEDS_INFO');
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'QUOTE_NOT_FOUND_OR_NOT_REJECTABLE'); END IF;
  RETURN jsonb_build_object('success', true);
END $$;

-- ─── get_admin_service_orders ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_admin_service_orders(
  p_status_filter text DEFAULT NULL,
  p_service_id    uuid DEFAULT NULL,
  p_limit         integer DEFAULT 50,
  p_offset        integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN
  IF NOT is_admin() THEN RETURN jsonb_build_object('error', 'UNAUTHORIZED'); END IF;
  RETURN (
    SELECT jsonb_build_object(
      'orders', jsonb_agg(row),
      'total', COUNT(*) OVER ()
    )
    FROM (
      SELECT
        co.id, co.order_code, co.order_status, co.payment_status,
        co.fulfillment_status, co.final_total_snapshot, co.currency,
        co.created_at, co.source,
        u.username, u.id as user_id,
        ci.item_name_ar_snapshot as service_name,
        ci.item_type,
        pr.id as payment_request_id, pr.request_code, pr.status as payment_request_status,
        fc.id as fulfillment_case_id, fc.status as case_status
      FROM commerce_orders co
      JOIN users u ON u.id = co.user_id
      LEFT JOIN commerce_order_items ci ON ci.order_id = co.id
      LEFT JOIN payment_requests pr ON pr.commerce_order_id = co.id
      LEFT JOIN fulfillment_cases fc ON fc.commerce_order_id = co.id
      WHERE co.order_type = 'SERVICE'
        AND (p_status_filter IS NULL OR co.order_status = p_status_filter)
        AND (p_service_id IS NULL OR (co.internal_metadata->>'service_id')::uuid = p_service_id)
      ORDER BY co.created_at DESC
      LIMIT p_limit OFFSET p_offset
    ) row
  );
END $$;

-- ─── get_admin_quotes ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_admin_quotes(
  p_status_filter text DEFAULT NULL,
  p_limit         integer DEFAULT 50,
  p_offset        integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN
  IF NOT is_admin() THEN RETURN jsonb_build_object('error', 'UNAUTHORIZED'); END IF;
  RETURN (
    SELECT jsonb_agg(jsonb_build_object(
      'id', sq.id, 'quote_code', sq.quote_code, 'status', sq.status,
      'proposed_amount', sq.proposed_amount, 'currency', sq.currency,
      'valid_until', sq.valid_until, 'requested_at', sq.requested_at,
      'quoted_at', sq.quoted_at, 'version', sq.version,
      'customer_message', sq.customer_message,
      'requested_input_snapshot', sq.requested_input_snapshot,
      'service_name', COALESCE(s.name_ar, s.name),
      'username', u.username,
      'user_id', sq.user_id,
      'order_id', sq.order_id
    ))
    FROM service_quotes sq
    JOIN services s ON s.id = sq.service_id
    JOIN users u ON u.id = sq.user_id
    WHERE (p_status_filter IS NULL OR sq.status = p_status_filter)
    ORDER BY sq.created_at DESC
    LIMIT p_limit OFFSET p_offset
  );
END $$;
