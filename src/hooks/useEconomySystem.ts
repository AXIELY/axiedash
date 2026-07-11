import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const DEFAULT_SPIN_COST = 100;
const DEFAULT_FREE_PLAYS = 3;

export interface EconomyState {
  freePlayRemaining: number;
  lastResetDate: string;
  totalPointsSpent: number;
  totalPointsPurchased: number;
  canPlay: boolean;
  costForNextPlay: number;
  costType: 'free' | 'paid';
}

// costPerPlay and freePlaysPerDay are passed from the caller so they come from
// the DB settings row — never hardcoded inside this hook.
export const useEconomySystem = (
  costPerPlay: number = DEFAULT_SPIN_COST,
  freePlaysPerDay: number = DEFAULT_FREE_PLAYS
) => {
  const { user, refreshUser } = useAuth();
  const [economyState, setEconomyState] = useState<EconomyState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.id) fetchEconomyState();
  }, [user?.id, costPerPlay, freePlaysPerDay]);

  const fetchEconomyState = async () => {
    if (!user?.id) return;
    try {
      setLoading(true);

      let { data: freePlaysData } = await supabase
        .from('free_plays')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      const today = new Date().toISOString().split('T')[0];

      if (!freePlaysData) {
        const { data: newFreePlay } = await supabase
          .from('free_plays')
          .insert({ user_id: user.id, free_plays_remaining: freePlaysPerDay, last_reset_date: today })
          .select()
          .maybeSingle();
        freePlaysData = newFreePlay;
      } else if (freePlaysData.last_reset_date !== today) {
        const { data: resetData } = await supabase
          .from('free_plays')
          .update({ free_plays_remaining: freePlaysPerDay, last_reset_date: today })
          .eq('user_id', user.id)
          .select()
          .maybeSingle();
        freePlaysData = resetData;
      }

      const freePlayRemaining = freePlaysData?.free_plays_remaining || 0;
      const costType: 'free' | 'paid' = freePlayRemaining > 0 ? 'free' : 'paid';
      const costForNextPlay = costType === 'free' ? 0 : costPerPlay;
      const canPlay = costType === 'free' || (user?.points || 0) >= costForNextPlay;

      setEconomyState({
        freePlayRemaining,
        lastResetDate: freePlaysData?.last_reset_date || today,
        totalPointsSpent: user?.total_points_spent || 0,
        totalPointsPurchased: user?.total_points_purchased || 0,
        canPlay,
        costForNextPlay,
        costType,
      });
      setError(null);
    } catch (err) {
      console.error('Error fetching economy state:', err);
      setError('Failed to load economy state');
    } finally {
      setLoading(false);
    }
  };

  const deductPlayCost = async (): Promise<{ success: boolean; message: string }> => {
    if (!user?.id || !economyState) return { success: false, message: 'User data not loaded' };

    try {
      if (economyState.costType === 'free') {
        if (economyState.freePlayRemaining <= 0) return { success: false, message: 'No free plays remaining' };

        await supabase
          .from('free_plays')
          .update({ free_plays_remaining: economyState.freePlayRemaining - 1 })
          .eq('user_id', user.id);

        await supabase.from('point_transactions').insert({
          user_id: user.id,
          transaction_type: 'game_play_free',
          amount: 0,
          description: 'Free Lucky Card play',
          balance_before: user.points,
          balance_after: user.points,
          ip_address: 'client',
          device_info: 'browser',
        });

        await supabase.from('game_attempts').insert({
          user_id: user.id,
          game_type: 'lucky-card',
          cost_type: 'free',
          cost_points: 0,
          was_free: true,
          points_before: user.points,
          points_after: user.points,
          ip_address: 'client',
          device_hash: 'unknown',
        });

        setEconomyState((prev) =>
          prev ? { ...prev, freePlayRemaining: prev.freePlayRemaining - 1 } : null
        );
        return { success: true, message: 'Free play used' };
      } else {
        if ((user?.points || 0) < costPerPlay) {
          return { success: false, message: `نقاط غير كافية. المطلوب ${costPerPlay}، متوفر ${user?.points || 0}` };
        }

        const newBalance = (user?.points || 0) - costPerPlay;

        const { error: updateError } = await supabase
          .from('users')
          .update({ points: newBalance, total_points_spent: (user?.total_points_spent || 0) + costPerPlay })
          .eq('id', user.id);

        if (updateError) throw updateError;

        await supabase.from('point_transactions').insert({
          user_id: user.id,
          transaction_type: 'game_play_paid',
          amount: -costPerPlay,
          description: `Lucky Card play (${costPerPlay} points)`,
          balance_before: user.points,
          balance_after: newBalance,
          ip_address: 'client',
          device_info: 'browser',
        });

        await supabase.from('game_attempts').insert({
          user_id: user.id,
          game_type: 'lucky-card',
          cost_type: 'paid',
          cost_points: costPerPlay,
          was_free: false,
          points_before: user.points,
          points_after: newBalance,
          ip_address: 'client',
          device_hash: 'unknown',
        });

        await refreshUser();
        return { success: true, message: `${costPerPlay} points deducted` };
      }
    } catch (err) {
      console.error('Error deducting play cost:', err);
      return { success: false, message: 'Failed to process play cost' };
    }
  };

  const addPoints = async (amount: number, description: string): Promise<boolean> => {
    if (!user?.id) return false;
    try {
      const newBalance = (user?.points || 0) + amount;
      const { error } = await supabase.from('users').update({ points: newBalance }).eq('id', user.id);
      if (error) throw error;

      await supabase.from('point_transactions').insert({
        user_id: user.id,
        transaction_type: 'reward',
        amount,
        description,
        balance_before: user.points,
        balance_after: newBalance,
        ip_address: 'client',
        device_info: 'browser',
      });

      await refreshUser();
      await fetchEconomyState();
      return true;
    } catch (err) {
      console.error('Error adding points:', err);
      return false;
    }
  };

  return { economyState, loading, error, deductPlayCost, addPoints, refetch: fetchEconomyState };
};
