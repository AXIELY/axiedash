import { memo, useMemo, useState } from 'react';
import { Search, Plus, Copy, Archive, GripVertical, AlertTriangle, Crown, Filter } from 'lucide-react';
import { ppmToPercentStr, REWARD_TYPE_AR, REWARD_TYPE_ICON, RARITY_AR, RARITY_COLOR } from './prizeUtils';

export interface PrizeListItem {
  id: string;
  prize_key: string;
  name_ar: string;
  name_en: string;
  reward_type: string;
  probability_ppm: number;
  enabled: boolean;
  is_grand_prize: boolean;
  icon_url: string | null;
  rarity: string;
}

interface Props {
  prizes: PrizeListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDuplicate: (id: string) => void;
  onArchive: (id: string) => void;
  onReorder: (fromId: string, toId: string) => void;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  errorsByPrize: Record<string, string[]>;
  isRTL: boolean;
}

type FilterType = 'all' | 'enabled' | 'disabled';
type FilterRarity = 'all' | string;

function PrizeCardInner({
  prize,
  selected,
  multiSelected,
  onSelect,
  onDuplicate,
  onArchive,
  onDragStart,
  onDragOver,
  onDrop,
  errors,
  isRTL,
}: {
  prize: PrizeListItem;
  selected: boolean;
  multiSelected: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  errors: string[];
  isRTL: boolean;
}) {
  const pct = ppmToPercentStr(prize.probability_ppm);
  const rarityColor = RARITY_COLOR[prize.rarity] || '#9c8b6e';

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onSelect}
      className="group relative rounded-xl p-2.5 cursor-pointer transition-all duration-200"
      style={{
        background: selected ? 'linear-gradient(135deg, rgba(248,231,180,0.14), rgba(217,171,78,0.08))' : '#120c07',
        border: `1.5px solid ${selected ? 'rgba(248,231,180,0.55)' : 'rgba(214,178,94,0.14)'}`,
        boxShadow: selected ? '0 0 0 1px rgba(248,231,180,0.25), 0 4px 14px rgba(0,0,0,0.3)' : 'none',
      }}
    >
      <div className="flex items-center gap-2">
        {/* Drag handle */}
        <span
          className="text-[#9c8b6e] opacity-40 group-hover:opacity-80 transition-opacity cursor-grab active:cursor-grabbing flex-shrink-0"
          aria-label="drag handle"
        >
          <GripVertical size={14} />
        </span>

        {/* Multi-select checkbox */}
        <input
          type="checkbox"
          checked={multiSelected}
          onClick={(e) => e.stopPropagation()}
          onChange={() => {}}
          className="accent-[#d9ab4e] w-3.5 h-3.5 flex-shrink-0"
          aria-label="select"
        />

        {/* Icon thumbnail */}
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden text-base"
          style={{ background: '#0d0906', border: '1px solid rgba(214,178,94,0.14)' }}
        >
          {prize.icon_url ? (
            <img src={prize.icon_url} alt="" className="w-full h-full object-contain" />
          ) : (
            <span>{REWARD_TYPE_ICON[prize.reward_type] || '\u2B50'}</span>
          )}
        </div>

        {/* Name + badges */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <b className="text-xs text-[#efe6d2] truncate" style={{ direction: isRTL ? 'rtl' : 'ltr' }}>
              {prize.name_ar || prize.name_en || prize.prize_key}
            </b>
            {prize.is_grand_prize && (
              <Crown size={11} className="text-[#f8e7b4] flex-shrink-0" aria-label="grand prize" />
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className="text-[9px] px-1.5 py-0.5 rounded-md font-bold flex-shrink-0"
              style={{ background: 'rgba(214,178,94,0.12)', color: '#d9ab4e' }}
            >
              {REWARD_TYPE_AR[prize.reward_type] || prize.reward_type}
            </span>
            <span
              className="text-[9px] px-1.5 py-0.5 rounded-md font-bold flex-shrink-0"
              style={{ background: `${rarityColor}22`, color: rarityColor }}
            >
              {RARITY_AR[prize.rarity] || prize.rarity}
            </span>
            {!prize.enabled && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-md font-bold flex-shrink-0" style={{ background: 'rgba(230,69,92,0.12)', color: '#e6455c' }}>
                {isRTL ? 'معطّل' : 'off'}
              </span>
            )}
          </div>
        </div>

        {/* Probability */}
        <div className="text-left flex-shrink-0">
          <b className="text-xs text-[#f8e7b4] block">{pct}%</b>
        </div>

        {/* Error indicator */}
        {errors.length > 0 && (
          <span className="text-[#e6455c] flex-shrink-0" title={errors.join(', ')}>
            <AlertTriangle size={12} />
          </span>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
            className="text-[#9c8b6e] hover:text-[#d9ab4e] transition-colors"
            aria-label="duplicate"
          >
            <Copy size={12} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onArchive(); }}
            className="text-[#9c8b6e] hover:text-[#e6455c] transition-colors"
            aria-label="archive"
          >
            <Archive size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

const PrizeCard = memo(PrizeCardInner);

export function PrizeListPanel({
  prizes,
  selectedId,
  onSelect,
  onAdd,
  onDuplicate,
  onArchive,
  onReorder,
  selectedIds,
  onToggleSelect,
  errorsByPrize,
  isRTL,
}: Props) {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterRarity, setFilterRarity] = useState<FilterRarity>('all');
  const [filterReward, setFilterReward] = useState<string>('all');
  const [dragId, setDragId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return prizes.filter((p) => {
      if (search) {
        const q = search.toLowerCase();
        if (!p.name_ar?.toLowerCase().includes(q) && !p.name_en?.toLowerCase().includes(q) && !p.prize_key.toLowerCase().includes(q)) return false;
      }
      if (filterType === 'enabled' && !p.enabled) return false;
      if (filterType === 'disabled' && p.enabled) return false;
      if (filterRarity !== 'all' && p.rarity !== filterRarity) return false;
      if (filterReward !== 'all' && p.reward_type !== filterReward) return false;
      return true;
    });
  }, [prizes, search, filterType, filterRarity, filterReward]);

  const handleDragStart = (id: string) => setDragId(id);
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (targetId: string) => {
    if (dragId && dragId !== targetId) onReorder(dragId, targetId);
    setDragId(null);
  };

  const rewardTypes = useMemo(() => {
    const set = new Set(prizes.map((p) => p.reward_type));
    return Array.from(set);
  }, [prizes]);

  return (
    <div className="flex flex-col h-full" style={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      {/* Header */}
      <div className="p-3 border-b border-[rgba(214,178,94,0.14)] space-y-2.5 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-[#f8e7b4]">{isRTL ? 'قائمة الجوائز' : 'Prize List'}</h3>
          <span className="text-[10px] text-[#9c8b6e]">{prizes.length} {isRTL ? 'جائزة' : 'prizes'}</span>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={13} className="absolute top-1/2 -translate-y-1/2 text-[#9c8b6e]" style={{ [isRTL ? 'right' : 'left']: '10px' } as any} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isRTL ? 'بحث عن جائزة...' : 'Search prizes...'}
            className="w-full rounded-lg py-2 pl-9 pr-9 text-xs"
            style={{ background: '#0d0906', border: '1px solid rgba(214,178,94,0.14)', color: '#efe6d2' }}
          />
        </div>

        {/* Filters */}
        <div className="space-y-1.5">
          <div className="flex gap-1 flex-wrap">
            {(['all', 'enabled', 'disabled'] as FilterType[]).map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className="text-[10px] px-2 py-1 rounded-md font-bold transition-all"
                style={{
                  background: filterType === t ? 'rgba(217,171,78,0.2)' : '#0d0906',
                  color: filterType === t ? '#d9ab4e' : '#9c8b6e',
                  border: `1px solid ${filterType === t ? 'rgba(217,171,78,0.4)' : 'rgba(214,178,94,0.1)'}`,
                }}
              >
                {t === 'all' ? (isRTL ? 'الكل' : 'All') : t === 'enabled' ? (isRTL ? 'مفعّل' : 'On') : (isRTL ? 'معطّل' : 'Off')}
              </button>
            ))}
          </div>
          <div className="flex gap-1 flex-wrap items-center">
            <Filter size={10} className="text-[#9c8b6e]" />
            <select
              value={filterRarity}
              onChange={(e) => setFilterRarity(e.target.value)}
              className="text-[10px] px-1.5 py-0.5 rounded-md"
              style={{ background: '#0d0906', border: '1px solid rgba(214,178,94,0.14)', color: '#9c8b6e' }}
            >
              <option value="all">{isRTL ? 'كل النوادر' : 'All rarity'}</option>
              {Object.entries(RARITY_AR).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select
              value={filterReward}
              onChange={(e) => setFilterReward(e.target.value)}
              className="text-[10px] px-1.5 py-0.5 rounded-md"
              style={{ background: '#0d0906', border: '1px solid rgba(214,178,94,0.14)', color: '#9c8b6e' }}
            >
              <option value="all">{isRTL ? 'كل الأنواع' : 'All types'}</option>
              {rewardTypes.map((t) => (
                <option key={t} value={t}>{REWARD_TYPE_AR[t] || t}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 min-h-0">
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-xs text-[#9c8b6e]">
            {prizes.length === 0
              ? (isRTL ? 'لم تتم إضافة جوائز للعجلة بعد' : 'No prizes added yet')
              : (isRTL ? 'لا نتائج مطابقة' : 'No matching prizes')}
          </div>
        ) : (
          filtered.map((prize) => (
            <PrizeCard
              key={prize.id}
              prize={prize}
              selected={selectedId === prize.id}
              multiSelected={selectedIds.includes(prize.id)}
              onSelect={(e) => {
                if (e.shiftKey || e.metaKey || e.ctrlKey) onToggleSelect(prize.id);
                else onSelect(prize.id);
              }}
              onDuplicate={() => onDuplicate(prize.id)}
              onArchive={() => onArchive(prize.id)}
              onDragStart={() => handleDragStart(prize.id)}
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(prize.id)}
              errors={errorsByPrize[prize.prize_key] || []}
              isRTL={isRTL}
            />
          ))
        )}
      </div>

      {/* Add button */}
      <div className="p-2 border-t border-[rgba(214,178,94,0.14)] flex-shrink-0">
        <button
          onClick={onAdd}
          className="w-full rounded-xl py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 transition-all hover:opacity-90"
          style={{ background: '#120c07', border: '1px dashed rgba(214,178,94,0.4)', color: '#d9ab4e' }}
        >
          <Plus size={14} />
          {isRTL ? 'إضافة جائزة' : 'Add Prize'}
        </button>
      </div>
    </div>
  );
}
