import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Rarity } from '../config/luckyCardRewards';

export interface PityState {
  lossStreak: number;
  lastWinRarity: Rarity | null;
  epicPityCount: number;
  legendaryPityCount: number;
  lastPlayTime: number;
}

export const usePitySystem = (settings: any) => {
  const { user } = useAuth();
  const [pityState, setPityState] = useState<PityState>({
    lossStreak: 0,
    lastWinRarity: null,
    epicPityCount: 0,
    legendaryPityCount: 0,
    lastPlayTime: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.id) {
      fetchPityState();
    }
  }, [user?.id]);

  const fetchPityState = async () => {
    try {
      const { data, error } = await supabase
        .from('player_pity_tracking')
        .select('*')
        .eq('user_id', user?.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setPityState({
          lossStreak: data.loss_streak || 0,
          lastWinRarity: data.last_win_rarity || null,
          epicPityCount: data.epic_pity_count || 0,
          legendaryPityCount: data.legendary_pity_count || 0,
          lastPlayTime: data.last_play_time || 0,
        });
      }
    } catch (error) {
      console.error('Error fetching pity state:', error);
    } finally {
      setLoading(false);
    }
  };

  const getAdjustedRarityOdds = (baseOdds: Record<Rarity, number>) => {
    const adjusted = { ...baseOdds };

    if (!settings?.pitySettings) return adjusted;

    const { epicPityThreshold, epicPityBoost, legendaryPityThreshold, legendaryPityGuarantee } =
      settings.pitySettings;

    if (pityState.epicPityCount >= epicPityThreshold) {
      adjusted.epic = Math.min(100, adjusted.epic + epicPityBoost);
      adjusted.common = Math.max(0, adjusted.common - epicPityBoost / 2);
    }

    if (legendaryPityGuarantee && pityState.legendaryPityCount >= legendaryPityThreshold) {
      adjusted.legendary = Math.min(100, 50);
      adjusted.common = Math.max(0, adjusted.common - 20);
    }

    return adjusted;
  };

  const recordPlay = async (wonRarity: Rarity | null) => {
    if (!user?.id) return;

    try {
      let newEpicCount = pityState.epicPityCount + 1;
      let newLegendaryCount = pityState.legendaryPityCount + 1;
      let newLossStreak = pityState.lossStreak + 1;

      if (wonRarity && wonRarity !== 'common') {
        newLossStreak = 0;

        if (wonRarity === 'epic' || wonRarity === 'legendary' || wonRarity === 'mythic' || wonRarity === 'divine') {
          newEpicCount = 0;
        }

        if (wonRarity === 'legendary' || wonRarity === 'mythic' || wonRarity === 'divine') {
          newLegendaryCount = 0;
        }
      }

      const { error } = await supabase.from('player_pity_tracking').upsert(
        {
          user_id: user.id,
          loss_streak: newLossStreak,
          last_win_rarity: wonRarity,
          epic_pity_count: newEpicCount,
          legendary_pity_count: newLegendaryCount,
          last_play_time: Date.now(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

      if (error) throw error;

      setPityState({
        lossStreak: newLossStreak,
        lastWinRarity: wonRarity,
        epicPityCount: newEpicCount,
        legendaryPityCount: newLegendaryCount,
        lastPlayTime: Date.now(),
      });
    } catch (error) {
      console.error('Error recording pity:', error);
    }
  };

  return {
    pityState,
    loading,
    getAdjustedRarityOdds,
    recordPlay,
  };
};
