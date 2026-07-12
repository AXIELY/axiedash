import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Plus, CreditCard as Edit2, Trash2, Save, X, ChevronDown, ChevronUp,
  Eye, Upload, Image as ImageIcon, RotateCcw, Lock, Clock, Package,
  Users, Calendar, Zap, AlertTriangle, Shield,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import type { WheelPrize, WheelSettings, AvailabilityMode } from '../../../hooks/useSpinWheelGame';

const CARD: React.CSSProperties = {
  background: 'rgba(10,8,24,0.7)',
  border: '1px solid rgba(214,170,98,0.14)',
  borderRadius: '18px',
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

const LABEL: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 700,
  color: 'rgba(255,255,255,0.5)',
  marginBottom: '6px',
  display: 'block',
};

const SECTION_TITLE: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 900,
  color: 'rgba(255,255,255,0.35)',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  marginBottom: '12px',
};

const PRIZE_TYPES = ['points', 'service', 'miss', 'grand'] as const;
const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
const BG_STYLES = ['none', 'soft_circle', 'soft_medal', 'glow_ring'] as const;
const SHAPES = ['contain', 'cover', 'rounded', 'circle'] as const;

const RARITY_COLOR: Record<string, string> = {
  common: '#94a3b8', uncommon: '#34d399', rare: '#60a5fa', epic: '#c084fc', legendary: '#fbbf24',
};
const TYPE_LABEL: Record<string, { ar: string; en: string }> = {
  points:  { ar: 'نقاط',           en: 'Points'   },
  service: { ar: 'خدمة',           en: 'Service'  },
  miss:    { ar: 'حظ أوفر',        en: 'No Prize' },
  grand:   { ar: 'الجائزة الكبرى', en: 'Grand'    },
};
const BG_STYLE_LABELS: Record<string, string> = {
  none: 'None', soft_circle: 'Soft Circle', soft_medal: 'Soft Medal', glow_ring: 'Glow Ring',
};
const SHAPE_LABELS: Record<string, string> = {
  contain: 'Contain', cover: 'Cover', rounded: 'Rounded', circle: 'Circle',
};

const AVAILABILITY_MODES: { value: AvailabilityMode; labelAr: string; labelEn: string; icon: React.ReactNode; descAr: string; descEn: string }[] = [
  { value: 'ALWAYS_ACTIVE', labelAr: 'دائمة', labelEn: 'Always Active', icon: <Zap className="w-4 h-4" />, descAr: 'الجائزة متاحة دائماً', descEn: 'Prize is always available' },
  { value: 'LOCKED_BY_GOAL', labelAr: 'مقفلة بهدف', labelEn: 'Locked by Goal', icon: <Lock className="w-4 h-4" />, descAr: 'تُفتح عند تحقيق هدف محدد', descEn: 'Unlocks when a target is reached' },
  { value: 'SCHEDULED', labelAr: 'مجدولة', labelEn: 'Scheduled', icon: <Calendar className="w-4 h-4" />, descAr: 'متاحة خلال فترة زمنية محددة', descEn: 'Available during a specific time window' },
  { value: 'LIMITED_STOCK', labelAr: 'مخزون محدود', labelEn: 'Limited Stock', icon: <Package className="w-4 h-4" />, descAr: 'عدد محدود من الجوائز المتاحة', descEn: 'Limited number of prizes available' },
  { value: 'LIMITED_WINNERS', labelAr: 'فائزين محدودين', labelEn: 'Limited Winners', icon: <Users className="w-4 h-4" />, descAr: 'عدد محدود من الفائزين', descEn: 'Limited number of winners allowed' },
  { value: 'EVENT_ONLY', labelAr: 'حدث خاص', labelEn: 'Event Only', icon: <Shield className="w-4 h-4" />, descAr: 'متاحة فقط خلال حدث معين', descEn: 'Available only during a specific event' },
];

const UNLOCK_METRICS = [
  { value: 'total_spins', labelAr: 'إجمالي الدورات', labelEn: 'Total Spins' },
  { value: 'total_points_spent', labelAr: 'إجمالي النقاط المنفقة', labelEn: 'Total Points Spent' },
  { value: 'consecutive_days', labelAr: 'أيام متتالية', labelEn: 'Consecutive Days' },
  { value: 'total_wins', labelAr: 'إجمالي الفوزات', labelEn: 'Total Wins' },
];

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME = ['image/png', 'image/webp', 'image/jpeg', 'image/gif'];

function FallbackIcon({ type, color, size }: { type: string; color: string; size: number }) {
  const paths: Record<string, string> = {
    points:  'M16 4l3.09 6.26L26 11.27l-5 4.87 1.18 6.86L16 19.77l-6.18 3.23L11 16.14 6 11.27l6.91-1.01L16 4z',
    service: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z',
    miss:    'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z',
    grand:   'M5 3l3 6.5L12 4l4 5.5 3-6.5 3 14H2L5 3zM2 19h20v2H2z',
  };
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden="true">
      <path d={paths[type] ?? paths.points} fill={color} opacity={0.9} />
    </svg>
  );
}

