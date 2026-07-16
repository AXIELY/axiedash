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
  type: string;
  accent_color: string;
  weight: number;
  probability_bp?: number;
  value: string;
  short_label: string;
  is_strong: boolean;
  is_grand_prize?: boolean;
  unlock_after_completed_spins?: number;
  disabled?: boolean;
  disabled_reason?: string;
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
  internal_cost_estimate?: number;
  max_winners_per_day?: number;
}

const MANUAL_FULFILLMENT_TYPES = new Set(['service', 'grand', 'coins']);

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
  single_spin_cost: number;
  five_spin_cost: number;
  ten_spin_cost: number;
  five_spin_enabled: boolean;
  ten_spin_enabled: boolean;
  fallback_prize_id: string;
}

const DEFAULT_SETTINGS: WheelSettings = {
  id: '',
  active: true,
  title_ar: 'عجلة أكسي',
  title_en: 'AXIE Wheel',
  spin_cost_points: 100,
  free_daily_spins: 3,
  prizes: [],
  single_spin_cost: 100,
  five_spin_cost: 450,
  ten_spin_cost: 800,
  five_spin_enabled: true,
  ten_spin_enabled: true,
  fallback_prize_id: 'points-1',
};

export interface SpinResultEntry {
  prize_index: number;
  prize_id: string;
  prize_type: string;
  prize_value: string;
  prize_name_ar: string;
  prize_name_en: string;
  points_awarded: number;
  sequence_number: number;
  fallback_used: boolean;
  original_prize_id: string;
  random_bucket: number;
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
  const [prizeStates, setPrizeStates] = useState<PrizeState[]>([]);

  const pendingServerResult = useRef<{
    prizeIndex: number;
    prize: WheelPrize;
    spinRequestId: string;
    pointsAwarded: number;
    pointsDeducted: number;
    quantity: number;
    allResults: Array<{ prizeIndex: number; prize: WheelPrize; fallbackUsed?: boolean; originalPrizeId?: string }>;
    unlockedGrandPrizeIds: string[];
    progress?: { before: number; after: number; required: number; remaining: number; unlocked: boolean; unlocked_during_batch_at: number | null };
    balanceAfter?: number;
  } | null>(null);

