import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type {
  WheelV2Config,
  SpinResponse,
  FreeSpinState,
  GrandPrizeProgress,
  LeaderboardEntry,
  WinnerEvent,
} from '../components/wheel-v2/types';

export function useWheelV2() {
  const { user, refreshUser } = useAuth();
  const [config, setConfig] = useState<WheelV2Config | null>(null);
  const [featureEnabled, setFeatureEnabled] = useState<boolean>(false);
  const [freeSpins, setFreeSpins] = useState<FreeSpinState | null>(null);
  const [grandPrize, setGrandPrize] = useState<GrandPrizeProgress | null>(null);
  const [winners, setWinners] = useState<WinnerEvent[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastRequestId = useRef<string | null>(null);

  const fetchConfig = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_published_wheel_v2_config');
    if (error) {
      setError(error.message);
      return null;
    }
    if (data && !data.error) {
      setConfig(data as WheelV2Config);
      return data as WheelV2Config;
    }
    return null;
  }, []);

  const fetchFeatureFlag = useCallback(async () => {
    const { data } = await supabase
      .from('wheel_v2_feature_flags')
      .select('value')
      .eq('key', 'wheel_v2_enabled')
      .maybeSingle();
    setFeatureEnabled(data?.value === true);
  }, []);

  const fetchFreeSpins = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_wheel_v2_free_spins_remaining');
    if (!error && data && !data.error) {
      setFreeSpins(data as FreeSpinState);
    }
  }, []);

  const fetchGrandPrize = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_wheel_v2_grand_prize_progress');
    if (!error && data && !data.error) {
      setGrandPrize(data as GrandPrizeProgress);
    }
  }, []);

  const fetchWinners = useCallback(async () => {
    const { data, error } = await supabase
      .from('wheel_v2_winner_events')
      .select('*')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(10);
    if (!error && data) {
      setWinners(data as WinnerEvent[]);
    }
  }, []);

  const fetchLeaderboard = useCallback(async (period: string = 'week') => {
    const { data, error } = await supabase.rpc('get_wheel_v2_leaderboard', {
      p_period: period,
      p_limit: 10,
    });
    if (!error && data) {
      setLeaderboard(data as LeaderboardEntry[]);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      await Promise.all([fetchConfig(), fetchFeatureFlag(), fetchFreeSpins(), fetchGrandPrize(), fetchWinners(), fetchLeaderboard()]);
      setLoading(false);
    })();
  }, [user, fetchConfig, fetchFeatureFlag, fetchFreeSpins, fetchGrandPrize, fetchWinners, fetchLeaderboard]);

  // Realtime for winner events
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('wheel_v2_winners')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'wheel_v2_winner_events' },
        () => fetchWinners()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchWinners]);

  const executeSpins = useCallback(
    async (spinCount: number): Promise<SpinResponse> => {
      if (!user) return { success: false, error: 'UNAUTHENTICATED' };
      if (spinning) return { success: false, error: 'ALREADY_SPINNING' };

      const requestId =
        lastRequestId.current ||
        (typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      lastRequestId.current = requestId;

      setSpinning(true);
      setError(null);

      try {
        const { data, error } = await supabase.rpc('execute_wheel_spins', {
          p_spin_count: spinCount,
          p_client_request_id: requestId,
        });

        if (error) {
          setError(error.message);
          return { success: false, error: error.message };
        }

        const response = data as SpinResponse;

        if (response.success) {
          // Refresh all state
          await Promise.all([fetchFreeSpins(), fetchGrandPrize(), fetchWinners(), refreshUser()]);
          lastRequestId.current = null;
        }

        return response;
      } catch (err: any) {
        setError(err.message);
        return { success: false, error: err.message };
      } finally {
        setSpinning(false);
      }
    },
    [user, spinning, fetchFreeSpins, fetchGrandPrize, fetchWinners, refreshUser]
  );

  return {
    config,
    featureEnabled,
    freeSpins,
    grandPrize,
    winners,
    leaderboard,
    loading,
    spinning,
    error,
    executeSpins,
    fetchConfig,
    fetchFreeSpins,
    fetchGrandPrize,
    fetchLeaderboard,
    refresh: () =>
      Promise.all([fetchConfig(), fetchFeatureFlag(), fetchFreeSpins(), fetchGrandPrize(), fetchWinners(), fetchLeaderboard()]),
  };
}
