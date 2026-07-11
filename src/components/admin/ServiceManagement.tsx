import { useState, useEffect, useCallback } from 'react';
import { Plus, Save, CreditCard as Edit2, Archive, RefreshCw, Eye, EyeOff, ChevronDown, ChevronUp, Copy, Settings, Star, Package, CreditCard, FileText, Layers, Tag, BarChart2, MessageSquare, CheckCircle, XCircle, Clock, AlertCircle, Trash2, X, Grid2x2 as Grid, DollarSign, Users, TrendingUp, ShoppingBag } from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ServiceCategory {
  id: string; slug: string; name_ar: string; name_en?: string;
  icon?: string; accent_color?: string; is_active: boolean; sort_order: number;
  archived_at?: string;
}

interface Service {
  id: string; slug: string; name: string; name_ar?: string; name_en?: string;
  description?: string; short_description_ar?: string; full_description_ar?: string;
  icon?: string; cover_url?: string; badge_text_ar?: string;
  category_id?: string; category?: string;
  pricing_mode: string; starting_price?: number; currency: string;
  fulfillment_mode: string; estimated_delivery_text_ar?: string;
  min_quantity?: number; max_quantity?: number; quantity_step?: number;
  availability_status: string; is_featured: boolean; is_published: boolean;
  is_active: boolean; order_index: number;
  customer_form_schema: FormField[]; terms_ar?: string; internal_instructions?: string;
  archived_at?: string; created_at: string;
}

interface ServicePackage {
  id: string; service_id: string; name: string; name_ar?: string; name_en?: string;
  description?: string; description_ar?: string;
  price: number; compare_at_price?: number; currency: string;
  included_quantity?: number; quantity_label_ar?: string;
  features?: string[]; duration_days?: number; quantity?: number;
  badge_type: string; badge_text_ar?: string;
  is_popular: boolean; is_active: boolean; order_index: number; archived_at?: string;
}

interface PricingRule {
  id?: string; service_id: string; mode: string;
  base_fee?: number; unit_price?: number;
  min_quantity?: number; max_quantity?: number; quantity_step?: number;
  minimum_charge?: number; maximum_charge?: number;
  rounding_mode: string; tiers: PricingTier[];
  is_active: boolean; version: number;
}

interface PricingTier {
  min: number; max: number | null; unit_price: number;
}

interface ServiceAddon {
  id?: string; service_id: string; name_ar: string; name_en?: string;
  description_ar?: string; price_type: string; price_value: number;
  is_required: boolean; is_active: boolean; sort_order: number;
}

interface PaymentMethod {
  id: string; code: string; name_ar: string; type: string; active: boolean;
}

interface ServicePaymentMethod {
  id?: string; service_id: string; payment_method_id: string;
  is_enabled: boolean; min_amount_override?: number; max_amount_override?: number;
  fixed_fee_override?: number; percentage_fee_override?: number;
  discount_percent?: number; instructions_override_ar?: string; sort_order: number;
  payment_method?: PaymentMethod;
}

interface FormField {
  key: string; label_ar: string; label_en?: string; field_type: string;
  placeholder_ar?: string; help_ar?: string; required: boolean;
  min_length?: number; max_length?: number; min_value?: number; max_value?: number;
  options?: string[]; is_sensitive: boolean; sort_order: number;
}

interface ServiceQuote {
  id: string; quote_code: string; status: string;
  proposed_amount?: number; currency: string;
  requested_input_snapshot: Record<string, unknown>;
  customer_message?: string; internal_note?: string;
  valid_until?: string; requested_at: string; quoted_at?: string; version: number;
  service_name?: string; username?: string; user_id?: string; order_id?: string;
}

interface AdminStats {
  active_services: number; paused_services: number;
  awaiting_payment: number; quote_requests: number;
  quotes_awaiting_customer: number; pending_fulfillment: number;
  completed_today: number; revenue_today: number; revenue_month: number;
}

// ── Tab config ────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'overview',   label: 'نظرة عامة',        icon: BarChart2 },
  { id: 'categories', label: 'التصنيفات',          icon: Grid },
  { id: 'services',   label: 'الخدمات',            icon: Layers },
  { id: 'packages',   label: 'الباقات والتسعير',   icon: Package },
  { id: 'forms',      label: 'نموذج بيانات العميل',icon: FileText },
  { id: 'addons',     label: 'الإضافات',           icon: Tag },
  { id: 'payments',   label: 'طرق الدفع',          icon: CreditCard },
  { id: 'quotes',     label: 'طلبات الأسعار',      icon: MessageSquare },
  { id: 'orders',     label: 'طلبات الخدمات',      icon: ShoppingBag },
] as const;

type TabId = typeof TABS[number]['id'];

const PRICING_MODES = [
  { value: 'FIXED',         label: 'سعر ثابت' },
  { value: 'PACKAGES',      label: 'باقات' },
  { value: 'PER_UNIT',      label: 'سعر لكل وحدة' },
  { value: 'TIERED',        label: 'تسعير متدرج' },
  { value: 'BASE_PLUS_UNIT',label: 'رسوم أساسية + وحدة' },
  { value: 'STARTING_FROM', label: 'يبدأ من' },
  { value: 'QUOTE_REQUIRED',label: 'عرض سعر' },
  { value: 'FREE_REQUEST',  label: 'طلب مجاني' },
];

const FULFILLMENT_MODES = [
  { value: 'MANUAL_FULFILLMENT', label: 'تنفيذ يدوي' },
  { value: 'DIGITAL_CODE',       label: 'كود رقمي' },
  { value: 'EXTERNAL_RECHARGE',  label: 'شحن خارجي' },
  { value: 'INFORMATION_ONLY',   label: 'معلومات فقط' },
  { value: 'NO_FULFILLMENT',     label: 'بدون تنفيذ' },
];

const AVAILABILITY_STATUSES = [
  { value: 'ACTIVE',          label: 'نشط',        color: '#10b981' },
  { value: 'PAUSED',          label: 'متوقف',       color: '#f59e0b' },
  { value: 'MAINTENANCE',     label: 'صيانة',       color: '#6b7280' },
  { value: 'DRAFT',           label: 'مسودة',       color: '#6b7280' },
  { value: 'OUT_OF_CAPACITY', label: 'ممتلئة',      color: '#ef4444' },
  { value: 'ARCHIVED',        label: 'مؤرشف',       color: '#374151' },
];

const BADGE_TYPES = ['NONE','POPULAR','BEST_VALUE','NEW','LIMITED','EXCLUSIVE'];
const FIELD_TYPES = ['text','textarea','number','phone','email','url','select','multi_select','radio','checkbox','date','account_username'];
const QUOTE_STATUSES: Record<string, { label: string; color: string }> = {
  REQUESTED:     { label: 'طلب جديد',   color: '#3b82f6' },
  UNDER_REVIEW:  { label: 'قيد المراجعة',color: '#8b5cf6' },
  NEEDS_INFO:    { label: 'يحتاج بيانات',color: '#f97316' },
  QUOTED:        { label: 'تم إصدار سعر',color: '#10b981' },
  ACCEPTED:      { label: 'مقبول',       color: '#10b981' },
  REJECTED:      { label: 'مرفوض',       color: '#ef4444' },
  EXPIRED:       { label: 'منتهي',       color: '#6b7280' },
  CANCELLED:     { label: 'ملغى',        color: '#6b7280' },
};

// ── Utility ───────────────────────────────────────────────────────────────────

const gold = '#D6AA62';
const cardBg = 'rgba(255,255,255,0.03)';
const border = '1px solid rgba(255,255,255,0.08)';

function InputField({ label, value, onChange, type = 'text', placeholder = '', rows = 0, required = false }: {
  label: string; value: string | number; onChange: (v: string) => void;
  type?: string; placeholder?: string; rows?: number; required?: boolean;
}) {
  const cls = 'w-full px-3 py-2 rounded-xl text-sm outline-none text-white';
  const style = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' };
  return (
    <div>
      <label className="block text-xs font-semibold mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
        {label}{required && <span style={{ color: '#ef4444' }}> *</span>}
      </label>
      {rows > 0
        ? <textarea value={value as string} onChange={e => onChange(e.target.value)} rows={rows}
            className={`${cls} resize-none`} style={style} placeholder={placeholder} />
        : <input type={type} value={value} onChange={e => onChange(e.target.value)}
            className={cls} style={style} placeholder={placeholder} />
      }
    </div>
  );
}

