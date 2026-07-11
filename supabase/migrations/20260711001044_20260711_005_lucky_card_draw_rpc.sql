-- ─────────────────────────────────────────────────
-- draw_lucky_card_round  — admin-only draw
-- ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION draw_lucky_card_round(
  p_round_id          uuid,
  p_manual_card_number integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id          uuid := auth.uid();
  v_round             lucky_card_rounds%ROWTYPE;
  v_winning_card      integer;
  v_winner_user_id    uuid;
  v_candidate_cards   integer[];
  v_selected_card     integer;
BEGIN
  -- 1. Admin only
  IF NOT EXISTS (SELECT 1 FROM admins WHERE user_id = v_actor_id AND is_active = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  -- 2. Lock round row exclusively
  SELECT * INTO v_round FROM lucky_card_rounds WHERE id = p_round_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'round_not_found');
  END IF;

  -- 3. Must be active or closed
  IF v_round.status NOT IN ('active', 'closed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_status', 'status', v_round.status);
  END IF;

  -- 4. Prevent double draw
  IF v_round.drawn_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_drawn');
  END IF;

  -- 5. Determine winning card
  IF v_round.draw_mode = 'manual_card' THEN
    IF p_manual_card_number IS NULL OR p_manual_card_number < 1 OR p_manual_card_number > v_round.total_cards THEN
      RETURN jsonb_build_object('success', false, 'error', 'manual_card_required');
    END IF;
    v_winning_card := p_manual_card_number;
  ELSE
    -- random_card: pick random integer 1..total_cards
    v_winning_card := floor(random() * v_round.total_cards)::integer + 1;
  END IF;

  -- 6. Find winner from entries that chose this card
  SELECT user_id INTO v_winner_user_id
  FROM lucky_card_entries
  WHERE round_id = p_round_id AND selected_card_number = v_winning_card
  ORDER BY random()
  LIMIT 1;

  -- 7. Handle empty card policy
  IF v_winner_user_id IS NULL AND v_round.empty_card_policy = 'redraw_until_nonempty' THEN
    -- Collect all cards that actually have entries
    SELECT ARRAY_AGG(DISTINCT selected_card_number) INTO v_candidate_cards
    FROM lucky_card_entries
    WHERE round_id = p_round_id;

    IF v_candidate_cards IS NOT NULL AND array_length(v_candidate_cards, 1) > 0 THEN
      -- Pick a random non-empty card
      v_winning_card := v_candidate_cards[floor(random() * array_length(v_candidate_cards, 1))::integer + 1];

      SELECT user_id INTO v_winner_user_id
      FROM lucky_card_entries
      WHERE round_id = p_round_id AND selected_card_number = v_winning_card
      ORDER BY random()
      LIMIT 1;
    END IF;
    -- If still null (no entries at all) — no winner, continue
  END IF;

  -- 8. Write result
  UPDATE lucky_card_rounds SET
    status              = 'drawn',
    winning_card_number = v_winning_card,
    winner_user_id      = v_winner_user_id,
    drawn_at            = now(),
    updated_at          = now()
  WHERE id = p_round_id;

  -- 9. Audit
  INSERT INTO lucky_card_events (round_id, event_type, actor_user_id, payload)
  VALUES (p_round_id, 'draw_executed', v_actor_id,
    jsonb_build_object(
      'winning_card', v_winning_card,
      'winner_user_id', v_winner_user_id,
      'draw_mode', v_round.draw_mode
    ));

  RETURN jsonb_build_object(
    'success', true,
    'winning_card_number', v_winning_card,
    'winner_user_id', v_winner_user_id,
    'has_winner', v_winner_user_id IS NOT NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION draw_lucky_card_round(uuid, integer) TO authenticated;


-- ─────────────────────────────────────────────────
-- publish_lucky_card_result  — make result public
-- ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION publish_lucky_card_result(p_round_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id  uuid := auth.uid();
  v_round     lucky_card_rounds%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins WHERE user_id = v_actor_id AND is_active = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_round FROM lucky_card_rounds WHERE id = p_round_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'round_not_found');
  END IF;

  IF v_round.status <> 'drawn' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_drawn_yet', 'status', v_round.status);
  END IF;

  -- Idempotent
  IF v_round.published_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_published', true);
  END IF;

  UPDATE lucky_card_rounds SET
    status       = 'published',
    published_at = now(),
    updated_at   = now()
  WHERE id = p_round_id;

  INSERT INTO lucky_card_events (round_id, event_type, actor_user_id, payload)
  VALUES (p_round_id, 'result_published', v_actor_id, '{}'::jsonb);

  RETURN jsonb_build_object('success', true, 'already_published', false);
END;
$$;

GRANT EXECUTE ON FUNCTION publish_lucky_card_result(uuid) TO authenticated;
