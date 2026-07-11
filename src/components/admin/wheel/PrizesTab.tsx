import { useState, useMemo, useCallback, useRef } from 'react';
import { Plus, CreditCard as Edit2, Trash2, Save, X, ChevronDown, ChevronUp, Eye, Upload, Image as ImageIcon, RotateCcw } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import type { WheelPrize, WheelSettings } from '../../../hooks/useSpinWheelGame';

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

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME = ['image/png', 'image/webp', 'image/jpeg', 'image/gif'];

// ── Fallback SVG icon for the preview ────────────────────────────────────────
function FallbackIcon({ type, color, size }: { type: string; color: string; size: number }) {
  const paths: Record<string, string> = {
    points:  'M16 4l3.09 6.26L26 11.27l-5 4.87 1.18 6.86L16 19.77l-6.18 3.23L11 16.14 6 11.27l6.91-1.01L16 4z',
    service: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z',
    miss:    'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z',
    grand:   'M5 3l3 6.5L12 4l4 5.5 3-6.5 3 14H2L5 3zM2 19h20v2H2z',
  };
  const d = paths[type] ?? paths.points;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden="true">
      <path d={d} fill={color} opacity={0.9} />
    </svg>
  );
}

// ── Mini wheel segment preview ────────────────────────────────────────────────
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
        <span className="text-[10px] font-bold text-white/30 uppercase tracking-wider">
          Wheel Preview
        </span>
        <button
          type="button"
          onClick={() => setDark(d => !d)}
          className="text-[10px] px-2 py-0.5 rounded-md transition-all"
          style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}>
          {dark ? 'Light' : 'Dark'}
        </button>
      </div>
      <div className="flex items-center justify-center py-3 rounded-xl"
        style={{ background: bg, border: '1px solid rgba(255,255,255,0.06)' }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Segment wedge */}
          <path
            d={`M${cx},${cy} L${cx},${cy - r} A${r},${r} 0 0,1 ${cx + r * Math.sin(Math.PI / 4)},${cy - r * Math.cos(Math.PI / 4)} Z`}
            fill={`${color}22`} stroke={color} strokeWidth="1.5" />
          {/* Rarity ring */}
          <circle cx={cx} cy={cy - r * 0.6} r={16}
            fill="rgba(10,8,24,0.9)"
            stroke={RARITY_COLOR[form.rarity ?? 'common']}
            strokeWidth="1.5" />
          {/* Icon or fallback */}
          {iconUrl ? (
            <image href={iconUrl} x={cx - 10} y={cy - r * 0.6 - 10}
              width={20} height={20}
              style={{ clipPath: `circle(50% at 50% 50%)` }} />
          ) : (
            <text x={cx} y={cy - r * 0.6 + 5} textAnchor="middle"
              fill={color} fontSize="14" fontWeight="900">
              {form.short_label?.slice(0, 2) || '?'}
            </text>
          )}
          {/* Label */}
          <text x={cx} y={cy + 8} textAnchor="middle"
            fill="rgba(255,255,255,0.6)" fontSize="7" fontWeight="700">
            {form.short_label || form.name_en || '—'}
          </text>
        </svg>
      </div>
    </div>
  );
}

