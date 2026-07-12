import { useState, useCallback } from 'react';
import {
  X, Plus, Trash2, Building2, Phone, Wallet, CreditCard,
  ChevronDown, ChevronUp, AlertCircle, Loader2, Check,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type MethodType =
  | 'BANK_TRANSFER'
  | 'CASH_DEPOSIT'
  | 'LIBYANA'
  | 'ALMADAR'
  | 'MOBILE_WALLET'
  | 'EXTERNAL_GATEWAY';

export interface PaymentDestination {
  id: string;
  payment_method_id: string;
  label_ar: string | null;
  label_en: string | null;
  account_holder: string | null;
  bank_name: string | null;
  bank_name_en: string | null;
  account_number: string | null;
  iban: string | null;
  wallet_phone: string | null;
  receiver_phone: string | null;
  receiver_name: string | null;
  branch_name: string | null;
  swift_code: string | null;
  transfer_service_name: string | null;
  wallet_provider: string | null;
  confirmation_instructions: string | null;
  public_notes_ar: string | null;
  public_notes_en: string | null;
  internal_notes: string | null;
  priority: number;
  is_active: boolean;
  is_maintenance: boolean;
  daily_capacity: number | null;
  min_amount: number | null;
  max_amount: number | null;
  available_from: string | null;
  available_until: string | null;
  archived_at: string | null;
}

export interface PaymentMethod {
  id: string;
  code: string;
  name_ar: string;
  name_en: string | null;
  description_ar: string | null;
  description_en: string | null;
  type: MethodType;
  icon_url: string | null;
  active: boolean;
  is_maintenance: boolean;
  sort_order: number;
  min_amount: number | null;
  max_amount: number | null;
  fixed_fee: number;
  percentage_fee: number;
  proof_required: boolean;
  reference_required: boolean;
  payer_phone_required: boolean;
  allowed_file_types: string[];
  max_file_size_mb: number;
  request_expiry_minutes: number;
  supported_order_types: string[];
  required_fields_schema: unknown[];
  instructions_ar: string | null;
  instructions_en: string | null;
  short_notice_ar: string | null;
  short_notice_en: string | null;
  warning_notice_ar: string | null;
  warning_notice_en: string | null;
  confirmation_note_ar: string | null;
  confirmation_note_en: string | null;
  support_contact_ar: string | null;
  support_contact_en: string | null;
  destinations: PaymentDestination[];
  total_destinations: number;
  active_destinations: number;
  archived_at: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const METHOD_TYPES: { value: MethodType; label: string }[] = [
  { value: 'LIBYANA',          label: 'ليبيانا (محفظة/تحويل)' },
  { value: 'ALMADAR',          label: 'المدار (محفظة/تحويل)' },
  { value: 'MOBILE_WALLET',    label: 'محفظة إلكترونية' },
  { value: 'BANK_TRANSFER',    label: 'تحويل بنكي' },
  { value: 'CASH_DEPOSIT',     label: 'إيداع نقدي' },
  { value: 'EXTERNAL_GATEWAY', label: 'بوابة دفع خارجية' },
];

const ORDER_TYPES = ['POINT_PACKAGE', 'SERVICE', 'SUBSCRIPTION', 'DIGITAL_PRODUCT'];

// ─── Small helpers ────────────────────────────────────────────────────────────

function MethodTypeIcon({ type }: { type: MethodType }) {
  const cls = 'w-4 h-4';
  if (type === 'BANK_TRANSFER' || type === 'CASH_DEPOSIT') return <Building2 className={cls} />;
  if (type === 'LIBYANA' || type === 'ALMADAR') return <Phone className={cls} />;
  if (type === 'MOBILE_WALLET') return <Wallet className={cls} />;
  return <CreditCard className={cls} />;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium" style={{ color: '#9c8d76' }}>{label}</label>
      {children}
    </div>
  );
}

function Input({
  value, onChange, placeholder, type = 'text', disabled,
}: {
  value: string | number | null | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type={type}
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-slate-500 border focus:outline-none transition-colors disabled:opacity-50"
      style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)' }}
    />
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none" onClick={() => onChange(!checked)}>
      <div className="relative w-9 h-5 rounded-full transition-colors" style={{ background: checked ? '#d6b47b' : 'rgba(255,255,255,0.1)' }}>
        <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform" style={{ transform: checked ? 'translateX(16px)' : 'translateX(2px)' }} />
      </div>
      <span className="text-xs" style={{ color: '#9c8d76' }}>{label}</span>
    </label>
  );
}

