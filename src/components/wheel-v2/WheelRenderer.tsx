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

function getPlaceholderIcon(prize: WheelV2Prize): string {
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

interface AdaptiveLayout {
  iconSize: number;
  labelSize: number;
  subSize: number;
  showSub: boolean;
  showLabel: boolean;
  medallionR: number;
  medallionCenterRadius: number;
}

function getAdaptiveLayout(prizeCount: number, sectorAngle: number): AdaptiveLayout {
  let base: { iconSize: number; labelSize: number; subSize: number; showSub: boolean; showLabel: boolean; medallionR: number };

  if (prizeCount <= 4) {
    base = { iconSize: 30, labelSize: 22, subSize: 12, showSub: true, showLabel: true, medallionR: 42 };
  } else if (prizeCount <= 6) {
    base = { iconSize: 26, labelSize: 20, subSize: 11, showSub: true, showLabel: true, medallionR: 36 };
  } else if (prizeCount <= 10) {
    base = { iconSize: 22, labelSize: 17, subSize: 10, showSub: true, showLabel: true, medallionR: 30 };
  } else if (prizeCount <= 14) {
    base = { iconSize: 18, labelSize: 14, subSize: 9, showSub: false, showLabel: true, medallionR: 24 };
  } else {
    base = { iconSize: 14, labelSize: 11, subSize: 8, showSub: false, showLabel: false, medallionR: 20 };
  }

  // Narrow sector adjustment: if sector angle is very small, reduce medallion and push outward
  const medallionCenterRadius = sectorAngle < 18 ? 200 : 166;

  // For very narrow sectors, use smaller medallion
  if (sectorAngle < 10) {
    base = { ...base, iconSize: base.iconSize * 0.75, medallionR: base.medallionR * 0.7, showLabel: false, showSub: false };
  }

  return { ...base, medallionCenterRadius };
}

export function WheelRenderer({
  prizes,
  rotation,
  spinning,
  size = 480,
  highlightPrizeKey,
  grandPrizeLocked = false,
}: WheelRendererProps) {
  const gradientId = useMemo(() => `wv2-${Math.random().toString(36).slice(2, 8)}`, []);

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

      const layout = getAdaptiveLayout(prizes.length, angle);
      const [tx, ty] = polar(midAngle, layout.medallionCenterRadius);
      const isHighlighted = highlightPrizeKey === prize.prize_key;
      const isLocked = prize.is_grand_prize && grandPrizeLocked;
      const hasIcon = !!(prize.icon_url);
      const placeholder = getPlaceholderIcon(prize);

      return { prize, path, midAngle, startAngle, endAngle, tx, ty, isHighlighted, isLocked, hasIcon, placeholder, layout };
    });
  }, [prizes, highlightPrizeKey, grandPrizeLocked]);

  const bulbs = useMemo(() => {
    return Array.from({ length: BULB_COUNT }, (_, i) => {
      const angle = (i / BULB_COUNT) * 360;
      return polar(angle, 246);
    });
  }, []);

  return (
    <div className="relative" style={{ width: `min(${size}px, 94vw)`, aspectRatio: '1', maxWidth: '100%' }}>
      {/* Pointer */}
      <div className="absolute -top-3 left-1/2 z-10" style={{ transform: 'translateX(-50%)', filter: 'drop-shadow(0 5px 10px rgba(0,0,0,0.6))' }}>
        <svg width="44" height="54" viewBox="0 0 52 62">
          <defs>
            <linearGradient id={`ptr-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fdf0c8" />
              <stop offset="0.5" stopColor="#d9ab4e" />
              <stop offset="1" stopColor="#7c5a13" />
            </linearGradient>
          </defs>
          <path d="M26 60 L4 16 A26 26 0 0 1 48 16 Z" fill={`url(#ptr-${gradientId})`} stroke="#4a3405" strokeWidth="1.5" />
          <circle cx="26" cy="17" r="7" fill="#fff6dd" />
        </svg>
      </div>

      {/* Wheel SVG */}
      <svg viewBox="0 0 520 520" style={{ width: '100%', height: '100%', display: 'block', filter: 'drop-shadow(0 20px 36px rgba(0,0,0,0.55))' }}>
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

        <circle cx={CX} cy={CY} r="256" fill={`url(#rim-${gradientId})`} />
        <circle cx={CX} cy={CY} r="236" fill="#100a05" />

        {/* Rotor */}
        <g style={{ transform: `rotate(${rotation}deg)`, transformOrigin: `${CX}px ${CY}px`, transition: spinning ? 'none' : 'transform 0.3s ease' }}>
          {sectors.map((s, i) => (
            <g key={`sector-${i}`}>
              <path d={s.path} fill={`url(#seg-${gradientId}-${i})`} stroke="rgba(217,171,78,0.55)" strokeWidth="1.5" opacity={s.isHighlighted ? 1 : 0.95} />
              {s.isLocked && <path d={s.path} fill="rgba(10,6,3,0.62)" stroke="#e6455c" strokeWidth="2" />}
              <g transform={`translate(${s.tx},${s.ty}) rotate(${s.midAngle})`}>
                <PrizeMedallion prize={s.prize} layout={s.layout} hasIcon={s.hasIcon} placeholder={s.placeholder} gradientId={`${gradientId}-${i}`} />
                {s.layout.showLabel && (
                  <text y={s.layout.medallionR + s.layout.labelSize * 0.5} textAnchor="middle" fontFamily="Lalezar, cursive"
                    fontSize={s.prize.short_label_en && s.prize.short_label_en.length > 4 ? s.layout.labelSize * 0.7 : s.layout.labelSize}
                    fill={s.prize.text_color}>
                    {s.prize.short_label_en || s.prize.name_en}
                  </text>
                )}
                {s.layout.showSub && s.layout.showLabel && (
                  <text y={s.layout.medallionR + s.layout.labelSize * 0.5 + s.layout.subSize + 4} textAnchor="middle"
                    fontFamily="Tajawal, sans-serif" fontWeight="700" fontSize={s.layout.subSize} fill={s.prize.text_color} opacity="0.8">
                    {s.prize.short_label_ar || s.prize.name_ar}
                  </text>
                )}
                {s.isLocked && <text y={s.layout.medallionR + 30} textAnchor="middle" fontSize="20">{'\uD83D\uDD12'}</text>}
              </g>
            </g>
          ))}
        </g>

        {/* Bulbs */}
        <g>
          {bulbs.map(([bx, by], i) => (
            <circle key={`bulb-${i}`} cx={bx} cy={by} r="5" fill="#fdf0c8" className="wheel-bulb"
              style={{ filter: 'drop-shadow(0 0 6px #d9ab4e)', animation: spinning ? `blink 0.26s ${i % 2 ? '0.13s' : '0s'} infinite` : `blink 1.15s ${i % 2 ? '0.57s' : '0s'} infinite` }} />
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

// ─── PrizeMedallion ─────────────────────────────────────────
interface PrizeMedallionProps {
  prize: WheelV2Prize;
  layout: AdaptiveLayout;
  hasIcon: boolean;
  placeholder: string;
  gradientId: string;
}

function PrizeMedallion({ prize, layout, hasIcon, placeholder, gradientId }: PrizeMedallionProps) {
  const r = layout.medallionR;
  const iconScale = (prize.icon_scale ?? 100) / 100;
  const offsetX = (prize.icon_offset_x ?? 0) * r / 100;
  const offsetY = (prize.icon_offset_y ?? 0) * r / 100;
  const rotation = prize.icon_rotation ?? 0;
  const bgEnabled = prize.icon_background_enabled ?? true;
  const bgStyle = prize.icon_background_style ?? 'radial';
  const bgColor = prize.icon_background_color ?? `radial-gradient(circle at 30% 25%, ${prize.wheel_color_start}, ${prize.wheel_color_end})`;
  const borderColor = prize.icon_border_color ?? prize.wheel_color_end;
  const glowColor = prize.icon_glow_color;
  const glowIntensity = prize.icon_glow_intensity ?? 0;
  const shadowIntensity = prize.icon_shadow_intensity ?? 0;
  const fit = prize.icon_fit ?? 'CONTAIN';

  const iconSize = r * 1.6 * iconScale;
  const filterParts: string[] = [];
  if (glowColor && glowIntensity > 0) {
    filterParts.push(`drop-shadow(0 0 ${glowIntensity * 0.15}px ${glowColor})`);
  }
  if (shadowIntensity > 0) {
    filterParts.push(`drop-shadow(0 ${shadowIntensity * 0.04}px ${shadowIntensity * 0.06}px rgba(0,0,0,0.5))`);
  }
  const filterStr = filterParts.length > 0 ? filterParts.join(' ') : undefined;

  return (
    <g>
      {/* Glow ring */}
      {glowColor && glowIntensity > 0 && (
        <circle r={r + 4} fill="none" stroke={glowColor} strokeWidth="2" opacity={glowIntensity / 100} style={{ filter: 'blur(3px)' }} />
      )}

      {/* Background */}
      {bgEnabled && bgStyle !== 'none' && (
        <>
          {bgStyle === 'radial' ? (
            <circle r={r} fill={`url(#medallion-bg-${gradientId})`} stroke={borderColor} strokeWidth="2" />
          ) : (
            <circle r={r} fill={bgColor || prize.wheel_color_start} stroke={borderColor} strokeWidth="2" />
          )}
        </>
      )}

      {/* Icon or placeholder */}
      {hasIcon && prize.icon_url ? (
        <image
          href={prize.icon_url}
          x={-iconSize / 2 + offsetX}
          y={-iconSize / 2 + offsetY}
          width={iconSize}
          height={iconSize}
          transform={rotation !== 0 ? `rotate(${rotation})` : undefined}
          preserveAspectRatio={fit === 'COVER' ? 'xMidYMid slice' : 'xMidYMid meet'}
          style={filterStr ? { filter: filterStr } : undefined}
        />
      ) : (
        <text
          y={offsetY + layout.iconSize * 0.35}
          x={offsetX}
          textAnchor="middle"
          fontSize={layout.iconSize * iconScale}
          transform={rotation !== 0 ? `rotate(${rotation})` : undefined}
          style={filterStr ? { filter: filterStr } : undefined}
        >
          {placeholder}
        </text>
      )}
    </g>
  );
}
