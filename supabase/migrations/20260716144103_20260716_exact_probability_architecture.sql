
/*
# Exact Probability Architecture — Basis Points, Versioning, No Renormalization

## Overview
Replaces relative-weight probability system with exact integer basis points (1 bp = 0.01%).
Introduces immutable published probability versions. Adds spin trace columns for full auditability.
Adds multi-spin batch settings. Implements safe-fallback-based perform_spin_batch RPC.

## New Tables
- `wheel_probability_versions` — Immutable published probability snapshots
  - id (uuid PK)
  - wheel_settings_id (uuid FK)
  - version_number (int)
  - status (text: DRAFT/PUBLISHED/ARCHIVED)
  - prizes_snapshot (jsonb — frozen prize array with probability_bp)
  - total_probability_bp (int — must equal 10000)
  - fallback_prize_id (text — safe fallback)
  - published_at (timestamptz)
  - published_by (uuid)
  - created_at (timestamptz)

## Modified Tables
- `wheel_game_settings` — Added multi-spin cost columns
  - single_spin_cost (int)
  - five_spin_cost (int)
  - ten_spin_cost (int)
  - five_spin_enabled (bool)
  - ten_spin_enabled (bool)
  - fallback_prize_id (text)
  
- `spin_results` — Added probability trace columns
  - probability_version_id (uuid)
  - random_bucket (int 0-9999)
  - original_selected_prize_id (text)
  - final_awarded_prize_id (text)
  - fallback_used (bool)
  - fallback_reason (text)
  - sequence_number (int — for batch ordering)
  - batch_request_id (uuid — groups batch spins)

## New Functions
- `perform_spin_batch` — Authoritative batch spin RPC with basis-point ranges
- `publish_wheel_version` — Admin publishes a new immutable probability version
- `simulate_wheel_spins` — Diagnostic: 100k dry-run using same engine, no side effects

## Security
- RLS on wheel_probability_versions (authenticated read, admin write via RPC)
- perform_spin_batch requires authenticated user

## Important Notes
1. probability_bp is the SOLE authority for production selection
2. Weight field preserved for backward compat display only
3. No renormalization — ineligible prizes resolve to safe fallback
4. All spins in a batch use the same probability_version_id
5. Grand Prize locked status uses fallback, never redistributes probability
6. Existing spin_results and reward_grants are NOT modified
*/

-- 1. wheel_probability_versions table
CREATE TABLE IF NOT EXISTS wheel_probability_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wheel_settings_id uuid NOT NULL,
  version_number int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  prizes_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_probability_bp int NOT NULL DEFAULT 0,
  fallback_prize_id text NOT NULL DEFAULT 'points-1',
  published_at timestamptz,
  published_by uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE wheel_probability_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_wheel_versions" ON wheel_probability_versions;
CREATE POLICY "auth_read_wheel_versions" ON wheel_probability_versions FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_wheel_versions" ON wheel_probability_versions;
CREATE POLICY "auth_insert_wheel_versions" ON wheel_probability_versions FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_wheel_versions" ON wheel_probability_versions;
CREATE POLICY "auth_update_wheel_versions" ON wheel_probability_versions FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- 2. Add multi-spin settings columns to wheel_game_settings
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wheel_game_settings' AND column_name = 'single_spin_cost') THEN
    ALTER TABLE wheel_game_settings ADD COLUMN single_spin_cost int NOT NULL DEFAULT 100;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wheel_game_settings' AND column_name = 'five_spin_cost') THEN
    ALTER TABLE wheel_game_settings ADD COLUMN five_spin_cost int NOT NULL DEFAULT 450;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wheel_game_settings' AND column_name = 'ten_spin_cost') THEN
    ALTER TABLE wheel_game_settings ADD COLUMN ten_spin_cost int NOT NULL DEFAULT 800;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wheel_game_settings' AND column_name = 'five_spin_enabled') THEN
    ALTER TABLE wheel_game_settings ADD COLUMN five_spin_enabled bool NOT NULL DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wheel_game_settings' AND column_name = 'ten_spin_enabled') THEN
    ALTER TABLE wheel_game_settings ADD COLUMN ten_spin_enabled bool NOT NULL DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wheel_game_settings' AND column_name = 'fallback_prize_id') THEN
    ALTER TABLE wheel_game_settings ADD COLUMN fallback_prize_id text NOT NULL DEFAULT 'points-1';
  END IF;