  useEffect(() => {
    fetchSettings();
    const channel = supabase
      .channel('wheel_settings_sync')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'wheel_game_settings' }, () => { fetchSettings(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (user?.id) {
      fetchSpinsToday();
      fetchPrizeStates();
    }
  }, [user?.id]);

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

  const doSpin = useCallback(async (quantity = 1): Promise<{
    prizeIndex: number;
    prize: WheelPrize;
    allResults: Array<{ prizeIndex: number; prize: WheelPrize; fallbackUsed?: boolean; originalPrizeId?: string }>;
    quantity: number;
    progress?: { before: number; after: number; required: number; remaining: number; unlocked: boolean; unlocked_during_batch_at: number | null };
    balanceAfter?: number;
  } | null> => {
    if (!user || !settings.active || spinning) return null;

    setError(null);
    setSpinning(true);

    const clientRequestId = crypto.randomUUID();
    const paymentMode = quantity === 1 && Math.max(settings.free_daily_spins - spinsToday, 0) > 0 ? 'free' : 'points';

    const { data, error: rpcErr } = await supabase.rpc('perform_spin_batch', {
      p_spin_count: quantity,
      p_client_request_id: clientRequestId,
      p_payment_mode: paymentMode,
    });

    if (rpcErr || !data?.success) {
      const errCode = data?.error ?? rpcErr?.message ?? 'unknown';
      const errorMessages: Record<string, string> = {
        insufficient_points: `نقاطك غير كافية. تحتاج ${data?.required ?? (quantity === 5 ? settings.five_spin_cost : quantity === 10 ? settings.ten_spin_cost : settings.single_spin_cost)} نقطة.`,
        five_spin_disabled: 'خيار 5 لفات غير متاح حالياً.',
        ten_spin_disabled: 'خيار 10 لفات غير متاح حالياً.',
        no_published_version: 'تكوين العجلة غير جاهز. يرجى المحاولة لاحقاً.',
        no_active_wheel: 'لا توجد عجلة نشطة حالياً.',
        invalid_spin_count: 'عدد اللفات غير صالح.',
        invalid_probability_config: 'إعدادات الاحتمالات غير صحيحة.',
        not_authenticated: 'يجب تسجيل الدخول أولاً.',
        batch_already_processing: 'يوجد سحب قيد المعالجة. يرجى الانتظار.',
        batch_failed: 'فشل السحب السابق. يرجى المحاولة مرة أخرى.',
      };
      setError(errorMessages[errCode] || `حدث خطأ: ${errCode}`);
      setSpinning(false);
      return null;
    }

    const result = data as {
      spin_count: number;
      results: SpinResultEntry[];
      cost: number;
      balance_before?: number;
      balance_after?: number;
      batch_id?: string;
      client_request_id: string;
      probability_version_id: string;
      recovered?: boolean;
      progress?: {
        before: number;
        after: number;
        required: number;
        remaining: number;
        unlocked: boolean;
        unlocked_during_batch_at: number | null;
      };
    };
    // Map server response to the shape the rest of the hook expects
    const mappedQuantity = result.spin_count || 1;
    const mappedPointsDeducted = result.cost || 0;
    const mappedPointsAwarded = (result.results || []).reduce((s, r) => s + (r.points_awarded || 0), 0);
    const mappedSpinRequestId = result.batch_id || result.client_request_id;

    const allResults: Array<{ prizeIndex: number; prize: WheelPrize; fallbackUsed?: boolean; originalPrizeId?: string }> = [];
    for (const r of result.results || []) {
      const p = settings.prizes.find(p => p.id === r.prize_id) ?? settings.prizes[r.prize_index];
      if (p) allResults.push({
        prizeIndex: settings.prizes.findIndex(sp => sp.id === r.prize_id),
        prize: p,
        fallbackUsed: r.fallback_used,
        originalPrizeId: r.original_prize_id,
      });
    }

    const lastResult = result.results?.[result.results.length - 1];
    const prize = lastResult
      ? (settings.prizes.find(p => p.id === lastResult.prize_id) ?? settings.prizes[lastResult.prize_index])
      : null;
    if (!prize) {
      setError('حدث خطأ في تحديد الجائزة.');
      setSpinning(false);
      return null;
    }

    const finalPrizeIndex = settings.prizes.findIndex(sp => sp.id === (lastResult?.prize_id ?? ''));

    pendingServerResult.current = {
      prizeIndex: finalPrizeIndex >= 0 ? finalPrizeIndex : (lastResult?.prize_index ?? 0),
      prize,
      spinRequestId: mappedSpinRequestId,
      pointsAwarded: mappedPointsAwarded,
      pointsDeducted: mappedPointsDeducted,
      quantity: mappedQuantity,
      allResults,
      unlockedGrandPrizeIds: [],
      progress: result.progress,
      balanceAfter: result.balance_after,
    };

    if (result.recovered) {
      setError(null);
    }

    // Refresh user balance immediately after server confirms deduction
    refreshUser();

    return {
      prizeIndex: finalPrizeIndex >= 0 ? finalPrizeIndex : (lastResult?.prize_index ?? 0),
      prize,
      allResults,
      quantity: mappedQuantity,
      progress: result.progress,
      balanceAfter: result.balance_after,
    };
  }, [user, settings, spinning, spinsToday, refreshUser]);

  const commitSpin = useCallback(async (_prize: WheelPrize) => {
    if (!user) return;

    try {
      if (pendingServerResult.current) {
        const { prize: confirmedPrize, spinRequestId, allResults, quantity } = pendingServerResult.current;
        pendingServerResult.current = null;

        const prizesToAdd = allResults?.length ? allResults.map(r => r.prize) : [confirmedPrize];
        setHistory(prev => [...prizesToAdd.reverse(), ...prev].slice(0, 10));
        setSpinsToday(prev => prev + (quantity || 1));
        if (confirmedPrize.type !== 'miss') setLastWin(confirmedPrize);

        const manualPrizes = (allResults?.length ? allResults : [{ prize: confirmedPrize, prizeIndex: 0 }])
          .filter(r => !r.fallbackUsed)
          .map(r => r.prize)
          .filter(p => MANUAL_FULFILLMENT_TYPES.has(p.type));

        if (manualPrizes.length > 0) {
          const { data: grants } = await supabase
            .from('reward_grants')
            .select('id, grant_type')
            .eq('spin_request_id', spinRequestId)
            .eq('user_id', user.id);

          if (grants && grants.length > 0) {
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
    } catch (err) {
      console.error('Error committing spin:', err);
    } finally {
      setSpinning(false);
    }
  }, [user, refreshUser]);

  const clearLastWin = () => { setLastWin(null); setLastFulfillmentCase(null); };

  const fetchUserGrandPrizeProgress = useCallback(async () => {
    if (!user) return [];
    const { data, error } = await supabase.rpc('get_user_grand_prize_progress');
    if (error) { console.error('Error fetching grand prize progress:', error); return []; }
    return (data as { success: boolean; progress: Array<Record<string, unknown>> })?.progress || [];
  }, [user]);

  const freeSpinsLeft = Math.max(settings.free_daily_spins - spinsToday, 0);
  const canSpin = !spinning && settings.active && (
    freeSpinsLeft > 0 || (user?.points || 0) >= settings.single_spin_cost
  );

  const getSpinCost = useCallback((quantity: number): number => {
    if (quantity === 1) return freeSpinsLeft > 0 ? 0 : settings.single_spin_cost;
    if (quantity === 5) return settings.five_spin_cost;
    if (quantity === 10) return settings.ten_spin_cost;
    return settings.single_spin_cost * quantity;
  }, [settings, freeSpinsLeft]);

  const canAffordSpin = useCallback((quantity: number): boolean => {
    if (quantity === 1 && freeSpinsLeft > 0) return true;
    if (quantity === 5 && !settings.five_spin_enabled) return false;
    if (quantity === 10 && !settings.ten_spin_enabled) return false;
    return (user?.points || 0) >= getSpinCost(quantity);
  }, [user, settings, freeSpinsLeft, getSpinCost]);

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
    prizeStates,
    fetchPrizeStates,
    fetchUserGrandPrizeProgress,
    getSpinCost,
    canAffordSpin,
  };
}
