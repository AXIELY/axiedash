import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, ToggleLeft, ToggleRight, RotateCcw, Lock, Unlock,
  CheckCircle, XCircle, Clock, Package, Trophy, Zap, AlertTriangle,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import type { WheelPrize, WheelSettings } from '../../../hooks/useSpinWheelGame';
import { CARD, GOLD, BORDER, RARITY_STYLE } from './shared';

interface PrizeRuntime {
  prize_id: string;
  settings_id: string;
  runtime_status: 'ACTIVE' | 'LOCKED' | 'SCHEDULED' | 'EXHAUSTED' | 'EXPIRED' | 'DISABLED';
  available_stock: number | null;
  winners_count: number;
  unique_participants: number;
  unlocked_at: string | null;
  exhausted_at: string | null;
  last_evaluated_at: string | null;
  updated_at: string;
}

interface PrizeWithState extends WheelPrize {
  rarity?: string;
  _state?: PrizeRuntime;
}

const STATUS_META: Record<string, { color: string; bg: string; label: { ar: string; en: string }; Icon: any }> = {
  ACTIVE:    { color: '#34d399', bg: 'rgba(52,211,153,0.1)',  label: { ar: 'نشط',      en: 'Active'     }, Icon: CheckCircle   },
  LOCKED:    { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  label: { ar: 'مقفل',     en: 'Locked'     }, Icon: Lock          },
  SCHEDULED: { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)', label: { ar: 'مجدول',    en: 'Scheduled'  }, Icon: Clock         },
  EXHAUSTED: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',  label: { ar: 'نفد',      en: 'Exhausted'  }, Icon: XCircle       },
  EXPIRED:   { color: '#6b7280', bg: 'rgba(107,114,128,0.1)',label: { ar: 'منتهي',    en: 'Expired'    }, Icon: XCircle       },
  DISABLED:  { color: '#6b7280', bg: 'rgba(107,114,128,0.1)',label: { ar: 'معطل',     en: 'Disabled'   }, Icon: XCircle       },
};

const MODE_LABEL: Record<string, { ar: string; en: string }> = {
  ALWAYS_ACTIVE:  { ar: 'دائماً',       en: 'Always'        },
  LOCKED_BY_GOAL: { ar: 'بهدف',         en: 'By Goal'       },
  SCHEDULED:      { ar: 'مجدول',        en: 'Scheduled'     },
  LIMITED_STOCK:  { ar: 'مخزون محدود',  en: 'Limited Stock' },
  LIMITED_WINNERS:{ ar: 'فائزون محدودون',en: 'Limited Win'  },
  EVENT_ONLY:     { ar: 'حدث خاص',     en: 'Event Only'    },
};

