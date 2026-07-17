import { useMemo, useState, memo } from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import { WheelRenderer } from './WheelRenderer';
import type { WheelV2Prize } from './types';
import { ppmToPercentStr, ppmToSectorAngle, expectedWinsLabel } from './prizeUtils';

interface Props {
  prizes: any[];
  selectedPrizeKey: string | null;
  grandPrizeLocked: boolean;
  isRTL: boolean;
}

function LivePreviewInner({ prizes, selectedPrizeKey, grandPrizeLocked, isRTL }: Props) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');

  const previewPrizes: WheelV2Prize[] = useMemo(() => {
    const visible = prizes.filter((p) => p.enabled && p.visible_on_wheel);
    let cumulative = 0;
    return visible.map((p) => {
      const angle = ppmToSectorAngle(p.probability_ppm);
      const rangeStart = Math.round((cumulative / 360) * 1_000_000);
      cumulative += angle;
      return {
        ...p,
        range_start: rangeStart,
        range_end: 0,
        sector_angle: angle,
      } as WheelV2Prize;
    });
  }, [prizes]);

  const selected = prizes.find((p) => p.prize_key === selectedPrizeKey);
  const selectedAngle = selected ? ppmToSectorAngle(selected.probability_ppm) : 0;
  const wheelSize = device === 'desktop' ? 340 : 260;

  return (
    <div className="flex flex-col h-full" style={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      {/* Header */}
      <div className="p-3 border-b border-[rgba(214,178,94,0.14)] flex-shrink-0">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-[#f8e7b4]">{isRTL ? 'معاينة حية' : 'Live Preview'}</h3>
          {/* Device toggle */}
          <div className="flex gap-1 rounded-lg p-0.5" style={{ background: '#0d0906', border: '1px solid rgba(214,178,94,0.14)' }}>
            <button
              onClick={() => setDevice('desktop')}
              className="p-1.5 rounded-md transition-all"
              style={{ background: device === 'desktop' ? 'rgba(217,171,78,0.2)' : 'transparent', color: device === 'desktop' ? '#d9ab4e' : '#9c8b6e' }}
              aria-label="desktop preview"
            >
              <Monitor size={14} />
            </button>
            <button
              onClick={() => setDevice('mobile')}
              className="p-1.5 rounded-md transition-all"
              style={{ background: device === 'mobile' ? 'rgba(217,171,78,0.2)' : 'transparent', color: device === 'mobile' ? '#d9ab4e' : '#9c8b6e' }}
              aria-label="mobile preview"
            >
              <Smartphone size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Wheel preview */}
      <div className="flex-1 overflow-y-auto p-4 min-h-0">
        <div className="flex justify-center mb-4">
          {previewPrizes.length === 0 ? (
            <div className="text-center py-10 text-xs text-[#9c8b6e]">
              {isRTL ? 'لا جوائز مرئية للمعاينة' : 'No visible prizes to preview'}
            </div>
          ) : (
            <WheelRenderer
              prizes={previewPrizes}
              rotation={0}
              spinning={false}
              size={wheelSize}
              highlightPrizeKey={selectedPrizeKey}
              grandPrizeLocked={grandPrizeLocked}
            />
          )}
        </div>

        {/* Selected prize stats */}
        {selected && (
          <div className="rounded-xl p-3 space-y-2" style={{ background: '#0d0906', border: '1px solid rgba(214,178,94,0.14)' }}>
            <div className="flex items-center gap-2 mb-1">
              {selected.icon_url ? (
                <img src={selected.icon_url} alt="" className="w-8 h-8 rounded-lg object-contain" />
              ) : (
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base" style={{ background: '#120c07' }}>
                  {'\u2B50'}
                </div>
              )}
              <b className="text-sm text-[#f8e7b4] truncate">{selected.name_ar || selected.name_en || selected.prize_key}</b>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#9c8b6e]">{isRTL ? 'النسبة' : 'Rate'}</span>
                <b className="text-[#f8e7b4]">{ppmToPercentStr(selected.probability_ppm)}%</b>
              </div>
              <div className="flex justify-between">
                <span className="text-[#9c8b6e]">{isRTL ? 'زاوية' : 'Angle'}</span>
                <b className="text-[#f8e7b4]">{selectedAngle.toFixed(2)}°</b>
              </div>
              <div className="flex justify-between">
                <span className="text-[#9c8b6e]">{isRTL ? 'لكل 1,000' : 'Per 1K'}</span>
                <b className="text-[#f8e7b4]">{expectedWinsLabel(selected.probability_ppm, 1000)}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-[#9c8b6e]">{isRTL ? 'لكل 100K' : 'Per 100K'}</span>
                <b className="text-[#f8e7b4]">{expectedWinsLabel(selected.probability_ppm, 100000)}</b>
              </div>
            </div>
          </div>
        )}

        {/* Wheel stats */}
        {previewPrizes.length > 0 && (
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div className="rounded-lg p-2 text-center" style={{ background: '#0d0906', border: '1px solid rgba(214,178,94,0.14)' }}>
              <b className="text-sm text-[#f8e7b4] block">{previewPrizes.length}</b>
              <span className="text-[10px] text-[#9c8b6e]">{isRTL ? 'جوائز مرئية' : 'Visible prizes'}</span>
            </div>
            <div className="rounded-lg p-2 text-center" style={{ background: '#0d0906', border: '1px solid rgba(214,178,94,0.14)' }}>
              <b className="text-sm text-[#f8e7b4] block">{previewPrizes.reduce((s, p) => s + p.sector_angle, 0).toFixed(1)}°</b>
              <span className="text-[10px] text-[#9c8b6e]">{isRTL ? 'مجموع الزوايا' : 'Total angles'}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const LivePreviewPanel = memo(LivePreviewInner);
