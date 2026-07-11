import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { Flame } from 'lucide-react';

interface ComboMeterProps {
  consecutiveWins: number;
  maxMilestone?: number; // default 7
  multiplier: number;
  lastMilestoneXp?: number;
  goldenMode?: boolean;
}

const MILESTONES = [3, 5, 7, 10];
const LABELS: Record<number, { en: string; ar: string }> = {
  3:  { en: 'Hot Streak!',  ar: 'سلسلة ساخنة!' },
  5:  { en: 'On Fire!',     ar: 'ملتهب!'       },
  7:  { en: 'Unstoppable!', ar: 'لا يُوقف!'    },
  10: { en: 'LEGENDARY!',   ar: 'أسطوري!'      },
};

export function ComboMeter({
  consecutiveWins,
  maxMilestone = 7,
  multiplier,
  lastMilestoneXp = 0,
  goldenMode = false,
}: ComboMeterProps) {
  const { language } = useLanguage();
  const [flash, setFlash] = useState(false);
  const prevWins = useRef(consecutiveWins);

  // Flash on progress
  useEffect(() => {
    if (consecutiveWins > prevWins.current && consecutiveWins > 0) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 600);
      return () => clearTimeout(t);
    }
    prevWins.current = consecutiveWins;
  }, [consecutiveWins]);

  if (consecutiveWins === 0 && !goldenMode) return null;

  const nextMilestone = MILESTONES.find(m => m > consecutiveWins) ?? maxMilestone;
  const hitMilestone = MILESTONES.find(m => m === consecutiveWins);
  const gold = goldenMode ? '#fbbf24' : '#f59e0b';
  const glow = goldenMode ? 'rgba(251,191,36,0.35)' : 'rgba(245,158,11,0.25)';

  return (
    <div
      className="relative overflow-hidden"
      style={{
        background: consecutiveWins > 0
          ? `linear-gradient(135deg, rgba(245,158,11,.1), rgba(0,0,0,.3))`
          : 'rgba(255,255,255,.03)',
        border: consecutiveWins > 0 ? `1px solid ${glow}` : '1px solid rgba(255,255,255,.06)',
        borderRadius: '16px',
        padding: '10px 14px',
        boxShadow: consecutiveWins > 0 && flash ? `0 0 20px ${glow}` : 'none',
        transition: 'box-shadow 0.3s ease, border-color 0.3s ease',
      }}
    >
      <div className="flex items-center gap-3">
        {/* Icon */}
        <div className="flex-shrink-0">
          <Flame
            className="w-5 h-5 transition-all"
            style={{
              color: consecutiveWins > 0 ? gold : 'rgba(255,255,255,.2)',
              filter: consecutiveWins > 0 ? `drop-shadow(0 0 6px ${glow})` : 'none',
            }}
          />
        </div>

        {/* Nodes */}
        <div className="flex items-center gap-2 flex-1">
          {Array.from({ length: nextMilestone }, (_, i) => {
            const filled = i < consecutiveWins;
            const isFlashing = filled && flash;
            return (
              <div
                key={i}
                className="rounded-full transition-all"
                style={{
                  width: '18px',
                  height: '18px',
                  background: filled
                    ? `radial-gradient(circle at 35% 35%, ${goldenMode ? '#fcd34d' : '#fbbf24'}, ${gold})`
                    : 'rgba(255,255,255,.08)',
                  border: filled ? `1px solid ${gold}60` : '1px solid rgba(255,255,255,.1)',
                  boxShadow: isFlashing ? `0 0 10px ${glow}` : filled ? `0 0 6px ${glow}60` : 'none',
                  transform: isFlashing ? 'scale(1.15)' : 'scale(1)',
                  transition: 'transform 0.26s cubic-bezier(.34,1.56,.64,1), box-shadow 0.26s ease',
                }}
              />
            );
          })}
        </div>

        {/* Count + label */}
        <div className="flex-shrink-0 text-right">
          <div className="font-black text-sm" style={{ color: consecutiveWins > 0 ? gold : 'rgba(255,255,255,.25)' }}>
            {consecutiveWins}/{nextMilestone}
          </div>
          {multiplier > 1 && (
            <div className="text-[10px] font-bold" style={{ color: glow.replace('0.25', '1') }}>
              {multiplier}× {language === 'ar' ? 'مضاعف' : 'multiplier'}
            </div>
          )}
        </div>
      </div>

      {/* Milestone label */}
      {hitMilestone && LABELS[hitMilestone] && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            background: `linear-gradient(135deg, ${glow.replace('0.25','0.85')}, rgba(0,0,0,.7))`,
            animation: 'milestoneFlash 0.6s ease-out forwards',
            borderRadius: '16px',
          }}
        >
          <span className="font-black text-sm" style={{ color: '#fff' }}>
            {language === 'ar' ? LABELS[hitMilestone].ar : LABELS[hitMilestone].en}
            {lastMilestoneXp > 0 && ` +${lastMilestoneXp} XP`}
          </span>
        </div>
      )}
    </div>
  );
}
