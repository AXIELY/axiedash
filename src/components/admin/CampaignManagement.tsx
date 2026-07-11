import { useState, useRef } from 'react';
import { Plus, CreditCard as Edit2, Copy, Pause, Play, Trash2, Eye, EyeOff, Upload, Image, Loader2, Check, AlertCircle, X, Megaphone, Calendar, Sparkles, Monitor, Smartphone, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  useHomeCampaignAdmin,
  HomeCampaign, CampaignChip,
  CampaignType, CampaignStatus, ContentAlignment, ContentWidth, TextAlignment, OverlayStrength,
  CountdownMode, CtaActionType, ChipType,
} from '../../hooks/useHomeCampaign';
import { CampaignBannerRenderer } from '../HomeCampaignBanner';

/* ── Constants ──────────────────────────────────────────────── */

const CAMPAIGN_TYPES: { value: CampaignType; labelAr: string }[] = [
  { value: 'EVENT',       labelAr: 'حدث' },
  { value: 'PROMOTION',   labelAr: 'عرض ترويجي' },
  { value: 'GAME_LAUNCH', labelAr: 'إطلاق لعبة' },
  { value: 'FLASH_OFFER', labelAr: 'عرض محدود' },
  { value: 'ANNOUNCEMENT',labelAr: 'إعلان' },
  { value: 'TOURNAMENT',  labelAr: 'بطولة' },
  { value: 'SEASONAL',    labelAr: 'موسمي' },
];

type DerivedStatus = 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'EXPIRED' | 'PAUSED';

const DERIVED_STATUS_STYLES: Record<DerivedStatus, { bg: string; text: string; border: string }> = {
  DRAFT:     { bg: 'rgba(161,161,170,0.08)', text: '#a1a1aa', border: 'rgba(161,161,170,0.2)' },
  SCHEDULED: { bg: 'rgba(88,166,255,0.08)',  text: '#58A6FF', border: 'rgba(88,166,255,0.2)' },
  ACTIVE:    { bg: 'rgba(63,185,80,0.08)',   text: '#3FB950', border: 'rgba(63,185,80,0.2)' },
  PAUSED:    { bg: 'rgba(245,158,11,0.08)',  text: '#f59e0b', border: 'rgba(245,158,11,0.2)' },
  EXPIRED:   { bg: 'rgba(244,112,103,0.08)', text: '#F47067', border: 'rgba(244,112,103,0.2)' },
};

const DERIVED_STATUS_LABELS: Record<DerivedStatus, string> = {
  DRAFT: 'مسودة', SCHEDULED: 'مجدولة', ACTIVE: 'نشطة', PAUSED: 'موقوفة', EXPIRED: 'منتهية',
};

function getDerivedStatus(c: HomeCampaign): DerivedStatus {
  if (c.status === 'DRAFT')  return 'DRAFT';
  if (c.status === 'PAUSED') return 'PAUSED';
  const now = Date.now();
  if (c.ends_at   && new Date(c.ends_at).getTime()   <= now) return 'EXPIRED';
  if (c.starts_at && new Date(c.starts_at).getTime() >  now) return 'SCHEDULED';
  return 'ACTIVE';
}

const CHIP_TYPE_LABELS: Record<ChipType, string> = {
  POINTS: 'نقاط', COINS: 'عملات', RARE_REWARD: 'جائزة نادرة', DISCOUNT: 'خصم', CUSTOM: 'مخصص',
};

const BLANK_CHIP: Partial<CampaignChip> = {
  chip_type: 'CUSTOM', label_ar: '', label_en: '', value: '', icon_type: null, display_order: 0,
};

