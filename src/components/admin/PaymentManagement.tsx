/**
 * PaymentManagement — Admin panel for managing payment methods and destinations.
 * Payment request review/approve/reject lives in CommerceAdmin.tsx (PaymentsTab).
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Plus, RefreshCw, AlertTriangle, Check, CheckCircle,
  Building2, Phone, Wallet, CreditCard, Settings,
  Eye, EyeOff, Archive, Loader2, Search,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PaymentMethodEditor, PaymentMethod, MethodType } from './PaymentMethodEditor';

// ─── Completeness helper ─────────────────────────────────────────────────────

function completeness(m: PaymentMethod): { label: string; color: string; bg: string } {
  if (!m.active) return { label: 'غير نشطة', color: '#6b7280', bg: 'rgba(107,114,128,0.15)' };
  if (m.is_maintenance) return { label: 'في وضع الصيانة', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' };
  if (m.active_destinations === 0 && m.type !== 'EXTERNAL_GATEWAY')
    return { label: 'لا يوجد حساب استقبال', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' };
  if ((m.active_destinations ?? 0) > 0)
    return { label: 'مكتملة', color: '#10b981', bg: 'rgba(16,185,129,0.12)' };
  return { label: 'تحتاج إعداد', color: '#f97316', bg: 'rgba(249,115,22,0.12)' };
}

function MethodTypeIcon({ type }: { type: MethodType }) {
  const cls = 'w-5 h-5';
  if (type === 'BANK_TRANSFER' || type === 'CASH_DEPOSIT') return <Building2 className={cls} />;
  if (type === 'LIBYANA' || type === 'ALMADAR') return <Phone className={cls} />;
  if (type === 'MOBILE_WALLET') return <Wallet className={cls} />;
  return <CreditCard className={cls} />;
}

// ─── Method card ─────────────────────────────────────────────────────────────

function MethodCard({
  method,
  onEdit,
  onToggle,
  onMaintenance,
}: {
  method: PaymentMethod;
  onEdit: () => void;
  onToggle: () => void;
  onMaintenance: () => void;
}) {
  const status = completeness(method);

  return (
    <div
      className="rounded-2xl border transition-all hover:border-slate-600 cursor-pointer group"
      style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
      onClick={onEdit}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(255,255,255,0.06)', color: '#d6b47b' }}>
            <MethodTypeIcon type={method.type} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-white text-sm truncate">{method.name_ar}</p>
            {method.name_en && <p className="text-xs text-slate-500 truncate">{method.name_en}</p>}
            <p className="text-xs mt-0.5" style={{ color: '#7c6f5c' }}>{method.code}</p>
          </div>
          <span
            className="text-xs px-2 py-0.5 rounded-full shrink-0 font-medium"
            style={{ color: status.color, background: status.bg }}
          >
            {status.label}
          </span>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="text-center rounded-lg py-2" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <p className="text-base font-black text-white">{method.active_destinations ?? 0}</p>
            <p className="text-xs" style={{ color: '#7c6f5c' }}>حساب نشط</p>
          </div>
          <div className="text-center rounded-lg py-2" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <p className="text-base font-black" style={{ color: '#d6b47b' }}>
              {method.fixed_fee > 0 ? `${method.fixed_fee} LYD` : method.percentage_fee > 0 ? `${method.percentage_fee}%` : '—'}
            </p>
            <p className="text-xs" style={{ color: '#7c6f5c' }}>الرسوم</p>
          </div>
          <div className="text-center rounded-lg py-2" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <p className="text-base font-black text-white">{method.sort_order}</p>
            <p className="text-xs" style={{ color: '#7c6f5c' }}>الترتيب</p>
          </div>
        </div>

        {/* Limits */}
        {(method.min_amount != null || method.max_amount != null) && (
          <p className="text-xs mb-3" style={{ color: '#7c6f5c' }}>
            {method.min_amount != null ? `${method.min_amount} LYD` : '—'}
            {' — '}
            {method.max_amount != null ? `${method.max_amount} LYD` : '—'}
          </p>
        )}

        {/* Requirements badges */}
        <div className="flex flex-wrap gap-1 mb-3">
          {method.proof_required && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(59,130,246,0.12)', color: '#60a5fa' }}>إثبات مطلوب</span>
          )}
          {method.reference_required && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(59,130,246,0.12)', color: '#60a5fa' }}>مرجع مطلوب</span>
          )}
          {method.payer_phone_required && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(59,130,246,0.12)', color: '#60a5fa' }}>هاتف مطلوب</span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}
          onClick={e => e.stopPropagation()}>
          <button
            onClick={onEdit}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{ background: 'rgba(214,180,123,0.1)', color: '#d6b47b' }}
          >
            <Settings size={12} />
            تحرير
          </button>
          <button
            onClick={onMaintenance}
            className="px-3 py-1.5 rounded-lg text-xs transition-colors"
            style={{
              background: method.is_maintenance ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)',
              color: method.is_maintenance ? '#f59e0b' : '#7c6f5c',
            }}
            title={method.is_maintenance ? 'إلغاء الصيانة' : 'وضع الصيانة'}
          >
            <AlertTriangle size={12} />
          </button>
          <button
            onClick={onToggle}
            className="px-3 py-1.5 rounded-lg text-xs transition-colors"
            style={{
              background: method.active ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
              color: method.active ? '#10b981' : '#ef4444',
            }}
            title={method.active ? 'تعطيل' : 'تفعيل'}
          >
            {method.active ? <Eye size={12} /> : <EyeOff size={12} />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Blank method defaults ────────────────────────────────────────────────────

function blankMethod(): Omit<PaymentMethod, 'id' | 'destinations' | 'total_destinations' | 'active_destinations' | 'archived_at'> {
  return {
    code: '',
    name_ar: '',
    name_en: null,
    description_ar: null,
    description_en: null,
    type: 'BANK_TRANSFER',
    icon_url: null,
    active: true,
    is_maintenance: false,
    sort_order: 0,
    min_amount: null,
    max_amount: null,
    fixed_fee: 0,
    percentage_fee: 0,
    proof_required: true,
    reference_required: false,
    payer_phone_required: false,
    allowed_file_types: ['image/jpeg', 'image/png', 'image/webp'],
    max_file_size_mb: 5,
    request_expiry_minutes: 1440,
    supported_order_types: ['POINT_PACKAGE', 'SERVICE', 'SUBSCRIPTION', 'DIGITAL_PRODUCT'],
    required_fields_schema: [],
    instructions_ar: null,
    instructions_en: null,
    short_notice_ar: null,
    short_notice_en: null,
    warning_notice_ar: null,
    warning_notice_en: null,
    confirmation_note_ar: null,
    confirmation_note_en: null,
    support_contact_ar: null,
    support_contact_en: null,
  };
}

// ─── Main component ───────────────────────────────────────────────────────────

export const PaymentManagement = () => {
  const [methods, setMethods]       = useState<PaymentMethod[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [editing, setEditing]       = useState<PaymentMethod | null>(null);
  const [creating, setCreating]     = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [notify, setNotify]         = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_payment_methods_admin');
    if (!error && Array.isArray(data)) {
      setMethods(data as PaymentMethod[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = (msg: string) => {
    setNotify(msg);
    setTimeout(() => setNotify(null), 3000);
  };

  const toggleActive = async (m: PaymentMethod) => {
    setTogglingId(m.id);
    await supabase.rpc('upsert_payment_method', { p_id: m.id, p_active: !m.active });
    await load();
    setTogglingId(null);
    flash(m.active ? 'تم تعطيل طريقة الدفع' : 'تم تفعيل طريقة الدفع');
  };

  const toggleMaintenance = async (m: PaymentMethod) => {
    setTogglingId(m.id);
    await supabase.rpc('upsert_payment_method', { p_id: m.id, p_is_maintenance: !m.is_maintenance });
    await load();
    setTogglingId(null);
    flash(m.is_maintenance ? 'تم إلغاء وضع الصيانة' : 'تم تفعيل وضع الصيانة');
  };

  const filtered = methods.filter(m =>
    !m.archived_at &&
    (m.name_ar.includes(search) || (m.name_en ?? '').toLowerCase().includes(search.toLowerCase()) || m.code.includes(search))
  );

  const newMethod: PaymentMethod = {
    ...blankMethod(),
    id: '',
    destinations: [],
    total_destinations: 0,
    active_destinations: 0,
    archived_at: null,
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-black" style={{ color: '#d6b47b' }}>طرق الدفع</h2>
          <p className="text-xs mt-0.5" style={{ color: '#7c6f5c' }}>
            {filtered.length} طريقة ·{' '}
            {filtered.filter(m => m.active && !m.is_maintenance && (m.active_destinations ?? 0) > 0).length} متاحة للعملاء
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="بحث..."
              className="pl-3 pr-8 py-2 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-slate-500 border border-slate-700"
              style={{ background: 'rgba(255,255,255,0.04)' }}
            />
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="p-2 rounded-lg transition-all"
            style={{ background: 'rgba(255,255,255,0.05)' }}
          >
            <RefreshCw size={14} className={`${loading ? 'animate-spin' : ''}`} style={{ color: '#9c8d76' }} />
          </button>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ background: 'rgba(214,180,123,0.15)', color: '#d6b47b' }}
          >
            <Plus size={14} />
            إضافة طريقة
          </button>
        </div>
      </div>

      {/* Flash notification */}
      {notify && (
        <div className="flex items-center gap-2 rounded-xl px-4 py-3" style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)' }}>
          <Check size={14} className="text-emerald-400" />
          <p className="text-sm text-emerald-300">{notify}</p>
        </div>
      )}

      {/* Warning: incomplete methods */}
      {(() => {
        const incomplete = filtered.filter(m => m.active && !m.is_maintenance && (m.active_destinations ?? 0) === 0 && m.type !== 'EXTERNAL_GATEWAY');
        if (!incomplete.length) return null;
        return (
          <div className="flex items-start gap-2 rounded-xl px-4 py-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-red-300 font-medium">طرق دفع نشطة بدون حساب استقبال</p>
              <p className="text-xs text-red-400/70 mt-0.5">
                {incomplete.map(m => m.name_ar).join('، ')} — هذه الطرق لن تظهر للعملاء تلقائيًا.
              </p>
            </div>
          </div>
        );
      })()}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array(6).fill(0).map((_, i) => (
            <div key={i} className="h-56 rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 rounded-2xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.08)' }}>
          <CreditCard size={32} className="mx-auto mb-3 text-slate-600" />
          <p className="text-slate-400">لا توجد طرق دفع</p>
          <button
            onClick={() => setCreating(true)}
            className="mt-4 px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: 'rgba(214,180,123,0.1)', color: '#d6b47b' }}
          >
            إضافة أول طريقة
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(m => (
            <div key={m.id} className="relative">
              {togglingId === m.id && (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl" style={{ background: 'rgba(0,0,0,0.5)' }}>
                  <Loader2 size={20} className="animate-spin text-white" />
                </div>
              )}
              <MethodCard
                method={m}
                onEdit={() => setEditing(m)}
                onToggle={() => toggleActive(m)}
                onMaintenance={() => toggleMaintenance(m)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Completeness legend */}
      <div className="flex flex-wrap gap-4 text-xs" style={{ color: '#7c6f5c' }}>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />مكتملة</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />في وضع الصيانة</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />لا يوجد حساب استقبال</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-500 inline-block" />غير نشطة</span>
      </div>

      {/* Editor modals */}
      {editing && (
        <PaymentMethodEditor
          method={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); flash('تم حفظ التغييرات'); }}
        />
      )}
      {creating && (
        <PaymentMethodEditor
          method={newMethod}
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); load(); flash('تم إنشاء طريقة الدفع بنجاح'); }}
        />
      )}
    </div>
  );
};
