import { useState, useEffect } from 'react';
import { Plus, Trash2, Play, Clock, Zap, Star, Crown } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

const CARD: React.CSSProperties = {
  background: 'rgba(10,8,24,0.7)',
  border: '1px solid rgba(214,170,98,0.14)',
  borderRadius: '18px',
  padding: '20px 24px',
};

const INPUT: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '10px',
  padding: '10px 14px',
  color: '#fff',
  width: '100%',
  outline: 'none',
  fontSize: '14px',
  height: '44px',
};

const EVENT_TYPES = ['lucky_hour', 'golden_wheel', 'double_xp', 'bonus_spins'] as const;
const TYPE_ICONS: Record<string, React.ReactNode> = {
  lucky_hour:   <Clock className="w-4 h-4" />,
  golden_wheel: <Star className="w-4 h-4" />,
  double_xp:    <Zap className="w-4 h-4" />,
  bonus_spins:  <Crown className="w-4 h-4" />,
};
const TYPE_COLOR: Record<string, string> = {
  lucky_hour: '#fbbf24', golden_wheel: '#fbbf24', double_xp: '#a78bfa', bonus_spins: '#22d3ee',
};
const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  active:   { bg: 'rgba(52,211,153,0.15)',  text: '#34d399' },
  upcoming: { bg: 'rgba(251,191,36,0.12)',  text: '#fbbf24' },
  ended:    { bg: 'rgba(255,255,255,0.05)', text: 'rgba(255,255,255,0.35)' },
};

const EMPTY_EVENT = {
  name_ar: '', name_en: '',
  description_ar: '', description_en: '',
  event_type: 'lucky_hour' as typeof EVENT_TYPES[number],
  starts_at: '',
  ends_at: '',
  is_published: false,
  config: {},
};

interface Props { language: string; }

