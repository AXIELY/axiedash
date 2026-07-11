-- ─────────────────────────────────────────────────
-- create_lucky_card_fulfillment
-- Wraps existing create_fulfillment_case and saves case_id back to round
-- ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_lucky_card_fulfillment(p_round_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id          uuid := auth.uid();
  v_round             lucky_card_rounds%ROWTYPE;
  v_winner_username   text;
  v_fulfillment_result jsonb;
  v_case_id           uuid;
  v_grant_id          uuid;
BEGIN
  -- Admin only
  IF NOT EXISTS (SELECT 1 FROM admins WHERE user_id = v_actor_id AND is_active = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_round FROM lucky_card_rounds WHERE id = p_round_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'round_not_found');
  END IF;

  IF v_round.status <> 'published' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_published');
  END IF;

  IF v_round.winner_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_winner');
  END IF;

  IF NOT v_round.fulfillment_required THEN
    RETURN jsonb_build_object('success', false, 'error', 'fulfillment_not_required');
  END IF;

  -- Idempotent — if already created, return existing
  IF v_round.fulfillment_case_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_existed', true, 'case_id', v_round.fulfillment_case_id);
  END IF;

  -- Get winner username for display
  SELECT username INTO v_winner_username FROM users WHERE id = v_round.winner_user_id;

  -- Create a synthetic reward_grant_id (idempotency key)
  v_grant_id := gen_random_uuid();

  -- Call existing fulfillment RPC
  SELECT create_fulfillment_case(
    p_reward_grant_id   => v_grant_id,
    p_spin_id           => p_round_id,   -- reuse spin_id field as round reference
    p_user_id           => v_round.winner_user_id,
    p_prize_name_ar     => v_round.prize_title,
    p_prize_name_en     => v_round.prize_title,
    p_prize_type        => 'grand',
    p_prize_value       => 0,
    p_prize_icon_url    => v_round.prize_image_url,
    p_prize_accent_color => '#d6b47b',
    p_prize_rarity      => 'legendary',
    p_required_fields   => ARRAY['phone']::text[]
  ) INTO v_fulfillment_result;

  v_case_id := (v_fulfillment_result->>'case_id')::uuid;

  -- Save case_id back to round
  UPDATE lucky_card_rounds SET
    fulfillment_case_id = v_case_id,
    updated_at          = now()
  WHERE id = p_round_id;

  -- Audit
  INSERT INTO lucky_card_events (round_id, event_type, actor_user_id, payload)
  VALUES (p_round_id, 'fulfillment_created', v_actor_id,
    jsonb_build_object('case_id', v_case_id, 'winner_user_id', v_round.winner_user_id));

  RETURN jsonb_build_object(
    'success', true,
    'already_existed', (v_fulfillment_result->>'existed')::boolean,
    'case_id', v_case_id,
    'case_code', v_fulfillment_result->>'case_code'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_lucky_card_fulfillment(uuid) TO authenticated;


-- ─────────────────────────────────────────────────
-- Admin round lifecycle helpers (activate, close, cancel)
-- ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION manage_lucky_card_round(
  p_round_id  uuid,
  p_action    text   -- 'activate' | 'close' | 'cancel'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id  uuid := auth.uid();
  v_round     lucky_card_rounds%ROWTYPE;
  v_new_status text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins WHERE user_id = v_actor_id AND is_active = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_round FROM lucky_card_rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  IF p_action = 'activate' THEN
    IF v_round.status <> 'draft' THEN
      RETURN jsonb_build_object('success', false, 'error', 'must_be_draft');
    END IF;
    v_new_status := 'active';
  ELSIF p_action = 'close' THEN
    IF v_round.status <> 'active' THEN
      RETURN jsonb_build_object('success', false, 'error', 'must_be_active');
    END IF;
    v_new_status := 'closed';
  ELSIF p_action = 'cancel' THEN
    IF v_round.status IN ('drawn','published') THEN
      RETURN jsonb_build_object('success', false, 'error', 'cannot_cancel_after_draw');
    END IF;
    v_new_status := 'cancelled';
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'unknown_action');
  END IF;

  UPDATE lucky_card_rounds SET status = v_new_status, updated_at = now() WHERE id = p_round_id;

  INSERT INTO lucky_card_events (round_id, event_type, actor_user_id, payload)
  VALUES (p_round_id, 'round_' || p_action || 'd', v_actor_id,
    jsonb_build_object('new_status', v_new_status));

  RETURN jsonb_build_object('success', true, 'status', v_new_status);
END;
$$;

GRANT EXECUTE ON FUNCTION manage_lucky_card_round(uuid, text) TO authenticated;


-- Enable realtime on rounds and entries
ALTER PUBLICATION supabase_realtime ADD TABLE lucky_card_rounds;
ALTER PUBLICATION supabase_realtime ADD TABLE lucky_card_entries;
