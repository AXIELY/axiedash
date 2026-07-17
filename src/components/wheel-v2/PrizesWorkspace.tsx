import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, X, Layers, Sparkles } from 'lucide-react';
import { PrizeListPanel } from './PrizeListPanel';
import { PrizeEditorPanel } from './PrizeEditorPanel';
import { LivePreviewPanel } from './LivePreviewPanel';
import {
  summarizeProbability,
  validatePrizes,
  ppmToPercentStr,
  assistDistributeRemaining,
  assistAddRemainingTo,
  assistSetAsRemaining,
  assistZeroSelected,
  assistCopyToOthers,
  type AssistPreview,
} from './prizeUtils';

interface Props {
  draftVersion: any;
  draftPrizes: any[];
  onUpdatePrize: (prizeId: string, updates: Record<string, any>) => Promise<void>;
  onAddPrize: () => Promise<void>;
  onRefetch: () => Promise<void>;
  isRTL: boolean;
}

type AssistType =
  | 'distribute'
  | 'add_to_selected'
  | 'set_as_remaining'
  | 'zero_selected'
  | 'copy_to_others';

export function PrizesWorkspace({
  draftVersion,
  draftPrizes,
  onUpdatePrize,
  onAddPrize,
  onRefetch,
  isRTL,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [localDraft, setLocalDraft] = useState<Record<string, any>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [showAssistModal, setShowAssistModal] = useState(false);
  const [assistType, setAssistType] = useState<AssistType | null>(null);
  const [assistPreviews, setAssistPreviews] = useState<AssistPreview[]>([]);
  const [showBulkBar, setShowBulkBar] = useState(false);
  const [showPreviewMobile, setShowPreviewMobile] = useState(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  // Initialize selection
  useEffect(() => {
    if (!selectedId && draftPrizes.length > 0) {
      setSelectedId(draftPrizes[0].id);
    }
  }, [draftPrizes, selectedId]);

  const selectedPrize = useMemo(
    () => draftPrizes.find((p) => p.id === selectedId) || null,
    [draftPrizes, selectedId],
  );

  // Merge server prize with local edits
  const effectivePrize = useMemo(() => {
    if (!selectedPrize) return null;
    return { ...selectedPrize, ...(localDraft[selectedPrize.id] || {}) };
  }, [selectedPrize, localDraft]);

  const summary = useMemo(() => summarizeProbability(draftPrizes), [draftPrizes]);
  const errors = useMemo(() => validatePrizes(draftPrizes), [draftPrizes]);
  const errorsByPrize = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const e of errors) {
      if (!e.prize_key) continue;
      (map[e.prize_key] ||= []).push(e.message);
    }
    return map;
  }, [errors]);
  const currentPrizeErrors = useMemo(() => {
    if (!effectivePrize) return [];
    return (errorsByPrize[effectivePrize.prize_key] || []).map((m) => `[${m.split(' ')[0]}] ${m}`);
  }, [errorsByPrize, effectivePrize]);

  // Local change handler — stores in localDraft, marks dirty
  const handleChange = useCallback((prizeId: string, patch: Record<string, any>) => {
    setLocalDraft((prev) => {
      const existing = prev[prizeId] || {};
      return { ...prev, [prizeId]: { ...existing, ...patch } };
    });
    setDirty(true);
  }, []);

  // Apply local edits to server
  const handleSaveDraft = useCallback(async () => {
    if (!dirty || Object.keys(localDraft).length === 0) return;
    setSaving(true);
    try {
      for (const [prizeId, patch] of Object.entries(localDraft)) {
        await onUpdatePrize(prizeId, patch);
      }
      setLocalDraft({});
      setDirty(false);
      setLastSavedAt(new Date().toLocaleTimeString(isRTL ? 'ar' : 'en'));
      await onRefetch();
    } finally {
      setSaving(false);
    }
  }, [dirty, localDraft, onUpdatePrize, onRefetch, isRTL]);

  const handleDiscard = useCallback(() => {
    setLocalDraft({});
    setDirty(false);
  }, []);

  // Selection with dirty guard
  const handleSelect = useCallback((id: string) => {
    if (dirty && id !== selectedId) {
      const ok = window.confirm(isRTL ? 'لديك تعديلات غير محفوظة. هل تريد الانتقال؟' : 'You have unsaved changes. Switch prize?');
      if (!ok) return;
      // discard current draft on switch
      setLocalDraft({});
      setDirty(false);
    }
    setSelectedId(id);
  }, [dirty, selectedId, isRTL]);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }, []);

  const handleDuplicate = useCallback(async (_id: string) => {
    await onAddPrize();
  }, [onAddPrize]);

  const handleArchive = useCallback(async (id: string) => {
    // Disable instead of hard delete (preserve history)
    await onUpdatePrize(id, { enabled: false });
    await onRefetch();
  }, [onUpdatePrize, onRefetch]);

  const handleReorder = useCallback(async (fromId: string, toId: string) => {
    const fromIdx = draftPrizes.findIndex((p) => p.id === fromId);
    const toIdx = draftPrizes.findIndex((p) => p.id === toId);
    if (fromIdx === -1 || toIdx === -1) return;
    const reordered = [...draftPrizes];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    // Update display_order for affected
    for (let i = 0; i < reordered.length; i++) {
      if (reordered[i].display_order !== i) {
        await onUpdatePrize(reordered[i].id, { display_order: i });
      }
    }
    await onRefetch();
  }, [draftPrizes, onUpdatePrize, onRefetch]);

  // Assist actions
  const openAssist = useCallback((type: AssistType) => {
    let previews: AssistPreview[] = [];
    if (type === 'distribute') previews = assistDistributeRemaining(draftPrizes);
    else if (type === 'add_to_selected' && effectivePrize) previews = assistAddRemainingTo(draftPrizes, effectivePrize.prize_key);
    else if (type === 'set_as_remaining' && effectivePrize) previews = assistSetAsRemaining(draftPrizes, effectivePrize.prize_key);
    else if (type === 'zero_selected') previews = assistZeroSelected(draftPrizes, selectedIds.length > 0 ? selectedIds : (effectivePrize ? [effectivePrize.prize_key] : []));
    else if (type === 'copy_to_others' && effectivePrize) {
      const others = draftPrizes.filter((p) => p.prize_key !== effectivePrize.prize_key).map((p) => p.prize_key);
      previews = assistCopyToOthers(draftPrizes, effectivePrize.prize_key, others.slice(0, 3));
    }
    setAssistPreviews(previews);
    setAssistType(type);
    setShowAssistModal(true);
  }, [draftPrizes, effectivePrize, selectedIds]);

  const applyAssist = useCallback(() => {
    if (!assistType) return;
    for (const p of assistPreviews) {
      const prize = draftPrizes.find((x) => x.prize_key === p.prize_key);
      if (prize) handleChange(prize.id, { probability_ppm: p.after_ppm });
    }
    setShowAssistModal(false);
    setAssistType(null);
    setAssistPreviews([]);
  }, [assistType, assistPreviews, draftPrizes, handleChange]);

  // Bulk actions
  const bulkEnable = useCallback(async (enable: boolean) => {
    for (const id of selectedIds) await onUpdatePrize(id, { enabled: enable });
    setSelectedIds([]);
    await onRefetch();
  }, [selectedIds, onUpdatePrize, onRefetch]);

  const bulkRarity = useCallback(async (rarity: string) => {
    for (const id of selectedIds) await onUpdatePrize(id, { rarity });
    setSelectedIds([]);
    await onRefetch();
  }, [selectedIds, onUpdatePrize, onRefetch]);

  const bulkDistribute = useCallback(() => {
    openAssist('distribute');
  }, [openAssist]);

  // Probability bar segments
  const segments = useMemo(() => {
    const enabled = draftPrizes.filter((p) => p.enabled);
    return enabled.map((p) => ({
      key: p.prize_key,
      ppm: p.probability_ppm,
      width: (p.probability_ppm / 1_000_000) * 100,
      color: p.wheel_color_start || '#d9ab4e',
    }));
  }, [draftPrizes]);

  const probStatus = summary.status;
  const probColor = probStatus === 'VALID' ? '#31d8c5' : probStatus === 'OVER' ? '#e6455c' : probStatus === 'UNDER' ? '#d9ab4e' : '#e6455c';
  const probLabel = probStatus === 'VALID' ? (isRTL ? 'صالح' : 'Valid')
    : probStatus === 'OVER' ? (isRTL ? `زيادة ${(summary.over_ppm / 10000).toFixed(4)}%` : `Over by ${(summary.over_ppm / 10000).toFixed(4)}%`)
    : probStatus === 'UNDER' ? (isRTL ? `نقص ${(summary.remaining_ppm / 10000).toFixed(4)}%` : `Under by ${(summary.remaining_ppm / 10000).toFixed(4)}%`)
    : (isRTL ? 'غير صالح' : 'Invalid');

  return (
    <div className="space-y-3" style={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      {/* ─── Sticky probability control bar ─── */}
      <div className="sticky top-0 z-30 rounded-xl p-3" style={{ background: '#120c07', border: '1px solid rgba(214,178,94,0.2)', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-[#9c8b6e]">{isRTL ? 'عدد الجوائز' : 'Prizes'}: <b className="text-[#f8e7b4]">{summary.prize_count}</b></span>
            <span className="text-xs text-[#9c8b6e]">{isRTL ? 'المفعّلة' : 'Enabled'}: <b className="text-[#f8e7b4]">{summary.enabled_count}</b></span>
            <span className="text-xs" style={{ color: probColor }}>
              {isRTL ? 'الإجمالي' : 'Total'}: <b>{ppmToPercentStr(summary.total_ppm)}%</b>
            </span>
            <span className="text-xs" style={{ color: probColor }}>
              {isRTL ? 'المتبقي' : 'Remaining'}: <b>{ppmToPercentStr(Math.abs(summary.remaining_ppm))}%</b>
            </span>
            <span className="text-xs px-2 py-0.5 rounded-md font-bold" style={{ background: `${probColor}22`, color: probColor }}>
              {probLabel}
            </span>
          </div>
          {/* Assist dropdown */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowBulkBar(!showBulkBar)}
              disabled={selectedIds.length === 0}
              className="text-[11px] px-2.5 py-1.5 rounded-lg font-bold disabled:opacity-40 transition-all flex items-center gap-1"
              style={{ background: '#0d0906', border: '1px solid rgba(214,178,94,0.16)', color: '#d9ab4e' }}
            >
              <Layers size={12} /> {isRTL ? `مجموعي (${selectedIds.length})` : `Bulk (${selectedIds.length})`}
            </button>
            <div className="relative">
              <button
                onClick={() => {
                  const el = document.getElementById('assist-menu');
                  if (el) el.classList.toggle('hidden');
                }}
                className="text-[11px] px-2.5 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1"
                style={{ background: '#0d0906', border: '1px solid rgba(214,178,94,0.16)', color: '#d9ab4e' }}
              >
                <Sparkles size={12} /> {isRTL ? 'مساعد' : 'Assist'}
              </button>
              <div id="assist-menu" className="hidden absolute top-full mt-1 z-40 rounded-lg overflow-hidden min-w-[200px]" style={{ background: '#120c07', border: '1px solid rgba(214,178,94,0.3)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }} onClick={(e) => e.stopPropagation()}>
                <button onClick={() => openAssist('distribute')} className="w-full text-right px-3 py-2 text-xs text-[#efe6d2] hover:bg-[rgba(214,178,94,0.08)] transition-colors">{isRTL ? 'توزيع المتبقي بالتساوي' : 'Distribute remaining equally'}</button>
                <button onClick={() => openAssist('add_to_selected')} disabled={!effectivePrize} className="w-full text-right px-3 py-2 text-xs text-[#efe6d2] hover:bg-[rgba(214,178,94,0.08)] transition-colors disabled:opacity-40">{isRTL ? 'إضافة المتبقي للجائزة المحددة' : 'Add remaining to selected'}</button>
                <button onClick={() => openAssist('set_as_remaining')} disabled={!effectivePrize} className="w-full text-right px-3 py-2 text-xs text-[#efe6d2] hover:bg-[rgba(214,178,94,0.08)] transition-colors disabled:opacity-40">{isRTL ? 'تعيين حظ أوفر كمتبقٍ' : 'Set as no-reward remaining'}</button>
                <button onClick={() => openAssist('zero_selected')} className="w-full text-right px-3 py-2 text-xs text-[#efe6d2] hover:bg-[rgba(214,178,94,0.08)] transition-colors">{isRTL ? 'تصفير الجوائز المحددة' : 'Zero selected prizes'}</button>
                <button onClick={() => openAssist('copy_to_others')} disabled={!effectivePrize} className="w-full text-right px-3 py-2 text-xs text-[#efe6d2] hover:bg-[rgba(214,178,94,0.08)] transition-colors disabled:opacity-40">{isRTL ? 'نسخ نسبة الجائزة' : 'Copy rate to others'}</button>
              </div>
            </div>
          </div>
        </div>

        {/* Segmented progress bar */}
        <div className="h-3 rounded-full overflow-hidden flex" style={{ background: '#0d0906' }}>
          {segments.map((s) => (
            <div key={s.key} style={{ width: `${s.width}%`, background: s.color, minWidth: s.width > 0 ? '1px' : 0 }} title={`${s.key}: ${ppmToPercentStr(s.ppm)}%`} />
          ))}
          {summary.remaining_ppm > 0 && (
            <div style={{ width: `${(summary.remaining_ppm / 1_000_000) * 100}%`, background: 'rgba(230,69,92,0.3)', minWidth: '1px' }} />
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {showBulkBar && selectedIds.length > 0 && (
        <div className="rounded-xl p-3 flex items-center gap-2 flex-wrap" style={{ background: 'rgba(217,171,78,0.08)', border: '1px solid rgba(214,178,94,0.2)' }}>
          <span className="text-xs font-bold text-[#d9ab4e]">{selectedIds.length} {isRTL ? 'محدد' : 'selected'}</span>
          <button onClick={() => bulkEnable(true)} className="text-[11px] px-2.5 py-1.5 rounded-lg font-bold" style={{ background: '#0d0906', border: '1px solid rgba(49,216,197,0.3)', color: '#31d8c5' }}>{isRTL ? 'تفعيل' : 'Enable'}</button>
          <button onClick={() => bulkEnable(false)} className="text-[11px] px-2.5 py-1.5 rounded-lg font-bold" style={{ background: '#0d0906', border: '1px solid rgba(230,69,92,0.3)', color: '#e6455c' }}>{isRTL ? 'تعطيل' : 'Disable'}</button>
          <select onChange={(e) => { if (e.target.value) bulkRarity(e.target.value); e.target.value = ''; }} className="text-[11px] px-2 py-1.5 rounded-lg" style={{ background: '#0d0906', border: '1px solid rgba(214,178,94,0.16)', color: '#9c8b6e' }}>
            <option value="">{isRTL ? 'تغيير الندرة...' : 'Change rarity...'}</option>
            <option value="common">{isRTL ? 'شائع' : 'Common'}</option>
            <option value="rare">{isRTL ? 'نادر' : 'Rare'}</option>
            <option value="epic">{isRTL ? 'ملحمي' : 'Epic'}</option>
            <option value="legendary">{isRTL ? 'أسطوري' : 'Legendary'}</option>
          </select>
          <button onClick={bulkDistribute} className="text-[11px] px-2.5 py-1.5 rounded-lg font-bold" style={{ background: '#0d0906', border: '1px solid rgba(214,178,94,0.3)', color: '#d9ab4e' }}>{isRTL ? 'توزيع الاحتمال' : 'Distribute'}</button>
          <button onClick={() => setSelectedIds([])} className="text-[11px] px-2 py-1.5 text-[#9c8b6e]"><X size={12} /></button>
        </div>
      )}

      {/* ─── Three-panel workspace ─── */}
      <div className="grid gap-3 lg:grid-cols-[280px_1fr_340px] md:grid-cols-[260px_1fr]">
        {/* Left: Prize list */}
        <div className="rounded-xl overflow-hidden lg:h-[calc(100vh-220px)] lg:sticky lg:top-[100px]" style={{ background: '#181008', border: '1px solid rgba(214,178,94,0.16)' }}>
          <PrizeListPanel
            prizes={draftPrizes}
            selectedId={selectedId}
            onSelect={handleSelect}
            onAdd={onAddPrize}
            onDuplicate={handleDuplicate}
            onArchive={handleArchive}
            onReorder={handleReorder}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            errorsByPrize={errorsByPrize}
            isRTL={isRTL}
          />
        </div>

        {/* Center: Editor */}
        <div className="rounded-xl overflow-hidden lg:h-[calc(100vh-220px)] lg:sticky lg:top-[100px]" style={{ background: '#181008', border: '1px solid rgba(214,178,94,0.16)' }}>
          {effectivePrize ? (
            <PrizeEditorPanel
              prize={effectivePrize}
              allPrizes={draftPrizes}
              onChange={handleChange}
              onDuplicate={handleDuplicate}
              onArchive={handleArchive}
              onSaveDraft={handleSaveDraft}
              onDiscard={handleDiscard}
              saving={saving}
              dirty={dirty}
              lastSavedAt={lastSavedAt}
              errors={currentPrizeErrors}
              isRTL={isRTL}
            />
          ) : (
            <div className="flex items-center justify-center h-full p-8 text-center">
              <div>
                <div className="text-4xl mb-3 opacity-40">{'\uD83C\uDFB0'}</div>
                <p className="text-sm text-[#9c8b6e] mb-4">{isRTL ? 'لم تتم إضافة جوائز للعجلة بعد' : 'No prizes added yet'}</p>
                <button onClick={onAddPrize} className="rounded-xl px-4 py-2.5 text-sm font-bold" style={{ background: 'linear-gradient(180deg, #f8e7b4, #d9ab4e)', color: '#241705' }}>
                  {isRTL ? 'إضافة أول جائزة' : 'Add first prize'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Live preview (desktop only in grid, mobile collapsible) */}
        <div className="hidden lg:block rounded-xl overflow-hidden lg:h-[calc(100vh-220px)] lg:sticky lg:top-[100px]" style={{ background: '#181008', border: '1px solid rgba(214,178,94,0.16)' }}>
          <LivePreviewPanel
            prizes={draftPrizes}
            selectedPrizeKey={effectivePrize?.prize_key || null}
            grandPrizeLocked={!!draftVersion?.jackpot_lock_enabled}
            isRTL={isRTL}
          />
        </div>
      </div>

      {/* Mobile preview toggle */}
      <div className="lg:hidden">
        <button
          onClick={() => setShowPreviewMobile(!showPreviewMobile)}
          className="w-full rounded-xl py-2.5 text-sm font-bold flex items-center justify-center gap-2"
          style={{ background: '#120c07', border: '1px solid rgba(214,178,94,0.16)', color: '#d9ab4e' }}
        >
          {showPreviewMobile ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {isRTL ? 'معاينة العجلة' : 'Wheel Preview'}
        </button>
        {showPreviewMobile && (
          <div className="mt-2 rounded-xl overflow-hidden" style={{ background: '#181008', border: '1px solid rgba(214,178,94,0.16)' }}>
            <LivePreviewPanel
              prizes={draftPrizes}
              selectedPrizeKey={effectivePrize?.prize_key || null}
              grandPrizeLocked={!!draftVersion?.jackpot_lock_enabled}
              isRTL={isRTL}
            />
          </div>
        )}
      </div>

      {/* ─── Assist confirmation modal ─── */}
      {showAssistModal && assistPreviews.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setShowAssistModal(false)}>
          <div className="rounded-2xl p-5 max-w-md w-full space-y-4" style={{ background: '#181008', border: '1px solid rgba(214,178,94,0.3)' }} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-[#f8e7b4]">{isRTL ? 'تأكيد تغيير الاحتمالات' : 'Confirm Probability Changes'}</h3>
            <p className="text-xs text-[#9c8b6e]">{isRTL ? 'سيتم تطبيق التغييرات التالية. لا يتم النشر التلقائي.' : 'The following changes will be applied. No auto-publish.'}</p>
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {assistPreviews.map((p) => (
                <div key={p.prize_key} className="flex items-center justify-between rounded-lg p-2 text-xs" style={{ background: '#0d0906', border: '1px solid rgba(214,178,94,0.14)' }}>
                  <span className="text-[#efe6d2] truncate flex-1">{p.prize_key}</span>
                  <span className="text-[#9c8b6e]">{ppmToPercentStr(p.before_ppm)}%</span>
                  <span className="text-[#9c8b6e] mx-1">→</span>
                  <b className="text-[#f8e7b4]">{ppmToPercentStr(p.after_ppm)}%</b>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowAssistModal(false)} className="flex-1 rounded-xl py-2.5 text-sm font-bold" style={{ background: '#0d0906', border: '1px solid rgba(214,178,94,0.16)', color: '#9c8b6e' }}>{isRTL ? 'إلغاء' : 'Cancel'}</button>
              <button onClick={applyAssist} className="flex-1 rounded-xl py-2.5 text-sm font-bold" style={{ color: '#241705', background: 'linear-gradient(180deg, #f8e7b4, #d9ab4e)' }}>{isRTL ? 'تطبيق' : 'Apply'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close assist menu */}
      <div className="fixed inset-0 z-20 hidden" id="assist-overlay" onClick={() => { document.getElementById('assist-menu')?.classList.add('hidden'); document.getElementById('assist-overlay')?.classList.add('hidden'); }} />
    </div>
  );
}
