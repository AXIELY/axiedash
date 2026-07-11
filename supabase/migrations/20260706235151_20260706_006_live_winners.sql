-- Phase 5: Live Winners Feed
-- Server-side username masking, deduplication via UNIQUE(spin_id)
-- Realtime-enabled for live subscription

CREATE TABLE IF NOT EXISTS public_winner_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spin_id        uuid NOT NULL REFERENCES spin_requests(id) ON DELETE CASCADE,
  masked_username text NOT NULL,  -- e.g. "Mo***d"
  prize_type     text NOT NULL,
  prize_name_en  text NOT NULL DEFAULT '',
  prize_name_ar  text NOT NULL DEFAULT '',
  prize_value    text NOT NULL DEFAULT '0',
  points_awarded int NOT NULL DEFAULT 0,
  avatar_seed    text NOT NULL DEFAULT 'default',
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT public_winner_events_spin_unique UNIQUE (spin_id)
);

ALTER TABLE public_winner_events ENABLE ROW LEVEL SECURITY;

-- Everyone can read (it's a public feed)
CREATE POLICY "all_read_winner_events" ON public_winner_events
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin_manage_winner_events" ON public_winner_events
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.user_id = auth.uid() AND admins.is_active = true));

CREATE INDEX IF NOT EXISTS idx_winner_events_created ON public_winner_events (created_at DESC);

-- Enable realtime for live winner feed
ALTER PUBLICATION supabase_realtime ADD TABLE public_winner_events;

-- ── Function: mask_username() ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION mask_username(p_username text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_len int := length(p_username);
BEGIN
  IF v_len <= 3 THEN
    RETURN left(p_username, 1) || repeat('*', GREATEST(v_len - 1, 1));
  ELSIF v_len <= 6 THEN
    RETURN left(p_username, 2) || repeat('*', v_len - 3) || right(p_username, 1);
  ELSE
    RETURN left(p_username, 3) || repeat('*', v_len - 5) || right(p_username, 2);
  END IF;
END;
$$;

-- ── publish_winner_event() ────────────────────────────────────────────────────
-- Called by outbox processor after a winning spin
CREATE OR REPLACE FUNCTION publish_winner_event(p_spin_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_flag     boolean;
  v_result   spin_results%ROWTYPE;
  v_user     users%ROWTYPE;
  v_req      spin_requests%ROWTYPE;
BEGIN
  SELECT enabled INTO v_flag FROM engagement_flags WHERE flag = 'live_winners';
  IF NOT COALESCE(v_flag, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'live_winners_disabled');
  END IF;

  SELECT * INTO v_result FROM spin_results WHERE spin_request_id = p_spin_request_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'result_not_found');
  END IF;

  -- Only publish non-miss wins
  IF v_result.prize_type = 'miss' THEN
    RETURN jsonb_build_object('success', true, 'published', false, 'reason', 'miss');
  END IF;

  SELECT * INTO v_user FROM users WHERE id = v_result.user_id;
  SELECT * INTO v_req  FROM spin_requests WHERE id = p_spin_request_id;

  INSERT INTO public_winner_events (
    spin_id, masked_username, prize_type, prize_name_en, prize_name_ar,
    prize_value, points_awarded, avatar_seed
  ) VALUES (
    p_spin_request_id,
    mask_username(COALESCE(v_user.username, 'User')),
    v_result.prize_type,
    v_result.prize_name_en,
    v_result.prize_name_ar,
    v_result.prize_value,
    v_result.points_awarded,
    COALESCE(v_user.username, 'default')
  )
  ON CONFLICT (spin_id) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'published', true);
END;
$$;
