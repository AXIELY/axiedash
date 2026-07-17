import { useEffect, useMemo, useState, useRef } from 'react';
import { Copy, Archive, Save, X, AlertTriangle, Clock } from 'lucide-react';
import {
  RewardTypeEditor,
  FallbackSelector,
  EligibilityEditor,
  IconMedallionEditor,
  ProbabilitySection,
} from './PrizeEditorSections';
import { RARITY_AR, ppmToPercentStr } from './prizeUtils';

type EditorTab = 'basic' | 'reward' | 'probability' | 'eligibility' | 'visual' | 'fallback' | 'preview';

const TABS: { id: EditorTab; labelAr: string; labelEn: string }[] = [
  { id: 'basic', labelAr: 'المعلومات الأساسية', labelEn: 'Basic Info' },
  { id: 'reward', labelAr: 'نوع الجائزة والمكافأة', labelEn: 'Reward Type' },
  { id: 'probability', labelAr: 'الاحتمال', labelEn: 'Probability' },
  { id: 'eligibility', labelAr: 'الأهلية والحدود', labelEn: 'Eligibility & Limits' },
  { id: 'visual', labelAr: 'الشكل داخل العجلة', labelEn: 'Wheel Visual' },
  { id: 'fallback', labelAr: 'البديل', labelEn: 'Fallback' },
  { id: 'preview', labelAr: 'معاينة النتيجة', labelEn: 'Result Preview' },
];

interface Props {
  prize: any;
  allPrizes: any[];
  onChange: (prizeId: string, patch: Record<string, any>) => void;
  onDuplicate: (prizeId: string) => void;
  onArchive: (prizeId: string) => void;
  onSaveDraft: () => void;
  onDiscard: () => void;
  saving: boolean;
  dirty: boolean;
  lastSavedAt: string | null;
  errors: string[];
  isRTL: boolean;
}

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
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-2.5 cursor-pointer group">
      <span className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors" style={{ background: checked ? 'rgba(217,171,78,0.5)' : 'rgba(156,139,110,0.2)' }}>
        <span className="inline-block h-4 w-4 rounded-full transition-transform" style={{ background: checked ? '#f8e7b4' : '#9c8b6e', transform: `translateX(${checked ? '20px' : '2px'})` }} />
      </span>
      <span className="text-sm text-[#efe6d2] group-hover:text-[#f8e7b4] transition-colors">{label}</span>
    </button>
  );
}