// ─── Destination row ──────────────────────────────────────────────────────────

type DestForm = Partial<PaymentDestination> & { _isNew?: boolean; _tmpId?: string };

function DestinationRow({
  dest, methodType, onSave, onArchive, saving,
}: {
  dest: DestForm;
  methodType: MethodType;
  onSave: (d: DestForm) => void;
  onArchive: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<DestForm>({ ...dest });
  const [expanded, setExpanded] = useState(dest._isNew ?? false);
  const set = (k: keyof DestForm, v: unknown) => setForm(prev => ({ ...prev, [k]: v }));
  const isMobile = methodType === 'LIBYANA' || methodType === 'ALMADAR' || methodType === 'MOBILE_WALLET';
  const isBank = methodType === 'BANK_TRANSFER' || methodType === 'CASH_DEPOSIT';

  return (
    <div className="rounded-xl border" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.07)' }}>
      <div className="flex items-center gap-3 p-3 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">
            {form.label_ar || (isMobile ? (form.receiver_phone || form.wallet_phone) : form.account_holder) || 'حساب جديد'}
          </p>
          {(form.receiver_phone || form.wallet_phone) && (
            <p className="text-xs mt-0.5" style={{ color: '#7c6f5c' }}>{form.receiver_phone || form.wallet_phone}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: form.is_active ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', color: form.is_active ? '#10b981' : '#ef4444' }}>
            {form.is_active ? 'نشط' : 'متوقف'}
          </span>
          {expanded ? <ChevronUp size={14} style={{ color: '#7c6f5c' }} /> : <ChevronDown size={14} style={{ color: '#7c6f5c' }} />}
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="grid grid-cols-2 gap-3 pt-3">
            <Field label="تسمية (عربي)">
              <Input value={form.label_ar} onChange={v => set('label_ar', v)} placeholder="مثال: رقم ليبيانا الرئيسي" />
            </Field>
            <Field label="تسمية (إنجليزي)">
              <Input value={form.label_en} onChange={v => set('label_en', v)} placeholder="e.g. Main Libyana" />
            </Field>
          </div>

          {isMobile && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="رقم الاستقبال *">
                <Input value={form.receiver_phone} onChange={v => set('receiver_phone', v)} placeholder="09xxxxxxxx" />
              </Field>
              <Field label="اسم المستلم">
                <Input value={form.receiver_name} onChange={v => set('receiver_name', v)} placeholder="الاسم" />
              </Field>
            </div>
          )}

          {isBank && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="صاحب الحساب">
                  <Input value={form.account_holder} onChange={v => set('account_holder', v)} placeholder="الاسم الكامل" />
                </Field>
                <Field label="اسم البنك">
                  <Input value={form.bank_name} onChange={v => set('bank_name', v)} placeholder="اسم البنك" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="رقم الحساب">
                  <Input value={form.account_number} onChange={v => set('account_number', v)} placeholder="رقم الحساب" />
                </Field>
                <Field label="IBAN">
                  <Input value={form.iban} onChange={v => set('iban', v)} placeholder="LY..." />
                </Field>
              </div>
            </>
          )}

          <Field label="تعليمات التأكيد">
            <textarea
              value={form.confirmation_instructions ?? ''}
              onChange={e => set('confirmation_instructions', e.target.value)}
              rows={2}
              placeholder="التعليمات الظاهرة للعميل بعد الإرسال..."
              className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-slate-500 border focus:outline-none resize-none"
              style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)' }}
            />
          </Field>

          <Field label="ملاحظات عامة (ظاهرة للعميل)">
            <Input value={form.public_notes_ar} onChange={v => set('public_notes_ar', v)} placeholder="ملاحظة اختيارية" />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="الأولوية">
              <Input type="number" value={form.priority ?? 0} onChange={v => set('priority', Number(v))} />
            </Field>
            <Field label="الحد الأدنى (LYD)">
              <Input type="number" value={form.min_amount} onChange={v => set('min_amount', v ? Number(v) : null)} placeholder="—" />
            </Field>
            <Field label="الحد الأقصى (LYD)">
              <Input type="number" value={form.max_amount} onChange={v => set('max_amount', v ? Number(v) : null)} placeholder="—" />
            </Field>
          </div>

          <div className="flex flex-wrap gap-4">
            <Toggle checked={form.is_active ?? true} onChange={v => set('is_active', v)} label="نشط" />
            <Toggle checked={form.is_maintenance ?? false} onChange={v => set('is_maintenance', v)} label="صيانة" />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => onSave(form)}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
              style={{ background: 'rgba(214,180,123,0.15)', color: '#d6b47b' }}
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              حفظ
            </button>
            {!dest._isNew && (
              <button
                onClick={onArchive}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors disabled:opacity-50"
                style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}
              >
                <Trash2 size={12} />
                حذف
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

interface Props {
  method: PaymentMethod;
  onClose: () => void;
  onSaved: () => void;
}

export function PaymentMethodEditor({ method, onClose, onSaved }: Props) {
  const isNew = !method.id;

  const [form, setForm] = useState<PaymentMethod>({ ...method });
  const [saving, setSaving] = useState(false);
  const [savingDestId, setSavingDestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [destinations, setDestinations] = useState<DestForm[]>(method.destinations ?? []);
  const [activeTab, setActiveTab] = useState<'info' | 'destinations'>('info');

  const set = (k: keyof PaymentMethod, v: unknown) => setForm(prev => ({ ...prev, [k]: v }));

  const toggleOrderType = (type: string) => {
    const current = form.supported_order_types ?? [];
    set('supported_order_types', current.includes(type) ? current.filter(t => t !== type) : [...current, type]);
  };

  const saveMethod = useCallback(async () => {
    if (!form.code.trim() || !form.name_ar.trim()) {
      setError('الكود والاسم العربي مطلوبان');
      return;
    }
    setSaving(true);
    setError(null);

    const { data, error: err } = await supabase.rpc('upsert_payment_method', {
      p_id:                    isNew ? null : (form.id || null),
      p_code:                  form.code.trim().toLowerCase(),
      p_name_ar:               form.name_ar.trim(),
      p_name_en:               form.name_en?.trim() || null,
      p_description_ar:        form.description_ar?.trim() || null,
      p_description_en:        form.description_en?.trim() || null,
      p_type:                  form.type,
      p_icon_url:              form.icon_url?.trim() || null,
      p_active:                form.active,
      p_is_maintenance:        form.is_maintenance,
      p_sort_order:            form.sort_order ?? 0,
      p_min_amount:            form.min_amount ?? null,
      p_max_amount:            form.max_amount ?? null,
      p_fixed_fee:             form.fixed_fee ?? 0,
      p_percentage_fee:        form.percentage_fee ?? 0,
      p_proof_required:        form.proof_required,
      p_reference_required:    form.reference_required,
      p_payer_phone_required:  form.payer_phone_required,
      p_allowed_file_types:    JSON.stringify(form.allowed_file_types ?? ['image/jpeg', 'image/png', 'image/webp']),
      p_max_file_size_mb:      form.max_file_size_mb ?? 5,
      p_request_expiry_minutes: form.request_expiry_minutes ?? 1440,
      p_supported_order_types: JSON.stringify(form.supported_order_types ?? ['POINT_PACKAGE', 'SERVICE', 'SUBSCRIPTION', 'DIGITAL_PRODUCT']),
      p_required_fields_schema: JSON.stringify(form.required_fields_schema ?? []),
      p_instructions_ar:       form.instructions_ar?.trim() || null,
      p_instructions_en:       form.instructions_en?.trim() || null,
      p_short_notice_ar:       form.short_notice_ar?.trim() || null,
      p_short_notice_en:       form.short_notice_en?.trim() || null,
      p_warning_notice_ar:     form.warning_notice_ar?.trim() || null,
      p_warning_notice_en:     form.warning_notice_en?.trim() || null,
      p_confirmation_note_ar:  form.confirmation_note_ar?.trim() || null,
      p_confirmation_note_en:  form.confirmation_note_en?.trim() || null,
      p_support_contact_ar:    form.support_contact_ar?.trim() || null,
      p_support_contact_en:    form.support_contact_en?.trim() || null,
    });

    setSaving(false);

    if (err) {
      setError(err.message.includes('FORBIDDEN') ? 'ليس لديك صلاحية تعديل طرق الدفع' : err.message);
      return;
    }
    if (!data?.success) {
      setError(data?.error || 'فشل حفظ طريقة الدفع');
      return;
    }

    onSaved();
  }, [form, isNew, onSaved]);

  const refreshDestinations = useCallback(async (methodId: string) => {
    const { data } = await supabase.rpc('get_payment_methods_admin');
    if (data) {
      const updated = (data as PaymentMethod[]).find(m => m.id === methodId);
      if (updated) setDestinations(updated.destinations ?? []);
    }
  }, []);

  const saveDestination = useCallback(async (dest: DestForm) => {
    const destId = dest._isNew ? null : (dest.id || null);
    const key = destId ?? dest._tmpId ?? 'new';
    setSavingDestId(key);
    setError(null);

    const { data, error: err } = await supabase.rpc('upsert_payment_destination', {
      p_id:                        destId,
      p_payment_method_id:         form.id,
      p_label_ar:                  dest.label_ar?.trim() || null,
      p_label_en:                  dest.label_en?.trim() || null,
      p_account_holder:            dest.account_holder?.trim() || null,
      p_bank_name:                 dest.bank_name?.trim() || null,
      p_bank_name_en:              dest.bank_name_en?.trim() || null,
      p_account_number:            dest.account_number?.trim() || null,
      p_iban:                      dest.iban?.trim() || null,
      p_wallet_phone:              dest.wallet_phone?.trim() || null,
      p_receiver_phone:            dest.receiver_phone?.trim() || null,
      p_receiver_name:             dest.receiver_name?.trim() || null,
      p_branch_name:               dest.branch_name?.trim() || null,
      p_swift_code:                dest.swift_code?.trim() || null,
      p_transfer_service_name:     dest.transfer_service_name?.trim() || null,
      p_wallet_provider:           dest.wallet_provider?.trim() || null,
      p_confirmation_instructions: dest.confirmation_instructions?.trim() || null,
      p_public_notes_ar:           dest.public_notes_ar?.trim() || null,
      p_public_notes_en:           dest.public_notes_en?.trim() || null,
      p_internal_notes:            dest.internal_notes?.trim() || null,
      p_priority:                  dest.priority ?? 0,
      p_is_active:                 dest.is_active ?? true,
      p_is_maintenance:            dest.is_maintenance ?? false,
      p_daily_capacity:            dest.daily_capacity ?? null,
      p_min_amount:                dest.min_amount ?? null,
      p_max_amount:                dest.max_amount ?? null,
      p_available_from:            dest.available_from ?? null,
      p_available_until:           dest.available_until ?? null,
    });

    setSavingDestId(null);

    if (err) {
      setError(err.message.includes('FORBIDDEN') ? 'ليس لديك صلاحية تعديل حسابات الاستقبال' : err.message);
      return;
    }
    if (!data?.success) {
      setError(data?.error || 'فشل حفظ حساب الاستقبال');
      return;
    }

    await refreshDestinations(form.id);
    onSaved();
  }, [form.id, refreshDestinations, onSaved]);

  const archiveDestination = useCallback(async (destId: string) => {
    setSavingDestId(destId);
    await supabase.rpc('archive_payment_destination', { p_destination_id: destId });
    setSavingDestId(null);
    await refreshDestinations(form.id);
    onSaved();
  }, [form.id, refreshDestinations, onSaved]);

  const addNewDestination = () => {
    const _tmpId = `new-${Date.now()}`;
    setDestinations(prev => [...prev, {
      _isNew: true, _tmpId,
      label_ar: null, label_en: null, receiver_phone: null, receiver_name: null,
      account_holder: null, bank_name: null, bank_name_en: null,
      account_number: null, iban: null, wallet_phone: null,
      branch_name: null, swift_code: null, transfer_service_name: null,
      wallet_provider: null, confirmation_instructions: null,
      public_notes_ar: null, public_notes_en: null, internal_notes: null,
      priority: 0, is_active: true, is_maintenance: false,
      daily_capacity: null, min_amount: null, max_amount: null,
      available_from: null, available_until: null, archived_at: null,
    }]);
    setActiveTab('destinations');
  };

  const visibleDestinations = destinations.filter(d => !d.archived_at);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full sm:max-w-2xl max-h-[94vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl flex flex-col"
        style={{ background: '#0f0e1a', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 z-10" style={{ background: '#0f0e1a', borderColor: 'rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(214,180,123,0.12)', color: '#d6b47b' }}>
              <MethodTypeIcon type={form.type} />
            </div>
            <div>
              <h2 className="font-bold text-white text-sm">{isNew ? 'إضافة طريقة دفع جديدة' : 'تحرير طريقة الدفع'}</h2>
              {!isNew && <p className="text-xs mt-0.5" style={{ color: '#7c6f5c' }}>{form.code}</p>}
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', color: '#7c6f5c' }}>
            <X size={14} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          {(['info', 'destinations'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="flex-1 py-2.5 text-xs font-medium transition-colors"
              style={{
                color: activeTab === tab ? '#d6b47b' : '#7c6f5c',
                borderBottom: `2px solid ${activeTab === tab ? '#d6b47b' : 'transparent'}`,
              }}
            >
              {tab === 'info' ? 'معلومات الطريقة' : `حسابات الاستقبال (${visibleDestinations.length})`}
            </button>
          ))}
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-5 mt-4 flex gap-2 p-3 rounded-xl" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {/* ── Info tab ─────────────────────────────────────────── */}
        {activeTab === 'info' && (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="كود الطريقة *">
                <Input value={form.code} onChange={v => set('code', v.toLowerCase().replace(/\s+/g, '_'))} placeholder="libyana" disabled={!isNew} />
              </Field>
              <Field label="النوع *">
                <select
                  value={form.type}
                  onChange={e => set('type', e.target.value as MethodType)}
                  className="w-full px-3 py-2 rounded-lg text-sm text-white border focus:outline-none"
                  style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)' }}
                >
                  {METHOD_TYPES.map(t => (
                    <option key={t.value} value={t.value} style={{ background: '#1a1826' }}>{t.label}</option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="الاسم (عربي) *">
                <Input value={form.name_ar} onChange={v => set('name_ar', v)} placeholder="ليبيانا" />
              </Field>
              <Field label="الاسم (إنجليزي)">
                <Input value={form.name_en} onChange={v => set('name_en', v)} placeholder="Libyana" />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="الترتيب">
                <Input type="number" value={form.sort_order} onChange={v => set('sort_order', Number(v))} />
              </Field>
              <Field label="مدة الانتهاء (دقيقة)">
                <Input type="number" value={form.request_expiry_minutes} onChange={v => set('request_expiry_minutes', Number(v))} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="رسوم ثابتة (LYD)">
                <Input type="number" value={form.fixed_fee} onChange={v => set('fixed_fee', Number(v))} placeholder="0" />
              </Field>
              <Field label="رسوم نسبية (%)">
                <Input type="number" value={form.percentage_fee} onChange={v => set('percentage_fee', Number(v))} placeholder="0" />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="الحد الأدنى (LYD)">
                <Input type="number" value={form.min_amount} onChange={v => set('min_amount', v ? Number(v) : null)} placeholder="—" />
              </Field>
              <Field label="الحد الأقصى (LYD)">
                <Input type="number" value={form.max_amount} onChange={v => set('max_amount', v ? Number(v) : null)} placeholder="—" />
              </Field>
            </div>

            {/* Supported order types */}
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: '#9c8d76' }}>أنواع الطلبات المدعومة</p>
              <div className="flex flex-wrap gap-2">
                {ORDER_TYPES.map(t => {
                  const on = (form.supported_order_types ?? []).includes(t);
                  const labels: Record<string, string> = {
                    POINT_PACKAGE: 'متجر النقاط', SERVICE: 'الخدمات',
                    SUBSCRIPTION: 'اشتراكات', DIGITAL_PRODUCT: 'منتجات رقمية',
                  };
                  return (
                    <button
                      key={t}
                      onClick={() => toggleOrderType(t)}
                      className="px-3 py-1 rounded-full text-xs font-medium transition-all"
                      style={{
                        background: on ? 'rgba(214,180,123,0.15)' : 'rgba(255,255,255,0.05)',
                        border: `1px solid ${on ? 'rgba(214,180,123,0.35)' : 'rgba(255,255,255,0.08)'}`,
                        color: on ? '#d6b47b' : '#7c6f5c',
                      }}
                    >
                      {labels[t] ?? t}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Requirements */}
            <div className="p-4 rounded-xl space-y-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-xs font-medium" style={{ color: '#9c8d76' }}>متطلبات النموذج</p>
              <div className="flex flex-wrap gap-4">
                <Toggle checked={form.proof_required} onChange={v => set('proof_required', v)} label="صورة إثبات" />
                <Toggle checked={form.reference_required} onChange={v => set('reference_required', v)} label="رقم مرجع" />
                <Toggle checked={form.payer_phone_required} onChange={v => set('payer_phone_required', v)} label="هاتف المرسِل" />
              </div>
            </div>

            <Field label="تعليمات الدفع (عربي)">
              <textarea
                value={form.instructions_ar ?? ''}
                onChange={e => set('instructions_ar', e.target.value)}
                rows={2}
                placeholder="أرسل المبلغ على الرقم التالي..."
                className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-slate-500 border focus:outline-none resize-none"
                style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)' }}
              />
            </Field>

            <Field label="ملاحظة قصيرة (عربي)">
              <Input value={form.short_notice_ar} onChange={v => set('short_notice_ar', v)} placeholder="ملاحظة تظهر في النموذج..." />
            </Field>

            <Field label="تحذير (عربي)">
              <Input value={form.warning_notice_ar} onChange={v => set('warning_notice_ar', v)} placeholder="تحذير يظهر للعميل..." />
            </Field>

            <Field label="معلومات الدعم (عربي)">
              <Input value={form.support_contact_ar} onChange={v => set('support_contact_ar', v)} placeholder="تواصل مع الدعم..." />
            </Field>

            {/* Status toggles */}
            <div className="p-4 rounded-xl space-y-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-xs font-medium" style={{ color: '#9c8d76' }}>الحالة</p>
              <div className="flex gap-6">
                <Toggle checked={form.active} onChange={v => set('active', v)} label="نشطة" />
                <Toggle checked={form.is_maintenance} onChange={v => set('is_maintenance', v)} label="وضع الصيانة" />
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: 'rgba(255,255,255,0.05)', color: '#7c6f5c' }}>
                إلغاء
              </button>
              <button
                onClick={saveMethod}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg,#c6a06a,#d6b47b)', color: '#0a0a0a' }}
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {isNew ? 'إنشاء طريقة الدفع' : 'حفظ التغييرات'}
              </button>
            </div>
          </div>
        )}

        {/* ── Destinations tab ──────────────────────────────────── */}
        {activeTab === 'destinations' && (
          <div className="p-5 space-y-3">
            {isNew ? (
              <div className="text-center py-10">
                <p className="text-sm" style={{ color: '#7c6f5c' }}>احفظ طريقة الدفع أولاً ثم أضف حسابات الاستقبال</p>
              </div>
            ) : (
              <>
                {visibleDestinations.length === 0 && (
                  <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.15)' }}>
                    <AlertCircle size={14} className="text-red-400 shrink-0" />
                    <p className="text-xs text-red-300">
                      طريقة الدفع غير مكتملة — لا يوجد رقم استقبال فعّال. لن تظهر للمستخدمين حتى تضيف رقماً.
                    </p>
                  </div>
                )}

                {visibleDestinations.map((dest, i) => (
                  <DestinationRow
                    key={dest.id || dest._tmpId || i}
                    dest={dest}
                    methodType={form.type}
                    saving={savingDestId === (dest.id || dest._tmpId || 'new')}
                    onSave={d => saveDestination(d)}
                    onArchive={() => dest.id && archiveDestination(dest.id)}
                  />
                ))}

                <button
                  onClick={addNewDestination}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all"
                  style={{ border: '2px dashed rgba(214,180,123,0.2)', color: '#d6b47b' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(214,180,123,0.4)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(214,180,123,0.2)')}
                >
                  <Plus size={14} />
                  إضافة حساب استقبال
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