function SegmentPreview({ form }: { form: FormState }) {
  const [dark, setDark] = useState(true);
  const bg = dark ? '#0a0818' : '#1a1535';
  const color = form.accent_color;
  const iconUrl = form.primary_icon_url;
  const size = 96;
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.44;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-white/30 uppercase tracking-wider">Wheel Preview</span>
        <button type="button" onClick={() => setDark(d => !d)}
          className="text-[10px] px-2 py-0.5 rounded-md transition-all"
          style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}>
          {dark ? 'Light' : 'Dark'}
        </button>
      </div>
      <div className="flex items-center justify-center py-3 rounded-xl"
        style={{ background: bg, border: '1px solid rgba(255,255,255,0.06)' }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <path
            d={`M${cx},${cy} L${cx},${cy - r} A${r},${r} 0 0,1 ${cx + r * Math.sin(Math.PI / 4)},${cy - r * Math.cos(Math.PI / 4)} Z`}
            fill={`${color}22`} stroke={color} strokeWidth="1.5" />
          <circle cx={cx} cy={cy - r * 0.6} r={16}
            fill="rgba(10,8,24,0.9)" stroke={RARITY_COLOR[form.rarity ?? 'common']} strokeWidth="1.5" />
          {iconUrl ? (
            <image href={iconUrl} x={cx - 10} y={cy - r * 0.6 - 10}
              width={20} height={20} style={{ clipPath: 'circle(50% at 50% 50%)' }} />
          ) : (
            <text x={cx} y={cy - r * 0.6 + 5} textAnchor="middle"
              fill={color} fontSize="14" fontWeight="900">
              {form.short_label?.slice(0, 2) || '?'}
            </text>
          )}
          <text x={cx} y={cy + 8} textAnchor="middle"
            fill="rgba(255,255,255,0.6)" fontSize="7" fontWeight="700">
            {form.short_label || form.name_en || '\u2014'}
          </text>
          {form.availability_mode !== 'ALWAYS_ACTIVE' && (
            <>
              <rect x={cx - 8} y={cy - r * 0.6 - 8} width={16} height={16} rx={4}
                fill="rgba(0,0,0,0.7)" />
              <text x={cx} y={cy - r * 0.6 + 4} textAnchor="middle"
                fill="#fbbf24" fontSize="10" fontWeight="900">
                {form.availability_mode === 'LOCKED_BY_GOAL' ? '\u{1F512}' : form.availability_mode === 'SCHEDULED' ? '\u23F0' : '\u{1F4E6}'}
              </text>
            </>
          )}
        </svg>
      </div>
    </div>
  );
}

