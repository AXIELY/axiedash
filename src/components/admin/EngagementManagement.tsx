import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  Zap, Target, Flame, Trophy, Star, Clock, ToggleLeft, ToggleRight,
  Plus, Trash2, Save, RefreshCw, ChevronDown, ChevronUp,
} from 'lucide-react';

interface Flag {
  flag: string;
  enabled: boolean;
  description: string;
}

interface GameEvent {
  id: string;
  event_type: string;
  name_en: string;
  name_ar: string;
  description_en: string;
  description_ar: string;
  starts_at: string;
  ends_at: string;
  published: boolean;
  config: Record<string, unknown>;
}

interface JackpotRound {
  id: string;
  seed_amount: number;
  current_amount: number;
  contribution_pct: number;
  settled: boolean;
  winner_id: string | null;
  won_at: string | null;
  created_at: string;
}

const FLAG_ICONS: Record<string, typeof Zap> = {
  spin_v2: Zap,
  progression: Star,
  missions: Target,
  streak: Flame,
  badges: Trophy,
  combo: Zap,
  live_winners: Star,
  lucky_hour: Clock,
  golden_wheel: Star,
  jackpot: Trophy,
};

const FLAG_LABELS: Record<string, { en: string; ar: string }> = {
  spin_v2:      { en: 'Server Spin V2',    ar: 'الدوران الخادمي V2' },
  progression:  { en: 'XP Progression',   ar: 'نظام التقدم XP' },
  missions:     { en: 'Daily Missions',    ar: 'المهام اليومية' },
  streak:       { en: 'Spin Streaks',      ar: 'سلاسل الدوران' },
  badges:       { en: 'Badges',           ar: 'الشارات' },
  combo:        { en: 'Win Combos',        ar: 'تسلسل الفوز' },
  live_winners: { en: 'Live Winners Feed', ar: 'قائمة الفائزين' },
  lucky_hour:   { en: 'Lucky Hour Events', ar: 'ساعة الحظ' },
  golden_wheel: { en: 'Golden Wheel',      ar: 'العجلة الذهبية' },
  jackpot:      { en: 'Jackpot Pool',      ar: 'الجائزة الكبرى' },
};

type Section = 'flags' | 'events' | 'jackpot';