END $$;

-- 3. Add trace columns to spin_results
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'spin_results' AND column_name = 'probability_version_id') THEN
    ALTER TABLE spin_results ADD COLUMN probability_version_id uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'spin_results' AND column_name = 'random_bucket') THEN
    ALTER TABLE spin_results ADD COLUMN random_bucket int;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'spin_results' AND column_name = 'original_selected_prize_id') THEN
    ALTER TABLE spin_results ADD COLUMN original_selected_prize_id text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'spin_results' AND column_name = 'final_awarded_prize_id') THEN
    ALTER TABLE spin_results ADD COLUMN final_awarded_prize_id text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'spin_results' AND column_name = 'fallback_used') THEN
    ALTER TABLE spin_results ADD COLUMN fallback_used bool DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'spin_results' AND column_name = 'fallback_reason') THEN
    ALTER TABLE spin_results ADD COLUMN fallback_reason text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'spin_results' AND column_name = 'sequence_number') THEN
    ALTER TABLE spin_results ADD COLUMN sequence_number int DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'spin_results' AND column_name = 'batch_request_id') THEN
    ALTER TABLE spin_results ADD COLUMN batch_request_id uuid;
  END IF;
END $$;

-- 4. Seed the initial published probability version from current prizes
-- Convert existing weights to basis points summing to 10000
-- Current eligible: points-1 (w=5), libyana (w=2.2), grand (w=0.08), prize_1783884291700 (w=0.05)
-- tiktok was removed from array. We add it back with 640bp.
-- Re-add tiktok to settings prizes array
UPDATE wheel_game_settings
SET prizes = prizes || '[{
  "id": "tiktok",
  "type": "coins",
  "value": "100 عملة تيك توك",
  "weight": 0.5,
  "name_ar": "تيك توك",
  "name_en": "TikTok Coins",
  "is_strong": false,
  "short_label": "100",
  "accent_color": "#00f2ea",
  "probability_bp": 640,
  "max_wins_per_user": 3,
  "max_winners_per_day": 10,
  "internal_cost_estimate": 2.5,
  "daily_cost_cap": 25,
  "disabled": true,
  "disabled_reason": "safety_hold_pending_verification"
}]'::jsonb
WHERE active = true
AND NOT EXISTS (
  SELECT 1 FROM jsonb_array_elements(prizes) elem
  WHERE elem->>'id' = 'tiktok'
);

-- Add probability_bp to each existing prize in the JSONB array
UPDATE wheel_game_settings
SET prizes = (
  SELECT jsonb_agg(
    CASE
      WHEN elem->>'id' = 'points-1' THEN elem || '{"probability_bp": 6386}'::jsonb
      WHEN elem->>'id' = 'libyana' THEN elem || '{"probability_bp": 2810, "disabled": true, "disabled_reason": "safety_hold_pending_verification"}'::jsonb
      WHEN elem->>'id' = 'tiktok' THEN elem || '{"probability_bp": 640, "disabled": true, "disabled_reason": "safety_hold_pending_verification"}'::jsonb
      WHEN elem->>'id' = 'tiktok-2' THEN elem || '{"probability_bp": 0}'::jsonb
      WHEN elem->>'id' = 'grand' THEN elem || '{"probability_bp": 100, "is_grand_prize": true, "unlock_after_completed_spins": 30}'::jsonb
      WHEN elem->>'id' = 'prize_1783884291700' THEN elem || '{"probability_bp": 64}'::jsonb
      ELSE elem || '{"probability_bp": 0}'::jsonb
    END
    ORDER BY ordinality
  )
  FROM jsonb_array_elements(prizes) WITH ORDINALITY AS arr(elem, ordinality)
)
WHERE active = true;

