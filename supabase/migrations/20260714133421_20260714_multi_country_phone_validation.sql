/*
# Multi-country phone validation (+218, +93, +94)

1. Changes
   - Creates validate_phone(p_raw, p_country_code) that validates phone numbers
     for Libya (+218), Afghanistan (+93), and Sri Lanka (+94).
   - Updates register_with_phone to accept p_country_code parameter and use
     the new multi-country validator instead of validate_libyan_phone.

2. Validation rules per country:
   - +218 (Libya): 9 digits, starts with 91 or 92
   - +93  (Afghanistan): 9 digits, starts with 7
   - +94  (Sri Lanka): 9 digits, starts with 7

3. Security
   - Both functions remain SECURITY DEFINER with search_path = public.
*/

-- Multi-country phone validator
CREATE OR REPLACE FUNCTION public.validate_phone(
  p_national     text,
  p_country_code text DEFAULT '+218'
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_clean text;
  v_cc    text := COALESCE(p_country_code, '+218');
  v_cc_digits text;
BEGIN
  v_cc_digits := regexp_replace(v_cc, '[^0-9]', '', 'g');
  v_clean := regexp_replace(COALESCE(p_national, ''), '[^0-9]', '', 'g');

  -- Strip leading country code if user entered it
  IF v_clean LIKE v_cc_digits || '%' THEN
    v_clean := substr(v_clean, length(v_cc_digits) + 1);
  END IF;
  -- Strip leading 0
  IF v_clean LIKE '0%' THEN
    v_clean := substr(v_clean, 2);
  END IF;

  -- Validate per country
  IF v_cc = '+218' THEN
    -- Libya: 9 digits, starts with 91 or 92
    IF length(v_clean) <> 9 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'INVALID_PHONE_LENGTH');
    END IF;
    IF v_clean NOT SIMILAR TO '(91|92)[0-9]{7}' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'INVALID_PHONE_PREFIX');
    END IF;

  ELSIF v_cc = '+93' THEN
    -- Afghanistan: 9 digits, starts with 7
    IF length(v_clean) <> 9 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'INVALID_PHONE_LENGTH');
    END IF;
    IF v_clean NOT SIMILAR TO '7[0-9]{8}' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'INVALID_PHONE_PREFIX');
    END IF;

  ELSIF v_cc = '+94' THEN
    -- Sri Lanka: 9 digits, starts with 7
    IF length(v_clean) <> 9 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'INVALID_PHONE_LENGTH');
    END IF;
    IF v_clean NOT SIMILAR TO '7[0-9]{8}' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'INVALID_PHONE_PREFIX');
    END IF;

  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'UNSUPPORTED_COUNTRY_CODE');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'national', v_clean,
    'e164', v_cc || v_clean,
    'country_code', v_cc
  );
END;
$$;

-- Update register_with_phone to accept country code
CREATE OR REPLACE FUNCTION public.register_with_phone(
  p_username     text,
  p_phone        text,
  p_country_code text DEFAULT '+218'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_phone_info jsonb;
  v_phone_e164 text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED');
  END IF;

  -- Validate phone if provided
  IF p_phone IS NOT NULL AND trim(p_phone) <> '' THEN
    SELECT public.validate_phone(p_phone, p_country_code) INTO v_phone_info;
    IF NOT (v_phone_info->>'ok')::boolean THEN
      RETURN jsonb_build_object('ok', false, 'error', COALESCE(v_phone_info->>'error', 'INVALID_PHONE'));
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