export function EngagementManagement() {
  const { language } = useLanguage();
  const [section, setSection] = useState<Section>('flags');
  const [flags, setFlags] = useState<Flag[]>([]);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [jackpot, setJackpot] = useState<JackpotRound | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [newEvent, setNewEvent] = useState<Partial<GameEvent>>({
    event_type: 'lucky_hour',
    name_en: '',
    name_ar: '',
    description_en: '',
    description_ar: '',
    starts_at: '',
    ends_at: '',
    published: false,
    config: {},
  });

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    const [flagsRes, eventsRes, jackpotRes] = await Promise.all([
      supabase.from('engagement_flags').select('*').order('flag'),
      supabase.from('game_events').select('*').order('starts_at', { ascending: false }),
      supabase.from('jackpot_rounds').select('*').eq('settled', false).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);

    setFlags((flagsRes.data || []) as Flag[]);
    setEvents((eventsRes.data || []) as GameEvent[]);
    setJackpot(jackpotRes.data as JackpotRound | null);
    setLoading(false);
  };

  const toggleFlag = async (flag: Flag) => {
    setSaving(flag.flag);
    const { error } = await supabase
      .from('engagement_flags')
      .update({ enabled: !flag.enabled, updated_at: new Date().toISOString() })
      .eq('flag', flag.flag);

    if (!error) {
      setFlags(prev => prev.map(f => f.flag === flag.flag ? { ...f, enabled: !f.enabled } : f));
    }
    setSaving(null);
  };

  const createEvent = async () => {
    if (!newEvent.name_en || !newEvent.starts_at || !newEvent.ends_at) return;
    setSaving('new-event');

    const { error } = await supabase.from('game_events').insert({
      event_type: newEvent.event_type,
      name_en: newEvent.name_en,
      name_ar: newEvent.name_ar || newEvent.name_en,
      description_en: newEvent.description_en || '',
      description_ar: newEvent.description_ar || '',
      starts_at: newEvent.starts_at,
      ends_at: newEvent.ends_at,
      published: newEvent.published ?? false,
      config: newEvent.config || {},
    });

    if (!error) {
      setShowNewEvent(false);
      setNewEvent({ event_type: 'lucky_hour', name_en: '', name_ar: '', description_en: '', description_ar: '', starts_at: '', ends_at: '', published: false, config: {} });
      await fetchAll();
    }
    setSaving(null);
  };

  const toggleEventPublished = async (event: GameEvent) => {
    setSaving(event.id);
    await supabase.from('game_events').update({ published: !event.published }).eq('id', event.id);
    setEvents(prev => prev.map(e => e.id === event.id ? { ...e, published: !e.published } : e));
    setSaving(null);
  };

  const deleteEvent = async (id: string) => {
    if (!confirm(language === 'ar' ? 'هل تريد حذف هذا الحدث؟' : 'Delete this event?')) return;
    await supabase.from('game_events').delete().eq('id', id);
    setEvents(prev => prev.filter(e => e.id !== id));
  };

  const sections: { id: Section; labelEn: string; labelAr: string; icon: typeof Zap }[] = [
    { id: 'flags',   labelEn: 'Feature Flags', labelAr: 'الإعدادات',      icon: ToggleRight },
    { id: 'events',  labelEn: 'Events',        labelAr: 'الأحداث',        icon: Clock },
    { id: 'jackpot', labelEn: 'Jackpot',       labelAr: 'الجائزة الكبرى', icon: Trophy },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 rounded-full border-2 border-transparent animate-spin"
          style={{ borderTopColor: '#8b5cf6', borderRightColor: '#d946ef' }} />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="section-title">{language === 'ar' ? 'إدارة التفاعل' : 'Engagement Management'}</h2>
          <p className="text-white/40 text-sm mt-1">
            {language === 'ar' ? 'تحكم في نظام التفاعل والأحداث والمكافآت' : 'Control engagement systems, events, and rewards'}
          </p>
        </div>
        <button
          onClick={fetchAll}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Section tabs */}
      <div className="flex gap-2">
        {sections.map(s => {
          const Icon = s.icon;
          const isActive = section === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all"
              style={isActive
                ? { background: 'rgba(139,92,246,0.2)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)' }
                : { color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.06)' }
              }
            >
              <Icon className="w-4 h-4" />
              {language === 'ar' ? s.labelAr : s.labelEn}
            </button>
          );
        })}
      </div>

      {/* ── Feature Flags ── */}
      {section === 'flags' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {flags.map(flag => {
            const Icon = FLAG_ICONS[flag.flag] ?? Zap;
            const label = FLAG_LABELS[flag.flag];
            const isSaving = saving === flag.flag;

            return (
              <div
                key={flag.flag}
                className="glass-card p-4 flex items-center gap-4"
                style={{ border: flag.enabled ? '1px solid rgba(139,92,246,0.25)' : undefined }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: flag.enabled ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)',
                  }}
                >
                  <Icon className="w-5 h-5" style={{ color: flag.enabled ? '#a78bfa' : 'rgba(255,255,255,0.3)' }} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-white">
                    {language === 'ar' ? label?.ar : label?.en}
                  </div>
                  <div className="text-xs text-white/30 font-mono mt-0.5">{flag.flag}</div>
                </div>

                <button
                  onClick={() => toggleFlag(flag)}
                  disabled={isSaving}
                  className="flex-shrink-0 transition-opacity disabled:opacity-50"
                >
                  {flag.enabled
                    ? <ToggleRight className="w-8 h-8 text-purple-400" />
                    : <ToggleLeft className="w-8 h-8 text-white/20" />
                  }
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Events ── */}
      {section === 'events' && (
        <div className="space-y-4">
          <button
            onClick={() => setShowNewEvent(!showNewEvent)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all"
            style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.25)' }}
          >
            <Plus className="w-4 h-4" />
            {language === 'ar' ? 'إضافة حدث' : 'New Event'}
            {showNewEvent ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showNewEvent && (
            <div className="glass-card p-5 space-y-4">
              <h3 className="font-bold text-white">{language === 'ar' ? 'حدث جديد' : 'New Event'}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-white/40 mb-1 block">{language === 'ar' ? 'نوع الحدث' : 'Event Type'}</label>
                  <select
                    value={newEvent.event_type}
                    onChange={e => setNewEvent(prev => ({ ...prev, event_type: e.target.value }))}
                    className="w-full rounded-xl px-3 py-2 text-sm text-white"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                  >
                    <option value="lucky_hour">Lucky Hour</option>
                    <option value="golden_wheel">Golden Wheel</option>
                    <option value="double_xp">Double XP</option>
                    <option value="bonus_spins">Bonus Spins</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-white/40 mb-1 block">Name (EN)</label>
                  <input
                    type="text"
                    value={newEvent.name_en}
                    onChange={e => setNewEvent(prev => ({ ...prev, name_en: e.target.value }))}
                    className="w-full rounded-xl px-3 py-2 text-sm text-white"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                    placeholder="Event name"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/40 mb-1 block">Name (AR)</label>
                  <input
                    type="text"
                    value={newEvent.name_ar}
                    onChange={e => setNewEvent(prev => ({ ...prev, name_ar: e.target.value }))}
                    className="w-full rounded-xl px-3 py-2 text-sm text-white"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                    placeholder="اسم الحدث"
                    dir="rtl"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/40 mb-1 block">Starts At</label>
                  <input
                    type="datetime-local"
                    value={newEvent.starts_at}
                    onChange={e => setNewEvent(prev => ({ ...prev, starts_at: e.target.value }))}
                    className="w-full rounded-xl px-3 py-2 text-sm text-white"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                  />
                </div>
                <div>
                  <label className="text-xs text-white/40 mb-1 block">Ends At</label>
                  <input
                    type="datetime-local"
                    value={newEvent.ends_at}
                    onChange={e => setNewEvent(prev => ({ ...prev, ends_at: e.target.value }))}
                    className="w-full rounded-xl px-3 py-2 text-sm text-white"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-xs text-white/40">{language === 'ar' ? 'منشور' : 'Published'}</label>
                  <button
                    onClick={() => setNewEvent(prev => ({ ...prev, published: !prev.published }))}
                    className="transition-colors"
                  >
                    {newEvent.published
                      ? <ToggleRight className="w-7 h-7 text-purple-400" />
                      : <ToggleLeft className="w-7 h-7 text-white/20" />
                    }
                  </button>
                </div>
              </div>
              <button
                onClick={createEvent}
                disabled={saving === 'new-event'}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm disabled:opacity-50 transition-all"
                style={{ background: 'linear-gradient(135deg, #8b5cf6, #d946ef)', color: 'white' }}
              >
                <Save className="w-4 h-4" />
                {language === 'ar' ? 'حفظ' : 'Save Event'}
              </button>
            </div>
          )}

          {events.length === 0 && (
            <div className="glass-card p-10 text-center text-white/30">
              <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>{language === 'ar' ? 'لا توجد أحداث' : 'No events yet'}</p>
            </div>
          )}

          {events.map(event => {
            const now = new Date();
            const start = new Date(event.starts_at);
            const end = new Date(event.ends_at);
            const status = now < start ? 'upcoming' : now <= end ? 'active' : 'ended';
            const statusColors = { upcoming: '#22d3ee', active: '#34d399', ended: 'rgba(255,255,255,0.2)' };

            return (
              <div
                key={event.id}
                className="glass-card p-4"
                style={{ opacity: status === 'ended' ? 0.6 : 1 }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-white">{event.name_en}</span>
                      <span
                        className="text-[10px] font-black px-1.5 py-0.5 rounded uppercase"
                        style={{ color: statusColors[status], border: `1px solid ${statusColors[status]}40` }}
                      >
                        {status}
                      </span>
                      {event.published && (
                        <span className="text-[10px] font-bold text-green-400">PUBLISHED</span>
                      )}
                    </div>
                    <div className="text-xs text-white/40 font-mono">
                      {new Date(event.starts_at).toLocaleString()} → {new Date(event.ends_at).toLocaleString()}
                    </div>
                    <div className="text-xs text-purple-400 mt-0.5">{event.event_type}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => toggleEventPublished(event)}
                      disabled={saving === event.id}
                      className="transition-opacity disabled:opacity-50"
                      title={event.published ? 'Unpublish' : 'Publish'}
                    >
                      {event.published
                        ? <ToggleRight className="w-7 h-7 text-green-400" />
                        : <ToggleLeft className="w-7 h-7 text-white/20" />
                      }
                    </button>
                    <button
                      onClick={() => deleteEvent(event.id)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-red-400/40 hover:text-red-400 hover:bg-red-400/10 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Jackpot ── */}
      {section === 'jackpot' && (
        <div className="space-y-4">
          {jackpot ? (
            <>
              <div
                className="glass-card p-6 text-center"
                style={{ border: '1px solid rgba(251,191,36,0.3)', background: 'linear-gradient(135deg, rgba(251,191,36,0.08), rgba(0,0,0,0.4))' }}
              >
                <Trophy className="w-12 h-12 text-amber-400 mx-auto mb-3" style={{ filter: 'drop-shadow(0 0 10px rgba(251,191,36,0.5))' }} />
                <div className="text-white/50 text-sm uppercase tracking-widest mb-2">
                  {language === 'ar' ? 'الجائزة الكبرى الحالية' : 'Active Jackpot Pool'}
                </div>
                <div className="font-black text-5xl text-amber-400 mb-1">
                  {jackpot.current_amount.toLocaleString()}
                </div>
                <div className="text-amber-400/60 text-sm">{language === 'ar' ? 'نقطة' : 'points'}</div>
              </div>

              <div className="glass-card p-4 space-y-3">
                <h3 className="font-bold text-white text-sm">{language === 'ar' ? 'تفاصيل الجولة' : 'Round Details'}</h3>
                {[
                  { label: language === 'ar' ? 'مبلغ البذر' : 'Seed Amount', value: jackpot.seed_amount.toLocaleString() },
                  { label: language === 'ar' ? 'نسبة المساهمة' : 'Contribution %', value: `${(jackpot.contribution_pct * 100).toFixed(1)}%` },
                  { label: 'ID', value: jackpot.id.slice(0, 8) + '…' },
                  { label: language === 'ar' ? 'بدأ في' : 'Created', value: new Date(jackpot.created_at).toLocaleDateString() },
                ].map(row => (
                  <div key={row.label} className="flex justify-between text-sm">
                    <span className="text-white/40">{row.label}</span>
                    <span className="text-white font-bold">{row.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="glass-card p-10 text-center text-white/30">
              <Trophy className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>{language === 'ar' ? 'لا توجد جولة جائزة كبرى نشطة' : 'No active jackpot round'}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
