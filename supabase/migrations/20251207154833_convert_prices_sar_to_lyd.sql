/*
  # Convert Prices from SAR to LYD

  1. Changes
    - Convert all service package prices from Saudi Riyal (SAR) to Libyan Dinar (LYD)
    - Conversion rate: 1 SAR = 1.30 LYD
    - Updates the following columns in `service_packages`:
      - `price`: Current price
      - `original_price`: Original price (if set)
    - Updates the following columns in `orders`:
      - `amount`: Order amount
      - `discount_amount`: Discount amount
      - `final_amount`: Final amount after discount
  
  2. Important Notes
    - All prices will be multiplied by 1.30 to convert from SAR to LYD
    - This migration is safe to run multiple times (idempotent) as it uses a flag to track conversion
*/

-- Add a column to track if prices have been converted (if it doesn't exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'service_packages' AND column_name = 'currency_converted_to_lyd'
  ) THEN
    ALTER TABLE service_packages ADD COLUMN currency_converted_to_lyd BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Convert service package prices from SAR to LYD
UPDATE service_packages
SET 
  price = ROUND((price * 1.30)::numeric, 2),
  original_price = CASE 
    WHEN original_price IS NOT NULL THEN ROUND((original_price * 1.30)::numeric, 2)
    ELSE NULL
  END,
  currency_converted_to_lyd = TRUE
WHERE currency_converted_to_lyd = FALSE OR currency_converted_to_lyd IS NULL;

-- Add a column to track if order prices have been converted (if it doesn't exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'currency_converted_to_lyd'
  ) THEN
    ALTER TABLE orders ADD COLUMN currency_converted_to_lyd BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Convert order prices from SAR to LYD
UPDATE orders
SET 
  amount = ROUND((amount * 1.30)::numeric, 2),
  discount_amount = ROUND((discount_amount * 1.30)::numeric, 2),
  final_amount = ROUND((final_amount * 1.30)::numeric, 2),
  currency_converted_to_lyd = TRUE
WHERE currency_converted_to_lyd = FALSE OR currency_converted_to_lyd IS NULL;
