/*
  # Daily Login Streak System

  ## Summary
  Implements a server-side daily login reward system with a 7-day streak cycle.

  ## New Tables

  ### `daily_login_streaks`
  Tracks each user's current streak state:
  - `user_id` — FK to auth.users (unique, one row per user)
  - `current_streak` — how many consecutive days the user has claimed (1–7)
  - `last_claim_date` — the calendar date (UTC) of the last successful claim
  - `total_claims` — lifetime total claims for stats
  - `created_at`, `updated_at`

  ### `daily_login_claims`
  Immutable log of every claim event:
  - `user_id` + `claim_date` — unique constraint prevents double-claiming
  - `day_number` — which day in the cycle (1–7) was rewarded
  - `points_awarded` — points credited in this claim
  - `streak_count` — streak value at time of claim

  ## Security
  - RLS enabled on both tables
  - Users can only SELECT/UPDATE their own streak row
  - Users can INSERT and SELECT their own claims
  - No DELETE or cross-user access

  ## Notes
  - The claim logic lives in the `claim_daily_login` RPC function
  - Server-side: uses `CURRENT_DATE AT TIME ZONE 'UTC'` — not frontend time
  - Unique constraint `(user_id, claim_date)` prevents duplicate claims
  - Streak resets to 1 if more than 1 day has passed since last claim
  - Day 7 awards 500 points; days 1–6 award 50/75/100/150/200/250
*/

-- ── daily_login_streaks ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_login_streaks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_streak  int  NOT NULL DEFAULT 0,
  last_claim_date date,
  total_claims    int  NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_login_streaks_user_id_unique UNIQUE (user_id)
);

ALTER TABLE daily_login_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own streak"
  ON daily_login_streaks FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own streak"
  ON daily_login_streaks FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can insert own streak row"
  ON daily_login_streaks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ── daily_login_claims ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_login_claims (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  claim_date     date NOT NULL DEFAULT (CURRENT_DATE AT TIME ZONE 'UTC'),
  day_number     int  NOT NULL CHECK (day_number BETWEEN 1 AND 7),
  points_awarded int  NOT NULL,
  streak_count   int  NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_login_claims_user_date_unique UNIQUE (user_id, claim_date)
);

ALTER TABLE daily_login_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own claims"
  ON daily_login_claims FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own claims"
  ON daily_login_claims FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ── RPC: claim_daily_login ─────────────────────────────────────────────────────
-- Returns JSON: { success, points_awarded, day_number, current_streak, already_claimed }
CREATE OR REPLACE FUNCTION claim_daily_login()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id        uuid := auth.uid();
  v_today          date := (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date;
  v_streak_row     daily_login_streaks%ROWTYPE;
  v_new_streak     int;
  v_day_number     int;
  v_points         int;
  v_reward_points  int[] := ARRAY[50, 75, 100, 150, 200, 250, 500];
BEGIN
  -- Guard: must be authenticated
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthenticated');
  END IF;

  -- Upsert streak row (ensure it exists)
  INSERT INTO daily_login_streaks (user_id, current_streak, last_claim_date, total_claims)
  VALUES (v_user_id, 0, NULL, 0)
  ON CONFLICT (user_id) DO NOTHING;

  -- Load streak row (lock for update)
  SELECT * INTO v_streak_row
  FROM daily_login_streaks
  WHERE user_id = v_user_id
  FOR UPDATE;

  -- Already claimed today?
  IF v_streak_row.last_claim_date = v_today THEN
    RETURN jsonb_build_object(
      'success',         false,
      'already_claimed', true,
      'current_streak',  v_streak_row.current_streak,
      'day_number',      v_streak_row.current_streak
    );
  END IF;

  -- Calculate new streak
  IF v_streak_row.last_claim_date IS NULL THEN
    v_new_streak := 1;
  ELSIF v_streak_row.last_claim_date = v_today - INTERVAL '1 day' THEN
    -- Consecutive day
    v_new_streak := LEAST(v_streak_row.current_streak + 1, 7);
    -- Reset after completing full cycle
    IF v_streak_row.current_streak >= 7 THEN
      v_new_streak := 1;
    END IF;
  ELSE
    -- Missed a day — reset
    v_new_streak := 1;
  END IF;

  v_day_number := v_new_streak;
  v_points     := v_reward_points[v_day_number];

  -- Insert claim log (unique constraint guards duplicates)
  INSERT INTO daily_login_claims (user_id, claim_date, day_number, points_awarded, streak_count)
  VALUES (v_user_id, v_today, v_day_number, v_points, v_new_streak)
  ON CONFLICT (user_id, claim_date) DO NOTHING;

  -- If nothing was inserted (race condition), treat as already claimed
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success',         false,
      'already_claimed', true,
      'current_streak',  v_streak_row.current_streak,
      'day_number',      v_streak_row.current_streak
    );
  END IF;

  -- Update streak row
  UPDATE daily_login_streaks SET
    current_streak  = v_new_streak,
    last_claim_date = v_today,
    total_claims    = total_claims + 1,
    updated_at      = now()
  WHERE user_id = v_user_id;

  -- Credit points to user
  UPDATE users SET
    points = points + v_points
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success',         true,
    'already_claimed', false,
    'points_awarded',  v_points,
    'day_number',      v_day_number,
    'current_streak',  v_new_streak
  );
END;
$$;

-- ── RPC: get_daily_login_status ────────────────────────────────────────────────
-- Returns current streak state without claiming
CREATE OR REPLACE FUNCTION get_daily_login_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_today      date := (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date;
  v_streak_row daily_login_streaks%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false);
  END IF;

  SELECT * INTO v_streak_row
  FROM daily_login_streaks
  WHERE user_id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success',         true,
      'current_streak',  0,
      'already_claimed', false,
      'last_claim_date', null
    );
  END IF;

  RETURN jsonb_build_object(
    'success',         true,
    'current_streak',  v_streak_row.current_streak,
    'already_claimed', v_streak_row.last_claim_date = v_today,
    'last_claim_date', v_streak_row.last_claim_date
  );
END;
$$;
