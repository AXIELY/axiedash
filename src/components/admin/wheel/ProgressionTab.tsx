import { useState, useEffect } from 'react';
import { Save, Plus, Trash2, Flame, Zap, Shield, Star } from 'lucide-react';
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

const RARITY_COLOR: Record<string, string> = {
  common: '#94a3b8', uncommon: '#34d399', rare: '#60a5fa', epic: '#c084fc', legendary: '#fbbf24',
};

type SubTab = 'combo' | 'levels' | 'ranks' | 'badges';

interface Props { language: string; }

// ── Combo Sub-tab ─────────────────────────────────────────────────────────────
function ComboAdmin({ language }: { language: string }) {
  const [combos, setCombos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    supabase.from('combo_definitions').select('*').order('consecutive_wins').then(({ data }) => {
      setCombos(data ?? []);
      setLoading(false);
    });
  }, []);

  const save = async (combo: any) => {
    setSaving(true);
    try {
      if (combo.id) {
        await supabase.from('combo_definitions').update({
          name: combo.name, consecutive_wins: combo.consecutive_wins,
          multiplier: combo.multiplier, xp_reward: combo.xp_reward, enabled: combo.enabled,
        }).eq('id', combo.id);
      } else {
        await supabase.from('combo_definitions').insert({
          name: combo.name, consecutive_wins: combo.consecutive_wins,
          multiplier: combo.multiplier, xp_reward: combo.xp_reward, enabled: combo.enabled ?? true,
        });
      }
      const { data } = await supabase.from('combo_definitions').select('*').order('consecutive_wins');
      setCombos(data ?? []);
      setEditing(null);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } finally { setSaving(false); }
  };

  const del = async (id: string) => {
    if (!confirm(language === 'ar' ? 'حذف هذه المرحلة؟' : 'Delete this milestone?')) return;
    await supabase.from('combo_definitions').delete().eq('id', id);
    setCombos(c => c.filter(x => x.id !== id));
  };

  if (loading) return <div className="py-12 text-center text-white/30">{language === 'ar' ? 'جارٍ التحميل...' : 'Loading...'}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-black text-white">{language === 'ar' ? 'مراحل الكومبو' : 'Combo Milestones'}</h4>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {language === 'ar' ? 'تُطبَّق عند الفوز بعدد متتالٍ من السحبات' : 'Applied on consecutive wins'}
          </p>
        </div>
        <div className="flex gap-2">
          {success && <span className="text-xs font-bold text-green-400">✓ {language === 'ar' ? 'تم الحفظ' : 'Saved'}</span>}
          <button onClick={() => setEditing({ consecutive_wins: 3, multiplier: 1.2, xp_reward: 50, name: '', enabled: true })}
            className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm"
            style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}>
            <Plus className="w-4 h-4" /> {language === 'ar' ? 'إضافة مرحلة' : 'Add Milestone'}
          </button>
        </div>
      </div>

      {combos.map(combo => (
        <div key={combo.id} style={{ ...CARD, padding: '16px 20px' }}>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl flex-shrink-0"
              style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.25)' }}>
              {combo.consecutive_wins}
            </div>
            <div className="flex-1">
              <div className="font-bold text-white text-sm">{combo.name || `${combo.consecutive_wins} ${language === 'ar' ? 'انتصارات متتالية' : 'consecutive wins'}`}</div>
              <div className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {combo.multiplier}× {language === 'ar' ? 'مضاعف' : 'multiplier'} · +{combo.xp_reward} XP
              </div>
            </div>
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${combo.enabled ? 'bg-green-400' : 'bg-red-400'}`} />
            <button onClick={() => setEditing(combo)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-amber-500/15"
              style={{ color: '#fbbf24' }}><Save className="w-4 h-4" /></button>
            <button onClick={() => del(combo.id)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-500/15"
              style={{ color: '#f87171' }}><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>
      ))}

      {editing && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: 'rgba(8,6,18,0.98)', border: '1px solid rgba(214,170,98,0.2)' }}>
            <h4 className="font-black text-white text-lg mb-5">
              {editing.id ? (language === 'ar' ? 'تعديل المرحلة' : 'Edit Milestone') : (language === 'ar' ? 'مرحلة جديدة' : 'New Milestone')}
            </h4>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-white/50 mb-1 block">{language === 'ar' ? 'الاسم' : 'Name'}</label>
                <input style={INPUT} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="Hot Streak!" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-white/50 mb-1 block">{language === 'ar' ? 'الانتصارات' : 'Wins'}</label>
                  <input type="number" style={INPUT} value={editing.consecutive_wins} min={1}
                    onChange={e => setEditing({ ...editing, consecutive_wins: parseInt(e.target.value) || 1 })} />
                </div>
                <div>
                  <label className="text-xs font-bold text-white/50 mb-1 block">{language === 'ar' ? 'المضاعف' : 'Mult'}</label>
                  <input type="number" style={INPUT} value={editing.multiplier} step={0.1} min={1}
                    onChange={e => setEditing({ ...editing, multiplier: parseFloat(e.target.value) || 1 })} />
                </div>
                <div>
                  <label className="text-xs font-bold text-white/50 mb-1 block">XP</label>
                  <input type="number" style={INPUT} value={editing.xp_reward} min={0}
                    onChange={e => setEditing({ ...editing, xp_reward: parseInt(e.target.value) || 0 })} />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={editing.enabled} onChange={e => setEditing({ ...editing, enabled: e.target.checked })} />
                <span className="text-sm text-white">{language === 'ar' ? 'مفعّلة' : 'Enabled'}</span>
              </label>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => save(editing)} disabled={saving}
                className="flex-1 py-3 rounded-xl font-bold text-sm"
                style={{ background: 'linear-gradient(135deg, #d4a853, #b8882e)', color: '#0a0608' }}>
                {language === 'ar' ? 'حفظ' : 'Save'}
              </button>
              <button onClick={() => setEditing(null)}
                className="flex-1 py-3 rounded-xl font-bold text-sm"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>
                {language === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Levels Sub-tab ─────────────────────────────────────────────────────────────
function LevelsAdmin({ language }: { language: string }) {
  const [levels, setLevels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('level_definitions').select('*').order('level_number').then(({ data }) => {
      setLevels(data ?? []);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="py-12 text-center text-white/30">{language === 'ar' ? 'جارٍ التحميل...' : 'Loading...'}</div>;

  return (
    <div>
      <div className="mb-4">
        <h4 className="font-black text-white">{language === 'ar' ? 'مستويات اللاعبين' : 'Player Levels'}</h4>
        <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {language === 'ar' ? 'عرض للقراءة — التعديل عبر ترحيل قاعدة البيانات' : 'Read-only — edit via database migration'}
        </p>
      </div>
      <div className="overflow-x-auto rounded-2xl" style={{ border: '1px solid rgba(214,170,98,0.14)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: 'rgba(214,170,98,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {[language === 'ar' ? 'المستوى' : 'Level', 'XP', language === 'ar' ? 'العنوان' : 'Title', language === 'ar' ? 'نشط' : 'Active'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'start', color: 'rgba(255,255,255,0.5)', fontWeight: 700, fontSize: '11px', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {levels.map(lv => (
              <tr key={lv.id ?? lv.level_number} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '10px 14px' }}>
                  <span className="font-black text-white">{lv.level_number}</span>
                </td>
                <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: '#D6AA62' }}>
                  {(lv.required_xp ?? lv.xp_required ?? 0).toLocaleString()}
                </td>
                <td style={{ padding: '10px 14px', color: 'rgba(255,255,255,0.7)' }}>
                  {lv.title_en ?? lv.title ?? '—'}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <div className={`w-2 h-2 rounded-full ${lv.is_active !== false ? 'bg-green-400' : 'bg-red-400'}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Ranks Sub-tab ─────────────────────────────────────────────────────────────
function RanksAdmin({ language }: { language: string }) {
  const [ranks, setRanks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('rank_definitions').select('*').order('min_level').then(({ data }) => {
      setRanks(data ?? []);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="py-12 text-center text-white/30">{language === 'ar' ? 'جارٍ التحميل...' : 'Loading...'}</div>;

  return (
    <div>
      <div className="mb-4">
        <h4 className="font-black text-white">{language === 'ar' ? 'الرتب' : 'Ranks'}</h4>
        <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {language === 'ar' ? 'الرتب المحددة لكل نطاق مستويات' : 'Rank brackets by level range'}
        </p>
      </div>
      <div className="space-y-2">
        {ranks.map(rank => (
          <div key={rank.id ?? rank.rank_name} style={{ ...CARD, padding: '14px 18px' }}>
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm flex-shrink-0"
                style={{ background: `${rank.color ?? '#94a3b8'}18`, color: rank.color ?? '#94a3b8', border: `1px solid ${rank.color ?? '#94a3b8'}30` }}>
                {rank.icon ?? '★'}
              </div>
              <div className="flex-1">
                <div className="font-bold text-white">
                  {language === 'ar' ? (rank.rank_ar ?? rank.rank_name) : (rank.rank_en ?? rank.rank_name)}
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  {language === 'ar' ? `المستوى ${rank.min_level ?? '?'} – ${rank.max_level ?? '?'}` : `Level ${rank.min_level ?? '?'}–${rank.max_level ?? '?'}`}
                </div>
              </div>
              <div className={`w-2 h-2 rounded-full ${rank.is_active !== false ? 'bg-green-400' : 'bg-red-400'}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Badges Sub-tab ─────────────────────────────────────────────────────────────
function BadgesAdmin({ language }: { language: string }) {
  const [badges, setBadges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from('achievements').select('*').order('rarity').then(({ data }) => {
      setBadges(data ?? []);
      setLoading(false);
    });
  }, []);

  const toggleActive = async (badge: any) => {
    await supabase.from('achievements').update({ is_active: !badge.is_active }).eq('id', badge.id);
    setBadges(b => b.map(x => x.id === badge.id ? { ...x, is_active: !x.is_active } : x));
  };

  const save = async (badge: any) => {
    setSaving(true);
    try {
      if (badge.id) {
        await supabase.from('achievements').update({
          name: badge.name, name_en: badge.name_en, name_ar: badge.name_ar,
          description: badge.description, rarity: badge.rarity,
          is_secret: badge.is_secret, is_active: badge.is_active,
          xp_reward: badge.xp_reward, rule_type: badge.rule_type, rule_value: badge.rule_value,
        }).eq('id', badge.id);
      }
      const { data } = await supabase.from('achievements').select('*').order('rarity');
      setBadges(data ?? []);
      setEditing(null);
    } finally { setSaving(false); }
  };

  if (loading) return <div className="py-12 text-center text-white/30">{language === 'ar' ? 'جارٍ التحميل...' : 'Loading...'}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-black text-white">{language === 'ar' ? 'الشارات والإنجازات' : 'Badges & Achievements'}</h4>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {badges.filter(b => b.is_active).length} {language === 'ar' ? 'نشطة' : 'active'}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {badges.map(badge => {
          const rColor = RARITY_COLOR[badge.rarity ?? 'common'];
          return (
            <div key={badge.id} style={{ ...CARD, padding: '14px 18px' }}>
              <div className="flex items-center gap-3">
                <span className="text-2xl flex-shrink-0">{badge.icon ?? '🏅'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-white text-sm">
                      {language === 'ar' ? (badge.name_ar ?? badge.name) : (badge.name_en ?? badge.name)}
                    </span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase"
                      style={{ background: `${rColor}15`, color: rColor }}>
                      {badge.rarity}
                    </span>
                    {badge.is_secret && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                        style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>
                        {language === 'ar' ? 'سري' : 'SECRET'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    {badge.rule_type ?? '—'}{badge.rule_value ? ` · ${badge.rule_value}` : ''} · +{badge.xp_reward ?? 0} XP
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => toggleActive(badge)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${badge.is_active ? '' : 'opacity-50'}`}
                    style={{
                      background: badge.is_active ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.05)',
                      color: badge.is_active ? '#34d399' : 'rgba(255,255,255,0.4)',
                      border: badge.is_active ? '1px solid rgba(52,211,153,0.3)' : '1px solid rgba(255,255,255,0.1)',
                    }}>
                    {badge.is_active ? (language === 'ar' ? 'نشطة' : 'Active') : (language === 'ar' ? 'معطلة' : 'Disabled')}
                  </button>
                  <button onClick={() => setEditing({ ...badge })}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-amber-500/15"
                    style={{ color: '#fbbf24' }}>
                    <Save className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-lg rounded-2xl p-6 max-h-[90vh] overflow-y-auto" style={{ background: 'rgba(8,6,18,0.98)', border: '1px solid rgba(214,170,98,0.2)' }}>
            <h4 className="font-black text-white text-lg mb-5">{language === 'ar' ? 'تعديل الشارة' : 'Edit Badge'}</h4>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-white/50 mb-1 block">{language === 'ar' ? 'الاسم بالعربية' : 'Arabic Name'}</label>
                  <input style={INPUT} value={editing.name_ar ?? ''} onChange={e => setEditing({ ...editing, name_ar: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-bold text-white/50 mb-1 block">{language === 'ar' ? 'الاسم بالإنجليزية' : 'English Name'}</label>
                  <input style={INPUT} value={editing.name_en ?? ''} onChange={e => setEditing({ ...editing, name_en: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-white/50 mb-1 block">{language === 'ar' ? 'الوصف' : 'Description'}</label>
                <input style={INPUT} value={editing.description ?? ''} onChange={e => setEditing({ ...editing, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-white/50 mb-1 block">{language === 'ar' ? 'الندرة' : 'Rarity'}</label>
                  <select style={INPUT} value={editing.rarity ?? 'common'} onChange={e => setEditing({ ...editing, rarity: e.target.value })}>
                    {['common','uncommon','rare','epic','legendary'].map(r => <option key={r} value={r} style={{ background: '#0a0818' }}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-white/50 mb-1 block">XP {language === 'ar' ? 'مكافأة' : 'Reward'}</label>
                  <input type="number" style={INPUT} value={editing.xp_reward ?? 0} onChange={e => setEditing({ ...editing, xp_reward: parseInt(e.target.value) || 0 })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-white/50 mb-1 block">{language === 'ar' ? 'نوع القاعدة' : 'Rule Type'}</label>
                  <input style={INPUT} value={editing.rule_type ?? ''} onChange={e => setEditing({ ...editing, rule_type: e.target.value })} placeholder="spin_count" />
                </div>
                <div>
                  <label className="text-xs font-bold text-white/50 mb-1 block">{language === 'ar' ? 'قيمة القاعدة' : 'Rule Value'}</label>
                  <input type="number" style={INPUT} value={editing.rule_value ?? 0} onChange={e => setEditing({ ...editing, rule_value: parseInt(e.target.value) || 0 })} />
                </div>
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={editing.is_active ?? false} onChange={e => setEditing({ ...editing, is_active: e.target.checked })} />
                  <span className="text-sm text-white">{language === 'ar' ? 'نشطة' : 'Active'}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={editing.is_secret ?? false} onChange={e => setEditing({ ...editing, is_secret: e.target.checked })} />
                  <span className="text-sm text-white">{language === 'ar' ? 'سرية' : 'Secret'}</span>
                </label>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => save(editing)} disabled={saving}
                className="flex-1 py-3 rounded-xl font-bold text-sm"
                style={{ background: 'linear-gradient(135deg, #d4a853, #b8882e)', color: '#0a0608' }}>
                {language === 'ar' ? 'حفظ' : 'Save'}
              </button>
              <button onClick={() => setEditing(null)}
                className="flex-1 py-3 rounded-xl font-bold text-sm"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>
                {language === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function ProgressionTab({ language }: Props) {
  const [sub, setSub] = useState<SubTab>('combo');

  const subTabs: { id: SubTab; labelAr: string; labelEn: string; icon: typeof Flame }[] = [
    { id: 'combo',  labelAr: 'الكومبو',      labelEn: 'Combo',   icon: Flame },
    { id: 'levels', labelAr: 'المستويات',    labelEn: 'Levels',  icon: Zap },
    { id: 'ranks',  labelAr: 'الرتب',        labelEn: 'Ranks',   icon: Star },
    { id: 'badges', labelAr: 'الشارات',      labelEn: 'Badges',  icon: Shield },
  ];

  return (
    <div className="space-y-5">
      {/* Sub-tab navigation */}
      <div className="flex gap-1 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {subTabs.map(({ id, labelAr, labelEn, icon: Icon }) => (
          <button key={id} onClick={() => setSub(id)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-sm whitespace-nowrap flex-shrink-0 transition-all"
            style={sub === id
              ? { background: 'rgba(214,170,98,0.15)', color: '#D6AA62', border: '1px solid rgba(214,170,98,0.3)' }
              : { color: 'rgba(255,255,255,0.4)', border: '1px solid transparent' }}>
            <Icon className="w-4 h-4" />
            {language === 'ar' ? labelAr : labelEn}
          </button>
        ))}
      </div>

      {sub === 'combo'  && <ComboAdmin language={language} />}
      {sub === 'levels' && <LevelsAdmin language={language} />}
      {sub === 'ranks'  && <RanksAdmin language={language} />}
      {sub === 'badges' && <BadgesAdmin language={language} />}
    </div>
  );
}