function SelectField({ label, value, onChange, options }: {
  label: string; value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
        {label}
      </label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-xl text-sm outline-none text-white cursor-pointer"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
        {options.map(o => <option key={o.value} value={o.value} style={{ background: '#111' }}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>{label}</span>
      <button onClick={() => onChange(!checked)}
        className="w-10 h-6 rounded-full transition-all flex items-center px-0.5"
        style={{ background: checked ? gold : 'rgba(255,255,255,0.1)' }}>
        <div className="w-5 h-5 bg-white rounded-full transition-all" style={{ transform: checked ? 'translateX(16px)' : 'translateX(0)' }} />
      </button>
    </div>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl p-4 ${className}`} style={{ background: cardBg, border }}>
      {children}
    </div>
  );
}

function Badge({ color, label }: { color: string; label: string }) {
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: `${color}20`, color, border: `1px solid ${color}30` }}>
      {label}
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-black mb-3" style={{ color: gold }}>{children}</h3>;
}

// ── Main Component ────────────────────────────────────────────────────────────

export const ServiceManagement = () => {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AdminStats | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [catRes, svcRes, pmRes] = await Promise.all([
      supabase.from('service_categories').select('*').order('sort_order'),
      supabase.from('services').select('*').order('order_index'),
      supabase.from('payment_methods').select('*').eq('active', true).order('sort_order'),
    ]);
    setCategories(catRes.data ?? []);
    setServices(svcRes.data ?? []);
    setPaymentMethods(pmRes.data ?? []);

    // Stats
    const [ordRes, quoteRes] = await Promise.all([
      supabase.from('commerce_orders').select('id,order_status,payment_status,final_total_snapshot,created_at').eq('order_type', 'SERVICE'),
      supabase.from('service_quotes').select('id,status'),
    ]);
    const orders = ordRes.data ?? [];
    const quotes = quoteRes.data ?? [];
    const today = new Date().toDateString();
    const thisMonth = new Date().toISOString().substring(0, 7);

    const activeServices = (svcRes.data ?? []).filter(s => s.availability_status === 'ACTIVE' && s.is_published && !s.archived_at).length;
    const pausedServices = (svcRes.data ?? []).filter(s => s.availability_status === 'PAUSED' || !s.is_published).length;

    setStats({
      active_services: activeServices,
      paused_services: pausedServices,
      awaiting_payment: orders.filter(o => o.payment_status === 'NOT_SUBMITTED').length,
      quote_requests: quotes.filter(q => q.status === 'REQUESTED' || q.status === 'UNDER_REVIEW').length,
      quotes_awaiting_customer: quotes.filter(q => q.status === 'QUOTED').length,
      pending_fulfillment: orders.filter(o => o.order_status === 'IN_FULFILLMENT').length,
      completed_today: orders.filter(o => o.order_status === 'COMPLETED' && new Date(o.created_at).toDateString() === today).length,
      revenue_today: orders.filter(o => o.order_status === 'COMPLETED' && new Date(o.created_at).toDateString() === today).reduce((s, o) => s + (o.final_total_snapshot ?? 0), 0),
      revenue_month: orders.filter(o => o.order_status === 'COMPLETED' && o.created_at?.startsWith(thisMonth)).reduce((s, o) => s + (o.final_total_snapshot ?? 0), 0),
    });
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: gold }} />
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-white">إدارة الخدمات</h2>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
            نظام الخدمات الشامل والقابل للتكوين
          </p>
        </div>
        <button onClick={fetchAll} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all"
          style={{ background: 'rgba(255,255,255,0.05)', border, color: 'rgba(255,255,255,0.6)' }}>
          <RefreshCw className="w-3.5 h-3.5" />
          تحديث
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5 p-1.5 rounded-2xl" style={{ background: 'rgba(0,0,0,0.3)', border }}>
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap"
              style={activeTab === tab.id
                ? { background: `${gold}18`, color: gold, border: `1px solid ${gold}30` }
                : { color: 'rgba(255,255,255,0.4)', border: '1px solid transparent' }}>
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'overview'   && <OverviewTab stats={stats} services={services} categories={categories} />}
        {activeTab === 'categories' && <CategoriesTab categories={categories} onRefresh={fetchAll} />}
        {activeTab === 'services'   && <ServicesTab services={services} categories={categories} onRefresh={fetchAll} />}
        {activeTab === 'packages'   && <PackagesTab services={services} onRefresh={fetchAll} />}
        {activeTab === 'forms'      && <FormsTab services={services} onRefresh={fetchAll} />}
        {activeTab === 'addons'     && <AddonsTab services={services} onRefresh={fetchAll} />}
        {activeTab === 'payments'   && <PaymentMethodsTab services={services} paymentMethods={paymentMethods} onRefresh={fetchAll} />}
        {activeTab === 'quotes'     && <QuotesTab />}
        {activeTab === 'orders'     && <ServiceOrdersTab services={services} />}
      </div>
    </div>
  );
};

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ stats, services, categories }: { stats: AdminStats | null; services: Service[]; categories: ServiceCategory[] }) {
  if (!stats) return null;
  const metric = (label: string, value: string | number, icon: React.ReactNode, color: string) => (
    <Card>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: `${color}15`, color }}>
          {icon}
        </div>
        <div>
          <p className="text-2xl font-black text-white">{value}</p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</p>
        </div>
      </div>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {metric('خدمات نشطة', stats.active_services, <CheckCircle className="w-5 h-5" />, '#10b981')}
        {metric('خدمات متوقفة', stats.paused_services, <XCircle className="w-5 h-5" />, '#f59e0b')}
        {metric('بانتظار الدفع', stats.awaiting_payment, <Clock className="w-5 h-5" />, '#3b82f6')}
        {metric('طلبات عروض أسعار', stats.quote_requests, <MessageSquare className="w-5 h-5" />, '#8b5cf6')}
        {metric('عروض بانتظار القبول', stats.quotes_awaiting_customer, <AlertCircle className="w-5 h-5" />, '#f97316')}
        {metric('قيد التنفيذ', stats.pending_fulfillment, <RefreshCw className="w-5 h-5" />, '#06b6d4')}
        {metric('أيرادات اليوم', `${stats.revenue_today} د.ل`, <DollarSign className="w-5 h-5" />, gold)}
        {metric('أيرادات الشهر', `${stats.revenue_month} د.ل`, <TrendingUp className="w-5 h-5" />, gold)}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <SectionTitle>الخدمات النشطة</SectionTitle>
          <div className="space-y-2">
            {services.filter(s => s.availability_status === 'ACTIVE' && s.is_published && !s.archived_at).slice(0, 6).map(s => (
              <div key={s.id} className="flex items-center justify-between py-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="flex items-center gap-2">
                  <span className="text-sm">{s.icon}</span>
                  <span className="text-sm text-white">{s.name_ar ?? s.name}</span>
                </div>
                <Badge color="#10b981" label={s.pricing_mode} />
              </div>
            ))}
            {services.filter(s => s.availability_status === 'ACTIVE' && s.is_published).length === 0 && (
              <p className="text-xs text-center py-4" style={{ color: 'rgba(255,255,255,0.3)' }}>لا توجد خدمات نشطة</p>
            )}
          </div>
        </Card>
        <Card>
          <SectionTitle>التصنيفات</SectionTitle>
          <div className="space-y-2">
            {categories.filter(c => c.is_active && !c.archived_at).map(c => (
              <div key={c.id} className="flex items-center justify-between py-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="flex items-center gap-2">
                  <span>{c.icon}</span>
                  <span className="text-sm text-white">{c.name_ar}</span>
                </div>
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  {services.filter(s => s.category_id === c.id).length} خدمة
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── Categories Tab ────────────────────────────────────────────────────────────

function CategoriesTab({ categories, onRefresh }: { categories: ServiceCategory[]; onRefresh: () => void }) {
  const [editing, setEditing] = useState<Partial<ServiceCategory> | null>(null);
  const [saving, setSaving] = useState(false);

  const blank: Partial<ServiceCategory> = {
    slug: '', name_ar: '', name_en: '', icon: '🔧', accent_color: '#D6AA62',
    is_active: true, sort_order: categories.length,
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      if (editing.id) {
        await supabase.from('service_categories').update({
          name_ar: editing.name_ar, name_en: editing.name_en,
          icon: editing.icon, accent_color: editing.accent_color,
          is_active: editing.is_active, sort_order: editing.sort_order,
        }).eq('id', editing.id);
      } else {
        const slug = editing.slug || editing.name_ar?.toLowerCase().replace(/\s+/g, '-') || Date.now().toString();
        await supabase.from('service_categories').insert({
          slug, name_ar: editing.name_ar, name_en: editing.name_en,
          icon: editing.icon, accent_color: editing.accent_color,
          is_active: editing.is_active, sort_order: editing.sort_order,
        });
      }
      setEditing(null);
      onRefresh();
    } finally { setSaving(false); }
  };

  const archive = async (id: string) => {
    if (!confirm('أرشفة هذا التصنيف؟')) return;
    await supabase.from('service_categories').update({ archived_at: new Date().toISOString(), is_active: false }).eq('id', id);
    onRefresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionTitle>التصنيفات ({categories.filter(c => !c.archived_at).length})</SectionTitle>
        <button onClick={() => setEditing(blank)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all"
          style={{ background: `${gold}18`, color: gold, border: `1px solid ${gold}30` }}>
          <Plus className="w-3.5 h-3.5" />
          تصنيف جديد
        </button>
      </div>

      {editing && (
        <Card className="space-y-3">
          <p className="text-sm font-bold text-white">{editing.id ? 'تعديل التصنيف' : 'تصنيف جديد'}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {!editing.id && <InputField label="الرمز المميز (slug)" value={editing.slug ?? ''} onChange={v => setEditing(p => ({ ...p!, slug: v }))} placeholder="social-media" />}
            <InputField label="الاسم بالعربية" value={editing.name_ar ?? ''} onChange={v => setEditing(p => ({ ...p!, name_ar: v }))} required />
            <InputField label="الاسم بالإنجليزية" value={editing.name_en ?? ''} onChange={v => setEditing(p => ({ ...p!, name_en: v }))} />
            <InputField label="الأيقونة (إيموجي)" value={editing.icon ?? ''} onChange={v => setEditing(p => ({ ...p!, icon: v }))} />
            <InputField label="لون التمييز (hex)" value={editing.accent_color ?? ''} onChange={v => setEditing(p => ({ ...p!, accent_color: v }))} />
            <InputField label="الترتيب" value={editing.sort_order ?? 0} onChange={v => setEditing(p => ({ ...p!, sort_order: parseInt(v) || 0 }))} type="number" />
          </div>
          <Toggle label="نشط" checked={editing.is_active ?? true} onChange={v => setEditing(p => ({ ...p!, is_active: v }))} />
          <div className="flex gap-2 pt-2">
            <button onClick={save} disabled={saving}
              className="flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              style={{ background: `${gold}18`, color: gold, border: `1px solid ${gold}30` }}>
              <Save className="w-3.5 h-3.5" />
              {saving ? 'جارٍ الحفظ...' : 'حفظ'}
            </button>
            <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-xl text-xs"
              style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>
              إلغاء
            </button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {categories.filter(c => !c.archived_at).map(cat => (
          <Card key={cat.id}>
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{cat.icon}</span>
                <div>
                  <p className="text-sm font-bold text-white">{cat.name_ar}</p>
                  <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{cat.slug}</p>
                </div>
              </div>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: cat.accent_color }} />
            </div>
            <div className="flex items-center gap-2 mt-3">
              <Badge color={cat.is_active ? '#10b981' : '#6b7280'} label={cat.is_active ? 'نشط' : 'متوقف'} />
              <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>ترتيب: {cat.sort_order}</span>
            </div>
            <div className="flex gap-2 mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <button onClick={() => setEditing(cat)}
                className="flex-1 py-1.5 rounded-lg text-xs flex items-center justify-center gap-1 transition-all"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)' }}>
                <Edit2 className="w-3 h-3" /> تعديل
              </button>
              <button onClick={() => archive(cat.id)}
                className="px-3 py-1.5 rounded-lg text-xs transition-all"
                style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444' }}>
                <Archive className="w-3 h-3" />
              </button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Services Tab ──────────────────────────────────────────────────────────────

function ServicesTab({ services, categories, onRefresh }: {
  services: Service[]; categories: ServiceCategory[]; onRefresh: () => void;
}) {
  const [editId, setEditId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<Partial<Service>>({});
  const [saving, setSaving] = useState(false);

  const blank: Partial<Service> = {
    name: '', name_ar: '', name_en: '', description: '', icon: '🔧',
    pricing_mode: 'PACKAGES', currency: 'LYD', fulfillment_mode: 'MANUAL_FULFILLMENT',
    availability_status: 'DRAFT', is_published: false, is_featured: false,
    is_active: true, order_index: services.length,
    customer_form_schema: [], category: '',
  };

  const startEdit = (svc?: Service) => {
    setForm(svc ? { ...svc } : blank);
    setEditId(svc?.id ?? 'new');
  };

  const save = async () => {
    if (!form.name_ar && !form.name) return;
    setSaving(true);
    try {
      const cat_id = form.category_id ?? categories.find(c => c.slug === form.category)?.id;
      const payload = {
        name: form.name_ar ?? form.name ?? '',
        name_ar: form.name_ar ?? form.name ?? '',
        name_en: form.name_en,
        description: form.description,
        short_description_ar: form.short_description_ar,
        full_description_ar: form.full_description_ar,
        icon: form.icon,
        cover_url: form.cover_url,
        badge_text_ar: form.badge_text_ar,
        category_id: cat_id,
        pricing_mode: form.pricing_mode ?? 'PACKAGES',
        starting_price: form.starting_price,
        currency: form.currency ?? 'LYD',
        fulfillment_mode: form.fulfillment_mode ?? 'MANUAL_FULFILLMENT',
        estimated_delivery_text_ar: form.estimated_delivery_text_ar,
        min_quantity: form.min_quantity,
        max_quantity: form.max_quantity,
        quantity_step: form.quantity_step,
        availability_status: form.availability_status ?? 'DRAFT',
        is_featured: form.is_featured ?? false,
        is_published: form.is_published ?? false,
        is_active: form.is_active ?? true,
        order_index: form.order_index ?? 0,
        terms_ar: form.terms_ar,
        internal_instructions: form.internal_instructions,
        customer_form_schema: form.customer_form_schema ?? [],
      };
      if (editId === 'new') {
        const slug = (form.name_ar ?? '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || `svc-${Date.now()}`;
        await supabase.from('services').insert({ ...payload, slug });
      } else {
        await supabase.from('services').update(payload).eq('id', editId!);
      }
      setEditId(null);
      onRefresh();
    } finally { setSaving(false); }
  };

  const archive = async (id: string) => {
    if (!confirm('أرشفة هذه الخدمة؟ ستبقى الطلبات القديمة سليمة.')) return;
    await supabase.from('services').update({ archived_at: new Date().toISOString(), is_published: false, availability_status: 'ARCHIVED' }).eq('id', id);
    onRefresh();
  };

  const togglePublish = async (svc: Service) => {
    await supabase.from('services').update({
      is_published: !svc.is_published,
      availability_status: !svc.is_published ? 'ACTIVE' : 'PAUSED',
    }).eq('id', svc.id);
    onRefresh();
  };

  const duplicate = async (svc: Service) => {
    const newSlug = `${svc.slug ?? 'svc'}-copy-${Date.now()}`;
    await supabase.from('services').insert({
      ...svc, id: undefined, slug: newSlug,
      name_ar: (svc.name_ar ?? svc.name) + ' (نسخة)',
      name: (svc.name_ar ?? svc.name) + ' (نسخة)',
      is_published: false, availability_status: 'DRAFT',
    });
    onRefresh();
  };

  const active = services.filter(s => !s.archived_at);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionTitle>الخدمات ({active.length})</SectionTitle>
        <button onClick={() => startEdit()}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold"
          style={{ background: `${gold}18`, color: gold, border: `1px solid ${gold}30` }}>
          <Plus className="w-3.5 h-3.5" /> خدمة جديدة
        </button>
      </div>

      {editId && (
        <ServiceEditor
          form={form}
          isNew={editId === 'new'}
          categories={categories}
          saving={saving}
          onChange={f => setForm(prev => ({ ...prev, ...f }))}
          onSave={save}
          onCancel={() => setEditId(null)}
        />
      )}

      <div className="space-y-2">
        {active.map(svc => {
          const cat = categories.find(c => c.id === svc.category_id);
          const statusInfo = AVAILABILITY_STATUSES.find(s => s.value === svc.availability_status);
          return (
            <Card key={svc.id}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                  style={{ background: 'rgba(255,255,255,0.05)' }}>
                  {svc.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center flex-wrap gap-2 mb-1">
                    <p className="text-sm font-bold text-white">{svc.name_ar ?? svc.name}</p>
                    <Badge color={statusInfo?.color ?? '#6b7280'} label={statusInfo?.label ?? svc.availability_status} />
                    {svc.is_published && <Badge color="#10b981" label="منشور" />}
                    {svc.is_featured && <Badge color={gold} label="مميز" />}
                    {cat && <Badge color={cat.accent_color ?? '#6b7280'} label={cat.name_ar} />}
                  </div>
                  <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {svc.short_description_ar ?? svc.description}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      {PRICING_MODES.find(p => p.value === svc.pricing_mode)?.label ?? svc.pricing_mode}
                    </span>
                    {svc.starting_price && (
                      <span className="text-[10px]" style={{ color: gold }}>{svc.starting_price} {svc.currency}</span>
                    )}
                    <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
                      {FULFILLMENT_MODES.find(f => f.value === svc.fulfillment_mode)?.label}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => togglePublish(svc)} title={svc.is_published ? 'إخفاء' : 'نشر'}
                    className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                    style={{ background: svc.is_published ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.05)', color: svc.is_published ? '#10b981' : 'rgba(255,255,255,0.4)' }}>
                    {svc.is_published ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => duplicate(svc)} title="نسخ"
                    className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                    style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)' }}>
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => startEdit(svc)} title="تعديل"
                    className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                    style={{ background: `${gold}15`, color: gold }}>
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => archive(svc.id)} title="أرشفة"
                    className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                    style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444' }}>
                    <Archive className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </Card>
          );
        })}
        {active.length === 0 && (
          <Card>
            <p className="text-center text-sm py-8" style={{ color: 'rgba(255,255,255,0.3)' }}>لا توجد خدمات. أضف خدمة جديدة.</p>
          </Card>
        )}
      </div>
    </div>
  );
}

// ── Service Editor ────────────────────────────────────────────────────────────

function ServiceEditor({ form, isNew, categories, saving, onChange, onSave, onCancel }: {
  form: Partial<Service>; isNew: boolean; categories: ServiceCategory[];
  saving: boolean; onChange: (f: Partial<Service>) => void;
  onSave: () => void; onCancel: () => void;
}) {
  const [section, setSection] = useState<'general' | 'pricing' | 'fulfillment' | 'policies'>('general');
  const sections = [
    { id: 'general' as const,     label: 'عام' },
    { id: 'pricing' as const,     label: 'التسعير' },
    { id: 'fulfillment' as const, label: 'التنفيذ' },
    { id: 'policies' as const,    label: 'السياسات' },
  ];

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-black text-white">{isNew ? 'خدمة جديدة' : `تعديل: ${form.name_ar ?? form.name}`}</p>
        <button onClick={onCancel}><X className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.4)' }} /></button>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(0,0,0,0.2)' }}>
        {sections.map(s => (
          <button key={s.id} onClick={() => setSection(s.id)}
            className="flex-1 py-1.5 rounded-lg text-xs font-bold transition-all"
            style={section === s.id ? { background: `${gold}18`, color: gold } : { color: 'rgba(255,255,255,0.4)' }}>
            {s.label}
          </button>
        ))}
      </div>

      {section === 'general' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <InputField label="الاسم بالعربية *" value={form.name_ar ?? ''} onChange={v => onChange({ name_ar: v, name: v })} required />
          <InputField label="الاسم بالإنجليزية" value={form.name_en ?? ''} onChange={v => onChange({ name_en: v })} />
          <div className="md:col-span-2">
            <InputField label="وصف قصير" value={form.short_description_ar ?? ''} onChange={v => onChange({ short_description_ar: v })} />
          </div>
          <div className="md:col-span-2">
            <InputField label="وصف كامل" value={form.full_description_ar ?? ''} onChange={v => onChange({ full_description_ar: v })} rows={3} />
          </div>
          <InputField label="أيقونة (إيموجي أو URL)" value={form.icon ?? ''} onChange={v => onChange({ icon: v })} />
          <InputField label="نص الشارة" value={form.badge_text_ar ?? ''} onChange={v => onChange({ badge_text_ar: v })} />
          <SelectField label="التصنيف" value={form.category_id ?? ''} onChange={v => onChange({ category_id: v })}
            options={[{ value: '', label: 'اختر التصنيف' }, ...categories.filter(c => c.is_active && !c.archived_at).map(c => ({ value: c.id, label: c.name_ar }))]} />
          <InputField label="الترتيب" value={form.order_index ?? 0} onChange={v => onChange({ order_index: parseInt(v) || 0 })} type="number" />
          <Toggle label="منشور" checked={form.is_published ?? false} onChange={v => onChange({ is_published: v, availability_status: v ? 'ACTIVE' : 'DRAFT' })} />
          <Toggle label="مميز" checked={form.is_featured ?? false} onChange={v => onChange({ is_featured: v })} />
        </div>
      )}

      {section === 'pricing' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <SelectField label="نوع التسعير" value={form.pricing_mode ?? 'PACKAGES'} onChange={v => onChange({ pricing_mode: v })} options={PRICING_MODES} />
          <InputField label="العملة" value={form.currency ?? 'LYD'} onChange={v => onChange({ currency: v })} />
          {['STARTING_FROM', 'QUOTE_REQUIRED'].includes(form.pricing_mode ?? '') && (
            <InputField label="يبدأ من (سعر عرض)" value={form.starting_price ?? ''} onChange={v => onChange({ starting_price: parseFloat(v) || undefined })} type="number" />
          )}
          {['PER_UNIT', 'TIERED', 'BASE_PLUS_UNIT'].includes(form.pricing_mode ?? '') && (
            <>
              <InputField label="أقل كمية" value={form.min_quantity ?? ''} onChange={v => onChange({ min_quantity: parseFloat(v) || undefined })} type="number" />
              <InputField label="أعلى كمية" value={form.max_quantity ?? ''} onChange={v => onChange({ max_quantity: parseFloat(v) || undefined })} type="number" />
              <InputField label="خطوة الكمية" value={form.quantity_step ?? 1} onChange={v => onChange({ quantity_step: parseFloat(v) || 1 })} type="number" />
            </>
          )}
        </div>
      )}

      {section === 'fulfillment' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <SelectField label="طريقة التنفيذ" value={form.fulfillment_mode ?? 'MANUAL_FULFILLMENT'} onChange={v => onChange({ fulfillment_mode: v })} options={FULFILLMENT_MODES} />
          <SelectField label="حالة التوفر" value={form.availability_status ?? 'DRAFT'} onChange={v => onChange({ availability_status: v })}
            options={AVAILABILITY_STATUSES.map(s => ({ value: s.value, label: s.label }))} />
          <div className="md:col-span-2">
            <InputField label="وقت التسليم المتوقع" value={form.estimated_delivery_text_ar ?? ''} onChange={v => onChange({ estimated_delivery_text_ar: v })} placeholder="مثال: خلال 24 ساعة" />
          </div>
          <div className="md:col-span-2">
            <InputField label="تعليمات داخلية (للموظفين فقط)" value={form.internal_instructions ?? ''} onChange={v => onChange({ internal_instructions: v })} rows={3} placeholder="تعليمات التنفيذ للموظف..." />
          </div>
        </div>
      )}

      {section === 'policies' && (
        <div className="space-y-3">
          <InputField label="الشروط والأحكام" value={form.terms_ar ?? ''} onChange={v => onChange({ terms_ar: v })} rows={4} placeholder="الشروط والأحكام للخدمة..." />
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <button onClick={onSave} disabled={saving}
          className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ background: `${gold}18`, color: gold, border: `1px solid ${gold}30` }}>
          <Save className="w-4 h-4" />
          {saving ? 'جارٍ الحفظ...' : 'حفظ الخدمة'}
        </button>
        <button onClick={onCancel} className="px-4 py-2.5 rounded-xl text-sm"
          style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>
          إلغاء
        </button>
      </div>
    </Card>
  );
}

// ── Packages Tab ──────────────────────────────────────────────────────────────

function PackagesTab({ services, onRefresh }: { services: Service[]; onRefresh: () => void }) {
  const [selectedServiceId, setSelectedServiceId] = useState<string>(services[0]?.id ?? '');
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [pricingRule, setPricingRule] = useState<PricingRule | null>(null);
  const [editPkg, setEditPkg] = useState<Partial<ServicePackage> | null>(null);
  const [editRule, setEditRule] = useState(false);
  const [ruleForm, setRuleForm] = useState<Partial<PricingRule>>({});
  const [saving, setSaving] = useState(false);
  const [simQty, setSimQty] = useState<number>(100);
  const [simResult, setSimResult] = useState<string | null>(null);

  const svc = services.find(s => s.id === selectedServiceId);

  const fetchPackages = useCallback(async () => {
    if (!selectedServiceId) return;
    const { data } = await supabase.from('service_packages').select('*').eq('service_id', selectedServiceId).order('order_index');
    setPackages(data ?? []);
    const { data: rule } = await supabase.from('service_pricing_rules').select('*').eq('service_id', selectedServiceId).eq('is_active', true).order('version', { ascending: false }).limit(1).maybeSingle();
    setPricingRule(rule ?? null);
    setRuleForm(rule ? { ...rule, tiers: (rule.tiers ?? []) as PricingTier[] } : { mode: svc?.pricing_mode ?? 'FIXED', tiers: [], rounding_mode: 'NONE', is_active: true, version: 1, service_id: selectedServiceId });
  }, [selectedServiceId, svc?.pricing_mode]);

  useEffect(() => { fetchPackages(); }, [fetchPackages]);

  const blankPkg: Partial<ServicePackage> = {
    service_id: selectedServiceId, name: '', name_ar: '', price: 0,
    currency: 'LYD', badge_type: 'NONE', is_popular: false, is_active: true,
    order_index: packages.length, features: [],
  };

  const savePkg = async () => {
    if (!editPkg) return;
    setSaving(true);
    const payload = {
      service_id: selectedServiceId,
      name: editPkg.name_ar ?? editPkg.name ?? '',
      name_ar: editPkg.name_ar ?? editPkg.name ?? '',
      name_en: editPkg.name_en,
      description: editPkg.description_ar,
      description_ar: editPkg.description_ar,
      price: editPkg.price ?? 0,
      compare_at_price: editPkg.compare_at_price,
      currency: editPkg.currency ?? 'LYD',
      included_quantity: editPkg.included_quantity,
      quantity_label_ar: editPkg.quantity_label_ar,
      features: editPkg.features ?? [],
      duration_days: editPkg.duration_days,
      badge_type: editPkg.badge_type ?? 'NONE',
      badge_text_ar: editPkg.badge_text_ar,
      is_popular: editPkg.is_popular ?? false,
      is_active: editPkg.is_active ?? true,
      order_index: editPkg.order_index ?? 0,
    };
    try {
      if (editPkg.id) {
        await supabase.from('service_packages').update(payload).eq('id', editPkg.id);
      } else {
        await supabase.from('service_packages').insert(payload);
      }
      setEditPkg(null);
      fetchPackages();
      onRefresh();
    } finally { setSaving(false); }
  };

  const archivePkg = async (id: string) => {
    if (!confirm('أرشفة هذه الباقة؟')) return;
    await supabase.from('service_packages').update({ archived_at: new Date().toISOString(), is_active: false }).eq('id', id);
    fetchPackages();
  };

  const saveRule = async () => {
    setSaving(true);
    const payload = {
      service_id: selectedServiceId,
      mode: ruleForm.mode ?? 'FIXED',
      base_fee: ruleForm.base_fee,
      unit_price: ruleForm.unit_price,
      min_quantity: ruleForm.min_quantity,
      max_quantity: ruleForm.max_quantity,
      quantity_step: ruleForm.quantity_step ?? 1,
      minimum_charge: ruleForm.minimum_charge,
      maximum_charge: ruleForm.maximum_charge,
      rounding_mode: ruleForm.rounding_mode ?? 'NONE',
      tiers: ruleForm.tiers ?? [],
      is_active: true,
      version: (pricingRule?.version ?? 0) + 1,
    };
    try {
      if (pricingRule?.id) {
        await supabase.from('service_pricing_rules').update({ is_active: false }).eq('id', pricingRule.id);
      }
      await supabase.from('service_pricing_rules').insert(payload);
      setEditRule(false);
      fetchPackages();
    } finally { setSaving(false); }
  };

  const simulate = async () => {
    if (!selectedServiceId) return;
    const result = await supabase.rpc('calculate_service_price', {
      p_service_id: selectedServiceId, p_quantity: simQty,
    });
    if (result.data?.error) setSimResult(`خطأ: ${result.data.error}`);
    else if (result.data?.final_amount !== undefined) setSimResult(`الإجمالي: ${result.data.final_amount} ${result.data.currency}`);
    else setSimResult(JSON.stringify(result.data));
  };

  const addTier = () => setRuleForm(p => ({ ...p, tiers: [...(p.tiers ?? []), { min: 0, max: null, unit_price: 0 }] }));
  const updateTier = (i: number, field: keyof PricingTier, val: unknown) => {
    setRuleForm(p => {
      const tiers = [...(p.tiers ?? [])];
      tiers[i] = { ...tiers[i], [field]: val === '' ? null : Number(val) };
      return { ...p, tiers };
    });
  };
  const removeTier = (i: number) => setRuleForm(p => ({ ...p, tiers: (p.tiers ?? []).filter((_, idx) => idx !== i) }));

  const showsPackages = !svc || ['PACKAGES', 'STARTING_FROM'].includes(svc.pricing_mode);
  const showsRule = svc && ['FIXED', 'PER_UNIT', 'TIERED', 'BASE_PLUS_UNIT'].includes(svc.pricing_mode);

  return (
    <div className="space-y-4">
      {/* Service selector */}
      <div className="flex flex-wrap gap-1.5 p-1.5 rounded-2xl overflow-x-auto" style={{ background: 'rgba(0,0,0,0.2)', border }}>
        {services.filter(s => !s.archived_at).map(s => (
          <button key={s.id} onClick={() => setSelectedServiceId(s.id)}
            className="px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all"
            style={selectedServiceId === s.id
              ? { background: `${gold}18`, color: gold, border: `1px solid ${gold}30` }
              : { color: 'rgba(255,255,255,0.4)', border: '1px solid transparent' }}>
            {s.icon} {s.name_ar ?? s.name}
          </button>
        ))}
      </div>

      {svc && (
        <div className="flex items-center gap-2 flex-wrap">
          <Badge color="#3b82f6" label={PRICING_MODES.find(p => p.value === svc.pricing_mode)?.label ?? svc.pricing_mode} />
          <Badge color="#8b5cf6" label={FULFILLMENT_MODES.find(f => f.value === svc.fulfillment_mode)?.label ?? ''} />
        </div>
      )}

      {/* Packages section */}
      {showsPackages && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <SectionTitle>الباقات ({packages.filter(p => !p.archived_at).length})</SectionTitle>
            <button onClick={() => setEditPkg(blankPkg)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold"
              style={{ background: `${gold}18`, color: gold, border: `1px solid ${gold}30` }}>
              <Plus className="w-3.5 h-3.5" /> باقة جديدة
            </button>
          </div>

          {editPkg && (
            <Card className="space-y-3">
              <p className="text-sm font-bold text-white">{editPkg.id ? 'تعديل الباقة' : 'باقة جديدة'}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <InputField label="اسم الباقة (عربي) *" value={editPkg.name_ar ?? ''} onChange={v => setEditPkg(p => ({ ...p!, name_ar: v, name: v }))} required />
                <InputField label="اسم الباقة (إنجليزي)" value={editPkg.name_en ?? ''} onChange={v => setEditPkg(p => ({ ...p!, name_en: v }))} />
                <InputField label="الوصف" value={editPkg.description_ar ?? ''} onChange={v => setEditPkg(p => ({ ...p!, description_ar: v, description: v }))} />
                <InputField label="السعر *" value={editPkg.price ?? 0} onChange={v => setEditPkg(p => ({ ...p!, price: parseFloat(v) || 0 }))} type="number" required />
                <InputField label="السعر قبل الخصم" value={editPkg.compare_at_price ?? ''} onChange={v => setEditPkg(p => ({ ...p!, compare_at_price: parseFloat(v) || undefined }))} type="number" />
                <InputField label="الكمية المشمولة" value={editPkg.included_quantity ?? ''} onChange={v => setEditPkg(p => ({ ...p!, included_quantity: parseFloat(v) || undefined }))} type="number" />
                <InputField label="وحدة الكمية" value={editPkg.quantity_label_ar ?? ''} onChange={v => setEditPkg(p => ({ ...p!, quantity_label_ar: v }))} placeholder="مثال: عملة" />
                <SelectField label="نوع الشارة" value={editPkg.badge_type ?? 'NONE'} onChange={v => setEditPkg(p => ({ ...p!, badge_type: v }))}
                  options={BADGE_TYPES.map(b => ({ value: b, label: b }))} />
                {editPkg.badge_type !== 'NONE' && (
                  <InputField label="نص الشارة" value={editPkg.badge_text_ar ?? ''} onChange={v => setEditPkg(p => ({ ...p!, badge_text_ar: v }))} />
                )}
                <InputField label="الترتيب" value={editPkg.order_index ?? 0} onChange={v => setEditPkg(p => ({ ...p!, order_index: parseInt(v) || 0 }))} type="number" />
              </div>
              <div className="space-y-2">
                <Toggle label="شائع" checked={editPkg.is_popular ?? false} onChange={v => setEditPkg(p => ({ ...p!, is_popular: v, badge_type: v ? 'POPULAR' : p!.badge_type }))} />
                <Toggle label="نشط" checked={editPkg.is_active ?? true} onChange={v => setEditPkg(p => ({ ...p!, is_active: v }))} />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={savePkg} disabled={saving}
                  className="flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ background: `${gold}18`, color: gold, border: `1px solid ${gold}30` }}>
                  <Save className="w-3.5 h-3.5" /> {saving ? 'جارٍ الحفظ...' : 'حفظ'}
                </button>
                <button onClick={() => setEditPkg(null)} className="px-4 py-2 rounded-xl text-xs"
                  style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>إلغاء</button>
              </div>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {packages.filter(p => !p.archived_at).map(pkg => (
              <Card key={pkg.id}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-bold text-white">{pkg.name_ar ?? pkg.name}</p>
                    {pkg.included_quantity && (
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                        {pkg.included_quantity} {pkg.quantity_label_ar ?? 'وحدة'}
                      </p>
                    )}
                  </div>
                  {pkg.badge_type !== 'NONE' && <Badge color={gold} label={pkg.badge_text_ar ?? pkg.badge_type} />}
                </div>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-xl font-black" style={{ color: gold }}>{pkg.price}</span>
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{pkg.currency}</span>
                  {pkg.compare_at_price && (
                    <span className="text-xs line-through mr-1" style={{ color: 'rgba(255,255,255,0.25)' }}>{pkg.compare_at_price}</span>
                  )}
                </div>
                <div className="flex gap-1.5 mt-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <button onClick={() => setEditPkg(pkg)} className="flex-1 py-1.5 rounded-lg text-xs flex items-center justify-center gap-1"
                    style={{ background: `${gold}10`, color: gold }}>
                    <Edit2 className="w-3 h-3" /> تعديل
                  </button>
                  <button onClick={() => archivePkg(pkg.id)} className="px-3 py-1.5 rounded-lg text-xs"
                    style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444' }}>
                    <Archive className="w-3 h-3" />
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Pricing rule section */}
      {showsRule && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <SectionTitle>قاعدة التسعير</SectionTitle>
            <button onClick={() => setEditRule(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold"
              style={{ background: `${gold}18`, color: gold, border: `1px solid ${gold}30` }}>
              <Settings className="w-3.5 h-3.5" /> {pricingRule ? 'تعديل' : 'إضافة قاعدة'}
            </button>
          </div>

          {pricingRule && !editRule && (
            <Card>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>النوع: </span><span className="text-white">{pricingRule.mode}</span></div>
                {pricingRule.base_fee && <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>الرسوم الأساسية: </span><span className="text-white">{pricingRule.base_fee} LYD</span></div>}
                {pricingRule.unit_price && <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>سعر الوحدة: </span><span className="text-white">{pricingRule.unit_price} LYD</span></div>}
                {pricingRule.min_quantity && <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>أقل كمية: </span><span className="text-white">{pricingRule.min_quantity}</span></div>}
                {pricingRule.minimum_charge && <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>حد أدنى للسعر: </span><span className="text-white">{pricingRule.minimum_charge}</span></div>}
                {pricingRule.maximum_charge && <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>حد أعلى للسعر: </span><span className="text-white">{pricingRule.maximum_charge}</span></div>}
              </div>
              {pricingRule.tiers?.length > 0 && (
                <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <p className="text-xs font-bold mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>الشرائح:</p>
                  {(pricingRule.tiers as PricingTier[]).map((t, i) => (
                    <div key={i} className="text-xs py-1 flex gap-3">
                      <span className="text-white">{t.min} — {t.max ?? '∞'}</span>
                      <span style={{ color: gold }}>{t.unit_price} LYD/وحدة</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {editRule && (
            <Card className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <SelectField label="نوع القاعدة" value={ruleForm.mode ?? 'FIXED'} onChange={v => setRuleForm(p => ({ ...p, mode: v }))}
                  options={[{ value: 'FIXED', label: 'ثابت' }, { value: 'PER_UNIT', label: 'لكل وحدة' }, { value: 'TIERED', label: 'متدرج' }, { value: 'BASE_PLUS_UNIT', label: 'أساسي + وحدة' }]} />
                {['FIXED', 'BASE_PLUS_UNIT'].includes(ruleForm.mode ?? '') && (
                  <InputField label="الرسوم الأساسية" value={ruleForm.base_fee ?? ''} onChange={v => setRuleForm(p => ({ ...p, base_fee: parseFloat(v) || undefined }))} type="number" />
                )}
                {['PER_UNIT', 'BASE_PLUS_UNIT'].includes(ruleForm.mode ?? '') && (
                  <InputField label="سعر الوحدة" value={ruleForm.unit_price ?? ''} onChange={v => setRuleForm(p => ({ ...p, unit_price: parseFloat(v) || undefined }))} type="number" />
                )}
                <InputField label="أقل كمية" value={ruleForm.min_quantity ?? ''} onChange={v => setRuleForm(p => ({ ...p, min_quantity: parseFloat(v) || undefined }))} type="number" />
                <InputField label="أعلى كمية" value={ruleForm.max_quantity ?? ''} onChange={v => setRuleForm(p => ({ ...p, max_quantity: parseFloat(v) || undefined }))} type="number" />
                <InputField label="حد أدنى للسعر" value={ruleForm.minimum_charge ?? ''} onChange={v => setRuleForm(p => ({ ...p, minimum_charge: parseFloat(v) || undefined }))} type="number" />
                <InputField label="حد أعلى للسعر" value={ruleForm.maximum_charge ?? ''} onChange={v => setRuleForm(p => ({ ...p, maximum_charge: parseFloat(v) || undefined }))} type="number" />
              </div>

              {ruleForm.mode === 'TIERED' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>الشرائح</p>
                    <button onClick={addTier} className="text-xs px-2 py-1 rounded-lg"
                      style={{ background: `${gold}15`, color: gold }}>+ شريحة</button>
                  </div>
                  {(ruleForm.tiers ?? []).map((tier, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input type="number" value={tier.min} onChange={e => updateTier(i, 'min', e.target.value)}
                        className="flex-1 px-2 py-1.5 rounded-lg text-xs text-white outline-none" placeholder="من"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
                      <input type="number" value={tier.max ?? ''} onChange={e => updateTier(i, 'max', e.target.value)}
                        className="flex-1 px-2 py-1.5 rounded-lg text-xs text-white outline-none" placeholder="إلى (فارغ=∞)"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
                      <input type="number" value={tier.unit_price} onChange={e => updateTier(i, 'unit_price', e.target.value)}
                        className="flex-1 px-2 py-1.5 rounded-lg text-xs text-white outline-none" placeholder="سعر/وحدة"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
                      <button onClick={() => removeTier(i)} className="w-6 h-6 flex items-center justify-center rounded"
                        style={{ color: '#ef4444' }}><X className="w-3 h-3" /></button>
                    </div>
                  ))}
                </div>
              )}

              {/* Simulator */}
              <div className="p-3 rounded-xl space-y-2" style={{ background: 'rgba(0,0,0,0.2)' }}>
                <p className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>محاكي الأسعار</p>
                <div className="flex gap-2">
                  <input type="number" value={simQty} onChange={e => setSimQty(parseFloat(e.target.value) || 0)}
                    className="flex-1 px-2 py-1.5 rounded-lg text-xs text-white outline-none" placeholder="الكمية"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
                  <button onClick={simulate} className="px-3 py-1.5 rounded-lg text-xs font-bold"
                    style={{ background: `${gold}18`, color: gold }}>احسب</button>
                </div>
                {simResult && <p className="text-xs" style={{ color: gold }}>{simResult}</p>}
              </div>

              <div className="flex gap-2 pt-2">
                <button onClick={saveRule} disabled={saving}
                  className="flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ background: `${gold}18`, color: gold, border: `1px solid ${gold}30` }}>
                  <Save className="w-3.5 h-3.5" /> {saving ? 'جارٍ الحفظ...' : 'حفظ القاعدة'}
                </button>
                <button onClick={() => setEditRule(false)} className="px-4 py-2 rounded-xl text-xs"
                  style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>إلغاء</button>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ── Forms Tab ─────────────────────────────────────────────────────────────────

function FormsTab({ services, onRefresh }: { services: Service[]; onRefresh: () => void }) {
  const [selectedServiceId, setSelectedServiceId] = useState<string>(services[0]?.id ?? '');
  const [fields, setFields] = useState<FormField[]>([]);
  const [editField, setEditField] = useState<FormField | null>(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);

  const svc = services.find(s => s.id === selectedServiceId);

  useEffect(() => {
    if (svc) setFields(svc.customer_form_schema ?? []);
  }, [svc]);

  const blankField: FormField = {
    key: '', label_ar: '', label_en: '', field_type: 'text',
    placeholder_ar: '', help_ar: '', required: false,
    is_sensitive: false, sort_order: fields.length, options: [],
  };

  const saveFields = async (newFields: FormField[]) => {
    setSaving(true);
    await supabase.from('services').update({ customer_form_schema: newFields }).eq('id', selectedServiceId);
    setFields(newFields);
    setSaving(false);
    onRefresh();
  };

  const saveField = async () => {
    if (!editField || !editField.key || !editField.label_ar) return;
    const existing = fields.findIndex(f => f.key === editField.key);
    const newFields = existing >= 0
      ? fields.map((f, i) => i === existing ? editField : f)
      : [...fields, editField];
    await saveFields(newFields);
    setEditField(null);
  };

  const removeField = async (key: string) => {
    if (!confirm('حذف هذا الحقل؟')) return;
    await saveFields(fields.filter(f => f.key !== key));
  };

  const moveField = async (key: string, dir: 'up' | 'down') => {
    const idx = fields.findIndex(f => f.key === key);
    if (idx < 0) return;
    const newFields = [...fields];
    const swap = dir === 'up' ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= newFields.length) return;
    [newFields[idx], newFields[swap]] = [newFields[swap], newFields[idx]];
    await saveFields(newFields.map((f, i) => ({ ...f, sort_order: i })));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5 p-1.5 rounded-2xl overflow-x-auto" style={{ background: 'rgba(0,0,0,0.2)', border }}>
        {services.filter(s => !s.archived_at).map(s => (
          <button key={s.id} onClick={() => setSelectedServiceId(s.id)}
            className="px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all"
            style={selectedServiceId === s.id
              ? { background: `${gold}18`, color: gold, border: `1px solid ${gold}30` }
              : { color: 'rgba(255,255,255,0.4)', border: '1px solid transparent' }}>
            {s.icon} {s.name_ar ?? s.name}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <SectionTitle>حقول النموذج ({fields.length})</SectionTitle>
        <div className="flex gap-2">
          <button onClick={() => setPreview(p => !p)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold"
            style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', border }}>
            <Eye className="w-3.5 h-3.5" /> {preview ? 'تعديل' : 'معاينة'}
          </button>
          {!preview && (
            <button onClick={() => setEditField({ ...blankField, sort_order: fields.length })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold"
              style={{ background: `${gold}18`, color: gold, border: `1px solid ${gold}30` }}>
              <Plus className="w-3.5 h-3.5" /> حقل جديد
            </button>
          )}
        </div>
      </div>

      {/* Field editor */}
      {editField && !preview && (
        <Card className="space-y-3">
          <p className="text-sm font-bold text-white">{editField.key ? 'تعديل الحقل' : 'حقل جديد'}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <InputField label="المفتاح (key) *" value={editField.key} onChange={v => setEditField(p => ({ ...p!, key: v.replace(/\s/g, '_') }))} placeholder="tiktok_username" required />
            <SelectField label="نوع الحقل" value={editField.field_type} onChange={v => setEditField(p => ({ ...p!, field_type: v }))}
              options={FIELD_TYPES.map(t => ({ value: t, label: t }))} />
            <InputField label="التسمية (عربي) *" value={editField.label_ar} onChange={v => setEditField(p => ({ ...p!, label_ar: v }))} required />
            <InputField label="التسمية (إنجليزي)" value={editField.label_en ?? ''} onChange={v => setEditField(p => ({ ...p!, label_en: v }))} />
            <InputField label="نص التلميح" value={editField.placeholder_ar ?? ''} onChange={v => setEditField(p => ({ ...p!, placeholder_ar: v }))} />
            <InputField label="نص المساعدة" value={editField.help_ar ?? ''} onChange={v => setEditField(p => ({ ...p!, help_ar: v }))} />
            {['select', 'multi_select', 'radio'].includes(editField.field_type) && (
              <div className="md:col-span-2">
                <InputField label="الخيارات (مفصولة بفاصلة)" value={(editField.options ?? []).join(',')} onChange={v => setEditField(p => ({ ...p!, options: v.split(',').map(o => o.trim()).filter(Boolean) }))} />
              </div>
            )}
            {editField.field_type === 'number' && (
              <>
                <InputField label="الحد الأدنى" value={editField.min_value ?? ''} onChange={v => setEditField(p => ({ ...p!, min_value: parseFloat(v) || undefined }))} type="number" />
                <InputField label="الحد الأعلى" value={editField.max_value ?? ''} onChange={v => setEditField(p => ({ ...p!, max_value: parseFloat(v) || undefined }))} type="number" />
              </>
            )}
          </div>
          <div className="flex gap-4">
            <Toggle label="مطلوب" checked={editField.required} onChange={v => setEditField(p => ({ ...p!, required: v }))} />
            <Toggle label="بيانات حساسة" checked={editField.is_sensitive} onChange={v => setEditField(p => ({ ...p!, is_sensitive: v }))} />
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={saveField} disabled={saving}
              className="flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2"
              style={{ background: `${gold}18`, color: gold, border: `1px solid ${gold}30` }}>
              <Save className="w-3.5 h-3.5" /> حفظ الحقل
            </button>
            <button onClick={() => setEditField(null)} className="px-4 py-2 rounded-xl text-xs"
              style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>إلغاء</button>
          </div>
        </Card>
      )}

      {/* Field list */}
      {!preview && (
        <div className="space-y-2">
          {fields.length === 0 && (
            <Card><p className="text-center text-sm py-4" style={{ color: 'rgba(255,255,255,0.3)' }}>لا توجد حقول. أضف حقلًا لجمع بيانات العميل.</p></Card>
          )}
          {fields.map((field, idx) => (
            <Card key={field.key} className="flex items-center gap-3">
              <div className="flex flex-col gap-0.5">
                <button onClick={() => moveField(field.key, 'up')} disabled={idx === 0} className="p-0.5 disabled:opacity-20"><ChevronUp className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.4)' }} /></button>
                <button onClick={() => moveField(field.key, 'down')} disabled={idx === fields.length - 1} className="p-0.5 disabled:opacity-20"><ChevronDown className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.4)' }} /></button>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-white">{field.label_ar}</span>
                  <Badge color="#3b82f6" label={field.field_type} />
                  {field.required && <Badge color="#ef4444" label="مطلوب" />}
                  {field.is_sensitive && <Badge color="#8b5cf6" label="حساس" />}
                </div>
                <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{field.key}</p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => setEditField(field)} className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: `${gold}10`, color: gold }}><Edit2 className="w-3 h-3" /></button>
                <button onClick={() => removeField(field.key)} className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444' }}><Trash2 className="w-3 h-3" /></button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Preview */}
      {preview && (
        <Card className="space-y-4">
          <p className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>معاينة النموذج كما يراه المستخدم</p>
          {fields.map(field => (
            <div key={field.key}>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'rgba(255,255,255,0.6)' }}>
                {field.label_ar}{field.required && <span style={{ color: '#ef4444' }}> *</span>}
              </label>
              {field.help_ar && <p className="text-[10px] mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>{field.help_ar}</p>}
              {field.field_type === 'textarea' ? (
                <textarea disabled rows={3} placeholder={field.placeholder_ar}
                  className="w-full px-3 py-2 rounded-xl text-xs resize-none" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)' }} />
              ) : field.field_type === 'select' ? (
                <select disabled className="w-full px-3 py-2 rounded-xl text-xs" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)' }}>
                  <option>{field.placeholder_ar ?? 'اختر...'}</option>
                  {(field.options ?? []).map(o => <option key={o}>{o}</option>)}
                </select>
              ) : (
                <input disabled type={field.field_type} placeholder={field.placeholder_ar}
                  className="w-full px-3 py-2 rounded-xl text-xs" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)' }} />
              )}
            </div>
          ))}
          {fields.length === 0 && <p className="text-center text-xs py-4" style={{ color: 'rgba(255,255,255,0.3)' }}>لا توجد حقول في النموذج</p>}
        </Card>
      )}
    </div>
  );
}

// ── Addons Tab ────────────────────────────────────────────────────────────────

function AddonsTab({ services, onRefresh }: { services: Service[]; onRefresh: () => void }) {
  const [selectedServiceId, setSelectedServiceId] = useState<string>(services[0]?.id ?? '');
  const [addons, setAddons] = useState<ServiceAddon[]>([]);
  const [editAddon, setEditAddon] = useState<Partial<ServiceAddon> | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchAddons = useCallback(async () => {
    if (!selectedServiceId) return;
    const { data } = await supabase.from('service_addons').select('*').eq('service_id', selectedServiceId).order('sort_order');
    setAddons(data ?? []);
  }, [selectedServiceId]);

  useEffect(() => { fetchAddons(); }, [fetchAddons]);

  const blank: Partial<ServiceAddon> = {
    service_id: selectedServiceId, name_ar: '', price_type: 'FIXED',
    price_value: 0, is_required: false, is_active: true, sort_order: addons.length,
  };

  const save = async () => {
    if (!editAddon?.name_ar) return;
    setSaving(true);
    const payload = {
      service_id: selectedServiceId,
      name_ar: editAddon.name_ar,
      name_en: editAddon.name_en,
      description_ar: editAddon.description_ar,
      price_type: editAddon.price_type ?? 'FIXED',
      price_value: editAddon.price_value ?? 0,
      is_required: editAddon.is_required ?? false,
      is_active: editAddon.is_active ?? true,
      sort_order: editAddon.sort_order ?? 0,
    };
    try {
      if ((editAddon as ServiceAddon).id) {
        await supabase.from('service_addons').update(payload).eq('id', (editAddon as ServiceAddon).id!);
      } else {
        await supabase.from('service_addons').insert(payload);
      }
      setEditAddon(null);
      fetchAddons();
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5 p-1.5 rounded-2xl overflow-x-auto" style={{ background: 'rgba(0,0,0,0.2)', border }}>
        {services.filter(s => !s.archived_at).map(s => (
          <button key={s.id} onClick={() => setSelectedServiceId(s.id)}
            className="px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all"
            style={selectedServiceId === s.id
              ? { background: `${gold}18`, color: gold, border: `1px solid ${gold}30` }
              : { color: 'rgba(255,255,255,0.4)', border: '1px solid transparent' }}>
            {s.icon} {s.name_ar ?? s.name}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <SectionTitle>الإضافات ({addons.length})</SectionTitle>
        <button onClick={() => setEditAddon(blank)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold"
          style={{ background: `${gold}18`, color: gold, border: `1px solid ${gold}30` }}>
          <Plus className="w-3.5 h-3.5" /> إضافة جديدة
        </button>
      </div>

      {editAddon && (
        <Card className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <InputField label="اسم الإضافة (عربي) *" value={editAddon.name_ar ?? ''} onChange={v => setEditAddon(p => ({ ...p!, name_ar: v }))} required />
            <InputField label="اسم الإضافة (إنجليزي)" value={editAddon.name_en ?? ''} onChange={v => setEditAddon(p => ({ ...p!, name_en: v }))} />
            <SelectField label="نوع السعر" value={editAddon.price_type ?? 'FIXED'} onChange={v => setEditAddon(p => ({ ...p!, price_type: v }))}
              options={[{ value: 'FIXED', label: 'ثابت' }, { value: 'PER_UNIT', label: 'لكل وحدة' }, { value: 'PERCENTAGE', label: 'نسبة مئوية' }]} />
            <InputField label="قيمة السعر *" value={editAddon.price_value ?? 0} onChange={v => setEditAddon(p => ({ ...p!, price_value: parseFloat(v) || 0 }))} type="number" required />
            <InputField label="وصف" value={editAddon.description_ar ?? ''} onChange={v => setEditAddon(p => ({ ...p!, description_ar: v }))} />
          </div>
          <div className="flex gap-4">
            <Toggle label="مطلوب" checked={editAddon.is_required ?? false} onChange={v => setEditAddon(p => ({ ...p!, is_required: v }))} />
            <Toggle label="نشط" checked={editAddon.is_active ?? true} onChange={v => setEditAddon(p => ({ ...p!, is_active: v }))} />
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={save} disabled={saving}
              className="flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: `${gold}18`, color: gold, border: `1px solid ${gold}30` }}>
              <Save className="w-3.5 h-3.5" /> {saving ? 'جارٍ الحفظ...' : 'حفظ'}
            </button>
            <button onClick={() => setEditAddon(null)} className="px-4 py-2 rounded-xl text-xs"
              style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>إلغاء</button>
          </div>
        </Card>
      )}

      <div className="space-y-2">
        {addons.map(addon => (
          <Card key={addon.id} className="flex items-center gap-3">
            <div className="flex-1">
              <p className="text-sm font-bold text-white">{addon.name_ar}</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {addon.price_value} {addon.price_type === 'PERCENTAGE' ? '%' : 'LYD'} ({addon.price_type})
              </p>
            </div>
            <div className="flex items-center gap-2">
              {addon.is_required && <Badge color="#ef4444" label="مطلوب" />}
              <Badge color={addon.is_active ? '#10b981' : '#6b7280'} label={addon.is_active ? 'نشط' : 'متوقف'} />
            </div>
            <button onClick={() => setEditAddon(addon)} className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: `${gold}10`, color: gold }}><Edit2 className="w-3 h-3" /></button>
          </Card>
        ))}
        {addons.length === 0 && <Card><p className="text-center text-sm py-4" style={{ color: 'rgba(255,255,255,0.3)' }}>لا توجد إضافات لهذه الخدمة.</p></Card>}
      </div>
    </div>
  );
}

// ── Payment Methods Tab ───────────────────────────────────────────────────────

function PaymentMethodsTab({ services, paymentMethods, onRefresh }: {
  services: Service[]; paymentMethods: PaymentMethod[]; onRefresh: () => void;
}) {
  const [selectedServiceId, setSelectedServiceId] = useState<string>(services[0]?.id ?? '');
  const [mappings, setMappings] = useState<ServicePaymentMethod[]>([]);
  const [editMap, setEditMap] = useState<Partial<ServicePaymentMethod> | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchMappings = useCallback(async () => {
    if (!selectedServiceId) return;
    const { data } = await supabase
      .from('service_payment_methods')
      .select('*, payment_method:payment_methods(*)')
      .eq('service_id', selectedServiceId)
      .order('sort_order');
    setMappings(data ?? []);
  }, [selectedServiceId]);

  useEffect(() => { fetchMappings(); }, [fetchMappings]);

  const enabledIds = mappings.map(m => m.payment_method_id);
  const availablePMs = paymentMethods.filter(pm => !enabledIds.includes(pm.id));

  const addMethod = async (pmId: string) => {
    await supabase.from('service_payment_methods').insert({
      service_id: selectedServiceId,
      payment_method_id: pmId,
      is_enabled: true,
      sort_order: mappings.length,
    });
    fetchMappings();
  };

  const save = async () => {
    if (!editMap) return;
    setSaving(true);
    try {
      await supabase.from('service_payment_methods').update({
        is_enabled: editMap.is_enabled,
        min_amount_override: editMap.min_amount_override,
        max_amount_override: editMap.max_amount_override,
        fixed_fee_override: editMap.fixed_fee_override,
        percentage_fee_override: editMap.percentage_fee_override,
        discount_percent: editMap.discount_percent,
        instructions_override_ar: editMap.instructions_override_ar,
      }).eq('id', editMap.id!);
      setEditMap(null);
      fetchMappings();
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5 p-1.5 rounded-2xl overflow-x-auto" style={{ background: 'rgba(0,0,0,0.2)', border }}>
        {services.filter(s => !s.archived_at).map(s => (
          <button key={s.id} onClick={() => setSelectedServiceId(s.id)}
            className="px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all"
            style={selectedServiceId === s.id
              ? { background: `${gold}18`, color: gold, border: `1px solid ${gold}30` }
              : { color: 'rgba(255,255,255,0.4)', border: '1px solid transparent' }}>
            {s.icon} {s.name_ar ?? s.name}
          </button>
        ))}
      </div>

      <SectionTitle>طرق الدفع المُفعَّلة</SectionTitle>

      {availablePMs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {availablePMs.map(pm => (
            <button key={pm.id} onClick={() => addMethod(pm.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold"
              style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', border }}>
              <Plus className="w-3 h-3" /> {pm.name_ar}
            </button>
          ))}
        </div>
      )}

      {editMap && (
        <Card className="space-y-3">
          <p className="text-sm font-bold text-white">إعدادات: {editMap.payment_method?.name_ar}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <InputField label="حد أدنى للمبلغ (تجاوز)" value={editMap.min_amount_override ?? ''} onChange={v => setEditMap(p => ({ ...p!, min_amount_override: parseFloat(v) || undefined }))} type="number" />
            <InputField label="حد أعلى للمبلغ (تجاوز)" value={editMap.max_amount_override ?? ''} onChange={v => setEditMap(p => ({ ...p!, max_amount_override: parseFloat(v) || undefined }))} type="number" />
            <InputField label="رسوم ثابتة (تجاوز)" value={editMap.fixed_fee_override ?? ''} onChange={v => setEditMap(p => ({ ...p!, fixed_fee_override: parseFloat(v) || undefined }))} type="number" />
            <InputField label="رسوم نسبة مئوية % (تجاوز)" value={editMap.percentage_fee_override ?? ''} onChange={v => setEditMap(p => ({ ...p!, percentage_fee_override: parseFloat(v) || undefined }))} type="number" />
            <InputField label="خصم % على هذه الطريقة" value={editMap.discount_percent ?? ''} onChange={v => setEditMap(p => ({ ...p!, discount_percent: parseFloat(v) || undefined }))} type="number" />
          </div>
          <InputField label="تعليمات خاصة لهذه الخدمة (تجاوز)" value={editMap.instructions_override_ar ?? ''} onChange={v => setEditMap(p => ({ ...p!, instructions_override_ar: v }))} rows={2} />
          <Toggle label="مُفعَّل" checked={editMap.is_enabled ?? true} onChange={v => setEditMap(p => ({ ...p!, is_enabled: v }))} />
          <div className="flex gap-2 pt-2">
            <button onClick={save} disabled={saving}
              className="flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2"
              style={{ background: `${gold}18`, color: gold, border: `1px solid ${gold}30` }}>
              <Save className="w-3.5 h-3.5" /> {saving ? 'جارٍ الحفظ...' : 'حفظ'}
            </button>
            <button onClick={() => setEditMap(null)} className="px-4 py-2 rounded-xl text-xs"
              style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>إلغاء</button>
          </div>
        </Card>
      )}

      <div className="space-y-2">
        {mappings.map(m => (
          <Card key={m.id} className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.05)' }}>
              <CreditCard className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.5)' }} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-white">{m.payment_method?.name_ar ?? '—'}</p>
              <div className="flex gap-2 flex-wrap mt-0.5">
                {m.fixed_fee_override != null && <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>رسوم: {m.fixed_fee_override} LYD</span>}
                {m.discount_percent && m.discount_percent > 0 && <span className="text-[10px]" style={{ color: '#10b981' }}>خصم: {m.discount_percent}%</span>}
              </div>
            </div>
            <Badge color={m.is_enabled ? '#10b981' : '#6b7280'} label={m.is_enabled ? 'مُفعَّل' : 'معطَّل'} />
            <button onClick={() => setEditMap({ ...m })} className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: `${gold}10`, color: gold }}><Edit2 className="w-3 h-3" /></button>
          </Card>
        ))}
        {mappings.length === 0 && <Card><p className="text-center text-sm py-4" style={{ color: 'rgba(255,255,255,0.3)' }}>لا توجد طرق دفع مُضافة. أضف طريقة دفع من القائمة أعلاه.</p></Card>}
      </div>
    </div>
  );
}

// ── Quotes Tab ────────────────────────────────────────────────────────────────

function QuotesTab() {
  const [quotes, setQuotes] = useState<ServiceQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('');
  const [issuing, setIssuing] = useState<string | null>(null);
  const [issueAmount, setIssueAmount] = useState('');
  const [issueNote, setIssueNote] = useState('');
  const [savingIssue, setSavingIssue] = useState(false);

  const fetchQuotes = async () => {
    setLoading(true);
    const { data } = await supabase.rpc('get_admin_quotes', { p_status_filter: filter || null, p_limit: 100, p_offset: 0 });
    setQuotes(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { fetchQuotes(); }, [filter]);

  const issueQuote = async (quoteId: string) => {
    if (!issueAmount || parseFloat(issueAmount) <= 0) { alert('أدخل مبلغًا صحيحًا'); return; }
    setSavingIssue(true);
    const { data, error } = await supabase.rpc('issue_service_quote', {
      p_quote_id: quoteId,
      p_proposed_amount: parseFloat(issueAmount),
      p_internal_note: issueNote || null,
      p_valid_hours: 48,
    });
    setSavingIssue(false);
    if (error || data?.error) { alert(`خطأ: ${error?.message ?? data?.error}`); return; }
    setIssuing(null);
    setIssueAmount('');
    setIssueNote('');
    fetchQuotes();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <SectionTitle>طلبات عروض الأسعار</SectionTitle>
        <div className="flex gap-2 flex-wrap">
          {['', 'REQUESTED', 'UNDER_REVIEW', 'QUOTED', 'ACCEPTED', 'REJECTED'].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
              style={filter === s
                ? { background: `${gold}18`, color: gold, border: `1px solid ${gold}30` }
                : { color: 'rgba(255,255,255,0.4)', border }}>
              {s ? (QUOTE_STATUSES[s]?.label ?? s) : 'الكل'}
            </button>
          ))}
          <button onClick={fetchQuotes} className="p-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)', border }}>
            <RefreshCw className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.5)' }} />
          </button>
        </div>
      </div>

      {loading && <div className="flex items-center justify-center py-8"><div className="w-6 h-6 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: gold }} /></div>}

      {!loading && quotes.length === 0 && (
        <Card><p className="text-center text-sm py-8" style={{ color: 'rgba(255,255,255,0.3)' }}>لا توجد طلبات عروض أسعار</p></Card>
      )}

      <div className="space-y-3">
        {quotes.map(q => {
          const statusInfo = QUOTE_STATUSES[q.status];
          return (
            <Card key={q.id}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-mono font-black text-white">{q.quote_code}</span>
                    <Badge color={statusInfo?.color ?? '#6b7280'} label={statusInfo?.label ?? q.status} />
                  </div>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    {q.service_name} · {q.username}
                  </p>
                  {q.proposed_amount && (
                    <p className="text-xs mt-1" style={{ color: gold }}>{q.proposed_amount} {q.currency}</p>
                  )}
                  {q.valid_until && q.status === 'QUOTED' && (
                    <p className="text-[10px] mt-0.5" style={{ color: new Date(q.valid_until) < new Date() ? '#ef4444' : 'rgba(255,255,255,0.35)' }}>
                      صالح حتى: {new Date(q.valid_until).toLocaleDateString('ar')}
                    </p>
                  )}
                  <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.25)' }}>
                    {new Date(q.requested_at).toLocaleDateString('ar')}
                  </p>
                </div>
                {['REQUESTED', 'UNDER_REVIEW', 'NEEDS_INFO'].includes(q.status) && (
                  <button onClick={() => setIssuing(q.id)}
                    className="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold"
                    style={{ background: `${gold}18`, color: gold, border: `1px solid ${gold}30` }}>
                    إصدار سعر
                  </button>
                )}
              </div>

              {/* Customer input */}
              {Object.keys(q.requested_input_snapshot).length > 0 && (
                <div className="mt-3 pt-3 space-y-1" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  {Object.entries(q.requested_input_snapshot).map(([k, v]) => (
                    <div key={k} className="flex gap-2 text-xs">
                      <span style={{ color: 'rgba(255,255,255,0.4)', minWidth: 80 }}>{k}:</span>
                      <span className="text-white">{String(v)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Issue form */}
              {issuing === q.id && (
                <div className="mt-3 pt-3 space-y-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex gap-2">
                    <input type="number" value={issueAmount} onChange={e => setIssueAmount(e.target.value)}
                      placeholder="المبلغ المقترح"
                      className="flex-1 px-3 py-1.5 rounded-lg text-xs text-white outline-none"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
                    <span className="text-xs flex items-center px-2" style={{ color: 'rgba(255,255,255,0.4)' }}>LYD</span>
                  </div>
                  <input value={issueNote} onChange={e => setIssueNote(e.target.value)}
                    placeholder="ملاحظة داخلية (اختياري)"
                    className="w-full px-3 py-1.5 rounded-lg text-xs text-white outline-none"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
                  <div className="flex gap-2">
                    <button onClick={() => issueQuote(q.id)} disabled={savingIssue}
                      className="flex-1 py-1.5 rounded-xl text-xs font-bold disabled:opacity-50"
                      style={{ background: `${gold}18`, color: gold }}>
                      {savingIssue ? 'جارٍ الإرسال...' : 'إرسال العرض'}
                    </button>
                    <button onClick={() => setIssuing(null)} className="px-3 py-1.5 rounded-xl text-xs"
                      style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)' }}>إلغاء</button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ── Service Orders Tab ────────────────────────────────────────────────────────

function ServiceOrdersTab({ services }: { services: Service[] }) {
  const [orders, setOrders] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [serviceFilter, setServiceFilter] = useState('');

  const fetchOrders = async () => {
    setLoading(true);
    const { data } = await supabase.rpc('get_admin_service_orders', {
      p_status_filter: filter || null,
      p_service_id: serviceFilter || null,
      p_limit: 100,
      p_offset: 0,
    });
    const arr = data?.orders ?? data;
    setOrders(Array.isArray(arr) ? arr : []);
    setLoading(false);
  };

  useEffect(() => { fetchOrders(); }, [filter, serviceFilter]);

  const PAY_COLOR: Record<string, string> = {
    NOT_SUBMITTED: '#6b7280', SUBMITTED: '#3b82f6', APPROVED: '#10b981',
    REJECTED: '#ef4444', NEEDS_INFO: '#f97316',
  };
  const ORDER_COLOR: Record<string, string> = {
    DRAFT: '#6b7280', AWAITING_PAYMENT: '#f59e0b', PAYMENT_SUBMITTED: '#3b82f6',
    PAID: '#10b981', IN_FULFILLMENT: '#8b5cf6', COMPLETED: '#10b981',
    CANCELLED: '#ef4444',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <SectionTitle>طلبات الخدمات</SectionTitle>
        <button onClick={fetchOrders} className="p-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)', border }}>
          <RefreshCw className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.5)' }} />
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <select value={filter} onChange={e => setFilter(e.target.value)}
          className="px-3 py-1.5 rounded-xl text-xs text-white outline-none"
          style={{ background: 'rgba(255,255,255,0.05)', border }}>
          <option value="">كل الحالات</option>
          {['AWAITING_PAYMENT','PAYMENT_SUBMITTED','PAID','IN_FULFILLMENT','COMPLETED','CANCELLED'].map(s => (
            <option key={s} value={s} style={{ background: '#111' }}>{s}</option>
          ))}
        </select>
        <select value={serviceFilter} onChange={e => setServiceFilter(e.target.value)}
          className="px-3 py-1.5 rounded-xl text-xs text-white outline-none"
          style={{ background: 'rgba(255,255,255,0.05)', border }}>
          <option value="">كل الخدمات</option>
          {services.filter(s => !s.archived_at).map(s => (
            <option key={s.id} value={s.id} style={{ background: '#111' }}>{s.name_ar ?? s.name}</option>
          ))}
        </select>
      </div>

      {loading && <div className="flex items-center justify-center py-8"><div className="w-6 h-6 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: gold }} /></div>}

      {!loading && orders.length === 0 && (
        <Card><p className="text-center text-sm py-8" style={{ color: 'rgba(255,255,255,0.3)' }}>لا توجد طلبات خدمات</p></Card>
      )}

      <div className="space-y-2">
        {orders.map((o: any) => (
          <Card key={o.id}>
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-xs font-mono font-bold text-white">{o.order_code}</span>
                  <Badge color={ORDER_COLOR[o.order_status] ?? '#6b7280'} label={o.order_status} />
                  <Badge color={PAY_COLOR[o.payment_status] ?? '#6b7280'} label={o.payment_status} />
                </div>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {o.service_name ?? '—'} · {o.username}
                </p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-sm font-bold" style={{ color: gold }}>{o.final_total_snapshot} {o.currency}</span>
                  <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    {new Date(o.created_at).toLocaleDateString('ar')}
                  </span>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
