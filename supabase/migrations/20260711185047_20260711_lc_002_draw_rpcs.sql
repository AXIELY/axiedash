/*
# Lucky Card Draw RPCs — N-Winner System

## Summary
Replaces the single-winner draw RPCs with a complete N-winner draw lifecycle.
All writes are server-authoritative; the client never determines winner selection.

## New RPCs
1. `draw_lucky_card_winners` — atomic draw: determine winning card + random N winners
2. `publish_lucky_card_draw` — idempotent publish: creates one fulfillment case per winner
3. `void_lucky_card_draw` — super-admin only: mark draw VOIDED with mandatory reason
4. `get_lucky_card_draw_result` — read draw + winners for a round (admin before publish, all after)
5. `get_lucky_card_eligible_participants` — preview eligible pool before executing draw

## Security
All RPCs are SECURITY DEFINER with fixed search_path.
Write RPCs verify admin membership. void requires super_admin role.
*/

-- ─── Helper: resolve user current identity ────────────────────────────────────

CREATE OR REPLACE FUNCTION _lcr_resolve_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
  SELECT jsonb_build_object(
    'user_id',    u.id,
    'username',   u.username,
    'avatar_url', u.avatar_url
  )
  FROM users u WHERE u.id = p_user_id;
$$;

-- ─── draw_lucky_card_winners ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION draw_lucky_card_winners(
  p_round_id              uuid,
  p_winning_card_number   integer  DEFAULT NULL,  -- required for MANUAL mode
  p_idempotency_key       text     DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  v_actor_id          uuid := auth.uid();
  v_round             lucky_card_rounds%ROWTYPE;
  v_winning_card      integer;
  v_eligible          uuid[];      -- array of entry ids (eligible pool)
  v_entry_ids         uuid[];      -- randomly selected entry ids
  v_candidate_cards   integer[];
  v_requested         integer;
  v_eligible_count    integer;
  v_actual_count      integer;
  v_draw_id           uuid;
  v_original_card     integer;
  v_entry_rec         record;
  v_pos               integer := 1;
  v_hash              text;
  v_empty_policy      text;
  v_existing_draw     uuid;
BEGIN
  -- 1. Admin only
  IF NOT EXISTS (SELECT 1 FROM admins WHERE user_id = v_actor_id AND is_active = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  -- 2. Lock round row
  SELECT * INTO v_round FROM lucky_card_rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ROUND_NOT_FOUND');
  END IF;

  -- 3. Must be closed (or active — admin may draw on active rounds)
  IF v_round.status NOT IN ('active', 'closed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_STATUS', 'status', v_round.status);
  END IF;

  -- 4. Idempotency: if draw already exists and is not VOIDED, return it
  SELECT id INTO v_existing_draw
  FROM lucky_card_draws
  WHERE round_id = p_round_id AND draw_status <> 'VOIDED';

  IF FOUND THEN
    -- Return existing draw result
    RETURN jsonb_build_object(
      'success',          true,
      'idempotent',       true,
      'draw_id',          v_existing_draw,
      'round_status',     v_round.status
    );
  END IF;

  -- 5. Determine winning card
  v_empty_policy := COALESCE(v_round.empty_card_policy, 'NO_WINNER');

  IF v_round.draw_mode = 'manual_card' THEN
    IF p_winning_card_number IS NULL OR p_winning_card_number < 1 OR p_winning_card_number > v_round.total_cards THEN
      RETURN jsonb_build_object('success', false, 'error', 'MANUAL_CARD_REQUIRED',
        'hint', format('Provide 1–%s', v_round.total_cards));
    END IF;
    v_winning_card := p_winning_card_number;
  ELSE
    -- random_card: server-side random
    v_winning_card := floor(random() * v_round.total_cards)::integer + 1;
  END IF;

  v_original_card := v_winning_card;

  -- 6. Collect eligible entries for chosen card
  SELECT ARRAY_AGG(id ORDER BY random())
  INTO v_eligible
  FROM lucky_card_entries
  WHERE round_id = p_round_id AND selected_card_number = v_winning_card;

  v_eligible_count := COALESCE(array_length(v_eligible, 1), 0);

  -- 7. Handle empty card
  IF v_eligible_count = 0 THEN
    IF v_empty_policy IN ('CHOOSE_ANOTHER_CARD') THEN
      RETURN jsonb_build_object(
        'success',      false,
        'error',        'EMPTY_CARD_CHOOSE_ANOTHER',
        'winning_card', v_winning_card,
        'hint',         'Select a different card number'
      );
    ELSIF v_empty_policy IN ('RANDOM_FROM_NON_EMPTY_CARDS', 'redraw_until_nonempty') THEN
      -- Pick a random non-empty card server-side
      SELECT ARRAY_AGG(DISTINCT selected_card_number)
      INTO v_candidate_cards
      FROM lucky_card_entries
      WHERE round_id = p_round_id;

      IF v_candidate_cards IS NULL OR array_length(v_candidate_cards, 1) = 0 THEN
        -- Truly empty round — no entries at all
        v_eligible_count := 0;
        -- Fall through to NO_WINNER handling
      ELSE
        v_winning_card := v_candidate_cards[floor(random() * array_length(v_candidate_cards, 1))::integer + 1];
        SELECT ARRAY_AGG(id ORDER BY random())
        INTO v_eligible
        FROM lucky_card_entries
        WHERE round_id = p_round_id AND selected_card_number = v_winning_card;
        v_eligible_count := COALESCE(array_length(v_eligible, 1), 0);
      END IF;
    END IF;
    -- For NO_WINNER and all remaining cases: proceed with 0 eligible
  END IF;

  -- 8. Determine actual winner count
  v_requested := COALESCE(v_round.winners_count, 1);
  v_actual_count := LEAST(v_requested, v_eligible_count);

  -- 9. Select first v_actual_count from the already-randomized v_eligible array
  IF v_actual_count > 0 THEN
    v_entry_ids := v_eligible[1:v_actual_count];
  ELSE
    v_entry_ids := ARRAY[]::uuid[];
  END IF;

  -- 10. Compute candidate set hash for audit
  v_hash := md5(COALESCE(array_to_string(v_eligible, ','), ''));

  -- 11. Create draw record
  INSERT INTO lucky_card_draws (
    round_id,
    original_winning_card_number,
    final_winning_card_number,
    winning_card_mode,
    empty_card_policy,
    requested_winners_count,
    eligible_count,
    selected_winners_count,
    draw_status,
    executed_by,
    executed_at,
    candidate_set_hash,
    metadata
  ) VALUES (
    p_round_id,
    v_original_card,
    v_winning_card,
    v_round.draw_mode,
    v_empty_policy,
    v_requested,
    v_eligible_count,
    v_actual_count,
    'DRAWN',
    v_actor_id,
    now(),
    v_hash,
    jsonb_build_object(
      'idempotency_key', p_idempotency_key,
      'empty_policy_triggered', (v_original_card <> v_winning_card)
    )
  )
  RETURNING id INTO v_draw_id;

  -- 12. Insert winner rows
  FOR v_pos IN 1..v_actual_count LOOP
    SELECT * INTO v_entry_rec FROM lucky_card_entries WHERE id = v_entry_ids[v_pos];

    INSERT INTO lucky_card_winners (
      round_id, draw_id, entry_id, user_id,
      winning_card_number, winner_position,
      draw_status, selected_at
    ) VALUES (
      p_round_id, v_draw_id, v_entry_rec.id, v_entry_rec.user_id,
      v_winning_card, v_pos,
      'DRAWN', v_entry_rec.created_at
    );
  END LOOP;

  -- 13. Update round status + winning card
  UPDATE lucky_card_rounds SET
    status              = 'drawn',
    winning_card_number = v_winning_card,
    -- keep winner_user_id for legacy: first winner, or null
    winner_user_id      = CASE WHEN v_actual_count > 0 THEN v_entry_ids[1]::text::uuid ELSE NULL END,
    drawn_at            = now(),
    updated_at          = now()
  WHERE id = p_round_id;

  -- Need to resolve first winner's user_id from entry
  IF v_actual_count > 0 THEN
    UPDATE lucky_card_rounds SET
      winner_user_id = (SELECT user_id FROM lucky_card_entries WHERE id = v_entry_ids[1])
    WHERE id = p_round_id;
  END IF;

  -- 14. Audit event
  INSERT INTO lucky_card_events (round_id, event_type, actor_user_id, payload)
  VALUES (p_round_id, 'draw_executed', v_actor_id,
    jsonb_build_object(
      'draw_id',              v_draw_id,
      'winning_card',         v_winning_card,
      'original_card',        v_original_card,
      'requested_winners',    v_requested,
      'eligible_count',       v_eligible_count,
      'selected_winners',     v_actual_count,
      'draw_mode',            v_round.draw_mode,
      'empty_policy',         v_empty_policy
    ));

  RETURN jsonb_build_object(
    'success',                true,
    'idempotent',             false,
    'draw_id',                v_draw_id,
    'winning_card_number',    v_winning_card,
    'original_card_number',   v_original_card,
    'eligible_count',         v_eligible_count,
    'requested_winners',      v_requested,
    'selected_winners_count', v_actual_count,
    'has_winners',            v_actual_count > 0
  );
END;
$$;

GRANT EXECUTE ON FUNCTION draw_lucky_card_winners(uuid, integer, text) TO authenticated;

-- ─── get_lucky_card_eligible_participants ─────────────────────────────────────

CREATE OR REPLACE FUNCTION get_lucky_card_eligible_participants(
  p_round_id            uuid,
  p_winning_card_number integer
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  v_actor_id  uuid := auth.uid();
  v_round     lucky_card_rounds%ROWTYPE;
  v_result    jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins WHERE user_id = v_actor_id AND is_active = true) THEN
    RETURN jsonb_build_object('error', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_round FROM lucky_card_rounds WHERE id = p_round_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'ROUND_NOT_FOUND'); END IF;

  SELECT jsonb_build_object(
    'round_id',             p_round_id,
    'winning_card_number',  p_winning_card_number,
    'total_participants',   (SELECT COUNT(*) FROM lucky_card_entries WHERE round_id = p_round_id),
    'eligible_count',       (SELECT COUNT(*) FROM lucky_card_entries WHERE round_id = p_round_id AND selected_card_number = p_winning_card_number),
    'requested_winners',    COALESCE(v_round.winners_count, 1),
    'participants',         (
      SELECT jsonb_agg(jsonb_build_object(
        'entry_id',     e.id,
        'user_id',      e.user_id,
        'username',     COALESCE(u.username, e.username_snapshot, '---'),
        'avatar_url',   COALESCE(u.avatar_url, e.avatar_url_snapshot),
        'selected_card',e.selected_card_number,
        'joined_at',    e.created_at
      ) ORDER BY e.created_at)
      FROM lucky_card_entries e
      LEFT JOIN users u ON u.id = e.user_id
      WHERE e.round_id = p_round_id AND e.selected_card_number = p_winning_card_number
    ),
    'card_distribution', (
      SELECT jsonb_agg(jsonb_build_object(
        'card', t.card_num,
        'count', t.cnt
      ) ORDER BY t.card_num)
      FROM (
        SELECT selected_card_number AS card_num, COUNT(*) AS cnt
        FROM lucky_card_entries WHERE round_id = p_round_id
        GROUP BY selected_card_number
      ) t
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_lucky_card_eligible_participants(uuid, integer) TO authenticated;

-- ─── get_lucky_card_draw_result ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_lucky_card_draw_result(p_round_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  v_actor_id  uuid := auth.uid();
  v_is_admin  boolean;
  v_draw      lucky_card_draws%ROWTYPE;
  v_result    jsonb;
BEGIN
  v_is_admin := EXISTS (SELECT 1 FROM admins WHERE user_id = v_actor_id AND is_active = true);

  SELECT * INTO v_draw FROM lucky_card_draws
  WHERE round_id = p_round_id AND draw_status <> 'VOIDED'
  ORDER BY created_at DESC LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'NO_DRAW');
  END IF;

  -- Non-admins can only see published draws
  IF NOT v_is_admin AND v_draw.draw_status <> 'PUBLISHED' THEN
    RETURN jsonb_build_object('error', 'NOT_PUBLISHED');
  END IF;

  SELECT jsonb_build_object(
    'draw_id',                    v_draw.id,
    'draw_status',                v_draw.draw_status,
    'winning_card_number',        v_draw.final_winning_card_number,
    'original_card_number',       v_draw.original_winning_card_number,
    'requested_winners_count',    v_draw.requested_winners_count,
    'eligible_count',             v_draw.eligible_count,
    'selected_winners_count',     v_draw.selected_winners_count,
    'executed_at',                v_draw.executed_at,
    'published_at',               v_draw.published_at,
    'winners', (
      SELECT jsonb_agg(jsonb_build_object(
        'winner_id',          w.id,
        'user_id',            w.user_id,
        'username',           COALESCE(u.username, e.username_snapshot, '---'),
        'avatar_url',         COALESCE(u.avatar_url, e.avatar_url_snapshot),
        'winner_position',    w.winner_position,
        'winning_card',       w.winning_card_number,
        'joined_at',          w.selected_at,
        'fulfillment_case_id',w.fulfillment_case_id,
        'draw_status',        w.draw_status
      ) ORDER BY w.winner_position)
      FROM lucky_card_winners w
      JOIN lucky_card_entries e ON e.id = w.entry_id
      LEFT JOIN users u ON u.id = w.user_id
      WHERE w.draw_id = v_draw.id AND w.draw_status <> 'VOIDED'
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_lucky_card_draw_result(uuid) TO authenticated;

-- ─── publish_lucky_card_draw ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION publish_lucky_card_draw(p_round_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  v_actor_id          uuid := auth.uid();
  v_round             lucky_card_rounds%ROWTYPE;
  v_draw              lucky_card_draws%ROWTYPE;
  v_winner            lucky_card_winners%ROWTYPE;
  v_winner_username   text;
  v_fulfillment_result jsonb;
  v_case_id           uuid;
  v_grant_id          uuid;
  v_cases_created     integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admins WHERE user_id = v_actor_id AND is_active = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_round FROM lucky_card_rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ROUND_NOT_FOUND');
  END IF;

  IF v_round.status <> 'drawn' THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_DRAWN', 'status', v_round.status);
  END IF;

  -- Get draw record
  SELECT * INTO v_draw FROM lucky_card_draws
  WHERE round_id = p_round_id AND draw_status = 'DRAWN'
  ORDER BY created_at DESC LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'DRAW_RECORD_NOT_FOUND');
  END IF;

  -- Idempotent
  IF v_draw.published_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_published', true);
  END IF;

  -- Update draw status
  UPDATE lucky_card_draws SET
    draw_status  = 'PUBLISHED',
    published_at = now()
  WHERE id = v_draw.id;

  -- Update winner rows
  UPDATE lucky_card_winners SET
    draw_status  = 'PUBLISHED',
    published_at = now()
  WHERE draw_id = v_draw.id AND draw_status <> 'VOIDED';

  -- Update round
  UPDATE lucky_card_rounds SET
    status       = 'published',
    published_at = now(),
    updated_at   = now()
  WHERE id = p_round_id;

  -- Create fulfillment case per winner (idempotent per winner)
  IF v_round.fulfillment_required THEN
    FOR v_winner IN
      SELECT * FROM lucky_card_winners
      WHERE draw_id = v_draw.id AND draw_status = 'PUBLISHED' AND fulfillment_case_id IS NULL
    LOOP
      SELECT username INTO v_winner_username FROM users WHERE id = v_winner.user_id;

      -- Generate unique grant id per winner to keep idempotency
      v_grant_id := gen_random_uuid();

      SELECT create_fulfillment_case(
        p_reward_grant_id    => v_grant_id,
        p_spin_id            => p_round_id,
        p_user_id            => v_winner.user_id,
        p_prize_name_ar      => v_round.prize_title,
        p_prize_name_en      => v_round.prize_title,
        p_prize_type         => 'grand',
        p_prize_value        => 0,
        p_prize_icon_url     => v_round.prize_image_url,
        p_prize_accent => '#d6b47b',
        p_prize_rarity       => 'legendary',
        p_required_fields    => ARRAY['phone']::text[]
      ) INTO v_fulfillment_result;

      v_case_id := (v_fulfillment_result->>'case_id')::uuid;

      UPDATE lucky_card_winners SET fulfillment_case_id = v_case_id WHERE id = v_winner.id;

      v_cases_created := v_cases_created + 1;
    END LOOP;

    -- Legacy: save first winner's case to round for backward compat
    UPDATE lucky_card_rounds SET
      fulfillment_case_id = (
        SELECT fulfillment_case_id FROM lucky_card_winners
        WHERE draw_id = v_draw.id ORDER BY winner_position LIMIT 1
      )
    WHERE id = p_round_id AND winner_user_id IS NOT NULL;
  END IF;

  -- Audit
  INSERT INTO lucky_card_events (round_id, event_type, actor_user_id, payload)
  VALUES (p_round_id, 'result_published', v_actor_id,
    jsonb_build_object(
      'draw_id',          v_draw.id,
      'winners_count',    v_draw.selected_winners_count,
      'cases_created',    v_cases_created,
      'winning_card',     v_draw.final_winning_card_number
    ));

  RETURN jsonb_build_object(
    'success',          true,
    'already_published',false,
    'draw_id',          v_draw.id,
    'winning_card',     v_draw.final_winning_card_number,
    'winners_count',    v_draw.selected_winners_count,
    'cases_created',    v_cases_created
  );
END;
$$;

GRANT EXECUTE ON FUNCTION publish_lucky_card_draw(uuid) TO authenticated;

-- ─── void_lucky_card_draw ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION void_lucky_card_draw(
  p_round_id uuid,
  p_reason   text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  v_actor_id  uuid := auth.uid();
  v_draw      lucky_card_draws%ROWTYPE;
BEGIN
  -- Super admin only
  IF NOT EXISTS (
    SELECT 1 FROM admins
    WHERE user_id = v_actor_id AND is_active = true AND role IN ('super_admin')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'SUPER_ADMIN_REQUIRED');
  END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'REASON_REQUIRED');
  END IF;

  SELECT * INTO v_draw FROM lucky_card_draws
  WHERE round_id = p_round_id AND draw_status <> 'VOIDED'
  ORDER BY created_at DESC LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_ACTIVE_DRAW');
  END IF;

  IF v_draw.draw_status = 'PUBLISHED' THEN
    RETURN jsonb_build_object('success', false, 'error', 'CANNOT_VOID_PUBLISHED',
      'hint', 'A published draw cannot be voided; contact system admin');
  END IF;

  -- Mark draw voided
  UPDATE lucky_card_draws SET
    draw_status = 'VOIDED',
    voided_at   = now(),
    voided_by   = v_actor_id,
    void_reason = trim(p_reason)
  WHERE id = v_draw.id;

  -- Mark winners voided
  UPDATE lucky_card_winners SET draw_status = 'VOIDED'
  WHERE draw_id = v_draw.id;

  -- Reset round to closed (allows redraw)
  UPDATE lucky_card_rounds SET
    status              = 'closed',
    winning_card_number = NULL,
    winner_user_id      = NULL,
    drawn_at            = NULL,
    updated_at          = now()
  WHERE id = p_round_id;

  -- Audit
  INSERT INTO lucky_card_events (round_id, event_type, actor_user_id, payload)
  VALUES (p_round_id, 'draw_voided', v_actor_id,
    jsonb_build_object(
      'draw_id',    v_draw.id,
      'reason',     trim(p_reason),
      'voided_at',  now()
    ));

  RETURN jsonb_build_object(
    'success',  true,
    'draw_id',  v_draw.id,
    'message',  'Draw voided. Round reset to closed. A new draw may now be executed.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION void_lucky_card_draw(uuid, text) TO authenticated;
