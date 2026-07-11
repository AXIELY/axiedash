-- Phase 0: Engagement system feature flags
-- All flags default FALSE — subsystems are off until explicitly enabled

CREATE TABLE IF NOT EXISTS engagement_flags (
  flag        text PRIMARY KEY,
  enabled     boolean NOT NULL DEFAULT false,
  description text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE engagement_flags ENABLE ROW LEVEL SECURITY;

-- Admins can read/write all flags; regular users can only read
CREATE POLICY "admin_manage_flags" ON engagement_flags
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.user_id = auth.uid() AND admins.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.user_id = auth.uid() AND admins.is_active = true
    )
  );

CREATE POLICY "users_read_flags" ON engagement_flags
  FOR SELECT TO authenticated
  USING (true);

-- Seed all 10 subsystem flags
INSERT INTO engagement_flags (flag, description) VALUES
  ('spin_v2',       'Server-authoritative spin via perform_spin() RPC'),
  ('progression',   'XP, Level, Rank progression system'),
  ('missions',      'Daily missions subsystem'),
  ('streak',        'Spin activity streak (separate from daily login)'),
  ('badges',        'Achievement badge system'),
  ('combo',         'Consecutive wins combo multiplier'),
  ('live_winners',  'Real-time public winner feed'),
  ('lucky_hour',    'Time-limited Lucky Hour events'),
  ('golden_wheel',  'Golden Wheel variant game mode'),
  ('jackpot',       'Jackpot pool contribution and settlement')
ON CONFLICT (flag) DO NOTHING;
