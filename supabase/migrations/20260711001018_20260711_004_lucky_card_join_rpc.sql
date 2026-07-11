-- ─────────────────────────────────────────────────
-- join_lucky_card_round  — server-authoritative participation
-- ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION join_lucky_card_round(
  p_round_id    uuid,
  p_card_number integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id           uuid := auth.uid();
  v_round             lucky_card_rounds%ROWTYPE;
  v_username          text;
  v_avatar_url        text;
  v_entry_id          uuid;
BEGIN
  -- 1. Must be authenticated
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- 2. Lock and read round
  SELECT * INTO v_round FROM lucky_card_rounds WHERE id = p_round_id FOR SHARE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'round_not_found');
  END IF;

  -- 3. Round must be active
  IF v_round.status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'round_not_active', 'status', v_round.status);
  END IF;

  -- 4. Time gates (server-side only)
  IF now() < v_round.starts_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'round_not_started');
  END IF;

  IF now() >= v_round.closes_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'round_closed');
  END IF;

  -- 5. Card number valid
  IF p_card_number < 1 OR p_card_number > v_round.total_cards THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_card_number');
  END IF;

  -- 6. Resolve safe public profile (server-authoritative)
  SELECT username, avatar_url INTO v_username, v_avatar_url
  FROM users WHERE id = v_user_id;

  -- 7. Insert entry (unique constraint prevents duplicates)
  BEGIN
    INSERT INTO lucky_card_entries
      (round_id, user_id, selected_card_number, username_snapshot, avatar_url_snapshot)
    VALUES
      (p_round_id, v_user_id, p_card_number, v_username, v_avatar_url)
    RETURNING id INTO v_entry_id;
  EXCEPTION WHEN unique_violation THEN
    -- Already entered — return existing entry info
    SELECT id INTO v_entry_id FROM lucky_card_entries
      WHERE round_id = p_round_id AND user_id = v_user_id;
    RETURN jsonb_build_object(
      'success', true, 'already_entered', true,
      'entry_id', v_entry_id,
      'round_id', p_round_id
    );
  END;

  -- 8. Audit event
  INSERT INTO lucky_card_events (round_id, event_type, actor_user_id, payload)
  VALUES (p_round_id, 'entry_created', v_user_id,
    jsonb_build_object('entry_id', v_entry_id, 'card_number', p_card_number));

  RETURN jsonb_build_object(
    'success', true,
    'already_entered', false,
    'entry_id', v_entry_id,
    'round_id', p_round_id,
    'selected_card_number', p_card_number,
    'created_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION join_lucky_card_round(uuid, integer) TO authenticated;