export function PrizeEditorPanel({
  prize,
  allPrizes,
  onChange,
  onDuplicate,
  onArchive,
  onSaveDraft,
  onDiscard,
  saving,
  dirty,
  lastSavedAt,
  errors,
  isRTL,
}: Props) {
  const [tab, setTab] = useState<EditorTab>('basic');
  const keyRef = useRef<HTMLInputElement>(null);

  // Reset tab when prize changes
  useEffect(() => { setTab('basic'); }, [prize.id]);

  const update = (patch: Record<string, any>) => onChange(prize.id, patch);

  const errorsByField = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const e of errors) {
      const m = e.match(/\[(\w+)\]/);
      if (m) { (map[m[1]] ||= []).push(e); }
    }
    return map;
  }, [errors]);

  return (
    <div className="flex flex-col h-full" style={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      {/* Header */}
      <div className="p-4 border-b border-[rgba(214,178,94,0.14)] flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base font-bold text-[#f8e7b4] truncate">{prize.name_ar || prize.name_en || prize.prize_key}</h3>
          <div className="flex items-center gap-1.5">
            <button onClick={() => onDuplicate(prize.id)} className="p-1.5 rounded-lg text-[#9c8b6e] hover:text-[#d9ab4e] hover:bg-[rgba(214,178,94,0.08)] transition-all" aria-label="duplicate" title={isRTL ? 'نسخ' : 'Duplicate'}>
              <Copy size={15} />
            </button>
            <button onClick={() => onArchive(prize.id)} className="p-1.5 rounded-lg text-[#9c8b6e] hover:text-[#e6455c] hover:bg-[rgba(230,69,92,0.08)] transition-all" aria-label="archive" title={isRTL ? 'أرشفة' : 'Archive'}>
              <Archive size={15} />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] px-2 py-0.5 rounded-md font-bold" style={{ background: 'rgba(214,178,94,0.12)', color: '#d9ab4e' }}>
            {ppmToPercentStr(prize.probability_ppm)}%
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-md font-bold" style={{ background: `${prize.is_grand_prize ? 'rgba(248,231,180,0.15)' : 'rgba(214,178,94,0.08)'}`, color: prize.is_grand_prize ? '#f8e7b4' : '#9c8b6e' }}>
            {RARITY_AR[prize.rarity] || prize.rarity}
          </span>
          {dirty && (
            <span className="text-[10px] px-2 py-0.5 rounded-md font-bold flex items-center gap-1" style={{ background: 'rgba(217,171,78,0.15)', color: '#d9ab4e' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-[#d9ab4e] animate-pulse" /> {isRTL ? 'تعديلات غير محفوظة' : 'Unsaved'}
            </span>
          )}
          {lastSavedAt && !dirty && (
            <span className="text-[10px] text-[#9c8b6e] flex items-center gap-1">
              <Clock size={9} /> {isRTL ? 'حُفظ' : 'Saved'} {lastSavedAt}
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-3 pt-3 flex-wrap flex-shrink-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="text-[11px] px-2.5 py-1.5 rounded-lg font-bold transition-all whitespace-nowrap"
            style={{
              background: tab === t.id ? 'linear-gradient(180deg, #f8e7b4, #d9ab4e)' : '#0d0906',
              color: tab === t.id ? '#241705' : '#9c8b6e',
              border: `1px solid ${tab === t.id ? 'transparent' : 'rgba(214,178,94,0.1)'}`,
            }}
          >
            {isRTL ? t.labelAr : t.labelEn}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 min-h-0">
        {tab === 'basic' && (
          <div className="space-y-4 max-w-2xl">
            <div className="grid grid-cols-2 gap-3">
              <Field label={isRTL ? 'الاسم بالعربية' : 'Arabic Name'} error={errorsByField.name_ar?.[0]}>
                <input value={prize.name_ar || ''} onChange={(e) => update({ name_ar: e.target.value })} className={inputCls} style={inputStyle} placeholder="جائزة جديدة" />
              </Field>
              <Field label={isRTL ? 'الاسم بالإنجليزية' : 'English Name'}>
                <input value={prize.name_en || ''} onChange={(e) => update({ name_en: e.target.value })} className={inputCls} style={inputStyle} placeholder="New Prize" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={isRTL ? 'الاسم المختصر (عربي)' : 'Short Label (AR)'} hint={isRTL ? 'يظهر داخل العجلة' : 'Shown inside wheel'}>
                <input value={prize.short_label_ar || ''} onChange={(e) => update({ short_label_ar: e.target.value })} className={inputCls} style={inputStyle} />
              </Field>
              <Field label={isRTL ? 'الاسم المختصر (إنجليزي)' : 'Short Label (EN)'}>
                <input value={prize.short_label_en || ''} onChange={(e) => update({ short_label_en: e.target.value })} className={inputCls} style={inputStyle} />
              </Field>
            </div>
            <Field label={isRTL ? 'الوصف بالعربية' : 'Description (AR)'}>
              <textarea value={prize.description_ar || ''} onChange={(e) => update({ description_ar: e.target.value })} rows={2} className={inputCls} style={inputStyle} />
            </Field>
            <Field label={isRTL ? 'الوصف بالإنجليزية' : 'Description (EN)'}>
              <textarea value={prize.description_en || ''} onChange={(e) => update({ description_en: e.target.value })} rows={2} className={inputCls} style={inputStyle} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={isRTL ? 'الندرة' : 'Rarity'}>
                <select value={prize.rarity || 'common'} onChange={(e) => update({ rarity: e.target.value })} className={inputCls} style={inputStyle}>
                  {Object.entries(RARITY_AR).map(([k, v]) => <option key={k} value={k}>{v} ({k})</option>)}
                </select>
              </Field>
              <Field label={isRTL ? 'ترتيب العرض' : 'Display Order'}>
                <input type="number" value={prize.display_order ?? 0} onChange={(e) => update({ display_order: +e.target.value })} className={inputCls} style={inputStyle} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-4 pt-1">
              <Toggle checked={!!prize.enabled} onChange={(v) => update({ enabled: v })} label={isRTL ? 'مفعّل' : 'Enabled'} />
              <Toggle checked={!!prize.visible_on_wheel} onChange={(v) => update({ visible_on_wheel: v })} label={isRTL ? 'ظاهر بالعجلة' : 'Visible on wheel'} />
              <Toggle checked={!!prize.is_public_winner} onChange={(v) => update({ is_public_winner: v })} label={isRTL ? 'فائز عام' : 'Public winner'} />
            </div>

            {/* prize_key advanced */}
            <details className="group pt-2" onToggle={(e: any) => { if (e.currentTarget.open) setTimeout(() => keyRef.current?.select(), 50); }}>
              <summary className="text-xs font-bold text-[#9c8b6e] cursor-pointer hover:text-[#d9ab4e] transition-colors list-none flex items-center gap-1">
                <span className="transition-transform group-open:rotate-90">▶</span>
                {isRTL ? 'مفتاح تقني' : 'Technical key'}
              </summary>
              <div className="mt-2 p-3 rounded-lg" style={{ background: '#0d0906', border: '1px solid rgba(214,178,94,0.1)' }}>
                <div className="flex items-center gap-2">
                  <input ref={keyRef} value={prize.prize_key || ''} readOnly className="flex-1 rounded-lg px-3 py-2 text-xs font-mono" style={{ background: '#080503', border: '1px solid rgba(214,178,94,0.1)', color: '#9c8b6e' }} />
                  <button onClick={() => navigator.clipboard?.writeText(prize.prize_key || '')} className="text-xs px-2 py-2 rounded-lg" style={{ background: '#120c07', border: '1px solid rgba(214,178,94,0.16)', color: '#d9ab4e' }}>
                    {isRTL ? 'نسخ' : 'Copy'}
                  </button>
                </div>
                <p className="text-[10px] text-[#9c8b6e] mt-1.5">{isRTL ? 'مفتاح ثابت للقراءة فقط بعد أول حفظ' : 'Read-only stable key after first save'}</p>
              </div>
            </details>
          </div>
        )}

        {tab === 'reward' && <RewardTypeEditor prize={prize} update={update} isRTL={isRTL} />}

        {tab === 'probability' && <ProbabilitySection prize={prize} update={update} isRTL={isRTL} />}

        {tab === 'eligibility' && <EligibilityEditor prize={prize} update={update} isRTL={isRTL} />}

        {tab === 'visual' && (
          <>
            <IconMedallionEditor prize={prize} update={update} isRTL={isRTL} />
            {/* Wheel colors */}
            <div className="mt-4 pt-4 border-t border-[rgba(214,178,94,0.1)] space-y-3">
              <h4 className="text-xs font-bold text-[#9c8b6e]">{isRTL ? 'ألوان القطاع' : 'Sector Colors'}</h4>
              <div className="grid grid-cols-3 gap-3">
                <Field label={isRTL ? 'لون البداية' : 'Start'}>
                  <input type="color" value={prize.wheel_color_start || '#d9ab4e'} onChange={(e) => update({ wheel_color_start: e.target.value })} className="w-full h-10 rounded-lg" style={inputStyle} />
                </Field>
                <Field label={isRTL ? 'لون النهاية' : 'End'}>
                  <input type="color" value={prize.wheel_color_end || '#9a7220'} onChange={(e) => update({ wheel_color_end: e.target.value })} className="w-full h-10 rounded-lg" style={inputStyle} />
                </Field>
                <Field label={isRTL ? 'لون النص' : 'Text'}>
                  <input type="color" value={prize.text_color || '#ffffff'} onChange={(e) => update({ text_color: e.target.value })} className="w-full h-10 rounded-lg" style={inputStyle} />
                </Field>
              </div>
            </div>
          </>
        )}

        {tab === 'fallback' && <FallbackSelector prize={prize} allPrizes={allPrizes} update={update} isRTL={isRTL} />}

        {tab === 'preview' && (
          <div className="space-y-3" style={{ direction: isRTL ? 'rtl' : 'ltr' }}>
            <div className="rounded-lg p-3 text-xs text-[#9c8b6e]" style={{ background: '#0d0906', border: '1px solid rgba(214,178,94,0.14)' }}>
              {isRTL ? 'معاينة نتيجة الجائزة كما ستظهر للاعب' : 'Preview of the prize result as the player will see it'}
            </div>
            <div className="rounded-xl p-4 text-center" style={{ background: 'linear-gradient(135deg, ' + (prize.wheel_color_start || '#d9ab4e') + ', ' + (prize.wheel_color_end || '#9a7220') + ')' }}>
              <div className="text-3xl mb-2">{prize.icon_url ? <img src={prize.icon_url} alt="" className="w-16 h-16 mx-auto object-contain" /> : '\u2B50'}</div>
              <b className="text-lg block" style={{ color: prize.text_color || '#fff' }}>{prize.short_label_ar || prize.name_ar}</b>
              <span className="text-sm" style={{ color: prize.text_color || '#fff', opacity: 0.8 }}>{prize.short_label_en || prize.name_en}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg p-2" style={{ background: '#0d0906', border: '1px solid rgba(214,178,94,0.14)' }}>
                <span className="text-[#9c8b6e]">{isRTL ? 'النوع' : 'Type'}</span>
                <b className="text-[#f8e7b4] block">{prize.reward_type}</b>
              </div>
              <div className="rounded-lg p-2" style={{ background: '#0d0906', border: '1px solid rgba(214,178,94,0.14)' }}>
                <span className="text-[#9c8b6e]">{isRTL ? 'الاحتمال' : 'Probability'}</span>
                <b className="text-[#f8e7b4] block">{ppmToPercentStr(prize.probability_ppm)}%</b>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sticky save footer */}
      <div className="p-3 border-t border-[rgba(214,178,94,0.14)] flex-shrink-0" style={{ background: '#120c07' }}>
        {errors.length > 0 && (
          <div className="mb-2 rounded-lg p-2" style={{ background: 'rgba(230,69,92,0.08)', border: '1px solid rgba(230,69,92,0.2)' }}>
            <div className="text-[11px] font-bold text-[#e6455c] flex items-center gap-1 mb-1"><AlertTriangle size={11} /> {isRTL ? `${errors.length} أخطاء` : `${errors.length} errors`}</div>
            <div className="text-[10px] text-[#e6455c] space-y-0.5 max-h-16 overflow-y-auto">
              {errors.slice(0, 4).map((e, i) => <div key={i}>• {e}</div>)}
              {errors.length > 4 && <div>... {errors.length - 4} {isRTL ? 'المزيد' : 'more'}</div>}
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={onDiscard} disabled={saving || !dirty}
            className="flex-1 rounded-xl py-2.5 text-sm font-bold disabled:opacity-40 transition-all"
            style={{ background: '#0d0906', border: '1px solid rgba(214,178,94,0.16)', color: '#9c8b6e' }}>
            <span className="flex items-center justify-center gap-1.5"><X size={14} /> {isRTL ? 'إلغاء التغييرات' : 'Discard'}</span>
          </button>
          <button onClick={onSaveDraft} disabled={saving || !dirty}
            className="flex-1 rounded-xl py-2.5 text-sm font-bold disabled:opacity-50 transition-all"
            style={{ color: '#241705', background: dirty ? 'linear-gradient(180deg, #f8e7b4, #d9ab4e)' : '#0d0906' }}>
            <span className="flex items-center justify-center gap-1.5"><Save size={14} /> {saving ? '...' : (isRTL ? 'حفظ كمسودة' : 'Save Draft')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