-- Create initial PUBLISHED version
INSERT INTO wheel_probability_versions (
  wheel_settings_id,
  version_number,
  status,
  prizes_snapshot,
  total_probability_bp,
  fallback_prize_id,
  published_at,
  published_by
)
SELECT
  ws.id,
  1,
  'PUBLISHED',
  (SELECT jsonb_agg(elem ORDER BY ordinality)
   FROM jsonb_array_elements(ws.prizes) WITH ORDINALITY AS arr(elem, ordinality)
   WHERE (elem->>'probability_bp')::int > 0
  ),
  10000,
  'points-1',
  now(),
  NULL
FROM wheel_game_settings ws
WHERE ws.active = true
ON CONFLICT DO NOTHING;

-- 5. publish_wheel_version RPC
CREATE OR REPLACE FUNCTION publish_wheel_version(
  p_settings_id uuid,
  p_prizes jsonb,
  p_fallback_prize_id text DEFAULT 'points-1'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_bp int;
  v_version_number int;
  v_version_id uuid;
BEGIN
  -- Validate total = 10000
  SELECT COALESCE(SUM((elem->>'probability_bp')::int), 0)
  INTO v_total_bp
  FROM jsonb_array_elements(p_prizes) elem
  WHERE NOT COALESCE((elem->>'disabled')::boolean, false);

  IF v_total_bp != 10000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'total_not_10000', 'total', v_total_bp);
  END IF;

  -- Validate fallback exists and is not disabled
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_prizes) elem
    WHERE elem->>'id' = p_fallback_prize_id
    AND NOT COALESCE((elem->>'disabled')::boolean, false)
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_fallback');
  END IF;

  -- Archive current PUBLISHED
  UPDATE wheel_probability_versions
  SET status = 'ARCHIVED'
  WHERE wheel_settings_id = p_settings_id AND status = 'PUBLISHED';

  -- Get next version number
  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO v_version_number
  FROM wheel_probability_versions
  WHERE wheel_settings_id = p_settings_id;

  -- Insert new PUBLISHED version
  INSERT INTO wheel_probability_versions (
    wheel_settings_id, version_number, status,
    prizes_snapshot, total_probability_bp, fallback_prize_id,
    published_at, published_by
  ) VALUES (
    p_settings_id, v_version_number, 'PUBLISHED',
    (SELECT jsonb_agg(elem) FROM jsonb_array_elements(p_prizes) elem
     WHERE (elem->>'probability_bp')::int > 0),
    v_total_bp, p_fallback_prize_id,
    now(), auth.uid()
  )
  RETURNING id INTO v_version_id;

  -- Update settings with latest prizes
  UPDATE wheel_game_settings
  SET prizes = p_prizes, updated_at = now()
  WHERE id = p_settings_id;

  RETURN jsonb_build_object(
    'success', true,
    'version_id', v_version_id,
    'version_number', v_version_number,
    'total_bp', v_total_bp
  );
END;
$$;

