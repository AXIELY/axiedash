-- Fix: secure_random_0_to_999999 had SET search_path TO 'public' which
-- excluded the 'extensions' schema where pgcrypto's gen_random_bytes lives.
-- Qualify the call as extensions.gen_random_bytes() to make it work
-- regardless of search_path.

CREATE OR REPLACE FUNCTION public.secure_random_0_to_999999()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_bytes bytea;
  v_value int;
BEGIN
  LOOP
    -- Generate 3 cryptographically secure random bytes (pgcrypto)
    v_bytes := extensions.gen_random_bytes(3);
    -- Convert to integer (0 to 16,777,215)
    v_value := get_byte(v_bytes, 0) * 65536 + get_byte(v_bytes, 1) * 256 + get_byte(v_bytes, 2);
    -- Rejection sampling: only accept if < 1,000,000
    IF v_value < 1000000 THEN
      RETURN v_value;
    END IF;
  END LOOP;
END;
$function$;
