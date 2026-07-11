import { useState, useEffect } from 'react';
import { Plus, Star, Trash2 } from 'lucide-react';
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

const EMPTY_FORM = {
  name_ar: '', name_en: '',
  description_ar: '', description_en: '',
  event_type: 'golden_wheel',
  starts_at: '', ends_at: '',
  is_published: false,
  config: { golden_mode: true, eligibility: 'ALL_USERS', spin_cost: 'FREE_EVENT_CREDIT', max_spins_per_user: 3 },
};

interface Props { language: string; }

export function GoldenWheelTab({ language }: Props) {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const fetchEvents = async () => {
    const { data } = await supabase.from('game_events')
      .select('*').eq('event_type', 'golden_wheel')
      .order('starts_at', { ascending: false }).limit(20);
    setEvents(data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchEvents(); }, []);

  const getStatus = (ev: any) => {
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
        event_type: 'golden_wheel',
        starts_at: form.starts_at, ends_at: form.ends_at,
        is_published: form.is_published,
        config: form.config,
      });
      await supabase.rpc('log_admin_action', {
        p_action_type: 'golden_event_created', p_entity_type: 'game_event',
        p_change_summary: `إنشاء حدث Golden Wheel: ${form.name_ar}`,
      }).then(() => {});
      await fetchEvents();
      setForm({ ...EMPTY_FORM });
      setShowForm(false);
    } finally { setSaving(false); }
  };

  const togglePublish = async (ev: any) => {
    await supabase.from('game_events').update({ is_published: !ev.is_published }).eq('id', ev.id);
    setEvents(prev => prev.map(e => e.id === ev.id ? { ...e, is_published: !e.is_published } : e));
  };

  const deleteEvent = async (ev: any) => {
    if (!confirm(language === 'ar' ? 'حذف هذا الحدث؟' : 'Delete this event?')) return;
    await supabase.from('game_events').delete().eq('id', ev.id);
    setEvents(prev => prev.filter(e => e.id !== ev.id));
  };

  const fmtDate = (iso: string) => {
    try { return new Date(iso).toLocaleString(language === 'ar' ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch { return iso; }
  };

  const STATUS_STYLE: Record<string, { bg: string; text: string; label: { ar: string; en: string } }> = {
    active:   { bg: 'rgba(251,191,36,0.2)',  text: '#fbbf24', label: { ar: 'نشط',    en: 'LIVE'   } },
    upcoming: { bg: 'rgba(214,170,98,0.12)', text: '#D6AA62', label: { ar: 'قادم',   en: 'SOON'   } },
    draft:    { bg: 'rgba(255,255,255,0.05)',text: 'rgba(255,255,255,0.4)', label: { ar: 'مسودة', en: 'DRAFT' } },
    ended:    { bg: 'rgba(255,255,255,0.03)',text: 'rgba(255,255,255,0.25)', label: { ar: 'انتهى', en: 'ENDED' } },
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 rounded-2xl"
        style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.1), rgba(0,0,0,0.4))', border: '1px solid rgba(251,191,36,0.25)' }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(251,191,36,0.2)', border: '1px solid rgba(251,191,36,0.35)' }}>
          <Star className="w-5 h-5 text-yellow-400" />
        </div>
        <div>
          <h3 className="font-black text-white text-base">Golden Wheel</h3>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {language === 'ar'
              ? 'حدث خاص يستخدم نفس محرك العجلة مع ثيم ذهبي'
              : 'Special event using the same wheel engine with a golden theme'}
          </p>
        </div>
        <button onClick={() => setShowForm(true)} className="ml-auto flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm"
          style={{ background: 'rgba(251,191,36,0.2)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.35)' }}>
          <Plus className="w-4 h-4" />
          {language === 'ar' ? 'حدث جديد' : 'New Event'}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div style={CARD}>
          <h4 className="font-black text-yellow-400 mb-4">✦ {language === 'ar' ? 'إنشاء حدث Golden Wheel' : 'Create Golden Wheel Event'}</h4>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-white/50 mb-1 block">{language === 'ar' ? 'الاسم بالعربية' : 'Arabic Name'}</label>
                <input style={INPUT} value={form.name_ar} onChange={e => setForm({ ...form, name_ar: e.target.value })} placeholder="عجلة الذهب" />
              </div>
              <div>
                <label className="text-xs font-bold text-white/50 mb-1 block">{language === 'ar' ? 'الاسم بالإنجليزية' : 'English Name'}</label>
                <input style={INPUT} value={form.name_en} onChange={e => setForm({ ...form, name_en: e.target.value })} placeholder="Golden Wheel Weekend" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-white/50 mb-1 block">{language === 'ar' ? 'تاريخ البداية' : 'Start'}</label>
                <input type="datetime-local" style={INPUT} value={form.starts_at}
                  onChange={e => setForm({ ...form, starts_at: e.target.value })}
                  className="[color-scheme:dark]" />
              </div>
              <div>
                <label className="text-xs font-bold text-white/50 mb-1 block">{language === 'ar' ? 'تاريخ النهاية' : 'End'}</label>
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-white/50 mb-1 block">{language === 'ar' ? 'الأهلية' : 'Eligibility'}</label>
                <select style={INPUT} value={form.config.eligibility}
                  onChange={e => setForm({ ...form, config: { ...form.config, eligibility: e.target.value } })}>
                  <option value="ALL_USERS" style={{ background: '#0a0818' }}>{language === 'ar' ? 'جميع المستخدمين' : 'All Users'}</option>
                  <option value="MIN_LEVEL_10" style={{ background: '#0a0818' }}>{language === 'ar' ? 'مستوى 10+' : 'Level 10+'}</option>
                  <option value="MIN_LEVEL_25" style={{ background: '#0a0818' }}>{language === 'ar' ? 'مستوى 25+' : 'Level 25+'}</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-white/50 mb-1 block">{language === 'ar' ? 'حد السحبات للمستخدم' : 'Max Spins/User'}</label>
                <input type="number" style={INPUT} min={1} max={50} value={form.config.max_spins_per_user}
                  onChange={e => setForm({ ...form, config: { ...form.config, max_spins_per_user: parseInt(e.target.value) || 1 } })} />
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_published} onChange={e => setForm({ ...form, is_published: e.target.checked })} />
              <span className="text-sm text-white">{language === 'ar' ? 'نشر الحدث فوراً' : 'Publish immediately'}</span>
            </label>
            <div className="flex gap-3">
              <button onClick={handleCreate} disabled={saving || !form.name_ar || !form.name_en || !form.starts_at || !form.ends_at}
                className="flex-1 py-3 rounded-xl font-bold text-sm disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, #fbbf24, #d97706)', color: '#0a0608' }}>
                {saving ? (language === 'ar' ? 'جارٍ الإنشاء...' : 'Creating...') : (language === 'ar' ? '✦ إنشاء الحدث' : '✦ Create Event')}
              </button>
              <button onClick={() => { setShowForm(false); setForm({ ...EMPTY_FORM }); }}
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
        <div className="py-12 text-center"><div className="w-8 h-8 rounded-full border-2 border-transparent animate-spin mx-auto" style={{ borderTopColor: '#fbbf24' }} /></div>
      ) : events.length === 0 ? (
        <div className="py-16 text-center rounded-2xl" style={CARD}>
          <Star className="w-12 h-12 mx-auto mb-3 opacity-20 text-yellow-400" />
          <p style={{ color: 'rgba(255,255,255,0.3)' }}>{language === 'ar' ? 'لا توجد أحداث Golden Wheel بعد' : 'No Golden Wheel events yet'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map(ev => {
            const status = getStatus(ev);
            const ss = STATUS_STYLE[status] ?? STATUS_STYLE.ended;
            return (
              <div key={ev.id} className="relative overflow-hidden rounded-2xl"
                style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.08), rgba(10,8,24,0.9))', border: '1px solid rgba(251,191,36,0.2)' }}>
                <div className="p-5">
                  <div className="flex items-start gap-4">
                    <Star className="w-6 h-6 flex-shrink-0 mt-0.5" style={{ color: '#fbbf24' }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-black text-white">{language === 'ar' ? ev.name_ar : ev.name_en}</span>
                        <span className="text-[10px] font-black px-2 py-0.5 rounded uppercase"
                          style={{ background: ss.bg, color: ss.text }}>
                          {language === 'ar' ? ss.label.ar : ss.label.en}
                        </span>
                      </div>
                      <div className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                        {fmtDate(ev.starts_at)} → {fmtDate(ev.ends_at)}
                      </div>
                      {ev.config?.eligibility && (
                        <div className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
                          {language === 'ar' ? 'الأهلية:' : 'Eligibility:'} {ev.config.eligibility} ·{' '}
                          {language === 'ar' ? 'الحد:' : 'Max:'} {ev.config.max_spins_per_user} {language === 'ar' ? 'سحبة' : 'spins'}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => togglePublish(ev)}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold"
                        style={{
                          background: ev.is_published ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.06)',
                          color: ev.is_published ? '#fbbf24' : 'rgba(255,255,255,0.4)',
                          border: ev.is_published ? '1px solid rgba(251,191,36,0.35)' : '1px solid rgba(255,255,255,0.1)',
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