// ── Win card preview ─────────────────────────────────────────────────────────
function WinPreview({ form }: { form: FormState }) {
  const color = form.accent_color;
  const iconUrl = form.primary_icon_url;
  const rarityColor = RARITY_COLOR[form.rarity ?? 'common'];

  return (
    <div>
      <span className="text-[10px] font-bold text-white/30 uppercase tracking-wider block mb-2">
        Win Card Preview
      </span>
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
          <div className="text-xs font-black text-white truncate">{form.name_ar || 'اسم الجائزة'}</div>
          <div className="text-[10px] mt-0.5" style={{ color: color }}>{form.name_en || 'Prize Name'}</div>
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
}

interface PrizeEditorProps {
  prize: Partial<WheelPrize> & { rarity?: string };
  totalWeight: number;
  onSave: (p: WheelPrize & { rarity: string }) => void;
  onClose: () => void;
  language: string;
}

function PrizeEditor({ prize, totalWeight, onSave, onClose, language }: PrizeEditorProps) {
  const [form, setForm] = useState<FormState>({
    name_ar:        prize.name_ar        ?? '',
    name_en:        prize.name_en        ?? '',
    type:           prize.type           ?? 'points',
    accent_color:   prize.accent_color   ?? '#22d3ee',
    weight:         prize.weight         ?? 5,
    value:          prize.value          ?? '',
    short_label:    prize.short_label    ?? '',
    is_strong:      prize.is_strong      ?? false,
    rarity:         (prize as any).rarity ?? 'common',
    primary_icon_url: prize.primary_icon_url ?? '',
    result_art_url:   prize.result_art_url   ?? '',
    icon_scale:       prize.icon_scale       ?? 1,
    icon_offset_x:    prize.icon_offset_x    ?? 0,
    icon_offset_y:    prize.icon_offset_y    ?? 0,
    glow_color:       prize.glow_color       ?? '',
    icon_bg_style:    prize.icon_bg_style     ?? 'soft_circle',
    icon_shape:       prize.icon_shape        ?? 'contain',
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
    onSave({ ...form, id: (prize as any).id ?? `prize_${Date.now()}` });
  };

  const isEdit = !!(prize as any).id;

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
            {isEdit
              ? (language === 'ar' ? 'تعديل الجائزة' : 'Edit Prize')
              : (language === 'ar' ? 'إضافة جائزة جديدة' : 'New Prize')}
          </h3>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* ── Basic Info ───────────────────────────────────────────────────── */}
          <div>
            <div style={SECTION_TITLE}>{language === 'ar' ? 'المعلومات الأساسية' : 'Basic Info'}</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label style={LABEL}>{language === 'ar' ? 'الاسم بالعربية' : 'Arabic Name'}</label>
                <input style={INPUT} value={form.name_ar}
                  onChange={e => set('name_ar', e.target.value)} placeholder="مثال: 100 نقطة" />
              </div>
              <div>
                <label style={LABEL}>{language === 'ar' ? 'الاسم بالإنجليزية' : 'English Name'}</label>
                <input style={INPUT} value={form.name_en}
                  onChange={e => set('name_en', e.target.value)} placeholder="100 Points" />
              </div>
              <div>
                <label style={LABEL}>{language === 'ar' ? 'نوع الجائزة' : 'Type'}</label>
                <select style={INPUT} value={form.type} onChange={e => set('type', e.target.value)}>
                  {PRIZE_TYPES.map(t => (
                    <option key={t} value={t} style={{ background: '#0a0818' }}>
                      {language === 'ar' ? TYPE_LABEL[t].ar : TYPE_LABEL[t].en}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={LABEL}>{language === 'ar' ? 'الندرة' : 'Rarity'}</label>
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
                <label style={LABEL}>{language === 'ar' ? 'القيمة / المبلغ' : 'Value / Amount'}</label>
                <input style={INPUT} value={form.value}
                  onChange={e => set('value', e.target.value)}
                  placeholder={language === 'ar' ? '100 أو "اشتراك نتفلكس"' : '100 or "Netflix sub"'} />
              </div>
              <div>
                <label style={LABEL}>{language === 'ar' ? 'اختصار العجلة (6 أحرف)' : 'Wheel Label (6 chars)'}</label>
                <input style={INPUT} value={form.short_label} maxLength={6}
                  onChange={e => set('short_label', e.target.value)} placeholder="100 / Plus" />
              </div>
            </div>
          </div>

          {/* ── Accent Color ─────────────────────────────────────────────────── */}
          <div>
            <div style={SECTION_TITLE}>{language === 'ar' ? 'لون العجلة' : 'Accent Color'}</div>
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

          {/* ── Icon Upload ──────────────────────────────────────────────────── */}
          <div>
            <div style={SECTION_TITLE}>{language === 'ar' ? 'أيقونة الجائزة' : 'Prize Icon'}</div>

            {form.primary_icon_url ? (
              /* Uploaded icon preview */
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
                  <p className="text-xs font-bold text-white/60">{language === 'ar' ? 'تم الرفع بنجاح' : 'Icon uploaded'}</p>
                  <div className="flex gap-2 flex-wrap">
                    <button type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                      style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)' }}>
                      <Upload className="w-3 h-3" />
                      {language === 'ar' ? 'تغيير' : 'Replace'}
                    </button>
                    <button type="button"
                      onClick={() => set('primary_icon_url', '')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                      style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                      <RotateCcw className="w-3 h-3" />
                      {language === 'ar' ? 'حذف' : 'Remove'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* Drop zone */
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => {
                  e.preventDefault(); setDragOver(false);
                  handleFile(e.dataTransfer.files[0]);
                }}
                onClick={() => fileRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 py-8 rounded-2xl cursor-pointer transition-all"
                style={{
                  border: `2px dashed ${dragOver ? '#D6AA62' : 'rgba(255,255,255,0.12)'}`,
                  background: dragOver ? 'rgba(214,170,98,0.06)' : 'rgba(255,255,255,0.02)',
                }}>
                {uploading
                  ? <div className="w-7 h-7 rounded-full border-2 border-transparent animate-spin"
                      style={{ borderTopColor: '#D6AA62' }} />
                  : <ImageIcon className="w-7 h-7 text-white/20" />}
                <p className="text-sm font-bold text-white/40">
                  {uploading
                    ? (language === 'ar' ? 'جارٍ الرفع...' : 'Uploading...')
                    : (language === 'ar' ? 'اسحب الصورة هنا أو اضغط للاختيار' : 'Drag & drop or click to pick')}
                </p>
                <p className="text-xs text-white/20">PNG, WebP, JPEG · max 5 MB</p>
              </div>
            )}

            <input ref={fileRef} type="file" accept="image/png,image/webp,image/jpeg,image/gif"
              className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
            {uploadErr && (
              <p className="text-xs mt-2 text-red-400">{uploadErr}</p>
            )}
          </div>

          {/* ── Visual Tuning ────────────────────────────────────────────────── */}
          <div>
            <div style={SECTION_TITLE}>{language === 'ar' ? 'ضبط المظهر' : 'Visual Tuning'}</div>
            <div className="space-y-4">
              {/* Scale */}
              <div>
                <label style={LABEL} className="flex items-center justify-between">
                  <span>{language === 'ar' ? 'حجم الأيقونة' : 'Icon Scale'}</span>
                  <span style={{ color: '#D6AA62', fontFamily: 'monospace' }}>{form.icon_scale.toFixed(2)}×</span>
                </label>
                <input type="range" min={0.70} max={1.25} step={0.01} value={form.icon_scale}
                  onChange={e => set('icon_scale', parseFloat(e.target.value))}
                  className="w-full accent-amber-400" />
                <div className="flex justify-between text-[10px] text-white/20 mt-1">
                  <span>0.70×</span><span>1.25×</span>
                </div>
              </div>

              {/* Offset X/Y */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={LABEL} className="flex items-center justify-between">
                    <span>{language === 'ar' ? 'إزاحة أفقية' : 'Offset X'}</span>
                    <span style={{ color: '#D6AA62', fontFamily: 'monospace' }}>{form.icon_offset_x}px</span>
                  </label>
                  <input type="range" min={-12} max={12} step={1} value={form.icon_offset_x}
                    onChange={e => set('icon_offset_x', parseInt(e.target.value))}
                    className="w-full accent-amber-400" />
                </div>
                <div>
                  <label style={LABEL} className="flex items-center justify-between">
                    <span>{language === 'ar' ? 'إزاحة عمودية' : 'Offset Y'}</span>
                    <span style={{ color: '#D6AA62', fontFamily: 'monospace' }}>{form.icon_offset_y}px</span>
                  </label>
                  <input type="range" min={-12} max={12} step={1} value={form.icon_offset_y}
                    onChange={e => set('icon_offset_y', parseInt(e.target.value))}
                    className="w-full accent-amber-400" />
                </div>
              </div>

              {/* Icon bg style + shape */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={LABEL}>{language === 'ar' ? 'خلفية الأيقونة' : 'Icon Background'}</label>
                  <select style={INPUT} value={form.icon_bg_style}
                    onChange={e => set('icon_bg_style', e.target.value)}>
                    {BG_STYLES.map(s => (
                      <option key={s} value={s} style={{ background: '#0a0818' }}>
                        {BG_STYLE_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={LABEL}>{language === 'ar' ? 'شكل الأيقونة' : 'Icon Shape'}</label>
                  <select style={INPUT} value={form.icon_shape}
                    onChange={e => set('icon_shape', e.target.value)}>
                    {SHAPES.map(s => (
                      <option key={s} value={s} style={{ background: '#0a0818' }}>
                        {SHAPE_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Glow color */}
              <div>
                <label style={LABEL}>{language === 'ar' ? 'لون التوهج (اختياري)' : 'Glow Color (optional)'}</label>
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

          {/* ── Previews ─────────────────────────────────────────────────────── */}
          <div>
            <div style={SECTION_TITLE}>{language === 'ar' ? 'معاينة' : 'Preview'}</div>
            <div className="grid grid-cols-2 gap-3">
              <SegmentPreview form={form} />
              <WinPreview form={form} />
            </div>
          </div>

          {/* ── Probability ──────────────────────────────────────────────────── */}
          <div>
            <div style={SECTION_TITLE}>{language === 'ar' ? 'الاحتمالية' : 'Probability'}</div>
            <div>
              <label style={LABEL} className="flex items-center justify-between">
                <span>{language === 'ar' ? 'الوزن' : 'Weight'}</span>
                <span style={{ color: '#fbbf24', fontFamily: 'monospace' }}>
                  ≈ {livePct.toFixed(2)}%
                </span>
              </label>
              <input type="number" style={INPUT} value={form.weight} min={0.01} step={0.01}
                onChange={e => set('weight', parseFloat(e.target.value) || 0)} />
              <div className="mt-3 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                <div className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(livePct, 100)}%`, background: form.accent_color }} />
              </div>
            </div>
          </div>

          {/* ── Advanced ─────────────────────────────────────────────────────── */}
          <div>
            <div style={SECTION_TITLE}>{language === 'ar' ? 'خيارات متقدمة' : 'Advanced'}</div>
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
                  {language === 'ar' ? 'جائزة قوية (لا تتكرر بنفس الجلسة)' : 'Strong prize (no repeat per session)'}
                </p>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  {language === 'ar' ? 'للجوائز الكبيرة كنتفلكس والجائزة الكبرى' : 'For Netflix, Grand Prize, etc.'}
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 flex-shrink-0"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button onClick={handleSave} disabled={!form.name_ar || !form.name_en || uploading}
            className="flex-1 flex items-center justify-center gap-2 py-3 font-bold rounded-xl transition-all disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #d4a853, #b8882e)', color: '#0a0608' }}>
            <Save className="w-4 h-4" />
            {language === 'ar' ? 'حفظ الجائزة' : 'Save Prize'}
          </button>
          <button onClick={onClose}
            className="px-6 py-3 font-bold rounded-xl transition-all"
            style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
            {language === 'ar' ? 'إلغاء' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface Props { language: string; }

export function PrizesTab({ language }: Props) {
  const [settings, setSettings] = useState<WheelSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editPrize, setEditPrize] = useState<(WheelPrize & { rarity?: string }) | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const fetchSettings = useCallback(async () => {
    const { data } = await supabase.from('wheel_game_settings').select('*').maybeSingle();
    if (data) setSettings(data as WheelSettings);
    setLoading(false);
  }, []);

  useState(() => { fetchSettings(); });

  const totalWeight = useMemo(() =>
    (settings?.prizes ?? []).reduce((s, p) => s + p.weight, 0), [settings?.prizes]);

  const persist = async (prizes: (WheelPrize & { rarity?: string })[]) => {
    if (!settings) return;
    setSaving(true);
    try {
      await supabase.from('wheel_game_settings')
        .update({ prizes, updated_at: new Date().toISOString() })
        .eq('id', settings.id);
      setSettings({ ...settings, prizes: prizes as WheelPrize[] });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
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
    await persist(updated);
    setShowEditor(false);
    setEditPrize(null);
    supabase.rpc('log_admin_action', {
      p_action_type: idx >= 0 ? 'prize_updated' : 'prize_created',
      p_entity_type: 'prize', p_entity_id: prize.id,
      p_change_summary: `${idx >= 0 ? 'تعديل' : 'إنشاء'} جائزة: ${prize.name_ar}`,
    }).then(() => {});
  };

  const handleDelete = async (id: string) => {
    if (!settings) return;
    if (!confirm(language === 'ar' ? 'هل تريد حذف هذه الجائزة؟' : 'Delete this prize?')) return;
    const updated = settings.prizes.filter(p => p.id !== id);
    await persist(updated);
    supabase.rpc('log_admin_action', {
      p_action_type: 'prize_deleted', p_entity_type: 'prize', p_entity_id: id,
    }).then(() => {});
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
            {language === 'ar' ? 'إدارة الجوائز' : 'Prize Management'}
          </h3>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {prizes.length} {language === 'ar' ? 'جائزة' : 'prizes'} ·{' '}
            {language === 'ar' ? 'إجمالي الوزن:' : 'Total weight:'} {totalWeight.toFixed(2)}
          </p>
        </div>
        <div className="flex gap-2">
          {success && (
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold"
              style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }}>
              ✓ {language === 'ar' ? 'تم الحفظ' : 'Saved'}
            </div>
          )}
          <button
            onClick={() => { setEditPrize(null); setShowEditor(true); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all"
            style={{ background: 'linear-gradient(135deg, #d4a853, #b8882e)', color: '#0a0608' }}>
            <Plus className="w-4 h-4" />
            {language === 'ar' ? 'جائزة جديدة' : 'New Prize'}
          </button>
        </div>
      </div>

      {/* Prize list */}
      {prizes.length === 0 ? (
        <div className="py-20 text-center rounded-2xl" style={CARD}>
          <Eye className="w-12 h-12 mx-auto mb-3 opacity-20 text-white" />
          <p style={{ color: 'rgba(255,255,255,0.3)' }}>
            {language === 'ar' ? 'لا توجد جوائز بعد' : 'No prizes yet'}
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
                  {/* Left accent bar */}
                  <div className="w-1 flex-shrink-0" style={{ background: prize.accent_color }} />
                  <div className="flex-1 p-4">
                    <div className="flex items-center gap-3">

                      {/* Icon thumbnail */}
                      <div className="w-11 h-11 rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden"
                        style={{ background: `${prize.accent_color}15`, border: `1.5px solid ${rarityColor}50` }}>
                        <PrizeThumbnail prize={prize} />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-white text-sm">
                            {language === 'ar' ? prize.name_ar : prize.name_en}
                          </span>
                          <span className="text-[10px] font-black px-1.5 py-0.5 rounded uppercase"
                            style={{ background: `${rarityColor}15`, color: rarityColor, border: `1px solid ${rarityColor}30` }}>
                            {(prize as any).rarity ?? 'common'}
                          </span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                            style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)' }}>
                            {language === 'ar' ? TYPE_LABEL[prize.type]?.ar : TYPE_LABEL[prize.type]?.en}
                          </span>
                        </div>
                        {/* Prob bar */}
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

                      {/* Actions */}
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

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 grid grid-cols-2 sm:grid-cols-4 gap-3"
                        style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        {[
                          { label: language === 'ar' ? 'القيمة' : 'Value', value: prize.value },
                          { label: language === 'ar' ? 'الوزن' : 'Weight', value: prize.weight },
                          { label: language === 'ar' ? 'اختصار العجلة' : 'Wheel Label', value: prize.short_label || '—' },
                          { label: language === 'ar' ? 'جائزة قوية' : 'Strong', value: prize.is_strong ? '✓' : '✗' },
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

      {saving && (
        <div className="text-center py-2 text-xs" style={{ color: '#D6AA62' }}>
          {language === 'ar' ? 'جارٍ الحفظ...' : 'Saving...'}
        </div>
      )}

      {showEditor && (
        <PrizeEditor
          prize={editPrize ?? {}}
          totalWeight={totalWeight}
          onSave={handleSavePrize}
          onClose={() => { setShowEditor(false); setEditPrize(null); }}
          language={language}
        />
      )}
    </div>
  );
}
