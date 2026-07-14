import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export type AvailabilityMode =
  | 'ALWAYS_ACTIVE'
  | 'LOCKED_BY_GOAL'
  | 'SCHEDULED'
  | 'LIMITED_STOCK'
  | 'LIMITED_WINNERS'
  | 'EVENT_ONLY';

export interface WheelPrize {
  id: string;
  name_ar: string;
  name_en: string;
  type: string; // 'points' | 'service' | 'miss' | 'grand' | 'coins'
  accent_color: string;
  weight: number;
  value: string;
  short_label: string;
  is_strong: boolean;
  // Icon fields
  primary_icon_url?: string;
  result_art_url?: string;
  icon_scale?: number;
  icon_offset_x?: number;
  icon_offset_y?: number;
  glow_color?: string;
  icon_bg_style?: string;
  icon_shape?: string;
  rarity?: string;
  icon_preset?: string;
  // Availability fields
  availability_mode?: AvailabilityMode;
  starts_at?: string | null;
  ends_at?: string | null;
  unlock_target_metric?: string | null;
  unlock_target_value?: number | null;
  initial_stock?: number | null;
  max_winners?: number | null;
  max_wins_per_user?: number | null;
  user_cooldown_days?: number | null;
  locked_visibility?: 'visible' | 'hidden' | 'silhouette';
  event_tag?: string | null;
  fallback_prize_id?: string | null;
}

// Prize types that require manual admin fulfillment
const MANUAL_FULFILLMENT_TYPES = new Set(['service', 'grand', 'coins']);

// Map prize id → required user fields for delivery
const PRIZE_REQUIRED_FIELDS: Record<string, string[]> = {
  chatgpt:  ['email'],
  netflix:  ['email'],
  tiktok:   ['username'],
  libyana:  ['phone'],
  almadar:  ['phone'],
};

export interface WheelSettings {
  id: string;
  active: boolean;
  title_ar: string;
  title_en: string;
  spin_cost_points: number;
  free_daily_spins: number;
  prizes: WheelPrize[];
}

const DEFAULT_SETTINGS: WheelSettings = {
  id: '',
  active: true,
  title_ar: 'عجلة أكسي',
  title_en: 'AXIE Wheel',
  spin_cost_points: 100,
  free_daily_spins: 3,
  prizes: [],
};

// Legacy client-side weighted pick (used when spin_v2 flag is off)
function weightedPick(prizes: WheelPrize[], excludeIds: string[]): number {
  const available = prizes
    .map((p, i) => ({ ...p, originalIndex: i }))
    .filter(p => !(p.is_strong && excludeIds.includes(p.id)));

  const total = available.reduce((s, p) => s + p.weight, 0);
  let roll = Math.random() * total;
  for (const item of available) {
    roll -= item.weight;
    if (roll <= 0) return item.originalIndex;
  }
  return available[available.length - 1].originalIndex;
}

export interface PrizeState {
  prize_id: string;
  settings_id: string;
  is_unlocked: boolean;
  current_stock: number | null;
  total_winners: number;
  current_progress: number;
  last_evaluated_at: string | null;
}

export interface FulfillmentCaseRef {
  caseId: string;
  threadId: string;
  caseCode: string;
}