function WinPreview({ form }: { form: FormState }) {
  const color = form.accent_color;
  const iconUrl = form.primary_icon_url;
  const rarityColor = RARITY_COLOR[form.rarity ?? 'common'];

  return (
    <div>
      <span className="text-[10px] font-bold text-white/30 uppercase tracking-wider block mb-2">Win Card Preview</span>
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
        style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${color}30` }}>
        <div className="w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center"
          style={{ background: `${color}15`, border: `2px solid ${rarityColor}` }}>
          {iconUrl
            ? <img src={iconUrl} alt="" width={32} height={32}
                style={{ objectFit: 'contain', borderRadius: form.icon_shape === 'circle' ? '50%' : 4 }} />
            : <FallbackIcon type={form.type} color={color} size={24} />}
        </div>
        <div className="min-w-0">
          <div className="text-xs font-black text-white truncate">{form.name_ar || '\u0627\u0633\u0645 \u0627\u0644\u062C\u0627\u0626\u0632\u0629'}</div>
          <div className="text-[10px] mt-0.5" style={{ color }}>{form.name_en || 'Prize Name'}</div>
        </div>
      </div>
    </div>
  );
}

function PrizeThumbnail({ prize }: { prize: WheelPrize & { rarity?: string } }) {
  const [imgErr, setImgErr] = useState(false);
  const shape = (prize as any).icon_shape;
  const br = shape === 'circle' ? '50%' : shape === 'rounded' ? '22%' : 2;
  if (prize.primary_icon_url && !imgErr) {
    return (
      <img src={prize.primary_icon_url} alt="" width={32} height={32}
        onError={() => setImgErr(true)}
        style={{ objectFit: 'contain', borderRadius: br }} />
    );
  }
  return <FallbackIcon type={prize.type} color={prize.accent_color} size={22} />;
}

// ─── Editor tabs ──────────────────────────────────────────────────────────────
type EditorTab = 'basic' | 'design' | 'availability' | 'probability' | 'delivery' | 'preview';

const EDITOR_TABS: { id: EditorTab; labelAr: string; labelEn: string }[] = [
  { id: 'basic',        labelAr: 'المعلومات الأساسية', labelEn: 'Basic Info' },
  { id: 'design',       labelAr: 'التصميم',           labelEn: 'Design' },
  { id: 'availability', labelAr: 'التوفر والسلوك',    labelEn: 'Availability' },
  { id: 'probability',  labelAr: 'الاحتمالات والحدود', labelEn: 'Probability' },
  { id: 'delivery',     labelAr: 'التسليم',           labelEn: 'Delivery' },
  { id: 'preview',      labelAr: 'المعاينة',          labelEn: 'Preview' },
];

interface FormState {
  name_ar: string;
  name_en: string;
  type: string;
  accent_color: string;
  weight: number;
  value: string;
  short_label: string;
  is_strong: boolean;
  rarity: string;
  primary_icon_url: string;
  result_art_url: string;
  icon_scale: number;
  icon_offset_x: number;
  icon_offset_y: number;
  glow_color: string;
  icon_bg_style: string;
  icon_shape: string;
  // Availability fields
  availability_mode: AvailabilityMode;
  starts_at: string;
  ends_at: string;
  unlock_target_metric: string;
  unlock_target_value: number;
  initial_stock: number;
  max_winners: number;
  max_wins_per_user: number;
  user_cooldown_days: number;
  locked_visibility: 'visible' | 'hidden' | 'silhouette';
  event_tag: string;
  fallback_prize_id: string;
}

interface PrizeEditorProps {
  prize: Partial<WheelPrize> & { rarity?: string };
  totalWeight: number;
  allPrizes: WheelPrize[];
  onSave: (p: WheelPrize & { rarity: string }) => void;
  onClose: () => void;
  language: string;
  saving?: boolean;
  saveError?: string | null;
}

function PrizeEditor({ prize, totalWeight, allPrizes, onSave, onClose, language, saving = false, saveError = null }: PrizeEditorProps) {
  const [activeTab, setActiveTab] = useState<EditorTab>('basic');
  const [form, setForm] = useState<FormState>({
    name_ar:              prize.name_ar              ?? '',
    name_en:              prize.name_en              ?? '',
    type:                 prize.type                 ?? 'points',
    accent_color:         prize.accent_color         ?? '#22d3ee',
    weight:               prize.weight               ?? 5,
    value:                prize.value                ?? '',
    short_label:          prize.short_label          ?? '',
    is_strong:            prize.is_strong            ?? false,
    rarity:               (prize as any).rarity      ?? 'common',
    primary_icon_url:     prize.primary_icon_url     ?? '',
    result_art_url:       prize.result_art_url       ?? '',
    icon_scale:           prize.icon_scale           ?? 1,
    icon_offset_x:        prize.icon_offset_x        ?? 0,
    icon_offset_y:        prize.icon_offset_y        ?? 0,
    glow_color:           prize.glow_color           ?? '',
    icon_bg_style:        prize.icon_bg_style        ?? 'soft_circle',
    icon_shape:           prize.icon_shape           ?? 'contain',
    availability_mode:    prize.availability_mode    ?? 'ALWAYS_ACTIVE',
    starts_at:            prize.starts_at            ?? '',
    ends_at:              prize.ends_at              ?? '',
    unlock_target_metric: prize.unlock_target_metric ?? 'total_spins',
    unlock_target_value:  prize.unlock_target_value  ?? 10,
    initial_stock:        prize.initial_stock        ?? 100,
    max_winners:          prize.max_winners          ?? 50,
    max_wins_per_user:    prize.max_wins_per_user    ?? 1,
    user_cooldown_days:   prize.user_cooldown_days   ?? 0,
    locked_visibility:    prize.locked_visibility    ?? 'visible',
    event_tag:            prize.event_tag            ?? '',
    fallback_prize_id:    prize.fallback_prize_id    ?? '',
  });

  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const prevWeight = prize.weight ?? 0;
  const poolWithout = totalWeight - prevWeight;
  const livePct = poolWithout + form.weight > 0
    ? (form.weight / (poolWithout + form.weight)) * 100
    : 0;

  const set = useCallback(<K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(f => ({ ...f, [k]: v })), []);

  const uploadIcon = useCallback(async (file: File) => {
    setUploadErr('');
    if (!ALLOWED_MIME.includes(file.type)) {
      setUploadErr('Only PNG, WebP, JPEG, or GIF allowed');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setUploadErr('File must be under 5 MB');
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() ?? 'png';
      const path = `prizes/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('prize-icons').upload(path, file, {
        contentType: file.type, upsert: false,
      });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('prize-icons').getPublicUrl(path);
      set('primary_icon_url', publicUrl);
    } catch (e: any) {
      setUploadErr(e.message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [set]);

  const handleFile = (f: File | undefined) => { if (f) uploadIcon(f); };

  const handleSave = () => {
    if (!form.name_ar || !form.name_en) return;
    const result: any = { ...form, id: (prize as any).id ?? `prize_${Date.now()}` };
    // Clean nullable fields
    if (!result.starts_at) result.starts_at = null;
    if (!result.ends_at) result.ends_at = null;
    if (!result.event_tag) result.event_tag = null;
    if (!result.fallback_prize_id) result.fallback_prize_id = null;
    if (result.availability_mode === 'ALWAYS_ACTIVE') {
      result.unlock_target_metric = null;
      result.unlock_target_value = null;
      result.initial_stock = null;
      result.max_winners = null;
    }
    onSave(result);
  };

  const isEdit = !!(prize as any).id;
  const isAr = language === 'ar';

  const renderTabContent = () => {
    switch (activeTab) {
      case 'basic':
        return (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label style={LABEL}>{isAr ? 'الاسم بالعربية' : 'Arabic Name'}</label>
                <input style={INPUT} value={form.name_ar}
                  onChange={e => set('name_ar', e.target.value)} placeholder="مثال: 100 نقطة" />
              </div>
              <div>
                <label style={LABEL}>{isAr ? 'الاسم بالإنجليزية' : 'English Name'}</label>
                <input style={INPUT} value={form.name_en}
                  onChange={e => set('name_en', e.target.value)} placeholder="100 Points" />
              </div>
              <div>
                <label style={LABEL}>{isAr ? 'نوع الجائزة' : 'Type'}</label>
                <select style={INPUT} value={form.type} onChange={e => set('type', e.target.value)}>
                  {PRIZE_TYPES.map(t => (
                    <option key={t} value={t} style={{ background: '#0a0818' }}>
                      {isAr ? TYPE_LABEL[t].ar : TYPE_LABEL[t].en}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={LABEL}>{isAr ? 'الندرة' : 'Rarity'}</label>
                <select style={{ ...INPUT, color: RARITY_COLOR[form.rarity] }}
                  value={form.rarity} onChange={e => set('rarity', e.target.value)}>
                  {RARITIES.map(r => (
                    <option key={r} value={r} style={{ background: '#0a0818', color: RARITY_COLOR[r] }}>
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={LABEL}>{isAr ? 'القيمة / المبلغ' : 'Value / Amount'}</label>
                <input style={INPUT} value={form.value}
                  onChange={e => set('value', e.target.value)}
                  placeholder={isAr ? '100 أو "اشتراك نتفلكس"' : '100 or "Netflix sub"'} />
              </div>
              <div>
                <label style={LABEL}>{isAr ? 'اختصار العجلة (6 أحرف)' : 'Wheel Label (6 chars)'}</label>
                <input style={INPUT} value={form.short_label} maxLength={6}
                  onChange={e => set('short_label', e.target.value)} placeholder="100 / Plus" />
              </div>
            </div>

            <div>
              <div style={SECTION_TITLE}>{isAr ? 'لون العجلة' : 'Accent Color'}</div>
              <div className="flex items-center gap-3">
                <input type="color" value={form.accent_color}
                  onChange={e => set('accent_color', e.target.value)}
                  className="w-12 h-11 rounded-lg cursor-pointer"
                  style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)' }} />
                <input style={{ ...INPUT, flex: 1 }} value={form.accent_color}
                  onChange={e => set('accent_color', e.target.value)} placeholder="#22d3ee" />
                <div className="w-11 h-11 rounded-lg flex-shrink-0"
                  style={{ background: form.accent_color, border: '1px solid rgba(255,255,255,0.1)' }} />
              </div>
            </div>
          </div>
        );

      case 'design':
        return (
          <div className="space-y-5">
            {/* Icon Upload */}
            <div>
              <div style={SECTION_TITLE}>{isAr ? 'أيقونة الجائزة' : 'Prize Icon'}</div>
              {form.primary_icon_url ? (
                <div className="flex items-start gap-4">
                  <div className="relative flex-shrink-0">
                    <div className="w-20 h-20 rounded-2xl flex items-center justify-center overflow-hidden"
                      style={{ background: 'rgba(255,255,255,0.05)', border: `2px solid ${RARITY_COLOR[form.rarity]}` }}>
                      <img src={form.primary_icon_url} alt=""
                        style={{ width: 64, height: 64, objectFit: 'contain',
                          borderRadius: form.icon_shape === 'circle' ? '50%' : form.icon_shape === 'rounded' ? '22%' : 2 }} />
                    </div>
                  </div>
                  <div className="flex-1 space-y-2">
                    <p className="text-xs font-bold text-white/60">{isAr ? 'تم الرفع بنجاح' : 'Icon uploaded'}</p>
                    <div className="flex gap-2 flex-wrap">
                      <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                        style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <Upload className="w-3 h-3" />
                        {isAr ? 'تغيير' : 'Replace'}
                      </button>
                      <button type="button" onClick={() => set('primary_icon_url', '')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                        style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                        <RotateCcw className="w-3 h-3" />
                        {isAr ? 'حذف' : 'Remove'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
                  onClick={() => fileRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-2 py-8 rounded-2xl cursor-pointer transition-all"
                  style={{
                    border: `2px dashed ${dragOver ? '#D6AA62' : 'rgba(255,255,255,0.12)'}`,
                    background: dragOver ? 'rgba(214,170,98,0.06)' : 'rgba(255,255,255,0.02)',
                  }}>
                  {uploading
                    ? <div className="w-7 h-7 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: '#D6AA62' }} />
                    : <ImageIcon className="w-7 h-7 text-white/20" />}
                  <p className="text-sm font-bold text-white/40">
                    {uploading ? (isAr ? 'جارٍ الرفع...' : 'Uploading...') : (isAr ? 'اسحب الصورة هنا أو اضغط للاختيار' : 'Drag & drop or click to pick')}
                  </p>
                  <p className="text-xs text-white/20">PNG, WebP, JPEG - max 5 MB</p>
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/png,image/webp,image/jpeg,image/gif"
                className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
              {uploadErr && <p className="text-xs mt-2 text-red-400">{uploadErr}</p>}
            </div>

            {/* Visual Tuning */}
            <div>
              <div style={SECTION_TITLE}>{isAr ? 'ضبط المظهر' : 'Visual Tuning'}</div>
              <div className="space-y-4">
                <div>
                  <label style={LABEL} className="flex items-center justify-between">
                    <span>{isAr ? 'حجم الأيقونة' : 'Icon Scale'}</span>
                    <span style={{ color: '#D6AA62', fontFamily: 'monospace' }}>{form.icon_scale.toFixed(2)}x</span>
                  </label>
                  <input type="range" min={0.70} max={1.25} step={0.01} value={form.icon_scale}
                    onChange={e => set('icon_scale', parseFloat(e.target.value))}
                    className="w-full accent-amber-400" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label style={LABEL} className="flex items-center justify-between">
                      <span>{isAr ? 'إزاحة أفقية' : 'Offset X'}</span>
                      <span style={{ color: '#D6AA62', fontFamily: 'monospace' }}>{form.icon_offset_x}px</span>
                    </label>
                    <input type="range" min={-12} max={12} step={1} value={form.icon_offset_x}
                      onChange={e => set('icon_offset_x', parseInt(e.target.value))}
                      className="w-full accent-amber-400" />
                  </div>
                  <div>
                    <label style={LABEL} className="flex items-center justify-between">
                      <span>{isAr ? 'إزاحة عمودية' : 'Offset Y'}</span>
                      <span style={{ color: '#D6AA62', fontFamily: 'monospace' }}>{form.icon_offset_y}px</span>
                    </label>
                    <input type="range" min={-12} max={12} step={1} value={form.icon_offset_y}
                      onChange={e => set('icon_offset_y', parseInt(e.target.value))}
                      className="w-full accent-amber-400" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label style={LABEL}>{isAr ? 'خلفية الأيقونة' : 'Icon Background'}</label>
                    <select style={INPUT} value={form.icon_bg_style}
                      onChange={e => set('icon_bg_style', e.target.value)}>
                      {BG_STYLES.map(s => (
                        <option key={s} value={s} style={{ background: '#0a0818' }}>{BG_STYLE_LABELS[s]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={LABEL}>{isAr ? 'شكل الأيقونة' : 'Icon Shape'}</label>
                    <select style={INPUT} value={form.icon_shape}
                      onChange={e => set('icon_shape', e.target.value)}>
                      {SHAPES.map(s => (
                        <option key={s} value={s} style={{ background: '#0a0818' }}>{SHAPE_LABELS[s]}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label style={LABEL}>{isAr ? 'لون التوهج (اختياري)' : 'Glow Color (optional)'}</label>
                  <div className="flex items-center gap-3">
                    <input type="color" value={form.glow_color || '#ffffff'}
                      onChange={e => set('glow_color', e.target.value)}
                      className="w-12 h-11 rounded-lg cursor-pointer"
                      style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)' }} />
                    <input style={{ ...INPUT, flex: 1 }} value={form.glow_color}
                      onChange={e => set('glow_color', e.target.value)} placeholder="#fbbf24" />
                    {form.glow_color && (
                      <button type="button" onClick={() => set('glow_color', '')}
                        className="px-3 h-11 rounded-lg text-xs text-white/40 hover:text-white/70 transition-all"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'availability':
        return (
          <div className="space-y-5">
            <div>
              <div style={SECTION_TITLE}>{isAr ? 'وضع التوفر' : 'Availability Mode'}</div>
              <div className="grid grid-cols-2 gap-2">
                {AVAILABILITY_MODES.map(mode => {
                  const selected = form.availability_mode === mode.value;
                  return (
                    <button
                      key={mode.value}
                      type="button"
                      onClick={() => set('availability_mode', mode.value)}
                      className="flex items-start gap-3 p-3 rounded-xl text-start transition-all"
                      style={{
                        background: selected ? 'rgba(214,170,98,0.12)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${selected ? 'rgba(214,170,98,0.4)' : 'rgba(255,255,255,0.06)'}`,
                      }}
                    >
                      <div className="flex-shrink-0 mt-0.5" style={{ color: selected ? '#D6AA62' : 'rgba(255,255,255,0.3)' }}>
                        {mode.icon}
                      </div>
                      <div>
                        <p className="text-xs font-bold" style={{ color: selected ? '#D6AA62' : 'rgba(255,255,255,0.6)' }}>
                          {isAr ? mode.labelAr : mode.labelEn}
                        </p>
                        <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                          {isAr ? mode.descAr : mode.descEn}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Mode-specific fields */}
            {form.availability_mode === 'LOCKED_BY_GOAL' && (
              <div className="space-y-3 p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={SECTION_TITLE}>{isAr ? 'إعدادات الهدف' : 'Goal Settings'}</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label style={LABEL}>{isAr ? 'المقياس المطلوب' : 'Target Metric'}</label>
                    <select style={INPUT} value={form.unlock_target_metric}
                      onChange={e => set('unlock_target_metric', e.target.value)}>
                      {UNLOCK_METRICS.map(m => (
                        <option key={m.value} value={m.value} style={{ background: '#0a0818' }}>
                          {isAr ? m.labelAr : m.labelEn}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={LABEL}>{isAr ? 'القيمة المطلوبة' : 'Target Value'}</label>
                    <input type="number" style={INPUT} value={form.unlock_target_value} min={1}
                      onChange={e => set('unlock_target_value', parseInt(e.target.value) || 1)} />
                  </div>
                </div>
                <div>
                  <label style={LABEL}>{isAr ? 'الظهور وهي مقفلة' : 'When Locked'}</label>
                  <select style={INPUT} value={form.locked_visibility}
                    onChange={e => set('locked_visibility', e.target.value as any)}>
                    <option value="visible" style={{ background: '#0a0818' }}>{isAr ? 'ظاهرة (مع قفل)' : 'Visible (with lock)'}</option>
                    <option value="silhouette" style={{ background: '#0a0818' }}>{isAr ? 'صورة ظلية' : 'Silhouette'}</option>
                    <option value="hidden" style={{ background: '#0a0818' }}>{isAr ? 'مخفية' : 'Hidden'}</option>
                  </select>
                </div>
              </div>
            )}

            {form.availability_mode === 'SCHEDULED' && (
              <div className="space-y-3 p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={SECTION_TITLE}>{isAr ? 'الجدول الزمني' : 'Schedule'}</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label style={LABEL}>{isAr ? 'تبدأ من' : 'Starts At'}</label>
                    <input type="datetime-local" style={INPUT} value={form.starts_at}
                      onChange={e => set('starts_at', e.target.value)} />
                  </div>
                  <div>
                    <label style={LABEL}>{isAr ? 'تنتهي في' : 'Ends At'}</label>
                    <input type="datetime-local" style={INPUT} value={form.ends_at}
                      onChange={e => set('ends_at', e.target.value)} />
                  </div>
                </div>
              </div>
            )}

            {form.availability_mode === 'LIMITED_STOCK' && (
              <div className="space-y-3 p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={SECTION_TITLE}>{isAr ? 'المخزون' : 'Stock Settings'}</div>
                <div>
                  <label style={LABEL}>{isAr ? 'المخزون الأولي' : 'Initial Stock'}</label>
                  <input type="number" style={INPUT} value={form.initial_stock} min={1}
                    onChange={e => set('initial_stock', parseInt(e.target.value) || 1)} />
                </div>
              </div>
            )}

            {form.availability_mode === 'LIMITED_WINNERS' && (
              <div className="space-y-3 p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={SECTION_TITLE}>{isAr ? 'حد الفائزين' : 'Winner Limit'}</div>
                <div>
                  <label style={LABEL}>{isAr ? 'أقصى عدد فائزين' : 'Max Winners'}</label>
                  <input type="number" style={INPUT} value={form.max_winners} min={1}
                    onChange={e => set('max_winners', parseInt(e.target.value) || 1)} />
                </div>
              </div>
            )}

            {form.availability_mode === 'EVENT_ONLY' && (
              <div className="space-y-3 p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={SECTION_TITLE}>{isAr ? 'إعدادات الحدث' : 'Event Settings'}</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label style={LABEL}>{isAr ? 'وسم الحدث' : 'Event Tag'}</label>
                    <input style={INPUT} value={form.event_tag}
                      onChange={e => set('event_tag', e.target.value)}
                      placeholder="ramadan_2026" />
                  </div>
                  <div>
                    <label style={LABEL}>{isAr ? 'تنتهي في' : 'Ends At'}</label>
                    <input type="datetime-local" style={INPUT} value={form.ends_at}
                      onChange={e => set('ends_at', e.target.value)} />
                  </div>
                </div>
              </div>
            )}

            {/* Fallback prize — for modes that can exhaust */}
            {['LIMITED_STOCK', 'LIMITED_WINNERS', 'SCHEDULED', 'EVENT_ONLY'].includes(form.availability_mode) && (
              <div>
                <label style={LABEL}>{isAr ? 'جائزة بديلة (عند النفاد)' : 'Fallback Prize (when exhausted)'}</label>
                <select style={INPUT} value={form.fallback_prize_id}
                  onChange={e => set('fallback_prize_id', e.target.value)}>
                  <option value="" style={{ background: '#0a0818' }}>{isAr ? 'بدون (تخطي)' : 'None (skip)'}</option>
                  {allPrizes.filter(p => p.id !== (prize as any).id).map(p => (
                    <option key={p.id} value={p.id} style={{ background: '#0a0818' }}>
                      {isAr ? p.name_ar : p.name_en}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        );

      case 'probability':
        return (
          <div className="space-y-5">
            <div>
              <div style={SECTION_TITLE}>{isAr ? 'الاحتمالية' : 'Probability'}</div>
              <label style={LABEL} className="flex items-center justify-between">
                <span>{isAr ? 'الوزن' : 'Weight'}</span>
                <span style={{ color: '#fbbf24', fontFamily: 'monospace' }}>
                  ~ {livePct.toFixed(2)}%
                </span>
              </label>
              <input type="number" style={INPUT} value={form.weight} min={0.01} step={0.01}
                onChange={e => set('weight', parseFloat(e.target.value) || 0)} />
              <div className="mt-3 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                <div className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(livePct, 100)}%`, background: form.accent_color }} />
              </div>
            </div>

            <div>
              <div style={SECTION_TITLE}>{isAr ? 'حدود اللاعب' : 'Per-User Limits'}</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={LABEL}>{isAr ? 'أقصى فوز للمستخدم' : 'Max Wins / User'}</label>
                  <input type="number" style={INPUT} value={form.max_wins_per_user} min={0}
                    onChange={e => set('max_wins_per_user', parseInt(e.target.value) || 0)} />
                  <p className="text-[10px] mt-1 text-white/25">{isAr ? '0 = غير محدود' : '0 = unlimited'}</p>
                </div>
                <div>
                  <label style={LABEL}>{isAr ? 'فترة تبريد (أيام)' : 'Cooldown (days)'}</label>
                  <input type="number" style={INPUT} value={form.user_cooldown_days} min={0}
                    onChange={e => set('user_cooldown_days', parseInt(e.target.value) || 0)} />
                  <p className="text-[10px] mt-1 text-white/25">{isAr ? '0 = بدون تبريد' : '0 = no cooldown'}</p>
                </div>
              </div>
            </div>

            <div>
              <div style={SECTION_TITLE}>{isAr ? 'خيارات متقدمة' : 'Advanced'}</div>
              <label className="flex items-center gap-3 cursor-pointer py-2">
                <div className="relative flex-shrink-0">
                  <input type="checkbox" className="sr-only" checked={form.is_strong}
                    onChange={e => set('is_strong', e.target.checked)} />
                  <div className="w-11 h-6 rounded-full transition-colors"
                    style={{ background: form.is_strong ? '#22d3ee' : 'rgba(255,255,255,0.1)' }}>
                    <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform"
                      style={{ transform: form.is_strong ? 'translateX(20px)' : 'translateX(2px)' }} />
                  </div>
                </div>
                <div>
                  <p className="text-sm font-bold text-white">
                    {isAr ? 'جائزة قوية (لا تتكرر بنفس الجلسة)' : 'Strong prize (no repeat per session)'}
                  </p>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    {isAr ? 'للجوائز الكبيرة كنتفلكس والجائزة الكبرى' : 'For Netflix, Grand Prize, etc.'}
                  </p>
                </div>
              </label>
            </div>
          </div>
        );

      case 'delivery':
        return (
          <div className="space-y-4">
            <div style={SECTION_TITLE}>{isAr ? 'معلومات التسليم' : 'Delivery Info'}</div>
            <div className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#D6AA62' }} />
                <div>
                  <p className="text-sm font-bold text-white/70">
                    {form.type === 'points'
                      ? (isAr ? 'النقاط تُضاف تلقائياً' : 'Points are awarded automatically')
                      : form.type === 'miss'
                      ? (isAr ? 'لا يوجد تسليم لهذا النوع' : 'No delivery for this type')
                      : (isAr ? 'يتم إنشاء طلب تسليم تلقائي عبر نظام الفلفلمنت' : 'A fulfillment case is auto-created for manual delivery')}
                  </p>
                  <p className="text-xs mt-1 text-white/30">
                    {form.type === 'points'
                      ? (isAr ? 'يتم إضافة القيمة المحددة مباشرة لرصيد المستخدم' : 'The specified value is added directly to user balance')
                      : form.type === 'miss'
                      ? (isAr ? 'جائزة "حظ أوفر" لا تتطلب أي إجراء' : '"Better luck" prize requires no action')
                      : (isAr ? 'فريق الدعم سيتولى التسليم عبر المحادثة' : 'Support team handles delivery via chat thread')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        );

      case 'preview':
        return (
          <div className="space-y-4">
            <div style={SECTION_TITLE}>{isAr ? 'المعاينة' : 'Preview'}</div>
            <div className="grid grid-cols-2 gap-3">
              <SegmentPreview form={form} />
              <WinPreview form={form} />
            </div>
            {/* Summary card */}
            <div className="p-4 rounded-xl space-y-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={SECTION_TITLE}>{isAr ? 'ملخص' : 'Summary'}</div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                {[
                  { l: isAr ? 'النوع' : 'Type', v: isAr ? TYPE_LABEL[form.type]?.ar : TYPE_LABEL[form.type]?.en },
                  { l: isAr ? 'الوزن' : 'Weight', v: `${form.weight} (~${livePct.toFixed(1)}%)` },
                  { l: isAr ? 'الندرة' : 'Rarity', v: form.rarity },
                  { l: isAr ? 'التوفر' : 'Availability', v: AVAILABILITY_MODES.find(m => m.value === form.availability_mode)?.[isAr ? 'labelAr' : 'labelEn'] },
                  { l: isAr ? 'حد الفوز/مستخدم' : 'Max/User', v: form.max_wins_per_user || (isAr ? 'غير محدود' : 'Unlimited') },
                  { l: isAr ? 'قوية' : 'Strong', v: form.is_strong ? (isAr ? 'نعم' : 'Yes') : (isAr ? 'لا' : 'No') },
                ].map(item => (
                  <div key={item.l}>
                    <p className="text-white/30">{item.l}</p>
                    <p className="font-bold text-white/70">{String(item.v)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className="w-full sm:max-w-2xl max-h-[96vh] flex flex-col overflow-hidden rounded-t-3xl sm:rounded-2xl"
        style={{ background: 'rgba(8,6,18,0.98)', border: '1px solid rgba(214,170,98,0.2)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 className="font-black text-lg text-white">
            {isEdit ? (isAr ? 'تعديل الجائزة' : 'Edit Prize') : (isAr ? 'إضافة جائزة جديدة' : 'New Prize')}
          </h3>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex-shrink-0 flex items-center gap-0.5 px-4 pt-2 overflow-x-auto"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {EDITOR_TABS.map(tab => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex-shrink-0 px-3 py-2.5 text-xs font-bold rounded-t-lg transition-all relative whitespace-nowrap"
                style={{
                  color: active ? '#D6AA62' : 'rgba(255,255,255,0.35)',
                  background: active ? 'rgba(214,170,98,0.08)' : 'transparent',
                }}
              >
                {isAr ? tab.labelAr : tab.labelEn}
                {active && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full"
                    style={{ background: '#D6AA62' }} />
                )}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {renderTabContent()}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {saveError && (
            <div className="mx-6 mt-4 px-4 py-3 rounded-xl text-sm font-semibold"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5' }}>
              {saveError}
            </div>
          )}
          <div className="flex gap-3 px-6 py-4">
            <button onClick={handleSave}
              disabled={!form.name_ar || !form.name_en || uploading || saving}
              className="flex-1 flex items-center justify-center gap-2 py-3 font-bold rounded-xl transition-all disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #d4a853, #b8882e)', color: '#0a0608' }}>
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-[#0a0608]/30 border-t-[#0a0608] rounded-full animate-spin" />
                  {isAr ? 'جارٍ الحفظ...' : 'Saving...'}
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  {isAr ? 'حفظ الجائزة' : 'Save Prize'}
                </>
              )}
            </button>
            <button onClick={onClose} disabled={saving}
              className="px-6 py-3 font-bold rounded-xl transition-all disabled:opacity-40"
              style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Status badge for prize list ─────────────────────────────────────────────
function AvailabilityBadge({ mode, language }: { mode: AvailabilityMode | undefined; language: string }) {
  const isAr = language === 'ar';
  if (!mode || mode === 'ALWAYS_ACTIVE') return null;
  const config: Record<string, { label: string; color: string; bg: string }> = {
    LOCKED_BY_GOAL:  { label: isAr ? 'مقفلة' : 'Locked', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
    SCHEDULED:       { label: isAr ? 'مجدولة' : 'Scheduled', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
    LIMITED_STOCK:   { label: isAr ? 'محدودة' : 'Limited', color: '#f472b6', bg: 'rgba(244,114,182,0.12)' },
    LIMITED_WINNERS: { label: isAr ? 'فائزين' : 'Winners', color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
    EVENT_ONLY:      { label: isAr ? 'حدث خاص' : 'Event', color: '#34d399', bg: 'rgba(52,211,153,0.12)' },
  };
  const c = config[mode];
  if (!c) return null;
  return (
    <span className="text-[10px] font-black px-1.5 py-0.5 rounded"
      style={{ background: c.bg, color: c.color, border: `1px solid ${c.color}30` }}>
      {c.label}
    </span>
  );
}

interface Props { language: string; }

export function PrizesTab({ language }: Props) {
  const [settings, setSettings] = useState<WheelSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editPrize, setEditPrize] = useState<(WheelPrize & { rarity?: string }) | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const isAr = language === 'ar';

  const fetchSettings = useCallback(async () => {
    const { data } = await supabase.from('wheel_game_settings').select('*').maybeSingle();
    if (data) setSettings(data as WheelSettings);
    setLoading(false);
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const totalWeight = useMemo(() =>
    (settings?.prizes ?? []).reduce((s, p) => s + p.weight, 0), [settings?.prizes]);

  const persist = async (prizes: (WheelPrize & { rarity?: string })[]): Promise<boolean> => {
    if (!settings) return false;
    setSaving(true);
    setSaveError(null);
    try {
      const { error: dbErr } = await supabase
        .from('wheel_game_settings')
        .update({ prizes, updated_at: new Date().toISOString() })
        .eq('id', settings.id);
      if (dbErr) throw dbErr;
      // Refetch from DB to confirm persisted state
      await fetchSettings();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
      return true;
    } catch (e: any) {
      const msg: string = e?.message ?? '';
      setSaveError(
        msg.includes('permission') || msg.includes('policy') || msg.includes('row-level')
          ? 'لا تملك صلاحية تعديل الجوائز'
          : 'تعذر حفظ تعديلات الجائزة'
      );
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSavePrize = async (prize: WheelPrize & { rarity: string }) => {
    if (!settings) return;
    const prizes = settings.prizes as (WheelPrize & { rarity?: string })[];
    const idx = prizes.findIndex(p => p.id === prize.id);
    const updated = idx >= 0
      ? prizes.map((p, i) => i === idx ? prize : p)
      : [...prizes, prize];
    const ok = await persist(updated);
    if (ok) {
      setShowEditor(false);
      setEditPrize(null);
      supabase.rpc('log_admin_action', {
        p_action_type: idx >= 0 ? 'prize_updated' : 'prize_created',
        p_entity_type: 'prize', p_entity_id: prize.id,
        p_change_summary: `${idx >= 0 ? 'تعديل' : 'إنشاء'} جائزة: ${prize.name_ar}`,
      }).then(() => {});
    }
  };

  const handleDelete = async (id: string) => {
    if (!settings) return;
    if (!confirm(isAr ? 'هل تريد حذف هذه الجائزة؟' : 'Delete this prize?')) return;
    const updated = settings.prizes.filter(p => p.id !== id);
    const ok = await persist(updated);
    if (ok) {
      supabase.rpc('log_admin_action', {
        p_action_type: 'prize_deleted', p_entity_type: 'prize', p_entity_id: id,
      }).then(() => {});
    }
  };

  const moveUp = (idx: number) => {
    if (!settings || idx === 0) return;
    const prizes = [...settings.prizes];
    [prizes[idx - 1], prizes[idx]] = [prizes[idx], prizes[idx - 1]];
    persist(prizes);
  };

  const moveDown = (idx: number) => {
    if (!settings || idx === settings.prizes.length - 1) return;
    const prizes = [...settings.prizes];
    [prizes[idx], prizes[idx + 1]] = [prizes[idx + 1], prizes[idx]];
    persist(prizes);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 rounded-full border-2 border-transparent animate-spin"
          style={{ borderTopColor: '#D6AA62', borderRightColor: '#D6AA62' }} />
      </div>
    );
  }

  const prizes = (settings?.prizes ?? []) as (WheelPrize & { rarity?: string })[];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-black text-white text-base">
            {isAr ? '\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u062C\u0648\u0627\u0626\u0632' : 'Prize Management'}
          </h3>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {prizes.length} {isAr ? '\u062C\u0627\u0626\u0632\u0629' : 'prizes'} ·{' '}
            {isAr ? '\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0648\u0632\u0646:' : 'Total weight:'} {totalWeight.toFixed(2)}
          </p>
        </div>
        <div className="flex gap-2">
          {success && (
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold"
              style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }}>
              {isAr ? 'تم الحفظ' : 'Saved'}
            </div>
          )}
          <button
            onClick={() => { setEditPrize(null); setShowEditor(true); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all"
            style={{ background: 'linear-gradient(135deg, #d4a853, #b8882e)', color: '#0a0608' }}>
            <Plus className="w-4 h-4" />
            {isAr ? '\u062C\u0627\u0626\u0632\u0629 \u062C\u062F\u064A\u062F\u0629' : 'New Prize'}
          </button>
        </div>
      </div>

      {/* Prize list */}
      {prizes.length === 0 ? (
        <div className="py-20 text-center rounded-2xl" style={CARD}>
          <Eye className="w-12 h-12 mx-auto mb-3 opacity-20 text-white" />
          <p style={{ color: 'rgba(255,255,255,0.3)' }}>
            {isAr ? '\u0644\u0627 \u062A\u0648\u062C\u062F \u062C\u0648\u0627\u0626\u0632 \u0628\u0639\u062F' : 'No prizes yet'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {prizes.map((prize, idx) => {
            const pct = totalWeight > 0 ? prize.weight / totalWeight * 100 : 0;
            const isExpanded = expandedId === prize.id;
            const rarityColor = RARITY_COLOR[(prize as any).rarity ?? 'common'];

            return (
              <div key={prize.id} style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
                <div className="flex">
                  <div className="w-1 flex-shrink-0" style={{ background: prize.accent_color }} />
                  <div className="flex-1 p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden"
                        style={{ background: `${prize.accent_color}15`, border: `1.5px solid ${rarityColor}50` }}>
                        <PrizeThumbnail prize={prize} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-white text-sm">
                            {isAr ? prize.name_ar : prize.name_en}
                          </span>
                          <span className="text-[10px] font-black px-1.5 py-0.5 rounded uppercase"
                            style={{ background: `${rarityColor}15`, color: rarityColor, border: `1px solid ${rarityColor}30` }}>
                            {(prize as any).rarity ?? 'common'}
                          </span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                            style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)' }}>
                            {isAr ? TYPE_LABEL[prize.type]?.ar : TYPE_LABEL[prize.type]?.en}
                          </span>
                          <AvailabilityBadge mode={prize.availability_mode} language={language} />
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                            <div className="h-full rounded-full transition-all"
                              style={{ width: `${Math.min(pct, 100)}%`, background: prize.accent_color }} />
                          </div>
                          <span className="text-xs font-black flex-shrink-0"
                            style={{ color: prize.accent_color, fontFamily: 'monospace' }}>
                            {pct < 0.1 ? pct.toFixed(3) : pct.toFixed(2)}%
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => moveUp(idx)} disabled={idx === 0}
                          className="w-8 h-8 flex items-center justify-center rounded-lg transition-all disabled:opacity-20"
                          style={{ color: 'rgba(255,255,255,0.4)' }}>
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <button onClick={() => moveDown(idx)} disabled={idx === prizes.length - 1}
                          className="w-8 h-8 flex items-center justify-center rounded-lg transition-all disabled:opacity-20"
                          style={{ color: 'rgba(255,255,255,0.4)' }}>
                          <ChevronDown className="w-4 h-4" />
                        </button>
                        <button onClick={() => { setEditPrize(prize); setShowEditor(true); }}
                          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-amber-500/20 transition-all">
                          <Edit2 className="w-4 h-4 text-amber-400" />
                        </button>
                        <button onClick={() => handleDelete(prize.id)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-500/15 transition-all">
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                        <button onClick={() => setExpandedId(isExpanded ? null : prize.id)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg transition-all"
                          style={{ color: 'rgba(255,255,255,0.3)' }}>
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-3 pt-3 grid grid-cols-2 sm:grid-cols-4 gap-3"
                        style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        {[
                          { label: isAr ? 'القيمة' : 'Value', value: prize.value },
                          { label: isAr ? 'الوزن' : 'Weight', value: prize.weight },
                          { label: isAr ? 'اختصار العجلة' : 'Wheel Label', value: prize.short_label || '\u2014' },
                          { label: isAr ? 'جائزة قوية' : 'Strong', value: prize.is_strong ? 'Yes' : 'No' },
                          { label: isAr ? 'التوفر' : 'Availability', value: AVAILABILITY_MODES.find(m => m.value === (prize.availability_mode ?? 'ALWAYS_ACTIVE'))?.[isAr ? 'labelAr' : 'labelEn'] ?? 'Always' },
                          { label: isAr ? 'حد الفوز/مستخدم' : 'Max/User', value: prize.max_wins_per_user || (isAr ? 'غير محدود' : '\u221E') },
                        ].map(d => (
                          <div key={d.label}>
                            <p className="text-[10px] uppercase tracking-widest mb-0.5"
                              style={{ color: 'rgba(255,255,255,0.3)' }}>{d.label}</p>
                            <p className="text-sm font-bold text-white">{String(d.value)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Inline error shown when editor is closed (e.g. reorder/delete failures) */}
      {saveError && !showEditor && (
        <div className="px-4 py-3 rounded-xl text-sm font-semibold"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5' }}>
          {saveError}
        </div>
      )}

      {showEditor && (
        <PrizeEditor
          prize={editPrize ?? {}}
          totalWeight={totalWeight}
          allPrizes={prizes}
          onSave={handleSavePrize}
          onClose={() => { setShowEditor(false); setEditPrize(null); setSaveError(null); }}
          language={language}
          saving={saving}
          saveError={saveError}
        />
      )}
    </div>
  );
}
