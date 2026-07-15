
/*
# Fix Prize Eligibility Configuration — Root Cause of Skewed Distribution

## Root Cause
Users repeatedly got "100 TikTok Coins" or only "Libyana" because:

1. `points-1` had `max_wins_per_user: 1` — after ONE win, the user could never
   win points again. Points are the most common prize (weight=5, ~64% probability)
   so losing them from the pool immediately funneled all spins to expensive prizes.
2. `tiktok` had `is_strong: true` — after winning once, the strong-prize filter
   excluded it forever, further shrinking the eligible pool.
3. Combined effect: after ~2 spins, the only eligible prize was `libyana` (100%).

## Fix
1. Remove `max_wins_per_user` from `points-1` (points are free/cheap, unlimited wins OK).
2. Set `tiktok` `is_strong: false` — it should use `max_wins_per_user` instead of
   the binary strong-prize exclusion. Set `max_wins_per_user: 3` for reasonable daily control.
3. Add `max_wins_per_user: 5` to `libyana` so it can't be farmed infinitely either.
4. Update admin_warnings with the fix note.
5. Keep `tiktok-2` disabled (duplicate economic identity).

## Security
- No RLS changes.
- No table structure changes.

## Important Notes
1. Historical spin results are NOT modified.
2. Existing reward grants are preserved.
3. This restores the intended probability distribution:
   - points-1: ~64% (always eligible)
   - libyana: ~28% (capped at 5 wins/user)
   - tiktok: ~6.4% (capped at 3 wins/user)
   - grand: ~1% (is_strong, one-time)
   - 5000 coins: ~0.6% (locked by goal)
*/

UPDATE wheel_game_settings
SET prizes = (
  SELECT jsonb_agg(
    CASE
      -- points-1: REMOVE per-user cap so it stays always eligible
      WHEN elem->>'id' = 'points-1' THEN
        (elem - 'max_wins_per_user') || '{"max_wins_per_user": null}'::jsonb

      -- tiktok: NOT strong, use per-user cap instead
      WHEN elem->>'id' = 'tiktok' THEN
        elem || '{"is_strong": false, "max_wins_per_user": 3}'::jsonb

      -- libyana: add per-user cap
      WHEN elem->>'id' = 'libyana' THEN
        elem || '{"max_wins_per_user": 5}'::jsonb

      ELSE elem
    END
    ORDER BY ordinality
  )
  FROM jsonb_array_elements(prizes) WITH ORDINALITY AS arr(elem, ordinality)
),
admin_warnings = '[
  {"type": "economy_safety", "severity": "info", "message_ar": "تم إصلاح توزيع الاحتمالات. جائزة النقاط لم تعد محدودة لمرة واحدة. تيك توك لم يعد يُستبعد نهائياً بعد فوز واحد.", "message_en": "Probability distribution fixed. Points prize no longer capped at 1 win. TikTok no longer permanently excluded after first win.", "created_at": "now()"},
  {"type": "economy_safety", "severity": "warning", "message_ar": "تيك توك-2 (المكرر) لا يزال معطلاً لمنع التضخم", "message_en": "tiktok-2 (duplicate) remains disabled to prevent probability inflation", "created_at": "now()"}
]'::jsonb,
updated_at = now()
WHERE active = true;