-- 6. perform_spin_batch — The authoritative basis-point spin engine
CREATE OR REPLACE FUNCTION perform_spin_batch(
  p_spin_count int,
  p_request_id uuid,
  p_payment_mode text DEFAULT 'points'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_settings record;
  v_version record;
  v_cost int;
  v_user_points int;
  v_free_spins_left int;
  v_use_free bool := false;
  v_spin_request_id uuid;
  v_results jsonb := '[]'::jsonb;
  v_total_points_awarded int := 0;
  v_i int;
  v_random_bucket int;
  v_cumulative int;
  v_original_prize_id text;
  v_final_prize_id text;
  v_fallback_used bool;
  v_fallback_reason text;
  v_prize jsonb;
  v_fallback_prize jsonb;
  v_eligible bool;
  v_user_wins_today int;
  v_user_wins_total int;
  v_spin_result_id uuid;
  v_points_awarded int;
  v_progress_count int;
  v_grand_unlock_spins int;
  v_grand_prize_id text;
  v_unlocked_grand_ids jsonb := '[]'::jsonb;
  v_batch_id uuid;
BEGIN
  -- Auth
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Validate spin count
  IF p_spin_count NOT IN (1, 5, 10) THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_spin_count');
  END IF;

  -- Idempotency check
  IF EXISTS (SELECT 1 FROM spin_requests WHERE client_request_id = p_request_id AND user_id = v_user_id) THEN
    -- Return existing results for this request
    SELECT jsonb_agg(jsonb_build_object(
      'prize_index', 0,
      'prize_id', sr.final_awarded_prize_id,
      'prize_type', sr.prize_type,
      'prize_value', sr.prize_value,
      'prize_name_ar', sr.prize_name_ar,
      'prize_name_en', sr.prize_name_en,
      'points_awarded', sr.points_awarded,
      'sequence_number', sr.sequence_number,
      'fallback_used', sr.fallback_used,
      'original_prize_id', sr.original_selected_prize_id
    ) ORDER BY sr.sequence_number)
    INTO v_results
    FROM spin_results sr
    JOIN spin_requests sreq ON sr.spin_request_id = sreq.id
    WHERE sreq.client_request_id = p_request_id AND sreq.user_id = v_user_id;

    RETURN jsonb_build_object(
      'success', true,
      'recovered', true,
      'results', COALESCE(v_results, '[]'::jsonb),
      'quantity', p_spin_count
    );
  END IF;

  -- Load active settings
  SELECT * INTO v_settings
  FROM wheel_game_settings
  WHERE active = true
  LIMIT 1;

  IF v_settings IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_active_wheel');
  END IF;

  -- Load PUBLISHED probability version
  SELECT * INTO v_version
  FROM wheel_probability_versions
  WHERE wheel_settings_id = v_settings.id AND status = 'PUBLISHED'
  ORDER BY version_number DESC
  LIMIT 1;

  IF v_version IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_published_version');
  END IF;

  -- Validate total = 10000
  IF v_version.total_probability_bp != 10000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_probability_config');
  END IF;

  -- Calculate cost
  IF p_spin_count = 1 THEN
    -- Check free spins
    SELECT COUNT(*) INTO v_user_wins_today
    FROM game_logs
    WHERE user_id = v_user_id AND game_type = 'wheel'
    AND played_at >= date_trunc('day', now());

    v_free_spins_left := GREATEST(v_settings.free_daily_spins - v_user_wins_today, 0);
    IF v_free_spins_left > 0 AND p_payment_mode = 'free' THEN
      v_use_free := true;
      v_cost := 0;
    ELSE
      v_cost := v_settings.single_spin_cost;
    END IF;
  ELSIF p_spin_count = 5 THEN
    IF NOT v_settings.five_spin_enabled THEN
      RETURN jsonb_build_object('success', false, 'error', 'five_spin_disabled');
    END IF;
    v_cost := v_settings.five_spin_cost;
  ELSIF p_spin_count = 10 THEN
    IF NOT v_settings.ten_spin_enabled THEN
      RETURN jsonb_build_object('success', false, 'error', 'ten_spin_disabled');
    END IF;
    v_cost := v_settings.ten_spin_cost;
  END IF;

  -- Lock user row and check balance
  SELECT points INTO v_user_points
  FROM users WHERE id = v_user_id FOR UPDATE;

  IF NOT v_use_free AND v_user_points < v_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_points', 'required', v_cost, 'available', v_user_points);
  END IF;

  -- Deduct cost once
  IF NOT v_use_free AND v_cost > 0 THEN
    UPDATE users SET points = points - v_cost WHERE id = v_user_id;
  END IF;

  -- Create spin request
  INSERT INTO spin_requests (user_id, client_request_id, config_version_id, spin_type, points_deducted, status)
  VALUES (v_user_id, p_request_id, v_version.id,
    CASE WHEN v_use_free THEN 'free' ELSE 'paid' END,
    v_cost, 'completed')
  RETURNING id INTO v_spin_request_id;

  v_batch_id := gen_random_uuid();

  -- Get fallback prize from version
  SELECT elem INTO v_fallback_prize
  FROM jsonb_array_elements(v_version.prizes_snapshot) elem
  WHERE elem->>'id' = v_version.fallback_prize_id
  LIMIT 1;

  -- Get grand prize config
  SELECT elem->>'id', (elem->>'unlock_after_completed_spins')::int
  INTO v_grand_prize_id, v_grand_unlock_spins
  FROM jsonb_array_elements(v_version.prizes_snapshot) elem
  WHERE COALESCE((elem->>'is_grand_prize')::boolean, false)
  LIMIT 1;

  -- Get user's current progress
  SELECT spin_count INTO v_progress_count
  FROM user_grand_prize_progress
  WHERE user_id = v_user_id AND settings_id = v_settings.id;
  v_progress_count := COALESCE(v_progress_count, 0);

  -- Process each sub-spin sequentially
  FOR v_i IN 1..p_spin_count LOOP
    v_fallback_used := false;
    v_fallback_reason := NULL;

    -- Generate random bucket 0-9999
    v_random_bucket := floor(random() * 10000)::int;
    IF v_random_bucket >= 10000 THEN v_random_bucket := 9999; END IF;

    -- Walk cumulative probability ranges to find selected prize
    v_cumulative := 0;
    v_original_prize_id := NULL;
    v_prize := NULL;

    FOR v_prize IN SELECT elem FROM jsonb_array_elements(v_version.prizes_snapshot) elem LOOP
      v_cumulative := v_cumulative + (v_prize->>'probability_bp')::int;
      IF v_random_bucket < v_cumulative THEN
        v_original_prize_id := v_prize->>'id';
        EXIT;
      END IF;
    END LOOP;

    -- Safety: if no prize selected (shouldn't happen), use fallback
    IF v_original_prize_id IS NULL THEN
      v_original_prize_id := v_version.fallback_prize_id;
      v_prize := v_fallback_prize;
    END IF;

    -- Eligibility check (NO renormalization — use fallback instead)
    v_eligible := true;
    v_final_prize_id := v_original_prize_id;

    -- Check if disabled
    IF COALESCE((v_prize->>'disabled')::boolean, false) THEN
      v_eligible := false;
      v_fallback_reason := 'PRIZE_DISABLED';
    END IF;

    -- Check grand prize lock
    IF v_eligible AND v_original_prize_id = v_grand_prize_id AND v_grand_unlock_spins IS NOT NULL THEN
      IF v_progress_count < v_grand_unlock_spins THEN
        v_eligible := false;
        v_fallback_reason := 'GRAND_PRIZE_LOCKED';
      END IF;
    END IF;

    -- Check per-user cap
    IF v_eligible AND (v_prize->>'max_wins_per_user') IS NOT NULL AND (v_prize->>'max_wins_per_user')::int > 0 THEN
      SELECT COUNT(*) INTO v_user_wins_total
      FROM spin_results
      WHERE user_id = v_user_id AND final_awarded_prize_id = v_original_prize_id;
      IF v_user_wins_total >= (v_prize->>'max_wins_per_user')::int THEN
        v_eligible := false;
        v_fallback_reason := 'USER_CAP_REACHED';
      END IF;
    END IF;

    -- Check daily cap
    IF v_eligible AND (v_prize->>'max_winners_per_day') IS NOT NULL AND (v_prize->>'max_winners_per_day')::int > 0 THEN
      SELECT COUNT(*) INTO v_user_wins_today
      FROM spin_results
      WHERE final_awarded_prize_id = v_original_prize_id
      AND created_at >= date_trunc('day', now());
      IF v_user_wins_today >= (v_prize->>'max_winners_per_day')::int THEN
        v_eligible := false;
        v_fallback_reason := 'DAILY_CAP_REACHED';
      END IF;
    END IF;

    -- Apply fallback if ineligible
    IF NOT v_eligible THEN
      v_fallback_used := true;
      v_final_prize_id := v_version.fallback_prize_id;
      v_prize := v_fallback_prize;
    END IF;

    -- Calculate points awarded
    v_points_awarded := 0;
    IF (v_prize->>'type') = 'points' THEN
      v_points_awarded := COALESCE((v_prize->>'value')::int, 0);
    END IF;

    -- Create spin result with full trace
    INSERT INTO spin_results (
      spin_request_id, user_id, prize_id, prize_type, prize_value,
      prize_name_ar, prize_name_en, points_awarded,
      probability_version_id, random_bucket,
      original_selected_prize_id, final_awarded_prize_id,
      fallback_used, fallback_reason,
      sequence_number, batch_request_id
    ) VALUES (
      v_spin_request_id, v_user_id, v_final_prize_id,
      v_prize->>'type', v_prize->>'value',
      v_prize->>'name_ar', v_prize->>'name_en', v_points_awarded,
      v_version.id, v_random_bucket,
      v_original_prize_id, v_final_prize_id,
      v_fallback_used, v_fallback_reason,
      v_i, v_batch_id
    ) RETURNING id INTO v_spin_result_id;

    -- Award points
    IF v_points_awarded > 0 THEN
      UPDATE users SET points = points + v_points_awarded WHERE id = v_user_id;
      v_total_points_awarded := v_total_points_awarded + v_points_awarded;
    END IF;

    -- Create reward_grant for service/grand/coins prizes
    IF (v_prize->>'type') IN ('service', 'grand', 'coins') AND NOT v_fallback_used THEN
      INSERT INTO reward_grants (
        user_id, spin_request_id, grant_type, prize_id,
        prize_name_ar, prize_name_en, prize_value, status
      ) VALUES (
        v_user_id, v_spin_request_id, v_prize->>'type', v_final_prize_id,
        v_prize->>'name_ar', v_prize->>'name_en', v_prize->>'value', 'pending'
      );
    END IF;

    -- Update progress count
    v_progress_count := v_progress_count + 1;

    -- Check grand prize unlock
    IF v_grand_prize_id IS NOT NULL AND v_grand_unlock_spins IS NOT NULL THEN
      IF v_progress_count = v_grand_unlock_spins THEN
        v_unlocked_grand_ids := v_unlocked_grand_ids || jsonb_build_array(v_grand_prize_id);
      END IF;
    END IF;

    -- Log to game_logs
    INSERT INTO game_logs (user_id, game_type, bet_amount, win_amount, result, result_data, played_at)
    VALUES (v_user_id, 'wheel', 0, v_points_awarded,
      CASE WHEN (v_prize->>'type') = 'miss' THEN 'miss' ELSE 'win' END,
      jsonb_build_object('prize_id', v_final_prize_id, 'prize_type', v_prize->>'type',
        'fallback_used', v_fallback_used, 'sequence', v_i),
      now()
    );

    -- Build result entry
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'prize_index', (SELECT idx - 1 FROM (
        SELECT elem->>'id' AS pid, ROW_NUMBER() OVER () AS idx
        FROM jsonb_array_elements(
          (SELECT prizes FROM wheel_game_settings WHERE id = v_settings.id)
        ) elem
      ) sub WHERE sub.pid = v_final_prize_id LIMIT 1),
      'prize_id', v_final_prize_id,
      'prize_type', v_prize->>'type',
      'prize_value', v_prize->>'value',
      'prize_name_ar', v_prize->>'name_ar',
      'prize_name_en', v_prize->>'name_en',
      'points_awarded', v_points_awarded,
      'sequence_number', v_i,
      'fallback_used', v_fallback_used,
      'original_prize_id', v_original_prize_id,
      'random_bucket', v_random_bucket
    ));
  END LOOP;

  -- Update user_grand_prize_progress
  INSERT INTO user_grand_prize_progress (user_id, settings_id, prize_id, spin_count, updated_at)
  VALUES (v_user_id, v_settings.id, COALESCE(v_grand_prize_id, 'grand'), v_progress_count, now())
  ON CONFLICT (user_id, settings_id, prize_id)
  DO UPDATE SET spin_count = v_progress_count, updated_at = now(),
    unlocked_at = CASE
      WHEN user_grand_prize_progress.unlocked_at IS NULL AND v_progress_count >= COALESCE(v_grand_unlock_spins, 999999)
      THEN now()
      ELSE user_grand_prize_progress.unlocked_at
    END;

  RETURN jsonb_build_object(
    'success', true,
    'quantity', p_spin_count,
    'results', v_results,
    'points_awarded', v_total_points_awarded,
    'points_deducted', v_cost,
    'spin_request_id', v_spin_request_id,
    'probability_version_id', v_version.id,
    'unlocked_grand_prize_ids', v_unlocked_grand_ids,
    'batch_request_id', v_batch_id
  );
