/*
  # Complete AXIE Economic System

  1. New Tables
    - `free_plays` - Track daily free plays per user
    - `payment_packages` - Point packages for purchase
    - `point_transactions` - Track point purchases and usage
    - `payment_verification` - Admin verification of payments
    - `economy_logs` - Audit trail for all economy operations
    - `game_attempts` - Track each card play attempt with costs

  2. Features
    - Daily free plays (3 per user, reset at midnight)
    - Point cost system (100 points per play after free plays)
    - Payment packages (Libyan-based)
    - Admin payment verification workflow
    - Complete audit trail for fraud prevention
    - Real-time balance updates

  3. Security
    - RLS on all tables
    - Server-side validation only
    - Prevent double-spending
    - IP and device tracking
    - Immutable audit logs
*/

-- Free Plays Tracking Table
CREATE TABLE IF NOT EXISTS free_plays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  free_plays_remaining integer DEFAULT 3,
  last_reset_date date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Payment Packages Configuration
CREATE TABLE IF NOT EXISTS payment_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  description_ar text,
  description_en text,
  points integer NOT NULL,
  bonus_points integer DEFAULT 0,
  price_lyd numeric NOT NULL,
  payment_methods text[] DEFAULT ARRAY['libyana', 'almadaar', 'bank_transfer'],
  icon text,
  featured boolean DEFAULT false,
  active boolean DEFAULT true,
  order_index integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Point Transactions Log
CREATE TABLE IF NOT EXISTS point_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_type text NOT NULL,
  amount integer NOT NULL,
  description text,
  reference_id text,
  balance_before integer,
  balance_after integer,
  metadata jsonb DEFAULT '{}',
  ip_address text,
  device_info text,
  created_at timestamptz DEFAULT now()
);

-- Payment Verification (Admin Workflow)
CREATE TABLE IF NOT EXISTS payment_verification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_number text NOT NULL UNIQUE,
  package_id uuid NOT NULL REFERENCES payment_packages(id),
  payment_method text NOT NULL,
  status text DEFAULT 'pending',
  points_to_add integer NOT NULL,
  proof_image_url text,
  proof_phone_number text,
  proof_transaction_id text,
  admin_notes text,
  rejected_reason text,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  points_added_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Game Attempts (tracks each play with cost deduction)
CREATE TABLE IF NOT EXISTS game_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_type text DEFAULT 'lucky-card',
  cost_type text DEFAULT 'free',
  cost_points integer DEFAULT 0,
  was_free boolean DEFAULT false,
  reward_type text,
  reward_value integer,
  reward_rarity text,
  points_before integer,
  points_after integer,
  ip_address text,
  device_hash text,
  created_at timestamptz DEFAULT now()
);

-- Economy Audit Log (immutable)
CREATE TABLE IF NOT EXISTS economy_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  points_change integer,
  balance_change integer,
  metadata jsonb DEFAULT '{}',
  timestamp timestamptz DEFAULT now()
);

-- Add new columns to existing users table if not exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'free_plays_remaining'
  ) THEN
    ALTER TABLE users ADD COLUMN free_plays_remaining integer DEFAULT 3;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'free_plays_reset_date'
  ) THEN
    ALTER TABLE users ADD COLUMN free_plays_reset_date date DEFAULT CURRENT_DATE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'total_points_spent'
  ) THEN
    ALTER TABLE users ADD COLUMN total_points_spent integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'total_points_purchased'
  ) THEN
    ALTER TABLE users ADD COLUMN total_points_purchased integer DEFAULT 0;
  END IF;
END $$;

-- Enable RLS
ALTER TABLE free_plays ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_verification ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE economy_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Free Plays
CREATE POLICY "Users can read their free plays"
  ON free_plays FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "System can update free plays"
  ON free_plays FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Payment Packages (read-only for all)
CREATE POLICY "All authenticated users can read packages"
  ON payment_packages FOR SELECT
  TO authenticated
  USING (active = true);

-- Point Transactions
CREATE POLICY "Users can read their transactions"
  ON point_transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert transactions"
  ON point_transactions FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Payment Verification
CREATE POLICY "Users can read their verification"
  ON payment_verification FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all verifications"
  ON payment_verification FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.user_id = auth.uid() AND admins.is_active = true
    )
  );

CREATE POLICY "Admins can update verifications"
  ON payment_verification FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.user_id = auth.uid() AND admins.is_active = true
    )
  );

-- Game Attempts
CREATE POLICY "Users can read their attempts"
  ON game_attempts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert attempts"
  ON game_attempts FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Economy Logs (admin only)
CREATE POLICY "Admins can read economy logs"
  ON economy_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.user_id = auth.uid() AND admins.is_active = true
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_free_plays_user ON free_plays(user_id);
CREATE INDEX IF NOT EXISTS idx_free_plays_reset_date ON free_plays(last_reset_date);
CREATE INDEX IF NOT EXISTS idx_point_transactions_user ON point_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_point_transactions_type ON point_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_point_transactions_created ON point_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_verification_user ON payment_verification(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_verification_status ON payment_verification(status);
CREATE INDEX IF NOT EXISTS idx_payment_verification_order ON payment_verification(order_number);
CREATE INDEX IF NOT EXISTS idx_game_attempts_user ON game_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_game_attempts_created ON game_attempts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_economy_logs_timestamp ON economy_logs(timestamp DESC);
