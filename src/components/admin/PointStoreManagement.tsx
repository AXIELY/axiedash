import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useLanguage } from '../../contexts/LanguageContext';
import { Package, Tag, Ticket, Settings2, Plus, CreditCard as Edit2, Archive, Copy, Loader2, RefreshCw, Check, X, AlertCircle, Trash2, Users, ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface StorePackage {
  id: string;
  package_id: string;
  name_ar: string;
  name_en: string;
  description_ar: string;
  description_en: string;
  points: number;
  bonus_points: number;
  total_points: number;
  price_lyd: number;
  payment_methods: string[];
  badge_type: string;
  lifecycle_status: string;
  starts_at: string | null;
  ends_at: string | null;
  featured: boolean;
  active: boolean;
  order_index: number;
}

interface Promotion {
  id: string;
  name_ar: string;
  name_en: string;
  description_ar: string;
  description_en: string;
  discount_type: string;
  discount_value: number;
  target_package_ids: string[] | null;
  priority: number;
  usage_limit: number | null;
  used_count: number;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
}

interface Coupon {
  id: string;
  code: string;
  description_ar: string;
  description_en: string;
  discount_type: string;
  discount_value: number;
  stacking_policy: string;
  target_package_ids: string[] | null;
  audience_type: string;
  allowed_user_ids: string[] | null;
  usage_limit_per_user: number;
  total_usage_limit: number | null;
  used_count: number;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
}

type Tab = 'packages' | 'promotions' | 'coupons' | 'settings';

const BADGE_OPTIONS = ['NONE','POPULAR','BEST_VALUE','LIMITED','NEW','EXCLUSIVE'];
const LIFECYCLE_OPTIONS = ['ACTIVE','INACTIVE','ARCHIVED'];
const DISCOUNT_TYPES = ['BONUS_POINTS_PERCENT','BONUS_POINTS_FIXED','PRICE_DISCOUNT_PERCENT','PRICE_DISCOUNT_FIXED'];
const STACKING_OPTIONS = ['COUPON_OVERRIDES_PROMOTION','STACK_WITH_PROMOTION'];

// ─── Helpers ────────────────────────────────────────────────────────────────

function BadgePill({ badge }: { badge: string }) {
  if (badge === 'NONE') return null;
  const map: Record<string, string> = {
    POPULAR: 'bg-amber-500/20 text-amber-300',
    BEST_VALUE: 'bg-emerald-500/20 text-emerald-300',
    LIMITED: 'bg-red-500/20 text-red-300',
    NEW: 'bg-blue-500/20 text-blue-300',
    EXCLUSIVE: 'bg-purple-500/20 text-purple-300',
  };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${map[badge] || 'bg-white/10 text-white/60'}`}>
      {badge}
    </span>
  );
}

function LifecyclePill({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE: 'bg-emerald-500/20 text-emerald-300',
    INACTIVE: 'bg-white/10 text-white/40',
    ARCHIVED: 'bg-red-500/10 text-red-400',
  };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${map[status] || 'bg-white/10 text-white/40'}`}>
      {status}
    </span>
  );
}

function discountLabel(type: string, value: number) {
  switch (type) {
    case 'BONUS_POINTS_PERCENT': return `+${value}% bonus pts`;
    case 'BONUS_POINTS_FIXED':   return `+${value} bonus pts`;
    case 'PRICE_DISCOUNT_PERCENT': return `-${value}% price`;
    case 'PRICE_DISCOUNT_FIXED':   return `-${value} LYD`;
    default: return `${value}`;
  }
}

// ─── Main Component ──────────────────────────────────────────────────────────

