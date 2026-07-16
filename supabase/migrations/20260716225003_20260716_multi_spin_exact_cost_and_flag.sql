-- Add multi_spin_enabled flag to wheel_game_settings
ALTER TABLE wheel_game_settings
ADD COLUMN IF NOT EXISTS multi_spin_enabled boolean NOT NULL DEFAULT false;

-- Add single_spin_cost to wheel_spin_batches for audit trail
ALTER TABLE wheel_spin_batches
ADD COLUMN IF NOT EXISTS single_spin_cost integer NOT NULL DEFAULT 100;

-- Backfill existing batches
UPDATE wheel_spin_batches SET single_spin_cost = 100 WHERE single_spin_cost IS NULL OR single_spin_cost = 0;