const BLANK_CAMPAIGN: Partial<HomeCampaign> = {
  internal_name: '',
  campaign_type: 'EVENT',
  title_ar: '', title_en: '',
  subtitle_ar: '', subtitle_en: '',
  badge_ar: '', badge_en: '',
  desktop_image_url: null, mobile_image_url: null,
  content_alignment: 'RIGHT',
  content_width: 'NORMAL',
  text_alignment: 'RIGHT',
  overlay_strength: 'MEDIUM',
  image_position_x: 50, image_position_y: 50,
  cta_enabled: true,
  cta_label_ar: 'العب الآن', cta_label_en: 'Play Now',
  cta_action_type: 'NO_ACTION',
  cta_target: '',
  countdown_mode: 'NONE',
  starts_at: null, ends_at: null,
  priority: 0,
  status: 'DRAFT',
  published_at: null,
  chips: [],
};

/* ── Image upload helper ────────────────────────────────────── */

async function uploadBannerImage(file: File, userId: string): Promise<string | null> {
  const MAX_SIZE = 8 * 1024 * 1024;
  const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
  if (file.size > MAX_SIZE || !ALLOWED.includes(file.type)) return null;

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `campaigns/${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: false, contentType: file.type });

  if (error) return null;
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
}

/* ── Section wrapper ────────────────────────────────────────── */

function Section({ title, children, defaultOpen = true }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-[18px] overflow-hidden" style={{ border: '1px solid var(--border)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 transition-colors"
        style={{ background: 'rgba(255,255,255,0.02)' }}
      >
        <span className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>{title}</span>
        {open ? <ChevronUp className="w-4 h-4" style={{ color: 'var(--text-3)' }} strokeWidth={1.5} />
               : <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-3)' }} strokeWidth={1.5} />}
      </button>
      {open && (
        <div className="p-5 space-y-4" style={{ borderTop: '1px solid var(--border)' }}>
          {children}
        </div>
      )}
    </div>
  );
}

/* ── Field helpers ──────────────────────────────────────────── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-3)' }}>{label}</label>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = 'text', dir }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; dir?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      dir={dir}
      className="input-glow w-full text-sm"
    />
  );
}

function Select({ value, onChange, options }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="input-glow w-full text-sm"
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/* ── Image Upload field ─────────────────────────────────────── */

function ImageUploadField({
  label, url, onUrl, userId,
}: {
  label: string; url: string | null; onUrl: (u: string | null) => void; userId: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr('');
    if (file.size > 8 * 1024 * 1024) { setErr('الحجم يتجاوز 8MB'); return; }
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) { setErr('صيغة غير مدعومة'); return; }
    setUploading(true);
    const result = await uploadBannerImage(file, userId);
    setUploading(false);
    if (result) onUrl(result);
    else setErr('فشل الرفع');
  };

  return (
    <div>
      <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-3)' }}>{label}</label>
      <div className="flex gap-2 items-start">
        {/* Thumbnail */}
        <div className="w-20 h-14 rounded-[10px] overflow-hidden flex-shrink-0 flex items-center justify-center"
          style={{ background: url ? undefined : 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
          {url ? (
            <img src={url} alt="" className="w-full h-full object-cover" />
          ) : (
            <Image className="w-6 h-6" style={{ color: 'var(--text-4)' }} strokeWidth={1} />
          )}
        </div>

        <div className="flex-1 space-y-1.5">
          <button
            onClick={() => ref.current?.click()}
            disabled={uploading}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-[10px] text-xs font-bold transition-all disabled:opacity-50"
            style={{ background: 'rgba(214,180,123,0.07)', border: '1px solid rgba(214,180,123,0.18)', color: 'var(--gold)' }}
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2} /> : <Upload className="w-3.5 h-3.5" strokeWidth={2} />}
            {uploading ? 'جارٍ الرفع...' : 'رفع صورة'}
          </button>
          {url && (
            <button
              onClick={() => onUrl(null)}
              className="w-full py-1.5 rounded-[10px] text-xs font-semibold transition-all"
              style={{ background: 'rgba(244,112,103,0.06)', border: '1px solid rgba(244,112,103,0.15)', color: '#F47067' }}
            >
              إزالة
            </button>
          )}
          {err && <p className="text-[10px]" style={{ color: '#F47067' }}>{err}</p>}
          <p className="text-[10px]" style={{ color: 'var(--text-4)' }}>PNG, JPG, WebP — حد 8MB</p>
        </div>
      </div>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" onChange={handle} className="hidden" />
    </div>
  );
}

/* ── Campaign Editor ────────────────────────────────────────── */

function CampaignEditor({
  initial,
  userId,
  onSave,
  onCancel,
}: {
  initial: Partial<HomeCampaign>;
  userId: string;
  onSave: (data: Partial<HomeCampaign>, chips: Partial<CampaignChip>[]) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<Partial<HomeCampaign>>({ ...BLANK_CAMPAIGN, ...initial });
  const [chips, setChips] = useState<Partial<CampaignChip>[]>(
    initial.chips?.length ? initial.chips : [{ ...BLANK_CHIP }]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [previewMobile, setPreviewMobile] = useState(false);

  const set = <K extends keyof HomeCampaign>(key: K, val: HomeCampaign[K]) =>
    setForm(f => ({ ...f, [key]: val }));

  const setChip = (i: number, key: keyof CampaignChip, val: any) =>
    setChips(cs => cs.map((c, idx) => idx === i ? { ...c, [key]: val } : c));

  const addChip = () => {
    if (chips.length >= 3) return;
    setChips(cs => [...cs, { ...BLANK_CHIP }]);
  };

  const removeChip = (i: number) => setChips(cs => cs.filter((_, idx) => idx !== i));

  const handleSaveDraft = async () => {
    if (!form.internal_name?.trim()) { setError('اسم الحملة الداخلي مطلوب'); return; }
    setSaving(true); setError('');
    const ok = await onSave({ ...form, status: 'DRAFT' }, chips);
    setSaving(false);
    if (ok) { setSuccess(true); setTimeout(onCancel, 800); }
    else setError('حدث خطأ أثناء الحفظ');
  };

  const handlePublish = async () => {
    if (!form.internal_name?.trim()) { setError('اسم الحملة الداخلي مطلوب'); return; }
    if (!form.title_ar?.trim() && !form.title_en?.trim()) { setError('العنوان مطلوب للنشر'); return; }
    if (!form.desktop_image_url) { setError('صورة سطح المكتب مطلوبة للنشر'); return; }
    if (form.starts_at && form.ends_at && new Date(form.ends_at) <= new Date(form.starts_at)) {
      setError('تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء'); return;
    }
    setSaving(true); setError('');
    const ok = await onSave({ ...form, status: 'PUBLISHED' }, chips);
    setSaving(false);
    if (ok) { setSuccess(true); setTimeout(onCancel, 800); }
    else setError('حدث خطأ أثناء النشر');
  };

  /* Build preview campaign object */
  const previewCampaign: HomeCampaign = {
    ...BLANK_CAMPAIGN as HomeCampaign,
    ...form as HomeCampaign,
    chips: chips.map((c, i) => ({ ...BLANK_CHIP, ...c, id: `preview-${i}`, campaign_id: 'preview', display_order: i } as CampaignChip)),
  };

  return (
    <div className="space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-base" style={{ color: 'var(--text-1)' }}>
          {initial.id ? 'تعديل الحملة' : 'حملة جديدة'}
        </h3>
        <div className="flex gap-2">
          <button onClick={onCancel} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-[12px] text-xs font-bold transition-all disabled:opacity-50"
            style={{ background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
            <X className="w-3.5 h-3.5" strokeWidth={2} /> إلغاء
          </button>
          <button onClick={handleSaveDraft} disabled={saving || success}
            className="flex items-center gap-1.5 px-4 py-2 rounded-[12px] text-xs font-bold transition-all disabled:opacity-50"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2} /> : <Check className="w-3.5 h-3.5" strokeWidth={2} />}
            حفظ كمسودة
          </button>
          <button onClick={handlePublish} disabled={saving || success}
            className="flex items-center gap-1.5 px-5 py-2 rounded-[12px] text-xs font-black transition-all disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#C6A06A,#E7C38F)', color: '#0a0a0a' }}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2} />
                    : success ? <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                    : <Sparkles className="w-3.5 h-3.5" strokeWidth={2} />}
            {saving ? 'جارٍ الحفظ...' : success ? 'تم النشر' : 'نشر'}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-[12px] text-sm"
          style={{ background: 'rgba(244,112,103,0.08)', border: '1px solid rgba(244,112,103,0.2)', color: '#F47067' }}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
          {error}
        </div>
      )}

      {/* Section 1 — Basic info */}
      <Section title="١. المعلومات الأساسية">
        <Field label="الاسم الداخلي (للإدارة فقط)">
          <Input value={form.internal_name || ''} onChange={v => set('internal_name', v)} placeholder="مثال: حملة رمضان ٢٠٢٦" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="نوع الحملة">
            <Select value={form.campaign_type || 'EVENT'} onChange={v => set('campaign_type', v as CampaignType)}
              options={CAMPAIGN_TYPES.map(t => ({ value: t.value, label: t.labelAr }))} />
          </Field>
          <Field label="الأولوية (عدد أكبر = أعلى)">
            <Input value={String(form.priority ?? 0)} onChange={v => set('priority', parseInt(v) || 0)} type="number" />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="العنوان (عربي)">
            <Input value={form.title_ar || ''} onChange={v => set('title_ar', v)} placeholder="عنوان الحدث" dir="rtl" />
          </Field>
          <Field label="العنوان (إنجليزي)">
            <Input value={form.title_en || ''} onChange={v => set('title_en', v)} placeholder="Event Title" />
          </Field>
          <Field label="الوصف (عربي)">
            <Input value={form.subtitle_ar || ''} onChange={v => set('subtitle_ar', v)} placeholder="وصف مختصر" dir="rtl" />
          </Field>
          <Field label="الوصف (إنجليزي)">
            <Input value={form.subtitle_en || ''} onChange={v => set('subtitle_en', v)} placeholder="Short subtitle" />
          </Field>
          <Field label="الشارة (عربي) - اختياري">
            <Input value={form.badge_ar || ''} onChange={v => set('badge_ar', v)} placeholder="حدث محدود" dir="rtl" />
          </Field>
          <Field label="الشارة (إنجليزي) - اختياري">
            <Input value={form.badge_en || ''} onChange={v => set('badge_en', v)} placeholder="Limited Event" />
          </Field>
        </div>
      </Section>

      {/* Section 2 — Design */}
      <Section title="٢. التصميم">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ImageUploadField label="صورة سطح المكتب" url={form.desktop_image_url || null}
            onUrl={u => set('desktop_image_url', u)} userId={userId} />
          <ImageUploadField label="صورة الجوال (اختياري)" url={form.mobile_image_url || null}
            onUrl={u => set('mobile_image_url', u)} userId={userId} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field label="موضع المحتوى">
            <Select value={form.content_alignment || 'RIGHT'} onChange={v => set('content_alignment', v as ContentAlignment)}
              options={[{ value: 'RIGHT', label: 'يمين' }, { value: 'LEFT', label: 'يسار' }, { value: 'CENTER', label: 'وسط' }]} />
          </Field>
          <Field label="عرض المحتوى">
            <Select value={form.content_width || 'NORMAL'} onChange={v => set('content_width', v as ContentWidth)}
              options={[{ value: 'NARROW', label: 'ضيق' }, { value: 'NORMAL', label: 'عادي' }, { value: 'WIDE', label: 'واسع' }]} />
          </Field>
          <Field label="محاذاة النص">
            <Select value={form.text_alignment || 'RIGHT'} onChange={v => set('text_alignment', v as TextAlignment)}
              options={[{ value: 'RIGHT', label: 'يمين' }, { value: 'LEFT', label: 'يسار' }, { value: 'CENTER', label: 'وسط' }]} />
          </Field>
          <Field label="قوة التعتيم">
            <Select value={form.overlay_strength || 'MEDIUM'} onChange={v => set('overlay_strength', v as OverlayStrength)}
              options={[{ value: 'NONE', label: 'بدون' }, { value: 'LIGHT', label: 'خفيف' }, { value: 'MEDIUM', label: 'متوسط' }, { value: 'STRONG', label: 'قوي' }]} />
          </Field>
          <Field label="بؤرة أفقية (0–100)">
            <Input value={String(form.image_position_x ?? 50)} onChange={v => set('image_position_x', Math.min(100, Math.max(0, parseInt(v) || 50)))} type="number" />
          </Field>
          <Field label="بؤرة رأسية (0–100)">
            <Input value={String(form.image_position_y ?? 50)} onChange={v => set('image_position_y', Math.min(100, Math.max(0, parseInt(v) || 50)))} type="number" />
          </Field>
        </div>
      </Section>

      {/* Section 3 — CTA */}
      <Section title="٣. زر الإجراء (CTA)">
        <div className="flex items-center gap-3 mb-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.cta_enabled ?? true}
              onChange={e => set('cta_enabled', e.target.checked)}
              className="w-4 h-4 rounded" />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-2)' }}>تفعيل زر الإجراء</span>
          </label>
        </div>
        {form.cta_enabled && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="نص الزر (عربي)">
              <Input value={form.cta_label_ar || ''} onChange={v => set('cta_label_ar', v)} placeholder="العب الآن" dir="rtl" />
            </Field>
            <Field label="نص الزر (إنجليزي)">
              <Input value={form.cta_label_en || ''} onChange={v => set('cta_label_en', v)} placeholder="Play Now" />
            </Field>
            <Field label="نوع الإجراء">
              <Select value={form.cta_action_type || 'NO_ACTION'} onChange={v => set('cta_action_type', v as CtaActionType)}
                options={[
                  { value: 'NO_ACTION', label: 'بدون إجراء' },
                  { value: 'INTERNAL_ROUTE', label: 'صفحة داخلية' },
                  { value: 'EXTERNAL_URL', label: 'رابط خارجي' },
                ]} />
            </Field>
            {form.cta_action_type !== 'NO_ACTION' && (
              <Field label={form.cta_action_type === 'EXTERNAL_URL' ? 'الرابط (https://)' : 'اسم الصفحة الداخلية'}>
                <Input value={form.cta_target || ''} onChange={v => set('cta_target', v)}
                  placeholder={form.cta_action_type === 'EXTERNAL_URL' ? 'https://example.com' : 'games'} />
              </Field>
            )}
          </div>
        )}
      </Section>

      {/* Section 4 — Timing */}
      <Section title="٤. التوقيت والجدولة">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="تاريخ البدء (اختياري)">
            <Input type="datetime-local" value={form.starts_at ? form.starts_at.slice(0, 16) : ''}
              onChange={v => set('starts_at', v ? new Date(v).toISOString() : null as any)} />
          </Field>
          <Field label="تاريخ الانتهاء (اختياري)">
            <Input type="datetime-local" value={form.ends_at ? form.ends_at.slice(0, 16) : ''}
              onChange={v => set('ends_at', v ? new Date(v).toISOString() : null as any)} />
          </Field>
          <Field label="وضع العداد التنازلي">
            <Select value={form.countdown_mode || 'NONE'} onChange={v => set('countdown_mode', v as CountdownMode)}
              options={[
                { value: 'NONE', label: 'بدون عداد' },
                { value: 'COUNTDOWN_TO_START', label: 'عداد للبدء' },
                { value: 'COUNTDOWN_TO_END', label: 'عداد للانتهاء' },
                { value: 'AUTO', label: 'تلقائي' },
              ]} />
          </Field>
          <Field label="الحالة">
            <Select value={form.status || 'DRAFT'} onChange={v => set('status', v as CampaignStatus)}
              options={[
                { value: 'DRAFT',     label: 'مسودة' },
                { value: 'PUBLISHED', label: 'منشور' },
                { value: 'PAUSED',    label: 'موقوف' },
              ]} />
          </Field>
        </div>
      </Section>

      {/* Section 5 — Chips */}
      <Section title="٥. العناصر البارزة (حتى 3 عناصر)">
        <div className="space-y-3">
          {chips.map((chip, i) => (
            <div key={i} className="rounded-[14px] p-4 space-y-3"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold" style={{ color: 'var(--text-3)' }}>العنصر {i + 1}</span>
                <button onClick={() => removeChip(i)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg"
                  style={{ background: 'rgba(244,112,103,0.07)', color: '#F47067' }}>
                  <X className="w-3.5 h-3.5" strokeWidth={2} />
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Field label="النوع">
                  <Select value={chip.chip_type || 'CUSTOM'} onChange={v => setChip(i, 'chip_type', v as ChipType)}
                    options={Object.entries(CHIP_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
                </Field>
                <Field label="الاسم (ع)">
                  <Input value={chip.label_ar || ''} onChange={v => setChip(i, 'label_ar', v)} placeholder="نقاط" dir="rtl" />
                </Field>
                <Field label="الاسم (En)">
                  <Input value={chip.label_en || ''} onChange={v => setChip(i, 'label_en', v)} placeholder="Points" />
                </Field>
                <Field label="القيمة">
                  <Input value={chip.value || ''} onChange={v => setChip(i, 'value', v)} placeholder="10,000" />
                </Field>
              </div>
            </div>
          ))}
          {chips.length < 3 && (
            <button onClick={addChip}
              className="w-full py-2.5 flex items-center justify-center gap-2 rounded-[14px] text-xs font-bold transition-all"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--border)', color: 'var(--text-3)' }}>
              <Plus className="w-3.5 h-3.5" strokeWidth={2} /> إضافة عنصر
            </button>
          )}
        </div>
      </Section>

      {/* Section 6 — Preview */}
      <Section title="٦. المعاينة المباشرة">
        <div className="flex gap-2 mb-4">
          <button onClick={() => setPreviewMobile(false)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-xs font-bold transition-all`}
            style={!previewMobile
              ? { background: 'rgba(214,180,123,0.12)', border: '1px solid rgba(214,180,123,0.25)', color: 'var(--gold)' }
              : { background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-3)' }}>
            <Monitor className="w-3.5 h-3.5" strokeWidth={1.5} /> سطح المكتب
          </button>
          <button onClick={() => setPreviewMobile(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-xs font-bold transition-all`}
            style={previewMobile
              ? { background: 'rgba(214,180,123,0.12)', border: '1px solid rgba(214,180,123,0.25)', color: 'var(--gold)' }
              : { background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-3)' }}>
            <Smartphone className="w-3.5 h-3.5" strokeWidth={1.5} /> الجوال
          </button>
        </div>
        <div style={previewMobile ? { maxWidth: '390px', margin: '0 auto' } : {}}>
          <CampaignBannerRenderer
            campaign={previewCampaign}
            isAr={true}
            isMobile={previewMobile}
            onCta={() => {}}
          />
        </div>
      </Section>
    </div>
  );
}

/* ── Campaign row card ──────────────────────────────────────── */

function CampaignRow({
  campaign,
  onEdit,
  onDuplicate,
  onToggle,
  onDelete,
}: {
  campaign: HomeCampaign;
  onEdit: () => void;
  onDuplicate: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const derived = getDerivedStatus(campaign);
  const style = DERIVED_STATUS_STYLES[derived];
  const canToggle = campaign.status === 'PUBLISHED' || campaign.status === 'PAUSED';

  return (
    <div className="flex items-center gap-3 p-4 rounded-[16px] transition-all"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>

      {/* Thumbnail */}
      <div className="w-16 h-12 rounded-[10px] overflow-hidden flex-shrink-0 flex items-center justify-center"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
        {campaign.desktop_image_url ? (
          <img src={campaign.desktop_image_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <Image className="w-5 h-5" style={{ color: 'var(--text-4)' }} strokeWidth={1} />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold truncate" style={{ color: 'var(--text-1)' }}>{campaign.internal_name}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
            style={{ background: style.bg, color: style.text, border: `1px solid ${style.border}` }}>
            {DERIVED_STATUS_LABELS[derived]}
          </span>
          <span className="text-[10px]" style={{ color: 'var(--text-4)' }}>
            {CAMPAIGN_TYPES.find(t => t.value === campaign.campaign_type)?.labelAr}
          </span>
          <span className="text-[10px]" style={{ color: 'var(--text-4)' }}>أولوية: {campaign.priority}</span>
        </div>
        {(campaign.starts_at || campaign.ends_at) && (
          <div className="flex items-center gap-1 mt-1 text-[10px]" style={{ color: 'var(--text-4)' }}>
            <Calendar className="w-3 h-3" strokeWidth={1.5} />
            {campaign.starts_at && <span>{new Date(campaign.starts_at).toLocaleDateString('ar')}</span>}
            {campaign.starts_at && campaign.ends_at && <span>→</span>}
            {campaign.ends_at && <span>{new Date(campaign.ends_at).toLocaleDateString('ar')}</span>}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button onClick={onEdit} title="تعديل"
          className="w-8 h-8 flex items-center justify-center rounded-[9px] transition-all hover:scale-105"
          style={{ background: 'rgba(214,180,123,0.07)', border: '1px solid rgba(214,180,123,0.14)', color: 'var(--gold)' }}>
          <Edit2 className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
        <button onClick={onDuplicate} title="نسخ"
          className="w-8 h-8 flex items-center justify-center rounded-[9px] transition-all hover:scale-105"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text-3)' }}>
          <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
        {canToggle && (
          <button onClick={onToggle} title={campaign.status === 'PUBLISHED' ? 'إيقاف مؤقت' : 'استئناف'}
            className="w-8 h-8 flex items-center justify-center rounded-[9px] transition-all hover:scale-105"
            style={campaign.status === 'PUBLISHED'
              ? { background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.18)', color: '#f59e0b' }
              : { background: 'rgba(63,185,80,0.07)',  border: '1px solid rgba(63,185,80,0.18)',  color: '#3FB950' }}>
            {campaign.status === 'PUBLISHED' ? <Pause className="w-3.5 h-3.5" strokeWidth={1.5} /> : <Play className="w-3.5 h-3.5" strokeWidth={1.5} />}
          </button>
        )}
        <button onClick={onDelete} title="حذف"
          className="w-8 h-8 flex items-center justify-center rounded-[9px] transition-all hover:scale-105"
          style={{ background: 'rgba(244,112,103,0.07)', border: '1px solid rgba(244,112,103,0.14)', color: '#F47067' }}>
          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────── */

export const CampaignManagement = () => {
  const { campaigns, loading, saveCampaign, updateStatus, duplicateCampaign, deleteCampaign } = useHomeCampaignAdmin();
  const [editing, setEditing] = useState<Partial<HomeCampaign> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Get current admin user ID for image upload paths
  const [adminId, setAdminId] = useState('admin');
  supabase.auth.getUser().then(({ data }) => { if (data?.user?.id) setAdminId(data.user.id); });

  const handleSave = async (data: Partial<HomeCampaign>, chips: Partial<CampaignChip>[]) => {
    const result = await saveCampaign(data, chips);
    return !!result;
  };

  const handleToggle = async (c: HomeCampaign) => {
    const next: CampaignStatus = c.status === 'PUBLISHED' ? 'PAUSED' : 'PUBLISHED';
    await updateStatus(c.id, next);
  };

  if (editing !== null) {
    return (
      <div className="max-w-3xl mx-auto">
        <CampaignEditor
          initial={editing}
          userId={adminId}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[14px] flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(214,180,123,0.08)', border: '1px solid rgba(214,180,123,0.18)' }}>
            <Megaphone className="w-5 h-5" style={{ color: 'var(--gold)' }} strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="font-bold text-base" style={{ color: 'var(--text-1)' }}>بانر الرئيسية</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>إدارة حملات البانر الرئيسي</p>
          </div>
        </div>
        <button
          onClick={() => setEditing({ ...BLANK_CAMPAIGN })}
          className="flex items-center gap-2 px-5 py-2.5 rounded-[14px] text-sm font-bold transition-all hover:-translate-y-0.5"
          style={{ background: 'linear-gradient(135deg,#C6A06A,#E7C38F)', color: '#0a0a0a' }}
        >
          <Plus className="w-4 h-4" strokeWidth={2} />
          حملة جديدة
        </button>
      </div>

      {/* Status note */}
      <div className="rounded-[14px] px-4 py-3 flex items-start gap-3"
        style={{ background: 'rgba(88,166,255,0.06)', border: '1px solid rgba(88,166,255,0.15)' }}>
        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#58A6FF' }} strokeWidth={1.5} />
        <p className="text-xs" style={{ color: 'var(--text-2)' }}>
          يظهر في البانر الرئيسي الحملة النشطة ذات أعلى أولوية فقط. الحملة المسودة أو الموقوفة لا تظهر للزوار.
        </p>
      </div>

      {/* Campaign list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--gold)' }} strokeWidth={1.5} />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-16 rounded-[20px]"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--border)' }}>
          <Megaphone className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-4)' }} strokeWidth={1} />
          <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-2)' }}>لا توجد حملات بعد</p>
          <p className="text-xs mb-4" style={{ color: 'var(--text-4)' }}>أنشئ أول حملة لتظهر في الصفحة الرئيسية</p>
          <button
            onClick={() => setEditing({ ...BLANK_CAMPAIGN })}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[14px] text-sm font-bold"
            style={{ background: 'linear-gradient(135deg,#C6A06A,#E7C38F)', color: '#0a0a0a' }}>
            <Plus className="w-4 h-4" strokeWidth={2} /> حملة جديدة
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {campaigns.map(c => (
            <CampaignRow
              key={c.id}
              campaign={c}
              onEdit={() => setEditing(c)}
              onDuplicate={() => duplicateCampaign(c.id)}
              onToggle={() => handleToggle(c)}
              onDelete={() => setConfirmDelete(c.id)}
            />
          ))}
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-sm rounded-[22px] p-6 space-y-4"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }} dir="rtl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[12px] flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(244,112,103,0.1)', border: '1px solid rgba(244,112,103,0.2)' }}>
                <Trash2 className="w-5 h-5" style={{ color: '#F47067' }} strokeWidth={1.5} />
              </div>
              <div>
                <p className="font-bold text-sm" style={{ color: 'var(--text-1)' }}>حذف الحملة؟</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>لا يمكن التراجع عن هذه العملية</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 text-sm font-bold rounded-[14px]"
                style={{ background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                إلغاء
              </button>
              <button onClick={async () => { await deleteCampaign(confirmDelete); setConfirmDelete(null); }}
                className="flex-1 py-2.5 text-sm font-bold rounded-[14px]"
                style={{ background: 'rgba(244,112,103,0.12)', border: '1px solid rgba(244,112,103,0.25)', color: '#F47067' }}>
                حذف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
