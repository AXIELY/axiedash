/*
# Prize Admin Management RPCs

Adds three admin-only RPCs for fine-grained prize control without
requiring the admin to re-save the entire wheel settings JSONB blob.

## New Functions

1. **admin_reset_prize_stock(p_prize_id, p_new_stock, p_reason)**
   - Resets `available_stock` on `wheel_prize_states` for a LIMITED_STOCK prize
   - Re-activates exhausted prizes (runtime_status → ACTIVE) when stock > 0
   - Records a PRIZE_STOCK_RESET event in wheel_prize_events

2. **admin_toggle_prize_status(p_prize_id, p_enabled, p_reason)**
   - Enables (ACTIVE) or disables (DISABLED) a prize's runtime_status
   - Records PRIZE_ENABLED or PRIZE_DISABLED event

3. **get_wheel_prize_states_with_progress(p_settings_id)**
   - Extended version of get_wheel_prize_states
   - Returns additional computed fields: unlock_progress_pct, availability_label

## Security
All functions are SECURITY DEFINER scoped to the is_admin_role() check.
Users without admin role receive a permission-denied error.
*/

-- ── 1. admin_reset_prize_stock ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_reset_prize_stock(
  p_prize_id   text,
  p_new_stock  int,
  p_reason     text DEFAULT 'Manual admin reset'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings_id uuid;
  v_old_stock   int;
  v_old_status  text;
BEGIN
  -- Admin gate
  IF NOT is_admin_role() THEN
    RAISE EXCEPTION 'permission_denied: admin only';
  END IF;

  -- Get settings id
  SELECT id INTO v_settings_id FROM wheel_game_settings WHERE active = true LIMIT 1;
  IF v_settings_id IS NULL THEN
    RAISE EXCEPTION 'no_active_settings: wheel not configured';
  END IF;

  -- Ensure state row exists
  PERFORM ensure_prize_state(p_prize_id, v_settings_id,
    (SELECT prize FROM jsonb_array_elements(
      (SELECT prizes FROM wheel_game_settings WHERE id = v_settings_id)
    ) AS prize WHERE prize->>'id' = p_prize_id LIMIT 1));

  -- Capture old values
  SELECT available_stock, runtime_status
    INTO v_old_stock, v_old_status
    FROM wheel_prize_states
   WHERE prize_id = p_prize_id AND settings_id = v_settings_id;

  -- Update stock and re-activate if needed
  UPDATE wheel_prize_states SET
    available_stock = p_new_stock,
    runtime_status  = CASE
                        WHEN p_new_stock > 0 AND runtime_status = 'EXHAUSTED' THEN 'ACTIVE'
                        ELSE runtime_status
                      END,
    exhausted_at    = CASE WHEN p_new_stock > 0 THEN NULL ELSE exhausted_at END,
    updated_at      = now()
  WHERE prize_id = p_prize_id AND settings_id = v_settings_id;

  -- Record event
  INSERT INTO wheel_prize_events(prize_id, settings_id, event_type, actor_id, previous_state, new_state, metadata)
  VALUES (
    p_prize_id, v_settings_id, 'PRIZE_STOCK_RESET',
    auth.uid(),
    jsonb_build_object('available_stock', v_old_stock, 'runtime_status', v_old_status),
    jsonb_build_object('available_stock', p_new_stock),
    jsonb_build_object('reason', p_reason)
  );

  RETURN jsonb_build_object('success', true, 'new_stock', p_new_stock);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_reset_prize_stock(text, int, text) TO authenticated;

-- ── 2. admin_toggle_prize_status ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_toggle_prize_status(
  p_prize_id text,
  p_enabled  boolean,
  p_reason   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings_id uuid;
  v_old_status  text;
  v_new_status  text;
  v_event_type  text;
BEGIN
  IF NOT is_admin_role() THEN
    RAISE EXCEPTION 'permission_denied: admin only';
  END IF;

  SELECT id INTO v_settings_id FROM wheel_game_settings WHERE active = true LIMIT 1;
  IF v_settings_id IS NULL THEN
    RAISE EXCEPTION 'no_active_settings';
  END IF;

  PERFORM ensure_prize_state(p_prize_id, v_settings_id,
    (SELECT prize FROM jsonb_array_elements(
      (SELECT prizes FROM wheel_game_settings WHERE id = v_settings_id)
    ) AS prize WHERE prize->>'id' = p_prize_id LIMIT 1));

  SELECT runtime_status INTO v_old_status
    FROM wheel_prize_states
   WHERE prize_id = p_prize_id AND settings_id = v_settings_id;

  v_new_status := CASE WHEN p_enabled THEN 'ACTIVE' ELSE 'DISABLED' END;
  v_event_type := CASE WHEN p_enabled THEN 'PRIZE_ENABLED' ELSE 'PRIZE_DISABLED' END;

  UPDATE wheel_prize_states SET
    runtime_status = v_new_status,
    updated_at     = now()
  WHERE prize_id = p_prize_id AND settings_id = v_settings_id;

  INSERT INTO wheel_prize_events(prize_id, settings_id, event_type, actor_id, previous_state, new_state, metadata)
  VALUES (
    p_prize_id, v_settings_id, v_event_type,
    auth.uid(),
    jsonb_build_object('runtime_status', v_old_status),
    jsonb_build_object('runtime_status', v_new_status),
    jsonb_build_object('reason', p_reason)
  );

  RETURN jsonb_build_object('success', true, 'status', v_new_status);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_toggle_prize_status(text, boolean, text) TO authenticated;
