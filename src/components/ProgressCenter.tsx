import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { usePlayerBadges } from '../hooks/usePlayerBadges';
import {
  X, Zap, Star, Target, Flame, Trophy, ChevronRight,
  Gift, Crown, Shield, Lock
} from 'lucide-react';
import { DailyMissions } from './DailyMissions';

interface HomeState {
  flags: Record<string, boolean>;
  user: {
    username: string;
    avatar_url: string;
    points: number;
    coins: number;
    xp: number;
    level: number;
    rank: string;
  };
  progression: {
    xp: number;
    level: number;
    rank: string;
    rank_color: string;
    rank_icon: string;
    prev_level_xp: number;
    current_level_xp: number;
    next_level_xp: number;
    level_title_en: string;
    level_title_ar: string;
  };
  spin_state: {
    spins_today: number;
    free_daily_spins: number;
    free_spins_left: number;
    spin_cost_points: number;
    spin_credits: number;
  };
  streak: {
    current_streak: number;
    longest_streak: number;
    total_spins: number;
  };
  combo: {
    consecutive_wins: number;
    current_multiplier: number;
  };
  jackpot: {
    id: string;
    current_amount: number;
  } | null;
  active_events: unknown[];
}

type Tab = 'overview' | 'level' | 'combo' | 'badges' | 'missions';

interface ProgressCenterProps {
  onClose: () => void;
}

