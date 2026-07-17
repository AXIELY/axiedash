import { useMemo } from 'react';
import type { WheelV2Prize } from './types';

interface WheelRendererProps {
  prizes: WheelV2Prize[];
  rotation: number;
  spinning: boolean;
  size?: number;
  highlightPrizeKey?: string | null;
  grandPrizeLocked?: boolean;
}

const CX = 260;
const CY = 260;
const R = 236;
const BULB_COUNT = 24;

function polar(angleDeg: number, radius: number): [number, number] {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [CX + radius * Math.cos(rad), CY + radius * Math.sin(rad)];
}

function getPrizeIcon(prize: WheelV2Prize): string {
  if (prize.icon_url) return prize.icon_url;
  switch (prize.reward_type) {
    case 'POINTS': return '\u2B50';
    case 'COINS': return '\uD83D\uDCB0';
    case 'FREE_SPIN': return '\uD83C\uDFB0';
    case 'NO_REWARD': return '\uD83C\uDFB2';
    case 'MANUAL_SERVICE': return '\uD83D\uDCF1';
    case 'VIP_ACCESS': return '\uD83C\uDFC6';
    case 'GRAND_PRIZE': return '\uD83D\uDC8E';
    default: return '\u2B50';
  }
}

function getAdaptiveLayout(prizeCount: number) {
  if (prizeCount <= 6) return { iconSize: 28, labelSize: 22, subSize: 12, showSub: true, showLabel: true };
  if (prizeCount <= 10) return { iconSize: 22, labelSize: 18, subSize: 10, showSub: true, showLabel: true };
  if (prizeCount <= 14) return { iconSize: 18, labelSize: 14, subSize: 9, showSub: false, showLabel: true };
  return { iconSize: 14, labelSize: 11, subSize: 8, showSub: false, showLabel: false };
}