export const PointStoreManagement = () => {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [tab, setTab] = useState<Tab>('packages');

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'packages',   label: ar ? 'الباقات'  : 'Packages',   icon: Package },
    { id: 'promotions', label: ar ? 'العروض'   : 'Promotions', icon: Tag },
    { id: 'coupons',    label: ar ? 'الكوبونات': 'Coupons',     icon: Ticket },
    { id: 'settings',   label: ar ? 'الإعدادات': 'Settings',    icon: Settings2 },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="section-title">{ar ? 'متجر النقاط' : 'Point Store'}</h2>
        <p className="text-white/40 text-sm mt-1">
          {ar ? 'إدارة الباقات والعروض والكوبونات' : 'Manage packages, promotions and coupons'}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/10">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold transition-colors relative ${
              tab === id ? 'text-white' : 'text-white/40 hover:text-white/70'
            }`}
          >
            {tab === id && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400 rounded-full" />}
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'packages'   && <PackagesTab ar={ar} />}
      {tab === 'promotions' && <PromotionsTab ar={ar} />}
      {tab === 'coupons'    && <CouponsTab ar={ar} />}
      {tab === 'settings'   && <StoreSettingsTab ar={ar} />}
    </div>
  );
};

// ─── Packages Tab ────────────────────────────────────────────────────────────

function PackagesTab({ ar }: { ar: boolean }) {
  const [packages, setPackages]   = useState<StorePackage[]>([]);
  const [loading, setLoading]     = useState(true);
  const [editing, setEditing]     = useState<Partial<StorePackage> | null>(null);
  const [isNew, setIsNew]         = useState(false);
  const [saving, setSaving]       = useState(false);
  const [msg, setMsg]             = useState<{ ok: boolean; text: string } | null>(null);
  const [preview, setPreview]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('payment_packages')
      .select('*')
      .order('order_index');
    setPackages((data || []) as StorePackage[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const blankPackage = (): Partial<StorePackage> => ({
    package_id: '', name_ar: '', name_en: '', description_ar: '', description_en: '',
    points: 0, bonus_points: 0, price_lyd: 0,
    payment_methods: ['libyana','almadar','bank_transfer'],
    badge_type: 'NONE', lifecycle_status: 'INACTIVE',
    featured: false, active: false, order_index: packages.length + 1,
    starts_at: null, ends_at: null,
  });

  const openNew = () => { setEditing(blankPackage()); setIsNew(true); setMsg(null); setPreview(false); };
  const openEdit = (pkg: StorePackage) => { setEditing({ ...pkg }); setIsNew(false); setMsg(null); setPreview(false); };

  const duplicate = async (pkg: StorePackage) => {
    const { error } = await supabase.from('payment_packages').insert({
      ...pkg,
      id: undefined,
      package_id: pkg.package_id + '_copy_' + Date.now(),
      name_ar: pkg.name_ar + ' (نسخة)',
      name_en: pkg.name_en + ' (Copy)',
      lifecycle_status: 'INACTIVE',
      active: false,
      created_at: undefined,
    });
    if (!error) { setMsg({ ok: true, text: ar ? 'تم نسخ الباقة' : 'Package duplicated' }); load(); }
  };

  const archive = async (pkg: StorePackage) => {
    await supabase.from('payment_packages')
      .update({ lifecycle_status: 'ARCHIVED', active: false })
      .eq('id', pkg.id);
    load();
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    setMsg(null);
    const payload = {
      package_id:       editing.package_id,
      name_ar:          editing.name_ar,
      name_en:          editing.name_en,
      description_ar:   editing.description_ar,
      description_en:   editing.description_en,
      points:           Number(editing.points) || 0,
      bonus_points:     Number(editing.bonus_points) || 0,
      price_lyd:        Number(editing.price_lyd) || 0,
      payment_methods:  editing.payment_methods,
      badge_type:       editing.badge_type || 'NONE',
      lifecycle_status: editing.lifecycle_status || 'INACTIVE',
      featured:         editing.featured || false,
      active:           editing.lifecycle_status === 'ACTIVE',
      order_index:      Number(editing.order_index) || 1,
      starts_at:        editing.starts_at || null,
      ends_at:          editing.ends_at || null,
    };

    let error;
    if (isNew) {
      ({ error } = await supabase.from('payment_packages').insert(payload));
    } else {
      ({ error } = await supabase.from('payment_packages').update(payload).eq('id', editing.id));
    }

    setSaving(false);
    if (error) {
      setMsg({ ok: false, text: error.message });
    } else {
      setMsg({ ok: true, text: ar ? 'تم الحفظ' : 'Saved' });
      load();
      setTimeout(() => setEditing(null), 1200);
    }
  };

  const totalPoints = (Number(editing?.points) || 0) + (Number(editing?.bonus_points) || 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all"
          style={{ background: 'linear-gradient(135deg,#0ea5e9,#0284c7)' }}>
          <Plus className="w-4 h-4" /> {ar ? 'باقة جديدة' : 'New Package'}
        </button>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/8 hover:bg-white/15 transition-colors text-sm text-white/70">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-16"><Loader2 className="w-7 h-7 animate-spin text-white/30" /></div>
      ) : (
        <div className="glass-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 bg-white/[0.025]">
                {['#', ar ? 'الباقة' : 'Package', ar ? 'السعر' : 'Price', ar ? 'النقاط' : 'Points', ar ? 'الحالة' : 'Status', ar ? 'الشارة' : 'Badge', ar ? 'إجراء' : 'Actions'].map(h => (
                  <th key={h} className="px-3 py-3 text-start text-xs font-bold text-white/50">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {packages.map(pkg => (
                <tr key={pkg.id} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                  <td className="px-3 py-3 text-white/30 text-xs">{pkg.order_index}</td>
                  <td className="px-3 py-3">
                    <div>
                      <p className="font-bold text-white text-xs">{ar ? pkg.name_ar : pkg.name_en}</p>
                      <p className="text-white/40 text-[11px] font-mono">{pkg.package_id}</p>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-amber-400 font-bold text-xs">{pkg.price_lyd} LYD</td>
                  <td className="px-3 py-3 text-cyan-400 font-bold text-xs">{(pkg.total_points ?? pkg.points + pkg.bonus_points).toLocaleString()}</td>
                  <td className="px-3 py-3"><LifecyclePill status={pkg.lifecycle_status || (pkg.active ? 'ACTIVE' : 'INACTIVE')} /></td>
                  <td className="px-3 py-3"><BadgePill badge={pkg.badge_type || 'NONE'} /></td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(pkg)} title="Edit"
                        className="p-1.5 rounded-lg bg-white/8 hover:bg-white/15 text-white/60 transition-colors">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => duplicate(pkg)} title="Duplicate"
                        className="p-1.5 rounded-lg bg-white/8 hover:bg-white/15 text-white/60 transition-colors">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      {pkg.lifecycle_status !== 'ARCHIVED' && (
                        <button onClick={() => archive(pkg)} title="Archive"
                          className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors">
                          <Archive className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit / Create Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card p-6 w-full max-w-2xl max-h-[92vh] overflow-y-auto space-y-5">
            <div className="flex items-start justify-between">
              <h3 className="font-bold text-white text-lg">
                {isNew ? (ar ? 'باقة جديدة' : 'New Package') : (ar ? 'تعديل الباقة' : 'Edit Package')}
              </h3>
              <button onClick={() => setEditing(null)} className="p-1.5 hover:bg-white/10 rounded-lg"><X className="w-5 h-5 text-white/60" /></button>
            </div>

            {msg && (
              <div className={`flex gap-2 p-3 rounded-lg border text-sm ${msg.ok ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
                {msg.ok ? <Check className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                {msg.text}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label={ar ? 'المعرف (slug)' : 'Slug (package_id)'}>
                <input className="input-glow w-full" value={editing.package_id || ''} onChange={e => setEditing(p => ({ ...p, package_id: e.target.value }))} placeholder="gold" />
              </Field>
              <Field label={ar ? 'الترتيب' : 'Order'}>
                <input type="number" className="input-glow w-full" value={editing.order_index || 1} onChange={e => setEditing(p => ({ ...p, order_index: +e.target.value }))} />
              </Field>
              <Field label={ar ? 'الاسم (عربي)' : 'Name (Arabic)'}>
                <input className="input-glow w-full" value={editing.name_ar || ''} onChange={e => setEditing(p => ({ ...p, name_ar: e.target.value }))} />
              </Field>
              <Field label={ar ? 'الاسم (إنجليزي)' : 'Name (English)'}>
                <input className="input-glow w-full" value={editing.name_en || ''} onChange={e => setEditing(p => ({ ...p, name_en: e.target.value }))} />
              </Field>
              <Field label={ar ? 'الوصف (عربي)' : 'Description (Arabic)'} className="col-span-2">
                <input className="input-glow w-full" value={editing.description_ar || ''} onChange={e => setEditing(p => ({ ...p, description_ar: e.target.value }))} />
              </Field>
              <Field label={ar ? 'الوصف (إنجليزي)' : 'Description (English)'} className="col-span-2">
                <input className="input-glow w-full" value={editing.description_en || ''} onChange={e => setEditing(p => ({ ...p, description_en: e.target.value }))} />
              </Field>
              <Field label={ar ? 'النقاط الأساسية' : 'Base Points'}>
                <input type="number" className="input-glow w-full" value={editing.points || 0} onChange={e => setEditing(p => ({ ...p, points: +e.target.value }))} />
              </Field>
              <Field label={ar ? 'نقاط البونص' : 'Bonus Points'}>
                <input type="number" className="input-glow w-full" value={editing.bonus_points || 0} onChange={e => setEditing(p => ({ ...p, bonus_points: +e.target.value }))} />
              </Field>
              <Field label={ar ? 'السعر (LYD)' : 'Price (LYD)'}>
                <input type="number" className="input-glow w-full" value={editing.price_lyd || 0} onChange={e => setEditing(p => ({ ...p, price_lyd: +e.target.value }))} />
              </Field>
              <Field label={ar ? 'الإجمالي (حساب تلقائي)' : 'Total Points (auto)'}>
                <div className="input-glow w-full text-cyan-400 font-bold flex items-center">{totalPoints.toLocaleString()}</div>
              </Field>
              <Field label={ar ? 'الحالة' : 'Lifecycle Status'}>
                <select className="input-glow w-full" value={editing.lifecycle_status || 'INACTIVE'} onChange={e => setEditing(p => ({ ...p, lifecycle_status: e.target.value }))}>
                  {LIFECYCLE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </Field>
              <Field label={ar ? 'الشارة' : 'Badge'}>
                <select className="input-glow w-full" value={editing.badge_type || 'NONE'} onChange={e => setEditing(p => ({ ...p, badge_type: e.target.value }))}>
                  {BADGE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </Field>
              <Field label={ar ? 'يبدأ في' : 'Starts At'}>
                <input type="datetime-local" className="input-glow w-full" value={editing.starts_at?.slice(0,16) || ''} onChange={e => setEditing(p => ({ ...p, starts_at: e.target.value || null }))} />
              </Field>
              <Field label={ar ? 'ينتهي في' : 'Ends At'}>
                <input type="datetime-local" className="input-glow w-full" value={editing.ends_at?.slice(0,16) || ''} onChange={e => setEditing(p => ({ ...p, ends_at: e.target.value || null }))} />
              </Field>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={editing.featured || false} onChange={e => setEditing(p => ({ ...p, featured: e.target.checked }))} className="rounded" />
              <span className="text-sm text-white/70">{ar ? 'مميز (بادج الأكثر شيوعًا)' : 'Featured (most popular badge)'}</span>
            </label>

            {/* Live preview toggle */}
            <div>
              <button onClick={() => setPreview(v => !v)} className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 transition-colors mb-3">
                {preview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {ar ? 'معاينة البطاقة' : 'Preview Card'}
              </button>
              {preview && (
                <div className="max-w-[160px]">
                  <PackageCardPreview pkg={{
                    package_id: editing.package_id || 'preview',
                    name_ar: editing.name_ar || 'الاسم',
                    name_en: editing.name_en || 'Package',
                    total_points: totalPoints,
                    bonus_points: Number(editing.bonus_points) || 0,
                    price_lyd: Number(editing.price_lyd) || 0,
                    featured: editing.featured || false,
                    badge_type: editing.badge_type || 'NONE',
                  }} ar={ar} />
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2 border-t border-white/10">
              <button onClick={() => setEditing(null)} className="flex-1 py-2.5 px-4 rounded-xl font-bold text-sm bg-white/8 hover:bg-white/15 transition-colors text-white/60">
                {ar ? 'إلغاء' : 'Cancel'}
              </button>
              <button onClick={save} disabled={saving} className="flex-1 py-2.5 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg,#0ea5e9,#0284c7)' }}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {ar ? 'حفظ' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Shared live preview card used in the edit modal
function PackageCardPreview({ pkg, ar }: {
  pkg: { package_id: string; name_ar: string; name_en: string; total_points: number; bonus_points: number; price_lyd: number; featured: boolean; badge_type: string };
  ar: boolean;
}) {
  const COLORS: Record<string, string> = { starter:'#9ca3af', silver:'#C0C0C0', gold:'#D6B47B', pro:'#D29922', legend:'#E7C38F' };
  const color = COLORS[pkg.package_id] || '#D6B47B';
  return (
    <div className="rounded-[20px] p-4 relative overflow-hidden" style={{ background: pkg.featured ? 'rgba(214,180,123,0.06)' : 'var(--card, #111)', border: pkg.featured ? '2px solid rgba(214,180,123,0.28)' : '1px solid rgba(255,255,255,0.1)' }}>
      {pkg.badge_type !== 'NONE' && (
        <div className="text-center mb-2 py-0.5 rounded-xl text-[9px] font-bold uppercase tracking-wider" style={{ background: 'rgba(214,180,123,0.1)', color: '#D6B47B', border: '1px solid rgba(214,180,123,0.15)' }}>
          {pkg.badge_type}
        </div>
      )}
      <div className="flex flex-col items-center text-center gap-2">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${color}1A`, border: `1px solid ${color}2E` }}>
          <Package className="w-5 h-5" style={{ color }} />
        </div>
        <p className="font-bold text-xs text-white">{ar ? pkg.name_ar : pkg.name_en}</p>
        <div>
          <p className="text-lg font-bold" style={{ color }}>{pkg.total_points.toLocaleString()}</p>
          <p className="text-[10px] text-white/40">{ar ? 'نقطة' : 'pts'}</p>
        </div>
        {pkg.bonus_points > 0 && (
          <div className="w-full py-1 rounded-xl text-[10px] font-bold" style={{ background: 'rgba(63,185,80,0.07)', color: '#3FB950', border: '1px solid rgba(63,185,80,0.14)' }}>
            +{pkg.bonus_points} {ar ? 'مكافأة' : 'bonus'}
          </div>
        )}
        <p className="text-sm font-bold text-white">{pkg.price_lyd} <span className="text-[10px] text-white/40">LYD</span></p>
      </div>
    </div>
  );
}

// ─── Promotions Tab ──────────────────────────────────────────────────────────

function PromotionsTab({ ar }: { ar: boolean }) {
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Promotion> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('promotions').select('*').order('priority', { ascending: false });
    setPromos((data || []) as Promotion[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const blank = (): Partial<Promotion> => ({
    name_ar: '', name_en: '', description_ar: '', description_en: '',
    discount_type: 'BONUS_POINTS_PERCENT', discount_value: 10,
    target_package_ids: null, priority: 0,
    usage_limit: null, active: true, starts_at: null, ends_at: null,
  });

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    setMsg(null);
    const payload = {
      name_ar: editing.name_ar, name_en: editing.name_en,
      description_ar: editing.description_ar, description_en: editing.description_en,
      discount_type: editing.discount_type, discount_value: Number(editing.discount_value),
      target_package_ids: editing.target_package_ids || null,
      priority: Number(editing.priority) || 0,
      usage_limit: editing.usage_limit ? Number(editing.usage_limit) : null,
      active: editing.active, starts_at: editing.starts_at || null, ends_at: editing.ends_at || null,
    };
    let error;
    if (isNew) ({ error } = await supabase.from('promotions').insert(payload));
    else ({ error } = await supabase.from('promotions').update(payload).eq('id', editing.id));
    setSaving(false);
    if (error) { setMsg({ ok: false, text: error.message }); }
    else { setMsg({ ok: true, text: ar ? 'تم الحفظ' : 'Saved' }); load(); setTimeout(() => setEditing(null), 1200); }
  };

  const toggle = async (promo: Promotion) => {
    await supabase.from('promotions').update({ active: !promo.active }).eq('id', promo.id);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => { setEditing(blank()); setIsNew(true); setMsg(null); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all"
          style={{ background: 'linear-gradient(135deg,#0ea5e9,#0284c7)' }}>
          <Plus className="w-4 h-4" /> {ar ? 'عرض جديد' : 'New Promotion'}
        </button>
        <button onClick={load} className="p-2 rounded-lg bg-white/8 hover:bg-white/15 transition-colors text-white/70">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-16"><Loader2 className="w-7 h-7 animate-spin text-white/30" /></div>
      ) : (
        <div className="glass-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 bg-white/[0.025]">
                {[ar ? 'الاسم' : 'Name', ar ? 'الخصم' : 'Discount', ar ? 'الأولوية' : 'Priority', ar ? 'الاستخدام' : 'Usage', ar ? 'نشط' : 'Active', ar ? 'إجراء' : 'Action'].map(h => (
                  <th key={h} className="px-3 py-3 text-start text-xs font-bold text-white/50">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {promos.map(promo => (
                <tr key={promo.id} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                  <td className="px-3 py-3">
                    <p className="font-bold text-white text-xs">{ar ? promo.name_ar : promo.name_en}</p>
                  </td>
                  <td className="px-3 py-3 text-emerald-300 text-xs font-bold">{discountLabel(promo.discount_type, promo.discount_value)}</td>
                  <td className="px-3 py-3 text-white/60 text-xs">{promo.priority}</td>
                  <td className="px-3 py-3 text-white/50 text-xs">
                    {promo.used_count}{promo.usage_limit ? `/${promo.usage_limit}` : ''}
                  </td>
                  <td className="px-3 py-3">
                    <button onClick={() => toggle(promo)} className={`text-xs font-bold px-2 py-0.5 rounded-full ${promo.active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/40'}`}>
                      {promo.active ? (ar ? 'نشط' : 'Active') : (ar ? 'معطل' : 'Off')}
                    </button>
                  </td>
                  <td className="px-3 py-3">
                    <button onClick={() => { setEditing({ ...promo }); setIsNew(false); setMsg(null); }}
                      className="p-1.5 rounded-lg bg-white/8 hover:bg-white/15 text-white/60 transition-colors">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {promos.length === 0 && (
                <tr><td colSpan={6} className="p-12 text-center text-white/30 text-sm">{ar ? 'لا توجد عروض' : 'No promotions'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-start justify-between">
              <h3 className="font-bold text-white">{isNew ? (ar ? 'عرض جديد' : 'New Promotion') : (ar ? 'تعديل العرض' : 'Edit Promotion')}</h3>
              <button onClick={() => setEditing(null)}><X className="w-5 h-5 text-white/60" /></button>
            </div>
            {msg && <div className={`flex gap-2 p-3 rounded-lg text-sm ${msg.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>{msg.text}</div>}
            <div className="grid grid-cols-2 gap-3">
              <Field label={ar ? 'الاسم (عربي)' : 'Name (AR)'}><input className="input-glow w-full" value={editing.name_ar || ''} onChange={e => setEditing(p => ({ ...p, name_ar: e.target.value }))} /></Field>
              <Field label={ar ? 'الاسم (إنجليزي)' : 'Name (EN)'}><input className="input-glow w-full" value={editing.name_en || ''} onChange={e => setEditing(p => ({ ...p, name_en: e.target.value }))} /></Field>
              <Field label={ar ? 'نوع الخصم' : 'Discount Type'} className="col-span-2">
                <select className="input-glow w-full" value={editing.discount_type || ''} onChange={e => setEditing(p => ({ ...p, discount_type: e.target.value }))}>
                  {DISCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label={ar ? 'قيمة الخصم' : 'Discount Value'}><input type="number" className="input-glow w-full" value={editing.discount_value || 0} onChange={e => setEditing(p => ({ ...p, discount_value: +e.target.value }))} /></Field>
              <Field label={ar ? 'الأولوية' : 'Priority'}><input type="number" className="input-glow w-full" value={editing.priority || 0} onChange={e => setEditing(p => ({ ...p, priority: +e.target.value }))} /></Field>
              <Field label={ar ? 'حد الاستخدام' : 'Usage Limit'}><input type="number" placeholder={ar ? 'فارغ = غير محدود' : 'blank = unlimited'} className="input-glow w-full" value={editing.usage_limit ?? ''} onChange={e => setEditing(p => ({ ...p, usage_limit: e.target.value ? +e.target.value : null }))} /></Field>
              <Field label={ar ? 'يبدأ في' : 'Starts At'}><input type="datetime-local" className="input-glow w-full" value={editing.starts_at?.slice(0,16) || ''} onChange={e => setEditing(p => ({ ...p, starts_at: e.target.value || null }))} /></Field>
              <Field label={ar ? 'ينتهي في' : 'Ends At'}><input type="datetime-local" className="input-glow w-full" value={editing.ends_at?.slice(0,16) || ''} onChange={e => setEditing(p => ({ ...p, ends_at: e.target.value || null }))} /></Field>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={editing.active ?? true} onChange={e => setEditing(p => ({ ...p, active: e.target.checked }))} className="rounded" />
              <span className="text-sm text-white/70">{ar ? 'مفعّل' : 'Active'}</span>
            </label>
            <div className="flex gap-3 pt-2 border-t border-white/10">
              <button onClick={() => setEditing(null)} className="flex-1 py-2.5 rounded-xl font-bold text-sm bg-white/8 text-white/60">{ar ? 'إلغاء' : 'Cancel'}</button>
              <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: 'linear-gradient(135deg,#0ea5e9,#0284c7)' }}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {ar ? 'حفظ' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Coupons Tab ─────────────────────────────────────────────────────────────

function CouponsTab({ ar }: { ar: boolean }) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Coupon> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState<{ id: string; username: string }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('coupons').select('*').order('created_at', { ascending: false });
    setCoupons((data || []) as Coupon[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const searchUsers = async (q: string) => {
    if (!q.trim()) { setUserResults([]); return; }
    const { data } = await supabase.from('users').select('id, username').ilike('username', `%${q}%`).limit(8);
    setUserResults(data || []);
  };

  const toggleUser = (uid: string) => {
    setEditing(p => {
      const ids = p?.allowed_user_ids || [];
      return { ...p, allowed_user_ids: ids.includes(uid) ? ids.filter(i => i !== uid) : [...ids, uid] };
    });
  };

  const blank = (): Partial<Coupon> => ({
    code: '', description_ar: '', description_en: '',
    discount_type: 'BONUS_POINTS_FIXED', discount_value: 100,
    stacking_policy: 'COUPON_OVERRIDES_PROMOTION', target_package_ids: null,
    audience_type: 'ALL_USERS', allowed_user_ids: null,
    usage_limit_per_user: 1, total_usage_limit: null,
    active: true, starts_at: null, ends_at: null,
  });

  const save = async () => {
    if (!editing) return;
    setSaving(true); setMsg(null);
    const payload = {
      code: (editing.code || '').toUpperCase().trim(),
      description_ar: editing.description_ar, description_en: editing.description_en,
      discount_type: editing.discount_type, discount_value: Number(editing.discount_value),
      stacking_policy: editing.stacking_policy,
      target_package_ids: editing.target_package_ids || null,
      audience_type: editing.audience_type,
      allowed_user_ids: editing.audience_type === 'SPECIFIC_USERS' ? (editing.allowed_user_ids || []) : null,
      usage_limit_per_user: Number(editing.usage_limit_per_user) || 1,
      total_usage_limit: editing.total_usage_limit ? Number(editing.total_usage_limit) : null,
      active: editing.active, starts_at: editing.starts_at || null, ends_at: editing.ends_at || null,
    };
    let error;
    if (isNew) ({ error } = await supabase.from('coupons').insert(payload));
    else ({ error } = await supabase.from('coupons').update(payload).eq('id', editing.id));
    setSaving(false);
    if (error) setMsg({ ok: false, text: error.message });
    else { setMsg({ ok: true, text: ar ? 'تم الحفظ' : 'Saved' }); load(); setTimeout(() => setEditing(null), 1200); }
  };

  const toggle = async (c: Coupon) => {
    await supabase.from('coupons').update({ active: !c.active }).eq('id', c.id);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => { setEditing(blank()); setIsNew(true); setMsg(null); setUserSearch(''); setUserResults([]); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white" style={{ background: 'linear-gradient(135deg,#0ea5e9,#0284c7)' }}>
          <Plus className="w-4 h-4" /> {ar ? 'كوبون جديد' : 'New Coupon'}
        </button>
        <button onClick={load} className="p-2 rounded-lg bg-white/8 hover:bg-white/15 text-white/70"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-16"><Loader2 className="w-7 h-7 animate-spin text-white/30" /></div>
      ) : (
        <div className="glass-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 bg-white/[0.025]">
                {['Code', ar ? 'الخصم' : 'Discount', ar ? 'الجمهور' : 'Audience', ar ? 'الاستخدام' : 'Used', ar ? 'نشط' : 'Active', ar ? 'إجراء' : 'Action'].map(h => (
                  <th key={h} className="px-3 py-3 text-start text-xs font-bold text-white/50">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {coupons.map(c => (
                <tr key={c.id} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                  <td className="px-3 py-3 font-mono font-bold text-cyan-400 text-xs">{c.code}</td>
                  <td className="px-3 py-3 text-emerald-300 text-xs font-bold">{discountLabel(c.discount_type, c.discount_value)}</td>
                  <td className="px-3 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 w-fit ${c.audience_type === 'SPECIFIC_USERS' ? 'bg-blue-500/20 text-blue-300' : 'bg-white/10 text-white/40'}`}>
                      {c.audience_type === 'SPECIFIC_USERS' ? <><Users className="w-3 h-3" />{c.allowed_user_ids?.length || 0}</> : (ar ? 'الجميع' : 'All')}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-white/50 text-xs">{c.used_count}{c.total_usage_limit ? `/${c.total_usage_limit}` : ''}</td>
                  <td className="px-3 py-3">
                    <button onClick={() => toggle(c)} className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/40'}`}>
                      {c.active ? (ar ? 'نشط' : 'Active') : (ar ? 'معطل' : 'Off')}
                    </button>
                  </td>
                  <td className="px-3 py-3">
                    <button onClick={() => { setEditing({ ...c }); setIsNew(false); setMsg(null); setUserSearch(''); setUserResults([]); }}
                      className="p-1.5 rounded-lg bg-white/8 hover:bg-white/15 text-white/60 transition-colors">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {coupons.length === 0 && (
                <tr><td colSpan={6} className="p-12 text-center text-white/30 text-sm">{ar ? 'لا توجد كوبونات' : 'No coupons'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card p-6 w-full max-w-lg max-h-[92vh] overflow-y-auto space-y-4">
            <div className="flex items-start justify-between">
              <h3 className="font-bold text-white">{isNew ? (ar ? 'كوبون جديد' : 'New Coupon') : (ar ? 'تعديل الكوبون' : 'Edit Coupon')}</h3>
              <button onClick={() => setEditing(null)}><X className="w-5 h-5 text-white/60" /></button>
            </div>
            {msg && <div className={`p-3 rounded-lg text-sm ${msg.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>{msg.text}</div>}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Code" className="col-span-2">
                <input className="input-glow w-full font-mono uppercase" value={editing.code || ''} onChange={e => setEditing(p => ({ ...p, code: e.target.value.toUpperCase() }))} placeholder="SUMMER25" />
              </Field>
              <Field label={ar ? 'نوع الخصم' : 'Discount Type'} className="col-span-2">
                <select className="input-glow w-full" value={editing.discount_type || ''} onChange={e => setEditing(p => ({ ...p, discount_type: e.target.value }))}>
                  {DISCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label={ar ? 'قيمة الخصم' : 'Value'}><input type="number" className="input-glow w-full" value={editing.discount_value || 0} onChange={e => setEditing(p => ({ ...p, discount_value: +e.target.value }))} /></Field>
              <Field label={ar ? 'حد/مستخدم' : 'Limit/User'}><input type="number" className="input-glow w-full" value={editing.usage_limit_per_user || 1} onChange={e => setEditing(p => ({ ...p, usage_limit_per_user: +e.target.value }))} /></Field>
              <Field label={ar ? 'الحد الكلي' : 'Total Limit'}><input type="number" placeholder={ar ? 'فارغ = غير محدود' : 'blank = unlimited'} className="input-glow w-full" value={editing.total_usage_limit ?? ''} onChange={e => setEditing(p => ({ ...p, total_usage_limit: e.target.value ? +e.target.value : null }))} /></Field>
              <Field label={ar ? 'سياسة التكديس' : 'Stacking'}>
                <select className="input-glow w-full" value={editing.stacking_policy || 'COUPON_OVERRIDES_PROMOTION'} onChange={e => setEditing(p => ({ ...p, stacking_policy: e.target.value }))}>
                  {STACKING_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label={ar ? 'يبدأ في' : 'Starts At'}><input type="datetime-local" className="input-glow w-full" value={editing.starts_at?.slice(0,16) || ''} onChange={e => setEditing(p => ({ ...p, starts_at: e.target.value || null }))} /></Field>
              <Field label={ar ? 'ينتهي في' : 'Ends At'}><input type="datetime-local" className="input-glow w-full" value={editing.ends_at?.slice(0,16) || ''} onChange={e => setEditing(p => ({ ...p, ends_at: e.target.value || null }))} /></Field>
            </div>

            {/* Audience */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-white/50 uppercase tracking-wider">{ar ? 'الجمهور المستهدف' : 'Audience'}</p>
              <div className="flex gap-2">
                {['ALL_USERS','SPECIFIC_USERS'].map(a => (
                  <button key={a} onClick={() => setEditing(p => ({ ...p, audience_type: a }))}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-colors ${editing.audience_type === a ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'bg-white/5 text-white/40 border border-white/8'}`}>
                    {a === 'ALL_USERS' ? (ar ? 'الجميع' : 'All Users') : (ar ? 'مستخدمون محددون' : 'Specific Users')}
                  </button>
                ))}
              </div>
              {editing.audience_type === 'SPECIFIC_USERS' && (
                <div className="space-y-2">
                  <input
                    className="input-glow w-full"
                    placeholder={ar ? 'ابحث عن مستخدم...' : 'Search user...'}
                    value={userSearch}
                    onChange={e => { setUserSearch(e.target.value); searchUsers(e.target.value); }}
                  />
                  {userResults.length > 0 && (
                    <div className="rounded-xl overflow-hidden border border-white/10">
                      {userResults.map(u => (
                        <button key={u.id} onClick={() => toggleUser(u.id)}
                          className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors ${(editing.allowed_user_ids || []).includes(u.id) ? 'bg-cyan-500/15 text-cyan-300' : 'text-white/60 hover:bg-white/5'}`}>
                          <span>{u.username}</span>
                          {(editing.allowed_user_ids || []).includes(u.id) && <Check className="w-3.5 h-3.5" />}
                        </button>
                      ))}
                    </div>
                  )}
                  {(editing.allowed_user_ids || []).length > 0 && (
                    <p className="text-xs text-cyan-400">{(editing.allowed_user_ids || []).length} {ar ? 'مستخدم محدد' : 'users selected'}</p>
                  )}
                </div>
              )}
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={editing.active ?? true} onChange={e => setEditing(p => ({ ...p, active: e.target.checked }))} className="rounded" />
              <span className="text-sm text-white/70">{ar ? 'مفعّل' : 'Active'}</span>
            </label>

            <div className="flex gap-3 pt-2 border-t border-white/10">
              <button onClick={() => setEditing(null)} className="flex-1 py-2.5 rounded-xl font-bold text-sm bg-white/8 text-white/60">{ar ? 'إلغاء' : 'Cancel'}</button>
              <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: 'linear-gradient(135deg,#0ea5e9,#0284c7)' }}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {ar ? 'حفظ' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

function StoreSettingsTab({ ar }: { ar: boolean }) {
  return (
    <div className="glass-card p-6">
      <p className="text-white/40 text-sm">{ar ? 'إعدادات المتجر قادمة قريبًا.' : 'Store settings coming soon.'}</p>
    </div>
  );
}

// ─── Shared Field ─────────────────────────────────────────────────────────────

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="text-xs font-bold text-white/50 mb-1 block">{label}</label>
      {children}
    </div>
  );
}