export function ProgressCenter({ onClose }: ProgressCenterProps) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const [homeState, setHomeState] = useState<HomeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchState();
  }, [user?.id]);

  const fetchState = async () => {
    try {
      const { data } = await supabase.rpc('get_game_home_state');
      if (data?.success) setHomeState(data as HomeState);
    } catch (err) {
      console.error('Error fetching home state:', err);
    } finally {
      setLoading(false);
    }
  };

  const tabs: { id: Tab; labelEn: string; labelAr: string; icon: typeof Zap }[] = [
    { id: 'overview', labelEn: 'Overview',  labelAr: 'نظرة عامة', icon: Star },
    { id: 'level',    labelEn: 'Level',     labelAr: 'المستوى',   icon: Zap },
    { id: 'combo',    labelEn: 'Combo',     labelAr: 'كومبو',     icon: Flame },
    { id: 'badges',   labelEn: 'Badges',    labelAr: 'الشارات',   icon: Shield },
    { id: 'missions', labelEn: 'Missions',  labelAr: 'المهام',    icon: Target },
  ];

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div
        className="w-full max-w-lg max-h-[92vh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, #13112a, #0d0b1e)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 -20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #8b5cf6, #d946ef)' }}
            >
              <Crown className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="font-black text-white text-base">
                {language === 'ar' ? 'مركز التقدم' : 'Progress Center'}
              </h2>
              <p className="text-white/40 text-xs">
                {language === 'ar' ? 'تتبع تقدمك ومكافآتك' : 'Track your progress & rewards'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div
          className="flex gap-1 px-4 pt-3 pb-0 flex-shrink-0 overflow-x-auto"
          style={{ scrollbarWidth: 'none' }}
        >
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all flex-shrink-0"
                style={isActive
                  ? { background: 'rgba(139,92,246,0.2)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)' }
                  : { color: 'rgba(255,255,255,0.35)', border: '1px solid transparent' }
                }
              >
                <Icon className="w-3.5 h-3.5" />
                {language === 'ar' ? tab.labelAr : tab.labelEn}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 rounded-full border-2 border-transparent animate-spin"
                style={{ borderTopColor: '#8b5cf6', borderRightColor: '#d946ef' }} />
            </div>
          ) : (
            <>
              {activeTab === 'overview' && homeState && <OverviewTab state={homeState} language={language} />}
              {activeTab === 'level'    && homeState && <LevelTab state={homeState} language={language} />}
              {activeTab === 'combo'    && homeState && <ComboTab state={homeState} language={language} />}
              {activeTab === 'badges'   && <BadgesTab language={language} />}
              {activeTab === 'missions' && <DailyMissions />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Overview Tab                                                          */
/* ------------------------------------------------------------------ */
function OverviewTab({ state, language }: { state: HomeState; language: string }) {
  const prog = state.progression;
  // XP within current level window (prev_level_xp → next_level_xp)
  // Fallback: if prev_level_xp not yet in RPC response, use current_level_xp as lower bound
  const levelMin = prog.prev_level_xp ?? prog.current_level_xp;
  const levelMax = prog.next_level_xp;
  const xpProgress = levelMax > levelMin
    ? Math.min(100, ((prog.xp - levelMin) / (levelMax - levelMin)) * 100)
    : 100;

  return (
    <div className="space-y-4">
      {/* Rank + Level card */}
      <div
        className="rounded-xl p-4"
        style={{
          background: `linear-gradient(135deg, ${prog.rank_color}20, rgba(0,0,0,0.3))`,
          border: `1px solid ${prog.rank_color}40`,
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-xs text-white/50 uppercase tracking-widest mb-1">
              {language === 'ar' ? 'الرتبة' : 'Rank'}
            </div>
            <div className="font-black text-xl" style={{ color: prog.rank_color }}>
              {prog.rank}
            </div>
            <div className="text-xs text-white/40">
              {language === 'ar' ? prog.level_title_ar : prog.level_title_en}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-white/50 uppercase tracking-widest mb-1">
              {language === 'ar' ? 'المستوى' : 'Level'}
            </div>
            <div className="font-black text-3xl text-white">{prog.level}</div>
          </div>
        </div>

        {/* XP bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-white/40">
            <span>{prog.xp.toLocaleString()} XP</span>
            <span>{levelMax.toLocaleString()} XP</span>
          </div>
          <div className="h-2.5 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${xpProgress}%`,
                background: `linear-gradient(90deg, ${prog.rank_color}cc, ${prog.rank_color})`,
                boxShadow: `0 0 8px ${prog.rank_color}80`,
              }}
            />
          </div>
          <div className="text-[11px] text-white/30 text-center">
            {Math.round(xpProgress)}% {language === 'ar' ? 'نحو المستوى التالي' : 'to next level'}
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: language === 'ar' ? 'النقاط' : 'Points', value: state.user.points.toLocaleString(), icon: Zap, color: '#22d3ee' },
          { label: language === 'ar' ? 'العملات' : 'Coins', value: state.user.coins.toLocaleString(), icon: Gift, color: '#fbbf24' },
          { label: language === 'ar' ? 'الدورات المجانية' : 'Free Spins', value: `${state.spin_state.free_spins_left}/${state.spin_state.free_daily_spins}`, icon: Star, color: '#34d399' },
          { label: language === 'ar' ? 'رصيد الدورات' : 'Spin Credits', value: state.spin_state.spin_credits.toString(), icon: Crown, color: '#a78bfa' },
        ].map(stat => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="rounded-xl p-3"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-3.5 h-3.5" style={{ color: stat.color }} />
                <span className="text-[11px] text-white/40">{stat.label}</span>
              </div>
              <div className="font-black text-lg" style={{ color: stat.color }}>{stat.value}</div>
            </div>
          );
        })}
      </div>

      {/* Combo state */}
      {state.combo.consecutive_wins > 0 && (
        <div
          className="rounded-xl p-4 flex items-center gap-3"
          style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.1), rgba(0,0,0,0.3))', border: '1px solid rgba(251,191,36,0.25)' }}
        >
          <Flame className="w-6 h-6 text-amber-400" />
          <div className="flex-1">
            <div className="font-bold text-white text-sm">
              {state.combo.consecutive_wins}× {language === 'ar' ? 'فوز متتالي' : 'Win Streak'}
            </div>
            <div className="text-xs text-white/40">
              {state.combo.current_multiplier}× {language === 'ar' ? 'مضاعف' : 'multiplier'}
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-white/20" />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Level Tab                                                             */
/* ------------------------------------------------------------------ */
const RANK_THRESHOLDS = [
  { rank: 'Bronze',   color: '#cd7f32', levels: '1–9'   },
  { rank: 'Silver',   color: '#94a3b8', levels: '10–19' },
  { rank: 'Gold',     color: '#fbbf24', levels: '20–29' },
  { rank: 'Platinum', color: '#22d3ee', levels: '30–39' },
  { rank: 'Diamond',  color: '#60a5fa', levels: '40–49' },
  { rank: 'Master',   color: '#c084fc', levels: '50'    },
];

function LevelTab({ state, language }: { state: HomeState; language: string }) {
  const prog = state.progression;
  const levelMin = prog.prev_level_xp ?? prog.current_level_xp;
  const levelMax = prog.next_level_xp;
  const xpProgress = levelMax > levelMin
    ? Math.min(100, ((prog.xp - levelMin) / (levelMax - levelMin)) * 100)
    : 100;
  const xpNeeded = Math.max(0, levelMax - prog.xp);

  return (
    <div className="space-y-5">
      {/* Level hero */}
      <div
        className="rounded-2xl p-5 text-center relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${prog.rank_color}18, rgba(0,0,0,0.5))`,
          border: `1px solid ${prog.rank_color}35`,
        }}
      >
        {/* Background level number */}
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
          style={{ fontSize: '120px', fontWeight: 900, color: `${prog.rank_color}08`, lineHeight: 1 }}
        >
          {prog.level}
        </div>

        <div className="relative z-10">
          <div className="text-xs text-white/40 uppercase tracking-widest mb-2">
            {language === 'ar' ? 'المستوى الحالي' : 'Current Level'}
          </div>
          <div className="font-black text-6xl text-white mb-1">{prog.level}</div>
          <div className="font-bold text-sm mb-4" style={{ color: prog.rank_color }}>
            {language === 'ar' ? prog.level_title_ar : prog.level_title_en}
          </div>

          {/* XP bar */}
          <div className="space-y-2">
            <div className="h-3 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${xpProgress}%`,
                  background: `linear-gradient(90deg, ${prog.rank_color}99, ${prog.rank_color})`,
                  boxShadow: `0 0 10px ${prog.rank_color}60`,
                }}
              />
            </div>
            <div className="flex justify-between text-xs text-white/40">
              <span>{prog.xp.toLocaleString()} XP</span>
              <span>{levelMax.toLocaleString()} XP</span>
            </div>
            {xpNeeded > 0 && (
              <div className="text-xs text-center" style={{ color: prog.rank_color }}>
                {xpNeeded.toLocaleString()} XP {language === 'ar' ? 'للمستوى التالي' : 'to next level'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Rank ladder */}
      <div>
        <div className="text-xs text-white/40 uppercase tracking-widest mb-3">
          {language === 'ar' ? 'سلّم الرتب' : 'Rank Ladder'}
        </div>
        <div className="space-y-2">
          {RANK_THRESHOLDS.map(r => {
            const isCurrent = prog.rank === r.rank;
            return (
              <div
                key={r.rank}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all"
                style={{
                  background: isCurrent ? `${r.color}18` : 'rgba(255,255,255,0.025)',
                  border: isCurrent ? `1px solid ${r.color}40` : '1px solid rgba(255,255,255,0.05)',
                }}
              >
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ background: r.color, boxShadow: isCurrent ? `0 0 8px ${r.color}80` : 'none' }}
                />
                <div className="flex-1 font-bold text-sm" style={{ color: isCurrent ? r.color : 'rgba(255,255,255,0.4)' }}>
                  {r.rank}
                </div>
                <div className="text-xs text-white/30">{language === 'ar' ? 'مستوى' : 'Lv.'} {r.levels}</div>
                {isCurrent && (
                  <div
                    className="text-[10px] font-black px-1.5 py-0.5 rounded uppercase"
                    style={{ background: `${r.color}30`, color: r.color }}
                  >
                    {language === 'ar' ? 'أنت هنا' : 'You'}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Combo Tab                                                             */
/* ------------------------------------------------------------------ */
const COMBO_MILESTONES = [
  { wins: 3,  label: { en: 'Hot Streak!',  ar: 'سلسلة ساخنة!' }, xp: 50,  mult: 1.2, color: '#f59e0b' },
  { wins: 5,  label: { en: 'On Fire!',     ar: 'ملتهب!'       }, xp: 100, mult: 1.5, color: '#ef4444' },
  { wins: 7,  label: { en: 'Unstoppable!', ar: 'لا يُوقف!'    }, xp: 200, mult: 2.0, color: '#ec4899' },
  { wins: 10, label: { en: 'LEGENDARY!',   ar: 'أسطوري!'      }, xp: 500, mult: 3.0, color: '#8b5cf6' },
];

function ComboTab({ state, language }: { state: HomeState; language: string }) {
  const { consecutive_wins, current_multiplier } = state.combo;
  const nextMilestone = COMBO_MILESTONES.find(m => m.wins > consecutive_wins);
  const progress = nextMilestone
    ? Math.min(100, (consecutive_wins / nextMilestone.wins) * 100)
    : 100;

  return (
    <div className="space-y-5">
      {/* Current combo hero */}
      <div
        className="rounded-2xl p-5 text-center"
        style={{
          background: consecutive_wins > 0
            ? 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(0,0,0,0.5))'
            : 'rgba(255,255,255,0.025)',
          border: consecutive_wins > 0
            ? '1px solid rgba(245,158,11,0.35)'
            : '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <Flame
          className="w-12 h-12 mx-auto mb-3"
          style={{
            color: consecutive_wins > 0 ? '#fbbf24' : 'rgba(255,255,255,0.15)',
            filter: consecutive_wins > 0 ? 'drop-shadow(0 0 12px rgba(251,191,36,0.6))' : 'none',
          }}
        />
        <div className="font-black text-5xl text-white mb-1">{consecutive_wins}</div>
        <div className="text-amber-400 font-bold text-sm uppercase tracking-wider mb-3">
          {language === 'ar' ? 'فوز متتالي' : 'Consecutive Wins'}
        </div>
        {current_multiplier > 1 && (
          <div
            className="inline-block px-3 py-1 rounded-full font-black text-sm"
            style={{ background: 'rgba(251,191,36,0.2)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.4)' }}
          >
            {current_multiplier}× {language === 'ar' ? 'مضاعف' : 'Multiplier'}
          </div>
        )}

        {/* Progress to next milestone */}
        {nextMilestone && (
          <div className="mt-4 space-y-1">
            <div className="flex justify-between text-xs text-white/40">
              <span>{consecutive_wins}</span>
              <span>{nextMilestone.wins} {language === 'ar' ? 'للمرحلة التالية' : 'for next milestone'}</span>
            </div>
            <div className="h-2 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progress}%`,
                  background: 'linear-gradient(90deg, #f59e0b, #fbbf24)',
                  boxShadow: '0 0 8px rgba(251,191,36,0.5)',
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Milestones list */}
      <div>
        <div className="text-xs text-white/40 uppercase tracking-widest mb-3">
          {language === 'ar' ? 'مراحل الكومبو' : 'Combo Milestones'}
        </div>
        <div className="space-y-2">
          {COMBO_MILESTONES.map(m => {
            const reached = consecutive_wins >= m.wins;
            return (
              <div
                key={m.wins}
                className="flex items-center gap-3 px-3 py-3 rounded-xl"
                style={{
                  background: reached ? `${m.color}15` : 'rgba(255,255,255,0.025)',
                  border: reached ? `1px solid ${m.color}35` : '1px solid rgba(255,255,255,0.05)',
                }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm flex-shrink-0"
                  style={{
                    background: reached ? `${m.color}25` : 'rgba(255,255,255,0.04)',
                    color: reached ? m.color : 'rgba(255,255,255,0.25)',
                  }}
                >
                  {m.wins}
                </div>
                <div className="flex-1">
                  <div className="font-bold text-sm" style={{ color: reached ? m.color : 'rgba(255,255,255,0.4)' }}>
                    {language === 'ar' ? m.label.ar : m.label.en}
                  </div>
                  <div className="text-xs text-white/30">
                    {m.mult}× {language === 'ar' ? 'مضاعف' : 'mult'} · +{m.xp} XP
                  </div>
                </div>
                {reached && (
                  <div className="text-[10px] font-black" style={{ color: m.color }}>
                    ✓
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Hint */}
      <div
        className="rounded-xl p-3 text-center"
        style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}
      >
        <p className="text-xs text-white/35">
          {language === 'ar'
            ? 'افوز باستمرار لتبني الكومبو. أي خسارة تعيد العداد إلى الصفر.'
            : 'Win consecutively to build your combo. Any loss resets the counter to zero.'}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Badges Tab                                                            */
/* ------------------------------------------------------------------ */
const RARITY_STYLE: Record<string, { color: string; glow: string; label: { en: string; ar: string } }> = {
  common:    { color: '#94a3b8', glow: 'rgba(148,163,184,0.3)', label: { en: 'Common',    ar: 'عادي'    } },
  uncommon:  { color: '#34d399', glow: 'rgba(52,211,153,0.3)',  label: { en: 'Uncommon',  ar: 'غير شائع' } },
  rare:      { color: '#60a5fa', glow: 'rgba(96,165,250,0.3)',  label: { en: 'Rare',      ar: 'نادر'    } },
  epic:      { color: '#c084fc', glow: 'rgba(192,132,252,0.3)', label: { en: 'Epic',      ar: 'ملحمي'   } },
  legendary: { color: '#fbbf24', glow: 'rgba(251,191,36,0.4)',  label: { en: 'Legendary', ar: 'أسطوري'  } },
};

function BadgesTab({ language }: { language: string }) {
  const { badges, loading, unlockedCount } = usePlayerBadges();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-8 h-8 rounded-full border-2 border-transparent animate-spin"
          style={{ borderTopColor: '#8b5cf6', borderRightColor: '#d946ef' }} />
      </div>
    );
  }

  const unlocked = badges.filter(b => b.unlocked);
  const locked   = badges.filter(b => !b.unlocked && !b.is_secret);

  return (
    <div className="space-y-5">
      {/* Progress summary */}
      <div
        className="rounded-xl p-4 flex items-center gap-4"
        style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}
      >
        <Shield className="w-8 h-8 flex-shrink-0" style={{ color: '#a78bfa' }} />
        <div className="flex-1">
          <div className="font-black text-white text-lg">{unlockedCount} / {badges.filter(b => !b.is_secret).length}</div>
          <div className="text-xs text-white/40">
            {language === 'ar' ? 'شارات مفتوحة' : 'Badges Unlocked'}
          </div>
        </div>
        <div className="text-right">
          <div className="font-black text-2xl" style={{ color: '#a78bfa' }}>
            {badges.filter(b => !b.is_secret).length > 0
              ? Math.round((unlockedCount / badges.filter(b => !b.is_secret).length) * 100)
              : 0}%
          </div>
          <div className="text-[11px] text-white/30">{language === 'ar' ? 'مكتمل' : 'complete'}</div>
        </div>
      </div>

      {/* Unlocked */}
      {unlocked.length > 0 && (
        <div>
          <div className="text-xs text-white/40 uppercase tracking-widest mb-3">
            {language === 'ar' ? 'المفتوحة' : 'Unlocked'} ({unlocked.length})
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {unlocked.map(badge => {
              const rs = RARITY_STYLE[badge.rarity] ?? RARITY_STYLE.common;
              return (
                <div
                  key={badge.id}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl text-center"
                  style={{
                    background: `${rs.color}12`,
                    border: `1px solid ${rs.color}30`,
                  }}
                >
                  <span className="text-2xl leading-none">{badge.icon}</span>
                  <div className="font-bold text-[11px] leading-tight" style={{ color: rs.color }}>
                    {language === 'ar' ? (badge.name_ar ?? badge.name) : (badge.name_en ?? badge.name)}
                  </div>
                  <div
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase"
                    style={{ background: `${rs.color}20`, color: rs.color }}
                  >
                    {language === 'ar' ? rs.label.ar : rs.label.en}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Locked */}
      {locked.length > 0 && (
        <div>
          <div className="text-xs text-white/40 uppercase tracking-widest mb-3">
            {language === 'ar' ? 'مقفلة' : 'Locked'} ({locked.length})
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {locked.map(badge => (
              <div
                key={badge.id}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl text-center"
                style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.05)' }}
                >
                  <Lock className="w-4 h-4 text-white/20" />
                </div>
                <div className="font-bold text-[11px] leading-tight text-white/30">
                  {language === 'ar' ? (badge.name_ar ?? badge.name) : (badge.name_en ?? badge.name)}
                </div>
                {badge.description && (
                  <div className="text-[9px] text-white/20 leading-tight">{badge.description}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {badges.length === 0 && (
        <div className="text-center py-12">
          <Shield className="w-12 h-12 mx-auto mb-3 opacity-15" style={{ color: '#f8ecda' }} />
          <p className="text-white/30 text-sm">
            {language === 'ar' ? 'لا توجد شارات بعد' : 'No badges yet'}
          </p>
        </div>
      )}
    </div>
  );
}
