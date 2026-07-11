/*
  # Seed Lucky Card Game Settings

  1. Purpose
    - The lucky_card_game_settings table exists but has 0 rows.
    - Without a row, the frontend always falls back to hardcoded defaults,
      making admin changes invisible to players.
    - This migration inserts the canonical default settings row with all
      10 default rewards so the DB is always the single source of truth.

  2. Schema Note
    - DB columns use snake_case: title_ar, title_en, daily_play_limit,
      rarity_chances, pity_settings, visual_effects_level etc.
    - The rewards array is stored as JSONB inside this single row.

  3. Security
    - RLS already enabled on this table from a prior migration.
    - No policy changes needed.
*/

INSERT INTO lucky_card_game_settings (
  active,
  title_ar,
  title_en,
  min_bet,
  max_bet,
  win_rate,
  daily_play_limit,
  cooldown_seconds,
  rewards,
  rarity_chances,
  pity_settings,
  max_daily_coins_output,
  max_daily_gems_output,
  visual_effects_level
)
SELECT
  true,
  'أكسي الحظ',
  'Axie Fortune',
  0,
  100,
  85,
  10,
  0,
  '[
    {"id":"reward_1","nameAr":"عملات ذهبية","nameEn":"Gold Coins","type":"coins","value":50,"rarity":"common","dropChance":25,"svgIcon":"coins","animationLevel":1,"active":true},
    {"id":"reward_2","nameAr":"نقاط خبرة","nameEn":"Experience Points","type":"xp","value":100,"rarity":"common","dropChance":20,"svgIcon":"xp","animationLevel":1,"active":true},
    {"id":"reward_3","nameAr":"عملات نادرة","nameEn":"Rare Coins","type":"coins","value":250,"rarity":"rare","dropChance":15,"svgIcon":"coins","animationLevel":2,"active":true},
    {"id":"reward_4","nameAr":"معزز قوة","nameEn":"Power Booster","type":"booster","value":1,"rarity":"rare","dropChance":12,"svgIcon":"booster","animationLevel":2,"active":true},
    {"id":"reward_5","nameAr":"أحجار كريمة","nameEn":"Gemstones","type":"gems","value":25,"rarity":"epic","dropChance":10,"svgIcon":"gems","animationLevel":2,"active":true},
    {"id":"reward_6","nameAr":"مضاعف النقاط","nameEn":"Point Multiplier","type":"multiplier","value":2,"rarity":"epic","dropChance":8,"svgIcon":"multiplier","animationLevel":2,"active":true},
    {"id":"reward_7","nameAr":"عملات أسطورية","nameEn":"Legendary Coins","type":"coins","value":2000,"rarity":"legendary","dropChance":5,"svgIcon":"coins","animationLevel":3,"active":true},
    {"id":"reward_8","nameAr":"تذكرة الحظ","nameEn":"Lucky Ticket","type":"ticket","value":1,"rarity":"legendary","dropChance":3,"svgIcon":"ticket","animationLevel":3,"active":true},
    {"id":"reward_9","nameAr":"كنز غامض","nameEn":"Mysterious Treasure","type":"mystery","value":500,"rarity":"mythic","dropChance":1.5,"svgIcon":"mystery","animationLevel":3,"active":true},
    {"id":"reward_10","nameAr":"الجائزة الإلهية","nameEn":"Divine Prize","type":"jackpot","value":5000,"rarity":"divine","dropChance":0.5,"svgIcon":"jackpot","animationLevel":3,"active":true}
  ]'::jsonb,
  '{"common":45,"rare":27,"epic":18,"legendary":8,"mythic":1.5,"divine":0.5}'::jsonb,
  '{"epicPityThreshold":20,"epicPityBoost":15,"legendaryPityThreshold":50,"legendaryPityGuarantee":true,"resetAfterLegendary":true}'::jsonb,
  10000,
  500,
  2
WHERE NOT EXISTS (SELECT 1 FROM lucky_card_game_settings);
