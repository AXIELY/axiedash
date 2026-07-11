import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { LuckyCardSettings, LuckyCardReward, defaultLuckyCardSettings } from '../config/luckyCardRewards';
import { usePitySystem } from './usePitySystem';
import { useEconomySystem } from './useEconomySystem';

export interface GameState {
  selectedCard: number | null;
  flippedCards: number[];
  wonReward: LuckyCardReward | null;
  isPlaying: boolean;
  playsToday: number;
  canPlay: boolean;
}

// DB columns are snake_case; TypeScript interface is camelCase
function mapDbRow(data: Record<string, any>): LuckyCardSettings {
  return {
    id: data.id,
    active: data.active ?? true,
    titleAr: data.title_ar ?? data.titleAr ?? '',
    titleEn: data.title_en ?? data.titleEn ?? '',
    minBet: data.min_bet ?? data.minBet ?? 0,
    maxBet: data.max_bet ?? data.maxBet ?? 100,
    winRate: data.win_rate ?? data.winRate ?? 85,
    dailyPlayLimit: data.daily_play_limit ?? data.dailyPlayLimit ?? 10,
    cooldownSeconds: data.cooldown_seconds ?? data.cooldownSeconds ?? 0,
    rewards: data.rewards ?? [],
    rarityChances: data.rarity_chances ?? data.rarityChances ?? defaultLuckyCardSettings.rarityChances,
    pitySettings: data.pity_settings ?? data.pitySettings ?? defaultLuckyCardSettings.pitySettings,
    maxDailyCoinsOutput: data.max_daily_coins_output ?? data.maxDailyCoinsOutput ?? 10000,
    maxDailyGemsOutput: data.max_daily_gems_output ?? data.maxDailyGemsOutput ?? 500,
    visualEffectsLevel: data.visual_effects_level ?? data.visualEffectsLevel ?? 2,
    created_at: data.created_at ?? new Date().toISOString(),
    updated_at: data.updated_at ?? new Date().toISOString(),
  };
}

export const useLuckyCardGame = () => {
  const { user, refreshUser } = useAuth();
  const [settings, setSettings] = useState<LuckyCardSettings>(defaultLuckyCardSettings);
  const [gameState, setGameState] = useState<GameState>({
    selectedCard: null,
    flippedCards: [],
    wonReward: null,
    isPlaying: false,
    playsToday: 0,
    canPlay: true,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pass live DB settings so cost/free-plays are never hardcoded
  const spinCost = settings.minBet > 0 ? settings.minBet : 100;
  const { economyState, deductPlayCost } = useEconomySystem(spinCost, settings.dailyPlayLimit);
  const { getAdjustedRarityOdds, recordPlay } = usePitySystem(settings);

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    if (user?.id) fetchPlaysToday();
  }, [user?.id, settings.dailyPlayLimit]);

  // Refresh when admin saves settings
  useEffect(() => {
    const handler = () => fetchSettings();
    window.addEventListener('lucky-card-settings-updated', handler);
    return () => window.removeEventListener('lucky-card-settings-updated', handler);
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const { data, error: err } = await supabase
        .from('lucky_card_game_settings')
        .select('*')
        .eq('active', true)
        .maybeSingle();

      if (err) throw err;
      setSettings(data ? mapDbRow(data) : defaultLuckyCardSettings);
    } catch (err) {
      console.error('Error fetching Lucky Card settings:', err);
      setSettings(defaultLuckyCardSettings);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPlaysToday = async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { count, error: err } = await supabase
        .from('game_logs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user?.id)
        .eq('game_type', 'lucky-card')
        .gte('created_at', today.toISOString());

      if (err) throw err;
      const plays = count || 0;
      setGameState((prev) => ({ ...prev, playsToday: plays, canPlay: plays < settings.dailyPlayLimit }));
    } catch (err) {
      console.error('Error fetching plays today:', err);
    }
  };

  const selectReward = () => {
    const activeRewards = settings.rewards.filter((r) => r.active);
    if (activeRewards.length === 0) return null;

    const rarityChances = getAdjustedRarityOdds(settings.rarityChances);
    let random = Math.random() * 100;
    const rarityOrder = ['divine', 'mythic', 'legendary', 'epic', 'rare', 'common'] as const;

    for (const rarity of rarityOrder) {
      random -= rarityChances[rarity];
      if (random <= 0) {
        const pool = activeRewards.filter((r) => r.rarity === rarity);
        if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)];
      }
    }
    return activeRewards[Math.floor(Math.random() * activeRewards.length)];
  };

  const playCard = async (cardIndex: number) => {
    if (gameState.isPlaying || !gameState.canPlay || gameState.flippedCards.includes(cardIndex)) return;

    if (!economyState?.canPlay) {
      setError(
        economyState?.costType === 'paid'
          ? `نقاط غير كافية. المطلوب: ${economyState.costForNextPlay}، متوفر: ${user?.points || 0}`
          : 'تعذّر تحديد أهلية اللعب'
      );
      return;
    }

    setGameState((prev) => ({ ...prev, isPlaying: true, selectedCard: cardIndex }));

    const costResult = await deductPlayCost();
    if (!costResult.success) {
      setError(costResult.message);
      setGameState((prev) => ({ ...prev, isPlaying: false, selectedCard: null }));
      return;
    }

    const reward = selectReward();

    setTimeout(() => {
      setGameState((prev) => ({ ...prev, flippedCards: [...prev.flippedCards, cardIndex], wonReward: reward }));
      if (reward) {
        awardReward(reward);
        recordPlay(reward.rarity);
      }
    }, 800);
  };

  const awardReward = async (reward: LuckyCardReward) => {
    if (!user) return;
    try {
      const updateData: Record<string, any> = {};
      switch (reward.type) {
        case 'coins':      updateData.coins = (user.coins || 0) + reward.value; break;
        case 'gems':       updateData.gems = (user.gems || 0) + reward.value; break;
        case 'xp':         updateData.xp = (user.xp || 0) + reward.value; break;
        case 'booster':    updateData.boosters = (user.boosters || 0) + reward.value; break;
        case 'multiplier': updateData.multipliers = (user.multipliers || 0) + reward.value; break;
        case 'ticket':     updateData.tickets = (user.tickets || 0) + reward.value; break;
        case 'badge':      updateData.badges = (user.badges || 0) + reward.value; break;
        case 'skin':       updateData.skins = (user.skins || 0) + reward.value; break;
      }

      await supabase.from('users').update(updateData).eq('id', user.id);
      await supabase.from('game_logs').insert({
        user_id: user.id,
        game_type: 'lucky-card',
        bet_amount: 0,
        win_amount: reward.value,
        result: 'win',
        result_data: {
          reward_id: reward.id,
          reward_type: reward.type,
          reward_value: reward.value,
          rarity: reward.rarity,
          card_index: gameState.selectedCard,
        },
        created_at: new Date().toISOString(),
      });

      await refreshUser();
      fetchPlaysToday();
    } catch (err) {
      console.error('Error awarding reward:', err);
      setError('Failed to award reward');
    }
  };

  const resetGame = () =>
    setGameState((prev) => ({ ...prev, selectedCard: null, wonReward: null, isPlaying: false }));

  const resetAllCards = () =>
    setGameState({
      selectedCard: null,
      flippedCards: [],
      wonReward: null,
      isPlaying: false,
      playsToday: gameState.playsToday,
      canPlay: gameState.canPlay,
    });

  return { settings, gameState, loading, error, playCard, resetGame, resetAllCards, fetchSettings };
};
