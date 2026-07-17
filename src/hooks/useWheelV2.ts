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
  PublicWheelConfig,
} from '../components/wheel-v2/types';

export type WheelRouteState =
  | 'LOADING'
  | 'ACTIVE'
  | 'DISABLED'
  | 'MAINTENANCE'
  | 'NO_ACTIVE_VERSION'
  | 'NETWORK_ERROR'
  | 'INVALID_CONTRACT';

export function useWheelV2() {
  const { user, refreshUser } = useAuth();
  const [config, setConfig] = useState<WheelV2Config | null>(null);
  const [publicConfig, setPublicConfig] = useState<PublicWheelConfig | null>(null);
  const [routeState, setRouteState] = useState<WheelRouteState>('LOADING');
  const [featureEnabled, setFeatureEnabled] = useState<boolean>(false);
  const [maintenanceMode, setMaintenanceMode] = useState<boolean>(false);
  const [freeSpins, setFreeSpins] = useState<FreeSpinState | null>(null);
  const [grandPrize, setGrandPrize] = useState<GrandPrizeProgress | null>(null);
  const [winners, setWinners] = useState<WinnerEvent[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastRequestId = useRef<string | null>(null);
  const lastValidConfig = useRef<PublicWheelConfig | null>(null);

  const fetchConfig = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_published_wheel_v2_config');
    if (error) {
      setError(error.message);
      setRouteState('NETWORK_ERROR');
      return null;
    }
    if (!data) {
      setRouteState('NETWORK_ERROR');
      return null;
    }

    const pub = data as PublicWheelConfig;

    if (!pub.available) {
      if (pub.reason === 'MAINTENANCE_MODE') {
        setRouteState('MAINTENANCE');
      } else {
        setRouteState('NO_ACTIVE_VERSION');
      }
      setPublicConfig(null);
      setConfig(null);
      return null;
    }

    // Validate contract: must have prizes array
    if (!pub.prizes || !Array.isArray(pub.prizes) || pub.prizes.length === 0) {
      setRouteState('INVALID_CONTRACT');
      setPublicConfig(null);
      setConfig(null);
      return null;
    }

    // Keep last-known-good config for smooth switching
    lastValidConfig.current = pub;
    setPublicConfig(pub);

    // Map to legacy config shape for backward compatibility
    const mapped: WheelV2Config = {
      version_id: pub.active_version_id!,
      version_number: pub.game?.version_number ?? 1,
      title_ar: pub.game?.title_ar ?? '',
      title_en: pub.game?.title_en ?? '',
      subtitle_ar: pub.game?.subtitle_ar ?? '',
      subtitle_en: pub.game?.subtitle_en ?? '',
      single_spin_cost: pub.economy?.single_spin_cost ?? 100,
      free_spins_per_period: pub.free_spins?.free_spins_per_period ?? 3,
      free_spin_reset_type: pub.free_spins?.free_spin_reset_type ?? 'DAILY',
      allowed_spin_counts: pub.multi_spin?.allowed_spin_counts ?? [1, 5, 10],
      max_spins_per_request: pub.economy?.max_spins_per_request ?? 10,
      animation_duration_ms: pub.visual?.animation_duration_ms ?? 5600,
      animation_turns: pub.visual?.animation_turns ?? 6,
      sounds_enabled: pub.visual?.sounds_enabled ?? true,
      confetti_enabled: pub.visual?.confetti_enabled ?? true,
      ticker_enabled: pub.panels?.ticker_enabled ?? true,
      leaderboard_enabled: pub.panels?.leaderboard_enabled ?? true,
      grand_prize_enabled: pub.grand_prize?.grand_prize_enabled ?? true,
      jackpot_lock_enabled: pub.grand_prize?.jackpot_lock_enabled ?? true,
      jackpot_unlock_spins: pub.grand_prize?.jackpot_unlock_spins ?? 30,
      streak_enabled: pub.streak?.streak_enabled ?? true,
      streak_spins_required: pub.streak?.streak_spins_required ?? 3,
      streak_reward_free_spins: pub.streak?.streak_reward_free_spins ?? 1,
      visual_config: pub.visual?.visual_config ?? {},
      prizes: pub.prizes!,
    } as any;

    setConfig(mapped);
    setRouteState('ACTIVE');
    return pub;
  }, []);

  const fetchFeatureFlag = useCallback(async () => {
    const { data } = await supabase
      .from('wheel_v2_feature_flags')
      .select('value')
      .eq('key', 'wheel_v2_enabled')
      .maybeSingle();
    setFeatureEnabled(data?.value === true);
  }, []);

  const fetchMaintenanceMode = useCallback(async () => {
    const { data } = await supabase
      .from('wheel_v2_runtime_settings')
      .select('maintenance_mode, public_enabled')
      .eq('id', 1)
      .maybeSingle();
    if (data) {
      setMaintenanceMode(data.maintenance_mode);
      if (!data.public_enabled) {
        setFeatureEnabled(false);
      }
    }
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
      setRouteState('LOADING');
      await Promise.all([
        fetchConfig(),
        fetchFeatureFlag(),
        fetchMaintenanceMode(),
        fetchFreeSpins(),
        fetchGrandPrize(),
        fetchWinners(),
        fetchLeaderboard(),
      ]);
      setLoading(false);
    })();
  }, [user, fetchConfig, fetchFeatureFlag, fetchMaintenanceMode, fetchFreeSpins, fetchGrandPrize, fetchWinners, fetchLeaderboard]);

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
    publicConfig,
    routeState,
    featureEnabled,
    maintenanceMode,
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
    lastValidConfig,
    refresh: () =>
      Promise.all([
        fetchConfig(),
        fetchFeatureFlag(),
        fetchMaintenanceMode(),
        fetchFreeSpins(),
        fetchGrandPrize(),
        fetchWinners(),
        fetchLeaderboard(),
      ]),
  };
}
