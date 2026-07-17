import { useRef, useState } from 'react';
import { Upload, Trash2, RotateCcw, Crown, Search, AlertTriangle, Info } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  REWARD_TYPE_AR,
  REWARD_TYPE_ICON,
  ppmToSectorAngle,
  ppmToPercentStr,
  ppmToLabel,
  expectedWinsLabel,
} from './prizeUtils';

// ─── Shared field helpers ──────────────────────────────────
const inputCls = 'w-full rounded-lg px-3 py-2.5 text-sm transition-all focus:outline-none focus:ring-1';
const inputStyle = { background: '#0d0906', border: '1px solid rgba(214,178,94,0.16)', color: '#efe6d2' } as const;
const labelCls = 'text-xs font-bold text-[#9c8b6e] block mb-1.5';

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
      {hint && !error && <p className="text-[11px] text-[#9c8b6e] mt-1">{hint}</p>}
      {error && <p className="text-[11px] text-[#e6455c] mt-1 flex items-center gap-1"><AlertTriangle size={10} />{error}</p>}
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2.5 cursor-pointer group"
    >
      <span
        className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
        style={{ background: checked ? 'rgba(217,171,78,0.5)' : 'rgba(156,139,110,0.2)' }}
      >
        <span
          className="inline-block h-4 w-4 rounded-full transition-transform"
          style={{
            background: checked ? '#f8e7b4' : '#9c8b6e',
            transform: `translateX(${checked ? '20px' : '2px'})`,
          }}
        />
      </span>
      <span className="text-sm text-[#efe6d2] group-hover:text-[#f8e7b4] transition-colors">{label}</span>
    </button>
  );
}

// ─── Typed Reward Editor ──────────────────────────────────
const REWARD_CARDS = [
  { type: 'POINTS', label: 'نقاط', icon: '\u2B50' },
  { type: 'COINS', label: 'عملات', icon: '\uD83D\uDCB0' },
  { type: 'NO_REWARD', label: 'حظ أوفر', icon: '\uD83C\uDFB2' },
  { type: 'FREE_SPIN', label: 'لفة مجانية', icon: '\uD83C\uDFB0' },
  { type: 'MANUAL_SERVICE', label: 'خدمة يدوية', icon: '\uD83D\uDCF1' },
  { type: 'VIP_ACCESS', label: 'VIP', icon: '\uD83C\uDFC6' },
  { type: 'GRAND_PRIZE', label: 'جائزة كبرى', icon: '\uD83D\uDC8E' },
];

