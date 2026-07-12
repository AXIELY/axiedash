import { useState, useEffect, useCallback } from 'react';
import {
  Gift, Lock, Package, Trophy, Clock, Star, ChevronLeft,
  Zap, AlertCircle, CheckCircle, Users,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import type { WheelPrize, WheelSettings, PrizeState } from '../hooks/useSpinWheelGame';

// ─── Availability badge metadata ──────────────────────────────────────────────
const MODE_META: Record<string, { color: string; bg: string; label: { ar: string; en: string }; Icon: any }> = {
  ALWAYS_ACTIVE:   { color: '#34d399', bg: 'rgba(52,211,153,0.1)',  label: { ar: 'متاح دائماً', en: 'Always Active' }, Icon: CheckCircle },
  LOCKED_BY_GOAL:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', label: { ar: 'بهدف مجتمعي', en: 'Community Goal'}, Icon: Lock        },
  SCHEDULED:       { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)', label: { ar: 'موسمي',        en: 'Seasonal'      }, Icon: Clock       },
  LIMITED_STOCK:   { color: '#c084fc', bg: 'rgba(192,132,252,0.1)',label: { ar: 'مخزون محدود',  en: 'Limited Stock' }, Icon: Package     },
  LIMITED_WINNERS: { color: '#fb923c', bg: 'rgba(251,146,60,0.1)', label: { ar: 'فائزون محدودون',en: 'Limited Win'  }, Icon: Trophy      },
  EVENT_ONLY:      { color: '#38bdf8', bg: 'rgba(56,189,248,0.1)', label: { ar: 'حدث خاص',     en: 'Event Only'    }, Icon: Star        },
};

const RARITY_META: Record<string, { color: string; label: { ar: string; en: string } }> = {
  common:    { color: '#94a3b8', label: { ar: 'عادي',     en: 'Common'    } },
  uncommon:  { color: '#34d399', label: { ar: 'غير شائع', en: 'Uncommon'  } },
  rare:      { color: '#60a5fa', label: { ar: 'نادر',     en: 'Rare'      } },
  epic:      { color: '#c084fc', label: { ar: 'ملحمي',    en: 'Epic'      } },
  legendary: { color: '#fbbf24', label: { ar: 'أسطوري',   en: 'Legendary' } },
  jackpot:   { color: '#fbbf24', label: { ar: 'الجائزة الكبرى', en: 'Jackpot' } },
};

function rarityFor(prize: WheelPrize): string {
  if (prize.type === 'grand') return 'jackpot';
  if (prize.is_strong) return 'epic';
  if (prize.rarity) return prize.rarity;
  if (prize.type === 'miss') return 'common';
  if (prize.type === 'points') return 'uncommon';
  return 'rare';
}

// ─── Countdown helper ─────────────────────────────────────────────────────────
function useCountdown(target: string | null) {
  const [label, setLabel] = useState('');
  useEffect(() => {
    if (!target) return;
    const tick = () => {
      const diff = new Date(target).getTime() - Date.now();
      if (diff <= 0) { setLabel(''); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setLabel(`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [target]);
  return label;
}

// ─── Prize icon ───────────────────────────────────────────────────────────────
function PrizeIcon({ prize, size = 48 }: { prize: WheelPrize; size?: number }) {
  const [err, setErr] = useState(false);
  if (prize.primary_icon_url && !err) {
    return (
      <img src={prize.primary_icon_url} alt="" onError={() => setErr(true)}
        style={{ width: size, height: size, objectFit: 'contain', borderRadius: 8 }} />
    );
  }
  const iconMap: Record<string, string> = {
    grand: '🏆', points: '🛡️', service: '🎁', miss: '•••',
  };
  return (
    <span style={{ fontSize: size * 0.55, lineHeight: 1 }}>
      {iconMap[prize.type] ?? '🎁'}
    </span>
  );
}

// ─── Single prize card ────────────────────────────────────────────────────────
function PrizeCard({
  prize, state, language,
}: {
  prize: WheelPrize;
  state?: PrizeState;
  language: string;
}) {
  const isAr = language === 'ar';
  const mode = prize.availability_mode ?? 'ALWAYS_ACTIVE';
  const modeMeta = MODE_META[mode] ?? MODE_META.ALWAYS_ACTIVE;
  const ModeIcon = modeMeta.Icon;
  const rarity = rarityFor(prize);
  const rarityMeta = RARITY_META[rarity] ?? RARITY_META.common;

  const now = Date.now();
  const isLocked = mode === 'LOCKED_BY_GOAL' && state && !state.is_unlocked;
  const isExhausted = (mode === 'LIMITED_STOCK' && state && state.current_stock !== null && state.current_stock <= 0)
    || (mode === 'LIMITED_WINNERS' && prize.max_winners && state && state.total_winners >= prize.max_winners);
  const beforeSchedule = mode === 'SCHEDULED' && prize.starts_at && now < new Date(prize.starts_at).getTime();
  const afterSchedule  = mode === 'SCHEDULED' && prize.ends_at  && now > new Date(prize.ends_at).getTime();
  const scheduledInactive = beforeSchedule || afterSchedule;
  const isUnavailable = isLocked || isExhausted || scheduledInactive;

  const stockCount = state?.current_stock ?? prize.initial_stock;
  const winnersCount = state?.total_winners ?? 0;
  const unlockProgress = mode === 'LOCKED_BY_GOAL' && prize.unlock_target_value
    ? Math.min(100, ((state?.current_progress ?? 0) / prize.unlock_target_value) * 100)
    : null;

  // Countdown: time to start or to end
  const countdownTo = beforeSchedule ? prize.starts_at : mode === 'SCHEDULED' ? prize.ends_at : null;
  const countdown = useCountdown(countdownTo ?? null);

  return (
    <div
      className="relative rounded-2xl p-4 flex flex-col gap-3 transition-all duration-200"
      style={{
        background: isUnavailable ? 'rgba(10,8,24,0.5)' : 'rgba(10,8,24,0.8)',
        border: `1px solid ${isUnavailable ? 'rgba(255,255,255,0.06)' : `${prize.accent_color}28`}`,
        opacity: isExhausted || afterSchedule ? 0.55 : 1,
      }}
    >
      {/* Rarity glow top border */}
      <div className="absolute top-0 inset-x-0 h-0.5 rounded-t-2xl"
        style={{ background: isUnavailable ? 'rgba(255,255,255,0.04)' : `linear-gradient(90deg, transparent, ${rarityMeta.color}60, transparent)` }} />

      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 relative"
          style={{ background: `${prize.accent_color}15`, border: `1px solid ${prize.accent_color}25` }}>
          <PrizeIcon prize={prize} size={36} />
          {isLocked && (
            <div className="absolute -top-1 -end-1 w-5 h-5 rounded-full flex items-center justify-center"
              style={{ background: '#f59e0b', boxShadow: '0 0 6px rgba(245,158,11,0.6)' }}>
              <Lock className="w-2.5 h-2.5 text-black" />
            </div>
          )}
          {isExhausted && (
            <div className="absolute inset-0 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.55)' }}>
              <AlertCircle className="w-5 h-5" style={{ color: '#ef4444' }} />
            </div>
          )}
        </div>

        {/* Name + badges */}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm leading-snug" style={{ color: isUnavailable ? 'rgba(255,255,255,0.45)' : '#fff' }}>
            {isAr ? prize.name_ar : (prize.name_en || prize.name_ar)}
          </p>
          <div className="flex flex-wrap gap-1 mt-1">
            {/* Rarity */}
            <span className="text-[10px] px-1.5 py-0.5 rounded font-bold"
              style={{ background: `${rarityMeta.color}18`, color: rarityMeta.color }}>
              {isAr ? rarityMeta.label.ar : rarityMeta.label.en}
            </span>
            {/* Mode */}
            <span className="text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5"
              style={{ background: modeMeta.bg, color: modeMeta.color }}>
              <ModeIcon className="w-2.5 h-2.5" />
              {isAr ? modeMeta.label.ar : modeMeta.label.en}
            </span>
          </div>
        </div>

        {/* Value pill */}
        {prize.type === 'points' && prize.value && (
          <div className="flex-shrink-0 px-2 py-1 rounded-lg text-xs font-black"
            style={{ background: 'rgba(214,170,98,0.12)', color: '#D6AA62', border: '1px solid rgba(214,170,98,0.2)' }}>
            {prize.value}
            <span className="font-normal ms-0.5 text-[10px]">{isAr ? 'نقطة' : 'pts'}</span>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Stock */}
        {mode === 'LIMITED_STOCK' && stockCount !== null && stockCount !== undefined && (
          <div className="flex items-center gap-1 text-xs"
            style={{ color: stockCount <= 0 ? '#ef4444' : stockCount <= 3 ? '#f59e0b' : '#34d399' }}>
            <Package className="w-3 h-3" />
            {isAr ? `متبقي: ${stockCount}` : `Stock: ${stockCount}`}
          </div>
        )}
        {/* Winners */}
        {mode === 'LIMITED_WINNERS' && (
          <div className="flex items-center gap-1 text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
            <Users className="w-3 h-3" />
            {isAr ? `الفائزون: ${winnersCount}/${prize.max_winners ?? '∞'}` : `Winners: ${winnersCount}/${prize.max_winners ?? '∞'}`}
          </div>
        )}
        {/* Per-user limit */}
        {prize.max_wins_per_user && (
          <div className="flex items-center gap-1 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
            <Zap className="w-3 h-3" />
            {isAr ? `حد ${prize.max_wins_per_user} مرة` : `Max ${prize.max_wins_per_user}× per user`}
          </div>
        )}
        {/* Cooldown */}
        {prize.user_cooldown_days && (
          <div className="flex items-center gap-1 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
            <Clock className="w-3 h-3" />
            {isAr ? `انتظار ${prize.user_cooldown_days} يوم` : `${prize.user_cooldown_days}d cooldown`}
          </div>
        )}
        {/* Countdown */}
        {countdown && (
          <div className="flex items-center gap-1 text-xs ms-auto" style={{ color: '#60a5fa' }}>
            <Clock className="w-3 h-3" />
            {beforeSchedule ? (isAr ? 'يبدأ في' : 'Starts in') : (isAr ? 'ينتهي في' : 'Ends in')} {countdown}
          </div>
        )}
      </div>

      {/* Unlock progress bar */}
      {unlockProgress !== null && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px]" style={{ color: '#f59e0b' }}>
              {isAr ? 'التقدم نحو الفتح' : 'Community unlock progress'}
            </span>
            <span className="text-[10px] font-bold" style={{ color: '#f59e0b' }}>
              {state?.current_progress ?? 0} / {prize.unlock_target_value}
            </span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${unlockProgress}%`, background: 'linear-gradient(90deg,#f59e0b,#fbbf24)' }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main prizes page ─────────────────────────────────────────────────────────
interface Props {
  onBack?: () => void;
  onNavigate?: (page: string) => void;
}

export function WheelPrizesPage({ onBack, onNavigate }: Props) {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const [prizes, setPrizes] = useState<WheelPrize[]>([]);
  const [prizeStates, setPrizeStates] = useState<PrizeState[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  const load = useCallback(async () => {
    const [settingsRes, statesRes] = await Promise.all([
      supabase.from('wheel_game_settings').select('prizes').eq('active', true).maybeSingle(),
      supabase.rpc('get_wheel_prize_states'),
    ]);
    if (settingsRes.data?.prizes) setPrizes(settingsRes.data.prizes as WheelPrize[]);
    if (statesRes.data) setPrizeStates(statesRes.data as PrizeState[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime: refresh when admin updates prizes
  useEffect(() => {
    const ch = supabase.channel('wheel_prizes_user_sync')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'wheel_game_settings' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wheel_prize_states' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const FILTERS = [
    { key: 'all',     label: { ar: 'الكل',           en: 'All'          } },
    { key: 'points',  label: { ar: 'نقاط',            en: 'Points'       } },
    { key: 'service', label: { ar: 'خدمات',           en: 'Services'     } },
    { key: 'grand',   label: { ar: 'الجائزة الكبرى',  en: 'Grand'        } },
    { key: 'limited', label: { ar: 'محدود',           en: 'Limited'      } },
    { key: 'locked',  label: { ar: 'مقفل',            en: 'Locked'       } },
  ];

  const filtered = prizes.filter(p => {
    if (filter === 'all') return p.type !== 'miss';
    if (filter === 'points') return p.type === 'points';
    if (filter === 'service') return p.type === 'service';
    if (filter === 'grand') return p.type === 'grand';
    if (filter === 'limited') return p.availability_mode === 'LIMITED_STOCK' || p.availability_mode === 'LIMITED_WINNERS';
    if (filter === 'locked') return p.availability_mode === 'LOCKED_BY_GOAL';
    return true;
  });

  // Group by rarity
  const RARITY_ORDER = ['jackpot', 'legendary', 'epic', 'rare', 'uncommon', 'common'];
  const grouped = RARITY_ORDER.map(r => ({
    rarity: r,
    prizes: filtered.filter(p => rarityFor(p) === r),
  })).filter(g => g.prizes.length > 0);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        {onBack && (
          <button onClick={onBack}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
            <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
          </button>
        )}
        <div className="flex-1">
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>
            {isAr ? 'جوائز العجلة' : 'Wheel Prizes'}
          </h1>
          {!loading && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
              {filtered.length} {isAr ? 'جائزة متاحة' : 'prizes'}
            </p>
          )}
        </div>
        <button
          onClick={() => onNavigate?.('wheel')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
          style={{ background: 'rgba(214,170,98,0.1)', color: '#D6AA62', border: '1px solid rgba(214,170,98,0.2)' }}>
          <Gift className="w-3.5 h-3.5" />
          {isAr ? 'العب الآن' : 'Play Now'}
        </button>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all"
            style={{
              background: filter === f.key ? 'rgba(214,170,98,0.12)' : 'var(--card-2)',
              border: `1px solid ${filter === f.key ? 'rgba(214,170,98,0.25)' : 'var(--border)'}`,
              color: filter === f.key ? '#D6AA62' : 'var(--text-2)',
            }}>
            {isAr ? f.label.ar : f.label.en}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-transparent rounded-full animate-spin"
            style={{ borderTopColor: '#D6AA62' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <Gift className="w-10 h-10" style={{ color: 'rgba(255,255,255,0.1)' }} />
          <p className="text-sm" style={{ color: 'var(--text-3)' }}>
            {isAr ? 'لا توجد جوائز في هذا التصنيف' : 'No prizes in this category'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(group => {
            const meta = RARITY_META[group.rarity] ?? RARITY_META.common;
            return (
              <div key={group.rarity} className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${meta.color}40, transparent)` }} />
                  <span className="text-[11px] font-black px-2 py-0.5 rounded-full"
                    style={{ color: meta.color, background: `${meta.color}15`, border: `1px solid ${meta.color}25` }}>
                    {isAr ? meta.label.ar : meta.label.en}
                  </span>
                  <div className="h-px flex-1" style={{ background: `linear-gradient(270deg, ${meta.color}40, transparent)` }} />
                </div>
                <div className="grid gap-3">
                  {group.prizes.map(p => (
                    <PrizeCard
                      key={p.id}
                      prize={p}
                      state={prizeStates.find(s => s.prize_id === p.id)}
                      language={language}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
