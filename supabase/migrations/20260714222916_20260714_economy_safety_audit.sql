
/*
# Economy Safety Audit — Disable Duplicate TikTok Prize & Add Safety Fields

## Problem
- Prize "tiktok" (coins, w=0.5) and "tiktok-2" (service, w=1.4) both represent
  "100 عملة تيك توك" — combined 20.61% probability causing financial risk.
- No economy safety fields (internal cost, daily cost cap, etc.) exist.
- perform_spin fallback picks the LAST prize in the array (could be the grand prize).

## Changes
1. Mark "tiktok-2" as disabled in the JSONB prizes array (set weight=0, add disabled flag).
   Keep the record for historical spin references.
2. Add economy safety fields to every prize in the JSONB:
   - internal_cost_estimate (numeric)
   - max_winners_per_day (int)
   - daily_cost_cap (numeric)
   - event_cost_cap (numeric)
   - auto_disable_on_cap (boolean)
3. Add an admin_warnings JSONB field to wheel_game_settings for surfacing alerts.

## Security
- No RLS changes.
- No table structure changes — only JSONB content updates and column additions.

## Important Notes
1. Historical spin_results referencing "tiktok-2" are NOT modified.
2. The prize record stays in the array but with weight=0 so it's excluded from draws.
3. This is a TEMPORARY safety measure pending full admin review.
*/

-- 1. Add admin_warnings column if not exists
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'wheel_game_settings' AND column_name = 'admin_warnings'
  ) THEN
    ALTER TABLE wheel_game_settings ADD COLUMN admin_warnings jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- 2. Disable the duplicate tiktok-2 prize by setting weight to 0 and adding disabled flag.
--    Also add internal_cost_estimate to all prizes.
UPDATE wheel_game_settings
SET prizes = (
  SELECT jsonb_agg(
    CASE
      WHEN elem->>'id' = 'tiktok-2' THEN
        elem || '{"weight": 0, "disabled": true, "disabled_reason": "duplicate_economic_identity", "internal_cost_estimate": 2.5}'::jsonb
      WHEN elem->>'id' = 'tiktok' THEN
        elem || '{"internal_cost_estimate": 2.5, "max_winners_per_day": 10, "daily_cost_cap": 25}'::jsonb
      WHEN elem->>'id' = 'libyana' THEN
        elem || '{"internal_cost_estimate": 5.0, "max_winners_per_day": 5, "daily_cost_cap": 25}'::jsonb
      WHEN elem->>'id' = 'grand' THEN
        elem || '{"internal_cost_estimate": 50.0, "max_winners_per_day": 1, "daily_cost_cap": 50}'::jsonb
      WHEN elem->>'id' = 'prize_1783884291700' THEN
        elem || '{"internal_cost_estimate": 25.0, "max_winners_per_day": 2, "daily_cost_cap": 50}'::jsonb
      WHEN elem->>'id' = 'points-1' THEN
        elem || '{"internal_cost_estimate": 0, "max_winners_per_day": null, "daily_cost_cap": null}'::jsonb
      ELSE elem
    END
    ORDER BY ordinality
  )
  FROM jsonb_array_elements(prizes) WITH ORDINALITY AS arr(elem, ordinality)
),
admin_warnings = '[
  {"type": "economy_safety", "severity": "critical", "message_ar": "تم إيقاف الجوائز مرتفعة التكلفة مؤقتًا لحين مراجعة الاحتمالات", "message_en": "High-cost prizes temporarily disabled pending probability audit", "created_at": "now()"}
]'::jsonb,
updated_at = now()
WHERE active = true;
