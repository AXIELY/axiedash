-- Fix batch spin costs to be exact multiples of single_spin_cost (no discounts)
-- 5x = 500 (5 × 100), 10x = 1000 (10 × 100)
UPDATE wheel_game_settings
SET five_spin_cost = 500,
    ten_spin_cost  = 1000,
    updated_at     = now()
WHERE id = (SELECT id FROM wheel_game_settings ORDER BY id LIMIT 1);