function fmt(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('ar-SA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface Props { language: string; }

export function PrizeStatesTab({ language }: Props) {
  const isAr = language === 'ar';
  const [prizes, setPrizes] = useState<PrizeWithState[]>([]);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [actionPrizeId, setActionPrizeId] = useState<string | null>(null);
  const [resetModal, setResetModal] = useState<{ id: string; name: string; currentStock: number | null } | null>(null);
  const [resetValue, setResetValue] = useState('');
  const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null);

  const notify = (msg: string, ok = true) => {
    setFeedback({ msg, ok });
    setTimeout(() => setFeedback(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const [settingsRes, statesRes] = await Promise.all([
      supabase.from('wheel_game_settings').select('*').eq('active', true).maybeSingle(),
      supabase.from('wheel_prize_states').select('*'),
    ]);

    const settings = settingsRes.data as WheelSettings | null;
    const states: PrizeRuntime[] = statesRes.data ?? [];

    if (settings?.prizes) {
      const merged: PrizeWithState[] = settings.prizes.map(p => ({
        ...p,
        _state: states.find(s => s.prize_id === p.id),
      }));
      setPrizes(merged);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime: refresh when prize states change
  useEffect(() => {
    const ch = supabase.channel('prize_states_admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wheel_prize_states' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const evaluate = async () => {
    setEvaluating(true);
    const { error } = await supabase.rpc('evaluate_wheel_prize_unlocks');
    if (error) notify(isAr ? 'خطأ في التقييم' : 'Evaluation error', false);
    else { notify(isAr ? 'تم تقييم الجوائز' : 'Prizes evaluated'); await load(); }
    setEvaluating(false);
  };

  const toggleStatus = async (prize: PrizeWithState) => {
    const st = prize._state;
    const isDisabled = st?.runtime_status === 'DISABLED';
    setActionPrizeId(prize.id);
    const { error } = await supabase.rpc('admin_toggle_prize_status', {
      p_prize_id: prize.id,
      p_enabled: isDisabled,
    });
    if (error) notify(isAr ? 'خطأ في تغيير الحالة' : 'Toggle error', false);
    else { notify(isAr ? (isDisabled ? 'تم تفعيل الجائزة' : 'تم تعطيل الجائزة') : (isDisabled ? 'Prize enabled' : 'Prize disabled')); await load(); }
    setActionPrizeId(null);
  };

  const manualUnlock = async (prize: PrizeWithState) => {
    setActionPrizeId(prize.id);
    const { error } = await supabase.rpc('admin_manual_unlock_prize', {
      p_prize_id: prize.id,
      p_reason: 'Manual admin unlock',
    });
    if (error) notify(isAr ? 'خطأ في فتح الجائزة' : 'Unlock error', false);
    else { notify(isAr ? 'تم فتح الجائزة يدوياً' : 'Prize manually unlocked'); await load(); }
    setActionPrizeId(null);
  };

  const resetStock = async () => {
    if (!resetModal) return;
    const newStock = parseInt(resetValue, 10);
    if (isNaN(newStock) || newStock < 0) { notify(isAr ? 'قيمة غير صالحة' : 'Invalid value', false); return; }
    setActionPrizeId(resetModal.id);
    const { error } = await supabase.rpc('admin_reset_prize_stock', {
      p_prize_id: resetModal.id,
      p_new_stock: newStock,
    });
    setResetModal(null);
    setResetValue('');
    if (error) notify(isAr ? 'خطأ في إعادة ضبط المخزون' : 'Stock reset error', false);
    else { notify(isAr ? `تم تعيين المخزون على ${newStock}` : `Stock reset to ${newStock}`); await load(); }
    setActionPrizeId(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-transparent rounded-full animate-spin"
          style={{ borderTopColor: GOLD }} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-black text-white text-base">{isAr ? 'حالة الجوائز الحية' : 'Live Prize States'}</h3>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {prizes.length} {isAr ? 'جائزة' : 'prizes'} · {isAr ? 'يتحدث تلقائياً' : 'auto-updates'}
          </p>
        </div>
        <div className="flex gap-2">
          {feedback && (
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold"
              style={{
                background: feedback.ok ? 'rgba(52,211,153,0.12)' : 'rgba(239,68,68,0.12)',
                color: feedback.ok ? '#34d399' : '#f87171',
                border: `1px solid ${feedback.ok ? 'rgba(52,211,153,0.25)' : 'rgba(239,68,68,0.25)'}`,
              }}>
              {feedback.msg}
            </div>
          )}
          <button onClick={evaluate} disabled={evaluating}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
            style={{ background: 'rgba(167,139,250,0.12)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.25)' }}>
            {evaluating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            {isAr ? 'تقييم الأهداف' : 'Evaluate Goals'}
          </button>
          <button onClick={load}
            className="w-8 h-8 flex items-center justify-center rounded-xl transition-all"
            style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)', border: `1px solid ${BORDER}` }}>
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Prize grid */}
      <div className="space-y-2">
        {prizes.map(prize => {
          const st = prize._state;
          const mode = prize.availability_mode ?? 'ALWAYS_ACTIVE';
          const statusKey = st?.runtime_status ?? 'ACTIVE';
          const meta = STATUS_META[statusKey] ?? STATUS_META.ACTIVE;
          const StatusIcon = meta.Icon;
          const isDisabled = statusKey === 'DISABLED';
          const isLocked = statusKey === 'LOCKED';
          const hasStock = mode === 'LIMITED_STOCK';
          const hasWinners = mode === 'LIMITED_WINNERS';
          const isProcessing = actionPrizeId === prize.id;

          const unlockProgress = mode === 'LOCKED_BY_GOAL' && prize.unlock_target_value
            ? Math.min(100, ((st?.unique_participants ?? 0) / prize.unlock_target_value) * 100)
            : null;

          return (
            <div key={prize.id} style={{ ...CARD, padding: '14px 16px', opacity: isDisabled ? 0.65 : 1 }}>
              <div className="flex items-center gap-3">
                {/* Icon */}
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${prize.accent_color}18`, border: `1px solid ${prize.accent_color}30` }}>
                  {prize.primary_icon_url ? (
                    <img src={prize.primary_icon_url} alt="" className="w-6 h-6 object-contain rounded" />
                  ) : (
                    <Package className="w-5 h-5" style={{ color: prize.accent_color }} />
                  )}
                </div>

                {/* Name + mode */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-white truncate">{prize.name_ar}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                      style={{ background: meta.bg, color: meta.color }}>
                      <span className="flex items-center gap-1">
                        <StatusIcon className="w-2.5 h-2.5" />
                        {isAr ? meta.label.ar : meta.label.en}
                      </span>
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>
                      {isAr ? MODE_LABEL[mode]?.ar : MODE_LABEL[mode]?.en}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {/* Stock */}
                    {hasStock && (
                      <span className="text-xs" style={{ color: (st?.available_stock ?? 0) <= 0 ? '#ef4444' : '#34d399' }}>
                        <Package className="w-3 h-3 inline-block me-0.5" />
                        {isAr ? 'المخزون:' : 'Stock:'} {st?.available_stock ?? prize.initial_stock ?? 0}
                      </span>
                    )}
                    {/* Winners */}
                    {(hasWinners || st?.winners_count > 0) && (
                      <span className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        <Trophy className="w-3 h-3 inline-block me-0.5" />
                        {isAr ? 'الفائزون:' : 'Winners:'} {st?.winners_count ?? 0}
                        {prize.max_winners ? ` / ${prize.max_winners}` : ''}
                      </span>
                    )}
                    {/* Last evaluated */}
                    {st?.last_evaluated_at && (
                      <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                        {isAr ? 'آخر تقييم:' : 'Evaluated:'} {fmt(st.last_evaluated_at)}
                      </span>
                    )}
                  </div>

                  {/* Unlock progress bar */}
                  {unlockProgress !== null && (
                    <div className="mt-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px]" style={{ color: '#f59e0b' }}>
                          {isAr ? 'التقدم نحو الفتح' : 'Unlock Progress'}
                        </span>
                        <span className="text-[10px] font-bold" style={{ color: '#f59e0b' }}>
                          {st?.unique_participants ?? 0} / {prize.unlock_target_value}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${unlockProgress}%`, background: 'linear-gradient(90deg,#f59e0b,#fbbf24)' }} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {isProcessing ? (
                    <div className="w-6 h-6 border border-transparent rounded-full animate-spin"
                      style={{ borderTopColor: GOLD }} />
                  ) : (
                    <>
                      {/* Manual unlock for LOCKED prizes */}
                      {isLocked && (
                        <button onClick={() => manualUnlock(prize)} title={isAr ? 'فتح يدوي' : 'Manual unlock'}
                          className="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
                          style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)' }}>
                          <Unlock className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {/* Reset stock for LIMITED_STOCK */}
                      {hasStock && (
                        <button
                          onClick={() => { setResetModal({ id: prize.id, name: prize.name_ar, currentStock: st?.available_stock ?? null }); setResetValue(String(prize.initial_stock ?? 0)); }}
                          title={isAr ? 'إعادة ضبط المخزون' : 'Reset stock'}
                          className="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
                          style={{ background: 'rgba(96,165,250,0.12)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.25)' }}>
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {/* Enable / disable */}
                      <button onClick={() => toggleStatus(prize)} title={isDisabled ? (isAr ? 'تفعيل' : 'Enable') : (isAr ? 'تعطيل' : 'Disable')}
                        className="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
                        style={{
                          background: isDisabled ? 'rgba(52,211,153,0.12)' : 'rgba(239,68,68,0.1)',
                          color: isDisabled ? '#34d399' : '#f87171',
                          border: `1px solid ${isDisabled ? 'rgba(52,211,153,0.25)' : 'rgba(239,68,68,0.2)'}`,
                        }}>
                        {isDisabled ? <ToggleLeft className="w-4 h-4" /> : <ToggleRight className="w-4 h-4" />}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {prizes.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <AlertTriangle className="w-8 h-8" style={{ color: 'rgba(255,255,255,0.2)' }} />
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {isAr ? 'لا توجد جوائز بعد' : 'No prizes configured'}
          </p>
        </div>
      )}

      {/* Reset stock modal */}
      {resetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div className="w-full max-w-sm p-6 rounded-2xl space-y-4"
            style={{ background: '#1a1208', border: '1px solid rgba(96,165,250,0.25)' }}>
            <h3 className="font-black text-base" style={{ color: '#60a5fa' }}>
              {isAr ? 'إعادة ضبط المخزون' : 'Reset Stock'}
            </h3>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
              {resetModal.name}
              {resetModal.currentStock !== null && (
                <span className="ms-2 text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  ({isAr ? 'الحالي:' : 'Current:'} {resetModal.currentStock})
                </span>
              )}
            </p>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.5)' }}>
                {isAr ? 'المخزون الجديد' : 'New stock'}
              </label>
              <input
                type="number" min="0" value={resetValue}
                onChange={e => setResetValue(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(96,165,250,0.3)' }}
              />
            </div>
            <div className="flex gap-2">
              <button onClick={resetStock}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm"
                style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }}>
                {isAr ? 'تأكيد' : 'Confirm'}
              </button>
              <button onClick={() => setResetModal(null)}
                className="px-4 py-2.5 rounded-xl text-sm"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
