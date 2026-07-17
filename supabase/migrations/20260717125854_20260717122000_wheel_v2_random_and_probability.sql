/*
# AXIE Wheel V2 — Secure Random Helper & Probability Engine

## Purpose
Creates the cryptographically secure random number helper using pgcrypto,
and the probability range builder that creates ordered half-open ranges
for prize selection.

## Functions

### secure_random_0_to_999999()
Returns an unbiased integer 0–999,999 using pgcrypto gen_random_bytes
with rejection sampling to avoid modulo bias.

### build_wheel_v2_probability_ranges(p_version_id)
Returns ordered prize rows with cumulative range_start and range_end
values (in ppm). Ranges are half-open: [start, end), start at 0,
end at 1,000,000, no gaps, no overlaps.

## Security
- SECURITY DEFINER, fixed search_path = public.
- Uses pgcrypto's gen_random_bytes (cryptographically secure).
- No user input directly in SQL — parameterized.

## Notes
1. Rejection sampling: generates 3 bytes (24-bit), rejects values >= 1,000,000
   to avoid modulo bias. Expected rejection rate ~6%.
2. pgcrypto extension must be enabled (it already is in this project).
*/

-- ═══════════════════════════════════════════════════════
-- Secure random helper: unbiased integer 0–999,999
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION secure_random_0_to_999999()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bytes bytea;
  v_value int;
BEGIN
  LOOP
    -- Generate 3 cryptographically secure random bytes
    v_bytes := gen_random_bytes(3);
    -- Convert to integer (0 to 16,777,215)
    v_value := get_byte(v_bytes, 0) * 65536 + get_byte(v_bytes, 1) * 256 + get_byte(v_bytes, 2);
    -- Rejection sampling: only accept if < 1,000,000
    IF v_value < 1000000 THEN
      RETURN v_value;
    END IF;
  END LOOP;
END;
$$;

-- ═══════════════════════════════════════════════════════
-- Build probability ranges for a version
-- Returns ordered rows with range_start and range_end
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION build_wheel_v2_probability_ranges(p_version_id uuid)
RETURNS TABLE (
  prize_key text,
  display_order int,
  probability_ppm int,
  range_start int,
  range_end int,
  reward_type text,
  reward_payload jsonb,
  name_ar text,
  name_en text,
  short_label_ar text,
  short_label_en text,
  rarity text,
  icon_url text,
  wheel_color_start text,
  wheel_color_end text,
  text_color text,
  is_grand_prize boolean,
  fallback_prize_key text,
  fulfillment_mode text,
  is_public_winner boolean,
  enabled boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cumulative int := 0;
  v_row record;
BEGIN
  FOR v_row IN
    SELECT *
    FROM wheel_v2_version_prizes
    WHERE version_id = p_version_id
      AND enabled = true
    ORDER BY display_order ASC, prize_key ASC
  LOOP
    prize_key := v_row.prize_key;
    display_order := v_row.display_order;
    probability_ppm := v_row.probability_ppm;
    range_start := v_cumulative;
    v_cumulative := v_cumulative + v_row.probability_ppm;
    range_end := v_cumulative;
    reward_type := v_row.reward_type;
    reward_payload := v_row.reward_payload;
    name_ar := v_row.name_ar;
    name_en := v_row.name_en;
    short_label_ar := v_row.short_label_ar;
    short_label_en := v_row.short_label_en;
    rarity := v_row.rarity;
    icon_url := v_row.icon_url;
    wheel_color_start := v_row.wheel_color_start;
    wheel_color_end := v_row.wheel_color_end;
    text_color := v_row.text_color;
    is_grand_prize := v_row.is_grand_prize;
    fallback_prize_key := v_row.fallback_prize_key;
    fulfillment_mode := v_row.fulfillment_mode;
    is_public_winner := v_row.is_public_winner;
    enabled := v_row.enabled;
    RETURN NEXT;
  END LOOP;
  RETURN;
END;
$$;

-- ═══════════════════════════════════════════════════════
-- Select prize by draw number using half-open ranges
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION select_wheel_v2_prize(
  p_version_id uuid,
  p_draw_number int
)
RETURNS TABLE (
  prize_key text,
  range_start int,
  range_end int,
  reward_type text,
  reward_payload jsonb,
  name_ar text,
  name_en text,
  short_label_ar text,
  short_label_en text,
  rarity text,
  icon_url text,
  wheel_color_start text,
  wheel_color_end text,
  text_color text,
  is_grand_prize boolean,
  fallback_prize_key text,
  fulfillment_mode text,
  is_public_winner boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
BEGIN
  -- Find the prize whose range contains the draw number
  -- Using the half-open interval [range_start, range_end)
  SELECT *
  INTO v_row
  FROM build_wheel_v2_probability_ranges(p_version_id)
  WHERE p_draw_number >= range_start AND p_draw_number < range_end
  LIMIT 1;

  IF v_row IS NULL THEN
    -- This should never happen if probabilities sum to 1,000,000
    -- But handle gracefully
    RETURN;
  END IF;

  prize_key := v_row.prize_key;
  range_start := v_row.range_start;
  range_end := v_row.range_end;
  reward_type := v_row.reward_type;
  reward_payload := v_row.reward_payload;
  name_ar := v_row.name_ar;
  name_en := v_row.name_en;
  short_label_ar := v_row.short_label_ar;
  short_label_en := v_row.short_label_en;
  rarity := v_row.rarity;
  icon_url := v_row.icon_url;
  wheel_color_start := v_row.wheel_color_start;
  wheel_color_end := v_row.wheel_color_end;
  text_color := v_row.text_color;
  is_grand_prize := v_row.is_grand_prize;
  fallback_prize_key := v_row.fallback_prize_key;
  fulfillment_mode := v_row.fulfillment_mode;
  is_public_winner := v_row.is_public_winner;
  RETURN NEXT;
  RETURN;
END;
$$;