export function WheelRenderer({
  prizes,
  rotation,
  spinning,
  size = 480,
  highlightPrizeKey,
  grandPrizeLocked = false,
}: WheelRendererProps) {
  const layout = useMemo(() => getAdaptiveLayout(prizes.length), [prizes.length]);

  const sectors = useMemo(() => {
    return prizes.map((prize, i) => {
      const angle = prize.sector_angle;
      const startAngle = prizes.slice(0, i).reduce((sum, p) => sum + p.sector_angle, 0);
      const endAngle = startAngle + angle;
      const midAngle = startAngle + angle / 2;

      const [x0, y0] = polar(startAngle, R);
      const [x1, y1] = polar(endAngle, R);
      const largeArc = angle > 180 ? 1 : 0;

      const path = `M${CX} ${CY} L${x0} ${y0} A${R} ${R} 0 ${largeArc} 1 ${x1} ${y1} Z`;

      const [tx, ty] = polar(midAngle, 166);
      const icon = getPrizeIcon(prize);
      const isHighlighted = highlightPrizeKey === prize.prize_key;
      const isLocked = prize.is_grand_prize && grandPrizeLocked;

      return { prize, path, midAngle, tx, ty, icon, isHighlighted, isLocked, startAngle, endAngle };
    });
  }, [prizes, highlightPrizeKey, grandPrizeLocked]);

  const bulbs = useMemo(() => {
    return Array.from({ length: BULB_COUNT }, (_, i) => {
      const angle = (i / BULB_COUNT) * 360;
      return polar(angle, 246);
    });
  }, []);

  const gradientId = useMemo(() => `wheel-grad-${Math.random().toString(36).slice(2, 8)}`, []);

  return (
    <div
      className="relative"
      style={{ width: `min(${size}px, 94vw)`, aspectRatio: '1', maxWidth: '100%' }}
    >
      {/* Pointer */}
      <div
        className="absolute -top-3 left-1/2 z-10"
        style={{ transform: 'translateX(-50%)', filter: 'drop-shadow(0 5px 10px rgba(0,0,0,0.6))' }}
      >
        <svg width="44" height="54" viewBox="0 0 52 62">
          <defs>
            <linearGradient id={`ptr-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fdf0c8" />
              <stop offset="0.5" stopColor="#d9ab4e" />
              <stop offset="1" stopColor="#7c5a13" />
            </linearGradient>
          </defs>
          <path
            d="M26 60 L4 16 A26 26 0 0 1 48 16 Z"
            fill={`url(#ptr-${gradientId})`}
            stroke="#4a3405"
            strokeWidth="1.5"
          />
          <circle cx="26" cy="17" r="7" fill="#fff6dd" />
        </svg>
      </div>

      {/* Wheel SVG */}
      <svg
        viewBox="0 0 520 520"
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          filter: 'drop-shadow(0 20px 36px rgba(0,0,0,0.55))',
        }}
      >
        <defs>
          <radialGradient id={`rim-${gradientId}`} cx="35%" cy="30%">
            <stop offset="0%" stopColor="#ffedb5" />
            <stop offset="45%" stopColor="#cfa04a" />
            <stop offset="75%" stopColor="#6e4f10" />
            <stop offset="100%" stopColor="#a8801f" />
          </radialGradient>
          <radialGradient id={`hub-${gradientId}`} cx="40%" cy="32%">
            <stop offset="0%" stopColor="#3a2a12" />
            <stop offset="100%" stopColor="#100a05" />
          </radialGradient>
          {sectors.map((s, i) => (
            <linearGradient key={`seg-${i}`} id={`seg-${gradientId}-${i}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={s.prize.wheel_color_start} />
              <stop offset="1" stopColor={s.prize.wheel_color_end} />
            </linearGradient>
          ))}
        </defs>

        {/* Outer rim */}
        <circle cx={CX} cy={CY} r="256" fill={`url(#rim-${gradientId})`} />
        <circle cx={CX} cy={CY} r="236" fill="#100a05" />

        {/* Rotor (rotating group) */}
        <g
          style={{
            transform: `rotate(${rotation}deg)`,
            transformOrigin: `${CX}px ${CY}px`,
            transition: spinning ? 'none' : 'transform 0.3s ease',
          }}
        >
          {sectors.map((s, i) => (
            <g key={`sector-${i}`}>
              <path
                d={s.path}
                fill={`url(#seg-${gradientId}-${i})`}
                stroke="rgba(217,171,78,0.55)"
                strokeWidth="1.5"
                opacity={s.isHighlighted ? 1 : 0.95}
              />
              {s.isLocked && (
                <path
                  d={s.path}
                  fill="rgba(10,6,3,0.62)"
                  stroke="#e6455c"
                  strokeWidth="2"
                />
              )}
              {/* Prize content */}
              <g
                transform={`translate(${s.tx},${s.ty}) rotate(${s.midAngle})`}
              >
                <text
                  y={-layout.iconSize * 0.5}
                  textAnchor="middle"
                  fontSize={layout.iconSize}
                >
                  {s.icon}
                </text>
                {layout.showLabel && (
                  <text
                    y={layout.labelSize * 0.4}
                    textAnchor="middle"
                    fontFamily="Lalezar, cursive"
                    fontSize={s.prize.short_label_en.length > 4 ? layout.labelSize * 0.7 : layout.labelSize}
                    fill={s.prize.text_color}
                  >
                    {s.prize.short_label_en || s.prize.name_en}
                  </text>
                )}
                {layout.showSub && (
                  <text
                    y={layout.labelSize * 0.4 + layout.subSize + 4}
                    textAnchor="middle"
                    fontFamily="Tajawal, sans-serif"
                    fontWeight="700"
                    fontSize={layout.subSize}
                    fill={s.prize.text_color}
                    opacity="0.8"
                  >
                    {s.prize.short_label_ar || s.prize.name_ar}
                  </text>
                )}
                {s.isLocked && (
                  <text
                    y={layout.labelSize * 0.4 + 30}
                    textAnchor="middle"
                    fontSize="20"
                  >
                    {'\uD83D\uDD12'}
                  </text>
                )}
              </g>
            </g>
          ))}
        </g>

        {/* Bulbs */}
        <g>
          {bulbs.map(([bx, by], i) => (
            <circle
              key={`bulb-${i}`}
              cx={bx}
              cy={by}
              r="5"
              fill="#fdf0c8"
              className="wheel-bulb"
              style={{
                filter: 'drop-shadow(0 0 6px #d9ab4e)',
                animation: spinning
                  ? `blink 0.26s ${i % 2 ? '0.13s' : '0s'} infinite`
                  : `blink 1.15s ${i % 2 ? '0.57s' : '0s'} infinite`,
              }}
            />
          ))}
        </g>

        {/* Hub */}
        <circle cx={CX} cy={CY} r="84" fill={`url(#rim-${gradientId})`} />
        <circle cx={CX} cy={CY} r="74" fill={`url(#hub-${gradientId})`} stroke="rgba(217,171,78,0.5)" strokeWidth="1.5" />
        <text x={CX} y={CY - 8} textAnchor="middle" fontFamily="Lalezar, cursive" fontSize="32" fill="#f8e7b4">AXIE</text>
        <text x={CX} y={CY + 18} textAnchor="middle" fontFamily="Tajawal, sans-serif" fontWeight="700" fontSize="13" fill="#9c8b6e">Lucky Spin</text>
      </svg>
    </div>
  );
}