export function useSpinWheelGame() {
  const { user, refreshUser } = useAuth();
  const [settings, setSettings] = useState<WheelSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [spinsToday, setSpinsToday] = useState(0);
  const [history, setHistory] = useState<WheelPrize[]>([]);
  const [lastWin, setLastWin] = useState<WheelPrize | null>(null);
  const [lastFulfillmentCase, setLastFulfillmentCase] = useState<FulfillmentCaseRef | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [spinV2Enabled, setSpinV2Enabled] = useState(false);
  const [prizeStates, setPrizeStates] = useState<PrizeState[]>([]);

  // Pending server result for spinV2 — resolved after wheel animation ends
  const pendingServerResult = useRef<{
    prizeIndex: number;
    prize: WheelPrize;
    spinRequestId: string;
    pointsAwarded: number;
    pointsDeducted: number;
    quantity: number;
    allResults: Array<{ prizeIndex: number; prize: WheelPrize }>;
    unlockedGrandPrizeIds: string[];
  } | null>(null);

  useEffect(() => {
    fetchSettings();
    fetchFlags();

    // Subscribe to admin changes on wheel_game_settings so the player wheel
    // updates immediately when an admin edits prizes without requiring a page refresh.
    const channel = supabase
      .channel('wheel_settings_sync')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'wheel_game_settings' },
        () => { fetchSettings(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (user?.id) {
      fetchSpinsToday();
      fetchPrizeStates();
    }
  }, [user?.id]);

  const fetchFlags = async () => {
    const { data } = await supabase
      .from('engagement_flags')
      .select('flag, enabled')
      .in('flag', ['spin_v2']);
    if (data) {
      const v2 = data.find(f => f.flag === 'spin_v2');
      setSpinV2Enabled(v2?.enabled ?? false);
    }
  };

  const fetchSettings = async () => {
    try {
      const { data, error: err } = await supabase
        .from('wheel_game_settings')
        .select('*')
        .eq('active', true)
        .maybeSingle();

      if (err) throw err;
      if (data) setSettings(data as WheelSettings);
    } catch (err) {
      console.error('Error fetching wheel settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPrizeStates = async () => {
    try {
      const { data } = await supabase.rpc('get_wheel_prize_states');
      if (data) setPrizeStates(data as PrizeState[]);
    } catch (err) {
      console.error('Error fetching prize states:', err);
    }
  };

  const fetchSpinsToday = async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { count } = await supabase
        .from('game_logs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user!.id)
        .eq('game_type', 'wheel')
        .gte('played_at', today.toISOString());

      setSpinsToday(count || 0);
    } catch (err) {
      console.error('Error fetching spins today:', err);
    }
  };

  // ── V2: server-authoritative spin ────────────────────────────────────────────
  const doSpinV2 = useCallback(async (quantity = 1): Promise<{ prizeIndex: number; prize: WheelPrize; allResults?: Array<{ prizeIndex: number; prize: WheelPrize }>; quantity?: number } | null> => {
    if (!user || !settings.active || spinning) return null;

    setError(null);
    setSpinning(true);

    const clientRequestId = crypto.randomUUID();

    const { data, error: rpcErr } = await supabase.rpc('perform_spin', {
      p_client_request_id: clientRequestId,
      p_quantity: quantity,
    });

    if (rpcErr || !data?.success) {
      const errCode = data?.error ?? rpcErr?.message ?? 'unknown';
      if (errCode === 'insufficient_points') {
        setError(`نقاطك غير كافية. تحتاج ${settings.spin_cost_points} نقطة للدوران.`);
      } else if (errCode === 'spin_v2_disabled') {
        // Flag was just disabled — fall through handled at caller
        setError('الخدمة مؤقتاً غير متاحة.');
      } else {
        setError('حدث خطأ أثناء الدوران.');
      }
      setSpinning(false);
      return null;
    }

    const result = data as {
      quantity: number;
      results: Array<{
        prize_index: number;
        prize_id: string;
        prize_type: string;
        prize_value: string;
        prize_name_ar: string;
        prize_name_en: string;
        points_awarded: number;
      }>;
      points_awarded: number;
      points_deducted: number;
      spin_request_id: string;
      unlocked_grand_prize_ids: string[];
    };

    // Build allResults array from the batch
    const allResults: Array<{ prizeIndex: number; prize: WheelPrize }> = [];
    for (const r of result.results || []) {
      const p = settings.prizes[r.prize_index] ?? settings.prizes.find(p => p.id === r.prize_id);
      if (p) allResults.push({ prizeIndex: r.prize_index, prize: p });
    }

    // Use the last prize for the wheel animation landing
    const lastResult = result.results?.[result.results.length - 1];
    const prize = lastResult
      ? (settings.prizes[lastResult.prize_index] ?? settings.prizes.find(p => p.id === lastResult.prize_id))
      : null;
    if (!prize) {
      setError('حدث خطأ في تحديد الجائزة.');
      setSpinning(false);
      return null;
    }

    // Store server result; commitSpinV2 will apply state after animation
    pendingServerResult.current = {
      prizeIndex: lastResult.prize_index,
      prize,
      spinRequestId: result.spin_request_id,
      pointsAwarded: result.points_awarded,
      pointsDeducted: result.points_deducted,
      quantity: result.quantity,
      allResults,
      unlockedGrandPrizeIds: result.unlocked_grand_prize_ids || [],
    };

    return { prizeIndex: lastResult.prize_index, prize, allResults, quantity: result.quantity };
  }, [user, settings, spinning]);

  // ── V1: legacy client-side spin ──────────────────────────────────────────────
  const doSpinV1 = useCallback(async (_quantity = 1): Promise<{ prizeIndex: number; prize: WheelPrize } | null> => {
    if (!user || !settings.active || spinning) return null;

    const freeLeft = Math.max(settings.free_daily_spins - spinsToday, 0);
    const isPaid = freeLeft <= 0;

    if (isPaid && (user.points || 0) < settings.spin_cost_points) {
      setError(`نقاطك غير كافية. تحتاج ${settings.spin_cost_points} نقطة للدوران.`);
      return null;
    }

    setError(null);
    setSpinning(true);

    if (isPaid) {
      const { error: deductErr } = await supabase
        .from('users')
        .update({ points: (user.points || 0) - settings.spin_cost_points })
        .eq('id', user.id);
      if (deductErr) {
        setError('حدث خطأ أثناء خصم النقاط.');
        setSpinning(false);
        return null;
      }
    }

    const wonStrongIds = history.filter(p => p.is_strong).map(p => p.id);
    const prizeIndex = weightedPick(settings.prizes, wonStrongIds);
    const prize = settings.prizes[prizeIndex];

    return { prizeIndex, prize };
  }, [user, settings, spinning, spinsToday, history]);

  const doSpin = useCallback(async (quantity = 1): Promise<{ prizeIndex: number; prize: WheelPrize; allResults?: Array<{ prizeIndex: number; prize: WheelPrize }>; quantity?: number } | null> => {
    return spinV2Enabled ? doSpinV2(quantity) : doSpinV1(quantity);
  }, [spinV2Enabled, doSpinV2, doSpinV1]);

  // ── commitSpin: called by wheel component after animation completes ───────────
  const commitSpin = useCallback(async (prize: WheelPrize) => {
    if (!user) return;

    try {
      if (spinV2Enabled && pendingServerResult.current) {
        // V2: state already applied server-side; just update local UI state
        const { prize: confirmedPrize, spinRequestId, allResults, quantity } = pendingServerResult.current;
        pendingServerResult.current = null;

        // Update history with all prizes from the batch
        const prizesToAdd = allResults?.length ? allResults.map(r => r.prize) : [confirmedPrize];
        setHistory(prev => [...prizesToAdd.reverse(), ...prev].slice(0, 10));
        setSpinsToday(prev => prev + (quantity || 1));
        if (confirmedPrize.type !== 'miss') setLastWin(confirmedPrize);

        // Create fulfillment cases for all manual delivery prizes in the batch
        const manualPrizes = (allResults?.length ? allResults : [{ prize: confirmedPrize, prizeIndex: 0 }])
          .map(r => r.prize)
          .filter(p => MANUAL_FULFILLMENT_TYPES.has(p.type));

        if (manualPrizes.length > 0) {
          // Look up all reward_grants created by perform_spin for this request
          const { data: grants } = await supabase
            .from('reward_grants')
            .select('id, grant_type')
            .eq('spin_request_id', spinRequestId)
            .eq('user_id', user.id);

          if (grants && grants.length > 0) {
            // Create a fulfillment case for each grant
            for (const grant of grants) {
              const matchingPrize = manualPrizes.find(p => p.type === grant.grant_type) || manualPrizes[0];
              const requiredFields = PRIZE_REQUIRED_FIELDS[matchingPrize.id] ?? null;
              const { data: caseResult } = await supabase.rpc('create_fulfillment_case', {
                p_reward_grant_id:  grant.id,
                p_spin_id:          spinRequestId,
                p_user_id:          user.id,
                p_prize_id:         matchingPrize.id,
                p_prize_name_ar:    matchingPrize.name_ar,
                p_prize_name_en:    matchingPrize.name_en,
                p_prize_type:       matchingPrize.type,
                p_prize_value:      matchingPrize.value,
                p_prize_icon_url:   matchingPrize.primary_icon_url ?? null,
                p_prize_accent:     matchingPrize.accent_color,
                p_prize_rarity:     matchingPrize.rarity ?? 'common',
                p_delivery_minutes: 1440,
                p_required_fields:  requiredFields,
              });
              if (caseResult?.case_id) {
                setLastFulfillmentCase({
                  caseId: caseResult.case_id,
                  threadId: caseResult.thread_id,
                  caseCode: caseResult.case_code ?? '',
                });
              }
            }
          }
        }

        await refreshUser();
        return;
      }

      // V1: legacy path — apply rewards now
      if (prize.type === 'points') {
        const pointsValue = parseInt(prize.value) || 0;
        if (pointsValue > 0) {
          await supabase
            .from('users')
            .update({ points: (user.points || 0) + pointsValue })
            .eq('id', user.id);
        }
      }

      await supabase.from('game_logs').insert({
        user_id: user.id,
        game_type: 'wheel',
        bet_amount: 0,
        win_amount: prize.type === 'points' ? parseInt(prize.value) || 0 : 0,
        result: prize.type === 'miss' ? 'miss' : 'win',
        result_data: {
          prize_id: prize.id,
          prize_type: prize.type,
          prize_value: prize.value,
          prize_name_ar: prize.name_ar,
        },
        played_at: new Date().toISOString(),
      });

      setHistory(prev => [prize, ...prev].slice(0, 5));
      setSpinsToday(prev => prev + 1);
      if (prize.type !== 'miss') setLastWin(prize);
      await refreshUser();
    } catch (err) {
      console.error('Error committing spin:', err);
    } finally {
      setSpinning(false);
    }
  }, [user, spinV2Enabled, refreshUser]);

  const clearLastWin = () => { setLastWin(null); setLastFulfillmentCase(null); };

  const fetchUserGrandPrizeProgress = useCallback(async () => {
    if (!user) return [];
    const { data, error } = await supabase.rpc('get_user_grand_prize_progress');
    if (error) { console.error('Error fetching grand prize progress:', error); return []; }
    return (data as { success: boolean; progress: Array<Record<string, unknown>> })?.progress || [];
  }, [user]);

  const freeSpinsLeft = Math.max(settings.free_daily_spins - spinsToday, 0);
  const canSpin = !spinning && settings.active && (
    freeSpinsLeft > 0 || (user?.points || 0) >= settings.spin_cost_points
  );

  return {
    settings,
    loading,
    spinning,
    setSpinning,
    spinsToday,
    freeSpinsLeft,
    canSpin,
    history,
    lastWin,
    lastFulfillmentCase,
    error,
    doSpin,
    commitSpin,
    clearLastWin,
    fetchSettings,
    spinV2Enabled,
    prizeStates,
    fetchPrizeStates,
    fetchUserGrandPrizeProgress,
  };
}