export function RewardTypeEditor({ prize, update, isRTL }: { prize: any; update: (patch: any) => void; isRTL: boolean }) {
  const rewardType = prize.reward_type || 'NO_REWARD';
  const payload = prize.reward_payload || {};

  const setPayload = (patch: Record<string, any>) => update({ reward_payload: { ...payload, ...patch } });

  return (
    <div className="space-y-4" style={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      {/* Reward type cards */}
      <div>
        <label className={labelCls}>{isRTL ? 'نوع الجائزة' : 'Reward Type'}</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {REWARD_CARDS.map((r) => (
            <button
              key={r.type}
              type="button"
              onClick={() => update({ reward_type: r.type })}
              className="rounded-xl p-2.5 text-center transition-all"
              style={{
                background: rewardType === r.type ? 'linear-gradient(135deg, rgba(248,231,180,0.14), rgba(217,171,78,0.06))' : '#0d0906',
                border: `1.5px solid ${rewardType === r.type ? 'rgba(248,231,180,0.5)' : 'rgba(214,178,94,0.14)'}`,
              }}
            >
              <div className="text-xl mb-0.5">{r.icon}</div>
              <div className="text-xs font-bold" style={{ color: rewardType === r.type ? '#f8e7b4' : '#9c8b6e' }}>{r.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Type-specific fields */}
      {rewardType === 'POINTS' && (
        <Field label={isRTL ? 'عدد النقاط' : 'Points Amount'} hint={isRTL ? `المكافأة: ${payload.amount || 0} نقطة` : `Reward: ${payload.amount || 0} points`}>
          <input type="number" min="0" value={payload.amount ?? 0}
            onChange={(e) => setPayload({ amount: +e.target.value })}
            className={inputCls} style={inputStyle} />
        </Field>
      )}

      {rewardType === 'COINS' && (
        <Field label={isRTL ? 'عدد العملات' : 'Coins Amount'} hint={isRTL ? `المكافأة: ${payload.amount || 0} عملة` : `Reward: ${payload.amount || 0} coins`}>
          <input type="number" min="0" value={payload.amount ?? 0}
            onChange={(e) => setPayload({ amount: +e.target.value })}
            className={inputCls} style={inputStyle} />
        </Field>
      )}

      {rewardType === 'NO_REWARD' && (
        <div className="rounded-lg p-3 flex items-start gap-2" style={{ background: 'rgba(217,171,78,0.08)', border: '1px solid rgba(214,178,94,0.2)' }}>
          <Info size={14} className="text-[#d9ab4e] flex-shrink-0 mt-0.5" />
          <p className="text-xs text-[#d9ab4e]">{isRTL ? 'هذه الجائزة لا تمنح أي مكافأة اقتصادية. تُستخدم لتمثيل "حظ أوفر" على العجلة.' : 'This prize grants no economic reward. Used to represent "no win" on the wheel.'}</p>
        </div>
      )}

      {rewardType === 'FREE_SPIN' && (
        <Field label={isRTL ? 'عدد اللفات المجانية' : 'Free Spin Count'} hint={isRTL ? `المكافأة: ${payload.amount || 1} لفة مجانية` : `Reward: ${payload.amount || 1} free spins`}>
          <input type="number" min="1" value={payload.amount ?? 1}
            onChange={(e) => setPayload({ amount: +e.target.value })}
            className={inputCls} style={inputStyle} />
        </Field>
      )}

      {rewardType === 'MANUAL_SERVICE' && (
        <div className="space-y-3">
          <Field label={isRTL ? 'كود الخدمة' : 'Service Code'}>
            <input value={payload.service_code || ''} placeholder="e.g. VIP_RECHARGE"
              onChange={(e) => setPayload({ service_code: e.target.value })}
              className={inputCls} style={inputStyle} />
          </Field>
          <Field label={isRTL ? 'القيمة المعروضة' : 'Display Value'}>
            <input value={payload.display_value || ''} placeholder={isRTL ? 'مثال: شحن 50 ريال' : 'e.g. 50 SAR recharge'}
              onChange={(e) => setPayload({ display_value: e.target.value })}
              className={inputCls} style={inputStyle} />
          </Field>
          <Field label={isRTL ? 'نوع التنفيذ' : 'Fulfillment Mode'}>
            <select value={payload.fulfillment_mode || 'manual'}
              onChange={(e) => setPayload({ fulfillment_mode: e.target.value })}
              className={inputCls} style={inputStyle}>
              <option value="manual">{isRTL ? 'يدوي' : 'Manual'}</option>
              <option value="instant">{isRTL ? 'فوري' : 'Instant'}</option>
              <option value="service">{isRTL ? 'خدمة' : 'Service'}</option>
            </select>
          </Field>
          <Toggle checked={payload.create_private_case ?? false}
            onChange={(v) => setPayload({ create_private_case: v })}
            label={isRTL ? 'إنشاء حالة جائزة خاصة' : 'Create private prize case'} />
        </div>
      )}

      {rewardType === 'VIP_ACCESS' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label={isRTL ? 'المدة' : 'Duration'}>
              <input type="number" min="1" value={payload.duration ?? 30}
                onChange={(e) => setPayload({ duration: +e.target.value })}
                className={inputCls} style={inputStyle} />
            </Field>
            <Field label={isRTL ? 'الوحدة' : 'Unit'}>
              <select value={payload.duration_unit || 'days'}
                onChange={(e) => setPayload({ duration_unit: e.target.value })}
                className={inputCls} style={inputStyle}>
                <option value="days">{isRTL ? 'أيام' : 'Days'}</option>
                <option value="hours">{isRTL ? 'ساعات' : 'Hours'}</option>
                <option value="months">{isRTL ? 'أشهر' : 'Months'}</option>
              </select>
            </Field>
          </div>
          <div className="rounded-lg p-2.5 text-xs text-[#9c8b6e]" style={{ background: '#0d0906', border: '1px solid rgba(214,178,94,0.14)' }}>
            {isRTL ? `معاينة: ${payload.duration || 30} ${payload.duration_unit === 'hours' ? 'ساعة' : payload.duration_unit === 'months' ? 'شهر' : 'يوم'} وصول VIP` : `Preview: ${payload.duration || 30} ${payload.duration_unit || 'days'} VIP access`}
          </div>
        </div>
      )}

      {rewardType === 'GRAND_PRIZE' && (
        <div className="space-y-3">
          <div className="rounded-lg p-3 flex items-start gap-2" style={{ background: 'rgba(248,231,180,0.08)', border: '1px solid rgba(248,231,180,0.2)' }}>
            <Crown size={14} className="text-[#f8e7b4] flex-shrink-0 mt-0.5" />
            <p className="text-xs text-[#f8e7b4]">{isRTL ? 'هذه الجائزة الكبرى مرتبطة بإعدادات الجائزة الكبرى في تبويب مخصص. تأكد من تعيين بديل أثناء القفل.' : 'This grand prize is linked to the Grand Prize settings tab. Ensure a fallback is set while locked.'}</p>
          </div>
          <Field label={isRTL ? 'نوع التنفيذ' : 'Fulfillment Mode'}>
            <select value={payload.fulfillment_mode || 'manual'}
              onChange={(e) => setPayload({ fulfillment_mode: e.target.value })}
              className={inputCls} style={inputStyle}>
              <option value="manual">{isRTL ? 'يدوي' : 'Manual'}</option>
              <option value="service">{isRTL ? 'خدمة' : 'Service'}</option>
            </select>
          </Field>
        </div>
      )}

      {/* Advanced technical payload */}
      <details className="group">
        <summary className="text-xs font-bold text-[#9c8b6e] cursor-pointer hover:text-[#d9ab4e] transition-colors list-none flex items-center gap-1">
          <span className="transition-transform group-open:rotate-90">▶</span>
          {isRTL ? 'إعدادات تقنية متقدمة' : 'Advanced technical settings'}
        </summary>
        <div className="mt-2 p-3 rounded-lg" style={{ background: '#0d0906', border: '1px solid rgba(214,178,94,0.1)' }}>
          <label className={labelCls}>reward_payload (JSON)</label>
          <textarea
            value={JSON.stringify(payload, null, 2)}
            onChange={(e) => {
              try { update({ reward_payload: JSON.parse(e.target.value) }); } catch { /* ignore invalid */ }
            }}
            rows={5}
            className="w-full rounded-lg p-2 text-xs font-mono"
            style={{ background: '#080503', border: '1px solid rgba(214,178,94,0.1)', color: '#9c8b6e' }}
          />
        </div>
      </details>
    </div>
  );
}

// ─── Fallback Prize Selector ──────────────────────────────
export function FallbackSelector({
  prize,
  allPrizes,
  update,
  isRTL,
}: {
  prize: any;
  allPrizes: any[];
  update: (patch: any) => void;
  isRTL: boolean;
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const eligible = allPrizes.filter(
    (p) =>
      p.prize_key !== prize.prize_key &&
      p.enabled &&
      p.prize_key !== prize.fallback_prize_key && // avoid circular
      (!p.fallback_prize_key || p.fallback_prize_key !== prize.prize_key),
  );

  const filtered = eligible.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.name_ar?.toLowerCase().includes(q) || p.name_en?.toLowerCase().includes(q) || p.prize_key.toLowerCase().includes(q);
  });

  const current = allPrizes.find((p) => p.prize_key === prize.fallback_prize_key);

  return (
    <div className="space-y-3" style={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      <div className="rounded-lg p-3 flex items-start gap-2" style={{ background: 'rgba(100,180,255,0.06)', border: '1px solid rgba(100,180,255,0.2)' }}>
        <Info size={14} className="text-[#64b4ff] flex-shrink-0 mt-0.5" />
        <p className="text-xs text-[#64b4ff]">
          {isRTL
            ? 'تُمنح هذه الجائزة البديلة عندما تصبح الجائزة الأصلية غير مؤهلة بسبب المخزون أو الحد أو قفل الجائزة الكبرى.'
            : 'This fallback prize is awarded when the original becomes ineligible due to stock, limit, or grand prize lock.'}
        </p>
      </div>

      {/* Current selection */}
      <div className="rounded-lg p-2.5 flex items-center gap-2" style={{ background: '#0d0906', border: '1px solid rgba(214,178,94,0.14)' }}>
        {current ? (
          <>
            <span className="text-base">{REWARD_TYPE_ICON[current.reward_type] || '\u2B50'}</span>
            <div className="flex-1 min-w-0">
              <b className="text-sm text-[#efe6d2] truncate block">{current.name_ar || current.name_en}</b>
              <span className="text-[10px] text-[#9c8b6e]">{REWARD_TYPE_AR[current.reward_type]} · {ppmToPercentStr(current.probability_ppm)}%</span>
            </div>
          </>
        ) : (
          <span className="text-xs text-[#9c8b6e]">{isRTL ? 'لا بديل مُعين' : 'No fallback set'}</span>
        )}
        {prize.fallback_prize_key && (
          <button onClick={() => update({ fallback_prize_key: null })} className="text-[#e6455c] hover:opacity-70">
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* Search + dropdown */}
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="w-full rounded-lg py-2.5 px-3 text-sm text-right flex items-center justify-between"
          style={{ background: '#0d0906', border: '1px solid rgba(214,178,94,0.16)', color: '#9c8b6e' }}
        >
          <span>{isRTL ? 'اختر جائزة بديلة...' : 'Select fallback prize...'}</span>
          <Search size={13} />
        </button>
        {open && (
          <div className="absolute z-20 mt-1 w-full rounded-lg overflow-hidden" style={{ background: '#120c07', border: '1px solid rgba(214,178,94,0.3)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isRTL ? 'بحث...' : 'Search...'}
              className="w-full px-3 py-2 text-xs"
              style={{ background: '#0d0906', border: 'none', color: '#efe6d2', borderBottom: '1px solid rgba(214,178,94,0.1)' }}
            />
            <div className="max-h-48 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-3 py-3 text-xs text-[#9c8b6e] text-center">{isRTL ? 'لا جوائز متاحة' : 'No eligible prizes'}</div>
              ) : (
                filtered.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { update({ fallback_prize_key: p.prize_key }); setOpen(false); setSearch(''); }}
                    className="w-full px-3 py-2 flex items-center gap-2 hover:bg-[rgba(214,178,94,0.08)] transition-colors text-right"
                  >
                    <span className="text-base flex-shrink-0">{REWARD_TYPE_ICON[p.reward_type] || '\u2B50'}</span>
                    <div className="flex-1 min-w-0">
                      <b className="text-xs text-[#efe6d2] truncate block">{p.name_ar || p.name_en}</b>
                      <span className="text-[10px] text-[#9c8b6e]">{REWARD_TYPE_AR[p.reward_type]} · {ppmToPercentStr(p.probability_ppm)}%</span>
                    </div>
                    {!p.enabled && <span className="text-[9px] text-[#e6455c]">{isRTL ? 'معطّل' : 'off'}</span>}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Validation warnings */}
      {prize.fallback_prize_key === prize.prize_key && (
        <div className="text-xs text-[#e6455c] flex items-center gap-1.5">
          <AlertTriangle size={12} /> {isRTL ? 'لا يمكن اختيار الجائزة نفسها كبديل' : 'Cannot select the same prize as fallback'}
        </div>
      )}
    </div>
  );
}

// ─── Eligibility & Limits ─────────────────────────────────
export function EligibilityEditor({ prize, update, isRTL }: { prize: any; update: (patch: any) => void; isRTL: boolean }) {
  const p = prize;
  const limitedStock = p.stock_quantity != null;
  const hasTotalLimit = p.total_win_limit != null && p.total_win_limit > 0;
  const hasDailyLimit = p.daily_win_limit != null && p.daily_win_limit > 0;
  const hasUserLimit = p.per_user_win_limit != null && p.per_user_win_limit > 0;
  const hasDateRange = p.start_date || p.end_date;

  // Summary
  let summary = isRTL ? 'متاحة دائمًا' : 'Always available';
  if (p.start_date && p.end_date) {
    summary = isRTL ? `متاحة من ${p.start_date} إلى ${p.end_date}` : `Available ${p.start_date} to ${p.end_date}`;
  } else if (p.start_date) {
    summary = isRTL ? `متاحة من ${p.start_date}` : `Available from ${p.start_date}`;
  } else if (p.end_date) {
    summary = isRTL ? `متاحة حتى ${p.end_date}` : `Available until ${p.end_date}`;
  }
  if (limitedStock && p.stock_quantity != null) {
    summary += isRTL ? ` · متبقي ${p.stock_quantity} جائزة` : ` · ${p.stock_quantity} remaining`;
  }

  return (
    <div className="space-y-4" style={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      {/* Summary */}
      <div className="rounded-lg p-2.5 text-xs text-[#d9ab4e]" style={{ background: 'rgba(217,171,78,0.08)', border: '1px solid rgba(214,178,94,0.2)' }}>
        {summary}
      </div>

      {/* Stock */}
      <div className="space-y-2">
        <Toggle checked={limitedStock} onChange={(v) => update({ stock_quantity: v ? 100 : null })} label={isRTL ? 'مخزون محدود' : 'Limited stock'} />
        {limitedStock && (
          <Field label={isRTL ? 'كمية المخزون' : 'Stock Quantity'}>
            <input type="number" min="0" value={p.stock_quantity ?? 0}
              onChange={(e) => update({ stock_quantity: +e.target.value })}
              className={inputCls} style={inputStyle} />
          </Field>
        )}
      </div>

      {/* Win limits */}
      <div className="space-y-2">
        <Toggle checked={hasTotalLimit} onChange={(v) => update({ total_win_limit: v ? 100 : null })} label={isRTL ? 'حد إجمالي للفوز' : 'Total win limit'} />
        {hasTotalLimit && (
          <Field label={isRTL ? 'الحد الإجمالي' : 'Total limit'}>
            <input type="number" min="1" value={p.total_win_limit ?? 100}
              onChange={(e) => update({ total_win_limit: +e.target.value })}
              className={inputCls} style={inputStyle} />
          </Field>
        )}
      </div>

      <div className="space-y-2">
        <Toggle checked={hasDailyLimit} onChange={(v) => update({ daily_win_limit: v ? 10 : null })} label={isRTL ? 'حد يومي للفوز' : 'Daily win limit'} />
        {hasDailyLimit && (
          <Field label={isRTL ? 'الحد اليومي' : 'Daily limit'}>
            <input type="number" min="1" value={p.daily_win_limit ?? 10}
              onChange={(e) => update({ daily_win_limit: +e.target.value })}
              className={inputCls} style={inputStyle} />
          </Field>
        )}
      </div>

      <div className="space-y-2">
        <Toggle checked={hasUserLimit} onChange={(v) => update({ per_user_win_limit: v ? 1 : null })} label={isRTL ? 'حد لكل مستخدم' : 'Per-user win limit'} />
        {hasUserLimit && (
          <Field label={isRTL ? 'حد المستخدم' : 'Per-user limit'}>
            <input type="number" min="1" value={p.per_user_win_limit ?? 1}
              onChange={(e) => update({ per_user_win_limit: +e.target.value })}
              className={inputCls} style={inputStyle} />
          </Field>
        )}
      </div>

      {/* Date range */}
      <div className="space-y-2">
        <Toggle checked={!!hasDateRange} onChange={(v) => update({ start_date: v ? new Date().toISOString().slice(0, 10) : null, end_date: v ? new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10) : null })} label={isRTL ? 'فترة توفّر' : 'Availability window'} />
        {hasDateRange && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={isRTL ? 'تاريخ البداية' : 'Start date'}>
              <input type="date" value={p.start_date?.slice(0, 10) || ''}
                onChange={(e) => update({ start_date: e.target.value })}
                className={inputCls} style={inputStyle} />
            </Field>
            <Field label={isRTL ? 'تاريخ النهاية' : 'End date'}>
              <input type="date" value={p.end_date?.slice(0, 10) || ''}
                onChange={(e) => update({ end_date: e.target.value })}
                className={inputCls} style={inputStyle} />
            </Field>
          </div>
        )}
      </div>

      {/* Grand Prize lock dependency */}
      {p.is_grand_prize && (
        <div className="rounded-lg p-3 flex items-start gap-2" style={{ background: 'rgba(248,231,180,0.08)', border: '1px solid rgba(248,231,180,0.2)' }}>
          <Crown size={14} className="text-[#f8e7b4] flex-shrink-0 mt-0.5" />
          <p className="text-xs text-[#f8e7b4]">{isRTL ? 'هذه الجائزة الكبرى تخضع لقفل الجائزة الكبرى حتى يكمل اللاعب عدد اللفات المطلوب.' : 'This grand prize is subject to the jackpot lock until the player completes the required spins.'}</p>
        </div>
      )}
    </div>
  );
}

// ─── Icon & Medallion Editor ─────────────────────────────
export function IconMedallionEditor({ prize, update, isRTL }: { prize: any; update: (patch: any) => void; isRTL: boolean }) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file) return;
    const allowed = ['image/png', 'image/webp', 'image/jpeg', 'image/svg+xml'];
    if (!allowed.includes(file.type)) {
      alert(isRTL ? 'صيغة غير مدعومة. استخدم PNG, WebP, JPEG, أو SVG' : 'Unsupported format. Use PNG, WebP, JPEG, or SVG');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert(isRTL ? 'الحجم الأقصى 5 ميجابايت' : 'Max size 5MB');
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const filePath = `${prize.prize_key}-${Date.now()}.${ext}`;
      if (prize.icon_storage_path) {
        await supabase.storage.from('wheel-v2-prizes').remove([prize.icon_storage_path]);
      }
      const { error: upErr } = await supabase.storage.from('wheel-v2-prizes').upload(filePath, file, { cacheControl: '3600', upsert: false });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('wheel-v2-prizes').getPublicUrl(filePath);
      update({ icon_storage_path: filePath, icon_url: urlData.publicUrl });
    } catch (err: any) {
      alert(`${isRTL ? 'فشل رفع الأيقونة' : 'Icon upload failed'}: ${err.message || err}`);
    }
    setUploading(false);
  };

  const removeIcon = async () => {
    if (prize.icon_storage_path) await supabase.storage.from('wheel-v2-prizes').remove([prize.icon_storage_path]);
    update({ icon_storage_path: null, icon_url: null });
  };

  const resetVisual = () => update({
    icon_fit: 'CONTAIN', icon_scale: 100, icon_offset_x: 0, icon_offset_y: 0, icon_rotation: 0,
    icon_background_enabled: true, icon_background_style: 'radial', icon_background_color: null,
    icon_border_color: null, icon_glow_color: null, icon_glow_intensity: 0, icon_shadow_intensity: 0,
    sizing_mode: 'AUTO', container_scale: 100, mobile_container_scale: 100, desktop_container_scale: 100,
  });

  const sliderCls = 'w-full accent-[#d9ab4e]';

  return (
    <div className="space-y-4" style={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      {/* Upload + preview */}
      <div className="flex items-start gap-3">
        <div className="w-20 h-20 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden text-2xl"
          style={{ background: '#0d0906', border: '1px solid rgba(214,178,94,0.16)' }}>
          {prize.icon_url ? <img src={prize.icon_url} alt="" className="w-full h-full object-contain" /> : <span>{REWARD_TYPE_ICON[prize.reward_type] || '\u2B50'}</span>}
        </div>
        <div className="flex-1 space-y-2">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
            onClick={() => fileRef.current?.click()}
            className="rounded-lg p-3 text-center text-xs cursor-pointer transition-colors"
            style={{ background: dragOver ? 'rgba(214,178,94,0.12)' : '#0d0906', border: `2px dashed ${dragOver ? '#d9ab4e' : 'rgba(214,178,94,0.3)'}`, color: uploading ? '#9c8b6e' : '#d9ab4e' }}
          >
            {uploading ? (isRTL ? 'جاري الرفع...' : 'Uploading...') : (
              <span className="flex items-center justify-center gap-1.5"><Upload size={13} /> {isRTL ? 'اسحب أو انقر لرفع PNG شفاف' : 'Drop or click to upload transparent PNG'}</span>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/webp,image/jpeg,image/svg+xml" className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); e.target.value = ''; }} />
          {prize.icon_url && (
            <button onClick={removeIcon} disabled={uploading}
              className="text-[11px] text-[#e6455c] hover:opacity-70 disabled:opacity-50 flex items-center gap-1">
              <Trash2 size={11} /> {isRTL ? 'إزالة الأيقونة' : 'Remove icon'}
            </button>
          )}
        </div>
      </div>

      {/* Sizing mode */}
      <div className="flex gap-2">
        {(['AUTO', 'CUSTOM'] as const).map((m) => (
          <button key={m} onClick={() => update({ sizing_mode: m })}
            className="text-xs px-3 py-1.5 rounded-lg font-bold transition-all"
            style={{
              background: (prize.sizing_mode || 'AUTO') === m ? 'linear-gradient(180deg, #f8e7b4, #d9ab4e)' : '#0d0906',
              color: (prize.sizing_mode || 'AUTO') === m ? '#241705' : '#9c8b6e',
              border: '1px solid rgba(214,178,94,0.16)',
            }}>
            {m === 'AUTO' ? (isRTL ? 'تلقائي' : 'Auto') : (isRTL ? 'مخصص' : 'Custom')}
          </button>
        ))}
      </div>

      {/* Visual controls */}
      <div className="grid grid-cols-2 gap-3">
        <Field label={isRTL ? 'الملاءمة' : 'Fit'}>
          <select value={prize.icon_fit || 'CONTAIN'} onChange={(e) => update({ icon_fit: e.target.value })} className={inputCls} style={inputStyle}>
            <option value="CONTAIN">CONTAIN</option>
            <option value="COVER">COVER</option>
          </select>
        </Field>
        <Field label={isRTL ? 'الحجم %' : 'Scale %'}>
          <input type="range" min="10" max="300" value={prize.icon_scale ?? 100} onChange={(e) => update({ icon_scale: +e.target.value })} className={sliderCls} />
        </Field>
        <Field label={isRTL ? 'إزاحة X %' : 'Offset X %'}>
          <input type="range" min="-100" max="100" value={prize.icon_offset_x ?? 0} onChange={(e) => update({ icon_offset_x: +e.target.value })} className={sliderCls} />
        </Field>
        <Field label={isRTL ? 'إزاحة Y %' : 'Offset Y %'}>
          <input type="range" min="-100" max="100" value={prize.icon_offset_y ?? 0} onChange={(e) => update({ icon_offset_y: +e.target.value })} className={sliderCls} />
        </Field>
        <Field label={isRTL ? 'دوران°' : 'Rotation°'}>
          <input type="range" min="-360" max="360" value={prize.icon_rotation ?? 0} onChange={(e) => update({ icon_rotation: +e.target.value })} className={sliderCls} />
        </Field>
        <Field label={isRTL ? 'حدّة الظل' : 'Shadow'}>
          <input type="range" min="0" max="100" value={prize.icon_shadow_intensity ?? 0} onChange={(e) => update({ icon_shadow_intensity: +e.target.value })} className={sliderCls} />
        </Field>
      </div>

      {/* Background */}
      <div className="space-y-2">
        <Toggle checked={prize.icon_background_enabled ?? true} onChange={(v) => update({ icon_background_enabled: v })} label={isRTL ? 'خلفية مفعّلة' : 'Background enabled'} />
        <div className="grid grid-cols-2 gap-3">
          <Field label={isRTL ? 'نمط الخلفية' : 'BG Style'}>
            <select value={prize.icon_background_style || 'radial'} onChange={(e) => update({ icon_background_style: e.target.value })} className={inputCls} style={inputStyle}>
              <option value="radial">radial</option>
              <option value="solid">solid</option>
              <option value="none">none</option>
            </select>
          </Field>
          <Field label={isRTL ? 'لون الخلفية' : 'BG Color'}>
            <input type="color" value={prize.icon_background_color || '#1a1208'} onChange={(e) => update({ icon_background_color: e.target.value })} className="w-full h-10 rounded-lg" style={inputStyle} />
          </Field>
        </div>
      </div>

      {/* Glow + border */}
      <div className="grid grid-cols-2 gap-3">
        <Field label={isRTL ? 'لون التوهج' : 'Glow Color'}>
          <input type="color" value={prize.icon_glow_color || '#d9ab4e'} onChange={(e) => update({ icon_glow_color: e.target.value })} className="w-full h-10 rounded-lg" style={inputStyle} />
        </Field>
        <Field label={isRTL ? 'شدة التوهج' : 'Glow Intensity'}>
          <input type="range" min="0" max="100" value={prize.icon_glow_intensity ?? 0} onChange={(e) => update({ icon_glow_intensity: +e.target.value })} className={sliderCls} />
        </Field>
        <Field label={isRTL ? 'لون الحدود' : 'Border Color'}>
          <input type="color" value={prize.icon_border_color || '#d9ab4e'} onChange={(e) => update({ icon_border_color: e.target.value })} className="w-full h-10 rounded-lg" style={inputStyle} />
        </Field>
      </div>

      {/* Container scales (CUSTOM) */}
      {prize.sizing_mode === 'CUSTOM' && (
        <div className="grid grid-cols-3 gap-3">
          <Field label={isRTL ? 'حاوية %' : 'Container %'}>
            <input type="number" min="50" max="200" value={prize.container_scale ?? 100} onChange={(e) => update({ container_scale: +e.target.value })} className={inputCls} style={inputStyle} />
          </Field>
          <Field label={isRTL ? 'موبايل %' : 'Mobile %'}>
            <input type="number" min="50" max="200" value={prize.mobile_container_scale ?? 100} onChange={(e) => update({ mobile_container_scale: +e.target.value })} className={inputCls} style={inputStyle} />
          </Field>
          <Field label={isRTL ? 'ديسكتوب %' : 'Desktop %'}>
            <input type="number" min="50" max="200" value={prize.desktop_container_scale ?? 100} onChange={(e) => update({ desktop_container_scale: +e.target.value })} className={inputCls} style={inputStyle} />
          </Field>
        </div>
      )}

      <button onClick={resetVisual} className="text-xs text-[#9c8b6e] hover:text-[#d9ab4e] flex items-center gap-1.5 transition-colors">
        <RotateCcw size={12} /> {isRTL ? 'إعادة تعيين الإعدادات الافتراضية' : 'Reset visual settings'}
      </button>
    </div>
  );
}

// ─── Grand Prize Controls ─────────────────────────────────
export function GrandPrizeControls({ prize, version, update, updateVersion, isRTL }: { prize: any; version: any; update: (patch: any) => void; updateVersion: (patch: any) => void; isRTL: boolean }) {
  const vc = version.visual_config || {};
  const threshold = vc.grand_prize_unlock_threshold ?? 30;
  const payload = prize.reward_payload || {};

  return (
    <div className="space-y-4" style={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      <div className="rounded-xl p-4" style={{ background: 'linear-gradient(135deg, rgba(248,231,180,0.1), rgba(217,171,78,0.04))', border: '1px solid rgba(248,231,180,0.25)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Crown size={18} className="text-[#f8e7b4]" />
          <h4 className="text-sm font-bold text-[#f8e7b4]">{isRTL ? 'إعدادات الجائزة الكبرى' : 'Grand Prize Settings'}</h4>
        </div>

        <Toggle checked={!!prize.is_grand_prize} onChange={(v) => update({ is_grand_prize: v })} label={isRTL ? 'تعيين كجائزة كبرى' : 'Mark as Grand Prize'} />

        {prize.is_grand_prize && (
          <div className="mt-4 space-y-3">
            <Field label={isRTL ? 'عدد اللفات المطلوبة للفتح' : 'Unlock threshold (spins)'}>
              <input type="number" min="1" value={threshold}
                onChange={(e) => updateVersion({ visual_config: { ...vc, grand_prize_unlock_threshold: +e.target.value } })}
                className={inputCls} style={inputStyle} />
            </Field>

            <Field label={isRTL ? 'نوع المبلغ' : 'Amount type'}>
              <select value={payload.amount_type || 'static'}
                onChange={(e) => update({ reward_payload: { ...payload, amount_type: e.target.value } })}
                className={inputCls} style={inputStyle}>
                <option value="static">{isRTL ? 'ثابت' : 'Static'}</option>
                <option value="accumulating">{isRTL ? 'متراكم' : 'Accumulating'}</option>
              </select>
            </Field>

            {payload.amount_type === 'accumulating' ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label={isRTL ? 'الزيادة لكل لفة' : 'Increment per spin'}>
                  <input type="number" min="0" value={payload.increment_per_spin ?? 0}
                    onChange={(e) => update({ reward_payload: { ...payload, increment_per_spin: +e.target.value } })}
                    className={inputCls} style={inputStyle} />
                </Field>
                <Field label={isRTL ? 'الحد الأقصى' : 'Maximum amount'}>
                  <input type="number" min="0" value={payload.max_amount ?? 0}
                    onChange={(e) => update({ reward_payload: { ...payload, max_amount: +e.target.value } })}
                    className={inputCls} style={inputStyle} />
                </Field>
              </div>
            ) : (
              <Field label={isRTL ? 'المبلغ' : 'Amount'}>
                <input type="number" min="0" value={payload.amount ?? 0}
                  onChange={(e) => update({ reward_payload: { ...payload, amount: +e.target.value } })}
                  className={inputCls} style={inputStyle} />
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label={isRTL ? 'عنوان مقفل' : 'Locked label'}>
                <input value={payload.locked_label || ''} placeholder={isRTL ? 'مقفل' : 'Locked'}
                  onChange={(e) => update({ reward_payload: { ...payload, locked_label: e.target.value } })}
                  className={inputCls} style={inputStyle} />
              </Field>
              <Field label={isRTL ? 'عنوان مفتوح' : 'Unlocked label'}>
                <input value={payload.unlocked_label || ''} placeholder={isRTL ? 'مفتوح' : 'Unlocked'}
                  onChange={(e) => update({ reward_payload: { ...payload, unlocked_label: e.target.value } })}
                  className={inputCls} style={inputStyle} />
              </Field>
            </div>

            {/* Progress ring preview */}
            <div className="flex items-center justify-center py-3">
              <svg width="80" height="80" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(214,178,94,0.2)" strokeWidth="6" />
                <circle cx="40" cy="40" r="34" fill="none" stroke="#f8e7b4" strokeWidth="6"
                  strokeDasharray={`${(15 / threshold) * 213.6} 213.6`}
                  strokeLinecap="round"
                  transform="rotate(-90 40 40)" />
                <text x="40" y="46" textAnchor="middle" fontSize="14" fill="#f8e7b4" fontWeight="bold">15/{threshold}</text>
              </svg>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Probability section (used in editor) ─────────────────
export function ProbabilitySection({ prize, update, isRTL }: { prize: any; update: (patch: any) => void; isRTL: boolean }) {
  const pctStr = ppmToPercentStr(prize.probability_ppm);
  const angle = ppmToSectorAngle(prize.probability_ppm);

  return (
    <div className="space-y-3" style={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      <Field label={isRTL ? 'نسبة الفوز' : 'Win Rate'} hint={isRTL ? 'حتى 4 منازل عشرية' : 'Up to 4 decimal places'}>
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={pctStr}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9.]/g, '');
              // Convert to ppm
              const n = parseFloat(v);
              if (!isNaN(n)) update({ probability_ppm: Math.round(n * 10000) });
              else if (v === '' || v === '.') update({ probability_ppm: 0 });
            }}
            className={inputCls} style={inputStyle}
            placeholder="33.3333"
          />
          <span className="text-sm text-[#9c8b6e] flex-shrink-0">%</span>
        </div>
      </Field>

      <div className="rounded-lg p-2.5 text-xs text-[#9c8b6e] space-y-1" style={{ background: '#0d0906', border: '1px solid rgba(214,178,94,0.1)' }}>
        <div className="flex justify-between"><span>{isRTL ? 'القيمة التقنية' : 'Technical'}</span><b className="text-[#d9ab4e]">{ppmToLabel(prize.probability_ppm)}</b></div>
        <div className="flex justify-between"><span>{isRTL ? 'زاوية القطاع' : 'Sector angle'}</span><b className="text-[#f8e7b4]">{angle.toFixed(2)}°</b></div>
        <div className="flex justify-between"><span>{isRTL ? 'متوسط لكل 100' : 'Per 100 spins'}</span><b className="text-[#f8e7b4]">{expectedWinsLabel(prize.probability_ppm, 100)}</b></div>
        <div className="flex justify-between"><span>{isRTL ? 'متوسط لكل 1,000' : 'Per 1,000 spins'}</span><b className="text-[#f8e7b4]">{expectedWinsLabel(prize.probability_ppm, 1000)}</b></div>
        <div className="flex justify-between"><span>{isRTL ? 'متوسط لكل 100,000' : 'Per 100,000 spins'}</span><b className="text-[#f8e7b4]">{expectedWinsLabel(prize.probability_ppm, 100000)}</b></div>
      </div>
    </div>
  );
}