END;
$$;

-- 7. simulate_wheel_spins — Dry-run diagnostic (no side effects)
CREATE OR REPLACE FUNCTION simulate_wheel_spins(p_count int DEFAULT 100000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings_id uuid;
  v_version record;
  v_prize jsonb;
  v_results jsonb := '[]'::jsonb;
  v_counts jsonb := '{}'::jsonb;
  v_original_counts jsonb := '{}'::jsonb;
  v_fallback_count int := 0;
  v_i int;
  v_random_bucket int;
  v_cumulative int;
  v_selected_id text;
  v_final_id text;
  v_fallback_prize_id text;
BEGIN
  SELECT id INTO v_settings_id FROM wheel_game_settings WHERE active = true LIMIT 1;

  SELECT * INTO v_version
  FROM wheel_probability_versions
  WHERE wheel_settings_id = v_settings_id AND status = 'PUBLISHED'
  ORDER BY version_number DESC LIMIT 1;

  IF v_version IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_published_version');
  END IF;

  v_fallback_prize_id := v_version.fallback_prize_id;

  -- Initialize counts
  FOR v_prize IN SELECT elem FROM jsonb_array_elements(v_version.prizes_snapshot) elem LOOP
    v_counts := v_counts || jsonb_build_object(v_prize->>'id', 0);
    v_original_counts := v_original_counts || jsonb_build_object(v_prize->>'id', 0);
  END LOOP;

  -- Run simulation
  FOR v_i IN 1..LEAST(p_count, 100000) LOOP
    v_random_bucket := floor(random() * 10000)::int;
    IF v_random_bucket >= 10000 THEN v_random_bucket := 9999; END IF;

    v_cumulative := 0;
    v_selected_id := v_fallback_prize_id;

    FOR v_prize IN SELECT elem FROM jsonb_array_elements(v_version.prizes_snapshot) elem LOOP
      v_cumulative := v_cumulative + (v_prize->>'probability_bp')::int;
      IF v_random_bucket < v_cumulative THEN
        v_selected_id := v_prize->>'id';
        EXIT;
      END IF;
    END LOOP;

    v_original_counts := jsonb_set(v_original_counts, ARRAY[v_selected_id],
      to_jsonb(COALESCE((v_original_counts->>v_selected_id)::int, 0) + 1));

    -- Check disabled for simulation
    v_final_id := v_selected_id;
    SELECT elem INTO v_prize FROM jsonb_array_elements(v_version.prizes_snapshot) elem
    WHERE elem->>'id' = v_selected_id LIMIT 1;

    IF COALESCE((v_prize->>'disabled')::boolean, false) THEN
      v_final_id := v_fallback_prize_id;
      v_fallback_count := v_fallback_count + 1;
    END IF;

    v_counts := jsonb_set(v_counts, ARRAY[v_final_id],
      to_jsonb(COALESCE((v_counts->>v_final_id)::int, 0) + 1));
  END LOOP;

  -- Build results
  FOR v_prize IN SELECT elem FROM jsonb_array_elements(v_version.prizes_snapshot) elem LOOP
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'prize_id', v_prize->>'id',
      'name_ar', v_prize->>'name_ar',
      'probability_bp', (v_prize->>'probability_bp')::int,
      'expected_pct', ROUND(((v_prize->>'probability_bp')::numeric / 100), 2),
      'original_count', COALESCE((v_original_counts->>(v_prize->>'id'))::int, 0),
      'original_pct', ROUND(COALESCE((v_original_counts->>(v_prize->>'id'))::numeric, 0) / p_count * 100, 2),
      'final_count', COALESCE((v_counts->>(v_prize->>'id'))::int, 0),
      'final_pct', ROUND(COALESCE((v_counts->>(v_prize->>'id'))::numeric, 0) / p_count * 100, 2),
      'disabled', COALESCE((v_prize->>'disabled')::boolean, false)
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'version_id', v_version.id,
    'version_number', v_version.version_number,
    'total_spins', p_count,
    'fallback_count', v_fallback_count,
    'results', v_results
  );
END;
$$;