export function EventsTab({ language }: Props) {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_EVENT });
  const [saving, setSaving] = useState(false);

  const fetchEvents = async () => {
    const { data } = await supabase
      .from('game_events')
      .select('*')
      .order('starts_at', { ascending: false })
      .limit(30);
    setEvents(data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchEvents(); }, []);

  const getStatus = (ev: any): string => {
    const now = Date.now();
    const start = new Date(ev.starts_at).getTime();
    const end = new Date(ev.ends_at).getTime();
    if (!ev.is_published) return 'draft';
    if (now < start) return 'upcoming';
    if (now > end) return 'ended';
    return 'active';
  };

  const handleCreate = async () => {
    if (!form.name_ar || !form.name_en || !form.starts_at || !form.ends_at) return;
    if (new Date(form.ends_at) <= new Date(form.starts_at)) {
      alert(language === 'ar' ? 'تاريخ النهاية يجب أن يكون بعد تاريخ البداية' : 'End must be after start');
      return;
    }
    setSaving(true);
    try {
      await supabase.from('game_events').insert({
        name_ar: form.name_ar, name_en: form.name_en,
        description_ar: form.description_ar, description_en: form.description_en,
        event_type: form.event_type,
        starts_at: form.starts_at, ends_at: form.ends_at,
        is_published: form.is_published,
        config: form.config,
      });
      await supabase.rpc('log_admin_action', {
        p_action_type: 'event_created', p_entity_type: 'game_event',
        p_change_summary: `إنشاء حدث: ${form.name_ar}`,
      }).then(() => {});
      await fetchEvents();
      setForm({ ...EMPTY_EVENT });
      setShowForm(false);
    } finally { setSaving(false); }
  };

  const togglePublish = async (ev: any) => {
    await supabase.from('game_events').update({ is_published: !ev.is_published }).eq('id', ev.id);
    await supabase.rpc('log_admin_action', {
      p_action_type: ev.is_published ? 'event_unpublished' : 'event_published',
      p_entity_type: 'game_event', p_entity_id: ev.id,
      p_change_summary: `${ev.is_published ? 'إيقاف' : 'نشر'} حدث: ${ev.name_ar}`,
    }).then(() => {});
    setEvents(prev => prev.map(e => e.id === ev.id ? { ...e, is_published: !e.is_published } : e));
  };

  const deleteEvent = async (ev: any) => {
    if (!confirm(language === 'ar' ? 'هل تريد حذف هذا الحدث؟' : 'Delete this event?')) return;
    await supabase.from('game_events').delete().eq('id', ev.id);
    setEvents(prev => prev.filter(e => e.id !== ev.id));
  };

  const fmtDate = (iso: string) => {
    try { return new Date(iso).toLocaleString(language === 'ar' ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch { return iso; }
  };

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <h3 className="font-black text-white text-base">
          {language === 'ar' ? 'أحداث العجلة' : 'Wheel Events'}
        </h3>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm"
          style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.3)' }}>
          <Plus className="w-4 h-4" />
          {language === 'ar' ? 'حدث جديد' : 'New Event'}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div style={CARD}>
          <h4 className="font-black text-white mb-4">{language === 'ar' ? 'إنشاء حدث جديد' : 'Create New Event'}</h4>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-white/50 mb-1 block">{language === 'ar' ? 'الاسم بالعربية' : 'Arabic Name'}</label>
                <input style={INPUT} value={form.name_ar} onChange={e => setForm({ ...form, name_ar: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-bold text-white/50 mb-1 block">{language === 'ar' ? 'الاسم بالإنجليزية' : 'English Name'}</label>
                <input style={INPUT} value={form.name_en} onChange={e => setForm({ ...form, name_en: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-white/50 mb-1 block">{language === 'ar' ? 'نوع الحدث' : 'Event Type'}</label>
              <select style={INPUT} value={form.event_type} onChange={e => setForm({ ...form, event_type: e.target.value as any })}>
                {EVENT_TYPES.map(t => <option key={t} value={t} style={{ background: '#0a0818' }}>{t}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-white/50 mb-1 block">{language === 'ar' ? 'تاريخ البداية' : 'Start Date'}</label>
                <input type="datetime-local" style={INPUT} value={form.starts_at}
                  onChange={e => setForm({ ...form, starts_at: e.target.value })}
                  className="[color-scheme:dark]" />
              </div>
              <div>
                <label className="text-xs font-bold text-white/50 mb-1 block">{language === 'ar' ? 'تاريخ النهاية' : 'End Date'}</label>
                <input type="datetime-local" style={INPUT} value={form.ends_at}
                  onChange={e => setForm({ ...form, ends_at: e.target.value })}
                  className="[color-scheme:dark]" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-white/50 mb-1 block">{language === 'ar' ? 'الوصف بالعربية' : 'Arabic Description'}</label>
                <input style={INPUT} value={form.description_ar} onChange={e => setForm({ ...form, description_ar: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-bold text-white/50 mb-1 block">{language === 'ar' ? 'الوصف بالإنجليزية' : 'English Description'}</label>
                <input style={INPUT} value={form.description_en} onChange={e => setForm({ ...form, description_en: e.target.value })} />
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_published} onChange={e => setForm({ ...form, is_published: e.target.checked })} />
              <span className="text-sm text-white">{language === 'ar' ? 'نشر الحدث فوراً' : 'Publish immediately'}</span>
            </label>
            <div className="flex gap-3">
              <button onClick={handleCreate} disabled={saving || !form.name_ar || !form.name_en || !form.starts_at || !form.ends_at}
                className="flex-1 py-3 rounded-xl font-bold text-sm disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, #d4a853, #b8882e)', color: '#0a0608' }}>
                {saving ? (language === 'ar' ? 'جارٍ الإنشاء...' : 'Creating...') : (language === 'ar' ? 'إنشاء الحدث' : 'Create Event')}
              </button>
              <button onClick={() => { setShowForm(false); setForm({ ...EMPTY_EVENT }); }}
                className="px-6 py-3 rounded-xl font-bold text-sm"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>
                {language === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Events list */}
      {loading ? (
        <div className="py-12 text-center"><div className="w-8 h-8 rounded-full border-2 border-transparent animate-spin mx-auto" style={{ borderTopColor: '#D6AA62' }} /></div>
      ) : events.length === 0 ? (
        <div className="py-16 text-center rounded-2xl" style={CARD}>
          <Play className="w-10 h-10 mx-auto mb-3 opacity-20 text-white" />
          <p style={{ color: 'rgba(255,255,255,0.3)' }}>{language === 'ar' ? 'لا توجد أحداث بعد' : 'No events yet'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map(ev => {
            const status = getStatus(ev);
            const sc = STATUS_COLOR[status] ?? STATUS_COLOR.ended;
            const tColor = TYPE_COLOR[ev.event_type] ?? '#D6AA62';

            return (
              <div key={ev.id} style={CARD}>
                <div className="flex items-start gap-4">
                  {/* Type icon */}
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: `${tColor}15`, color: tColor, border: `1px solid ${tColor}25` }}>
                    {TYPE_ICONS[ev.event_type] ?? <Play className="w-4 h-4" />}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-bold text-white text-sm">
                        {language === 'ar' ? ev.name_ar : ev.name_en}
                      </span>
                      <span className="text-[10px] font-black px-2 py-0.5 rounded uppercase"
                        style={{ background: sc.bg, color: sc.text }}>
                        {status === 'active' ? (language === 'ar' ? 'نشط' : 'LIVE')
                          : status === 'upcoming' ? (language === 'ar' ? 'قادم' : 'SOON')
                          : status === 'draft' ? (language === 'ar' ? 'مسودة' : 'DRAFT')
                          : (language === 'ar' ? 'انتهى' : 'ENDED')}
                      </span>
                    </div>
                    <div className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      {fmtDate(ev.starts_at)} → {fmtDate(ev.ends_at)}
                    </div>
                    {ev.description_ar && (
                      <p className="text-xs mt-1 truncate" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        {language === 'ar' ? ev.description_ar : ev.description_en}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => togglePublish(ev)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                      style={{
                        background: ev.is_published ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.06)',
                        color: ev.is_published ? '#34d399' : 'rgba(255,255,255,0.4)',
                        border: ev.is_published ? '1px solid rgba(52,211,153,0.3)' : '1px solid rgba(255,255,255,0.1)',
                      }}>
                      {ev.is_published ? (language === 'ar' ? 'منشور' : 'Published') : (language === 'ar' ? 'نشر' : 'Publish')}
                    </button>
                    <button onClick={() => deleteEvent(ev)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-500/15"
                      style={{ color: '#f87171' }}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
