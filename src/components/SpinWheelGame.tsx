import { useState, useRef, useCallback, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useSpinWheelGame, WheelPrize, PrizeState } from '../hooks/useSpinWheelGame';
import { AlertCircle, X, Crown, Lock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { LiveWinnerFeed } from './LiveWinnerFeed';
import { EventStrip } from './EventStrip';
import { ProgressCenter } from './ProgressCenter';
import { WheelLeaderboard } from './WheelLeaderboard';
import { ComboMeter } from './ComboMeter';
import { BadgeUnlockReveal } from './BadgeUnlockReveal';
import { usePlayerBadges } from '../hooks/usePlayerBadges';
import type { Badge } from '../hooks/usePlayerBadges';

// ─── Wheel geometry (760x760 viewBox) ─────────────────────────────────────────
const CX = 380;
const CY = 380;
const R_OUTER = 334;
const R_INNER = 126;
const SPIN_DURATION_MS = 5200;
const MIN_TURNS = 7;
const MAX_TURNS = 9;

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, rOuter: number, rInner: number, startDeg: number, endDeg: number) {
  const startOuter = polar(cx, cy, rOuter, startDeg);
  const endOuter = polar(cx, cy, rOuter, endDeg);
  const startInner = polar(cx, cy, rInner, endDeg);
  const endInner = polar(cx, cy, rInner, startDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${endOuter.x} ${endOuter.y}`,
    `L ${startInner.x} ${startInner.y}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${endInner.x} ${endInner.y}`,
    'Z',
  ].join(' ');
}

// ─── Rarity mapping ───────────────────────────────────────────────────────────
function rarityForPrize(prize: WheelPrize): string {
  if (prize.type === 'grand') return 'jackpot';
  if (prize.is_strong) return 'epic';
  if (prize.type === 'points') return 'common';
  if (prize.type === 'miss') return 'common';
  return 'rare';
}

const RARITY_LABELS: Record<string, string> = {
  common: 'COMMON',
  rare: 'RARE',
  epic: 'EPIC',
  legendary: 'LEGENDARY',
  jackpot: 'JACKPOT',
};

// ─── SVG icon set (gold-themed, matching new design) ──────────────────────────
function PrizeFallbackIcon({ type, color, size }: { type: string; color: string; size: number }) {
  const base = `width="${size}" height="${size}" aria-hidden="true" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" overflow="visible"`;
  switch (type) {
    case 'grand':
      return <svg viewBox="0 0 32 32" dangerouslySetInnerHTML={{ __html: `<g ${base}><path d="M10 6h12v4c0 4.4-2.6 8-6 8s-6-3.6-6-8V6Z"/><path d="M10 8H6c0 4.4 2.4 6.5 5 7M22 8h4c0 4.4-2.4 6.5-5 7"/><path d="M16 18v4M11 26h10M13 22h6v4h-6z"/></g>` }} />;
    case 'points':
      return <svg viewBox="0 0 32 32" dangerouslySetInnerHTML={{ __html: `<g ${base}><path d="M16 4 6 9v7c0 6 4.5 9.7 10 12 5.5-2.3 10-6 10-12V9L16 4Z"/><path d="M11 18l3-4 2 3 3-5"/><path d="M10.5 23h11"/></g>` }} />;
    case 'miss':
      return <svg viewBox="0 0 32 32" dangerouslySetInnerHTML={{ __html: `<g ${base}><circle cx="9" cy="16" r="2" fill="${color}" stroke="none"/><circle cx="16" cy="16" r="2" fill="${color}" stroke="none"/><circle cx="23" cy="16" r="2" fill="${color}" stroke="none"/></g>` }} />;
    default:
      return <svg viewBox="0 0 32 32" dangerouslySetInnerHTML={{ __html: `<g ${base}><path d="M12 7h8l-1.8 3 3 3c0 8.3-3.2 12-8.2 12S5 21.3 5 13l3-3L12 7Z"/><path d="M13 16.2c1.2-1.3 4.8-1.3 6 0"/><circle cx="16" cy="18" r="3.3"/></g>` }} />;
  }
}

function PrizeIcon({ prize, size = 32 }: { prize: WheelPrize; size?: number }) {
  const [imgErr, setImgErr] = useState(false);
  const url = prize.primary_icon_url;
  if (url && !imgErr) {
    return (
      <img src={url} alt="" width={size} height={size} onError={() => setImgErr(true)}
        style={{ objectFit: 'contain', display: 'block',
          borderRadius: prize.icon_shape === 'circle' ? '50%' : prize.icon_shape === 'rounded' ? '22%' : 2,
          transform: `scale(${Math.min(1.25, Math.max(0.7, prize.icon_scale ?? 1))}) translate(${prize.icon_offset_x ?? 0}px,${prize.icon_offset_y ?? 0}px)`,
        }} />
    );
  }
  return <PrizeFallbackIcon type={prize.type} color={prize.accent_color} size={size} />;
}

function iconHtml(type: string, color: string, size = 32): string {
  const base = `width="${size}" height="${size}" aria-hidden="true" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" overflow="visible"`;
  switch (type) {
    case 'grand':
      return `<svg viewBox="0 0 32 32" ${base}><path d="M10 6h12v4c0 4.4-2.6 8-6 8s-6-3.6-6-8V6Z"/><path d="M10 8H6c0 4.4 2.4 6.5 5 7M22 8h4c0 4.4-2.4 6.5-5 7"/><path d="M16 18v4M11 26h10M13 22h6v4h-6z"/></svg>`;
    case 'points':
      return `<svg viewBox="0 0 32 32" ${base}><path d="M16 4 6 9v7c0 6 4.5 9.7 10 12 5.5-2.3 10-6 10-12V9L16 4Z"/><path d="M11 18l3-4 2 3 3-5"/><path d="M10.5 23h11"/></svg>`;
    case 'service':
    case 'netflix':
    case 'chatgpt':
    case 'tiktok':
    case 'libyana':
      return `<svg viewBox="0 0 32 32" ${base}><path d="M12 7h8l-1.8 3 3 3c0 8.3-3.2 12-8.2 12S5 21.3 5 13l3-3L12 7Z"/><path d="M13 16.2c1.2-1.3 4.8-1.3 6 0"/><circle cx="16" cy="18" r="3.3"/></svg>`;
    case 'miss':
      return `<svg viewBox="0 0 32 32" ${base}><circle cx="9" cy="16" r="2" fill="${color}" stroke="none"/><circle cx="16" cy="16" r="2" fill="${color}" stroke="none"/><circle cx="23" cy="16" r="2" fill="${color}" stroke="none"/></svg>`;
    default:
      return `<svg viewBox="0 0 32 32" ${base}><ellipse cx="16" cy="8" rx="7" ry="3.5"/><path d="M9 8v4c0 2 3.1 3.5 7 3.5s7-1.5 7-3.5V8"/><path d="M9 12v4c0 2 3.1 3.5 7 3.5s7-1.5 7-3.5v-4"/><path d="M9 16v4c0 2 3.1 3.5 7 3.5s7-1.5 7-3.5v-4"/></svg>`;
  }
}

// ─── Sound engine ─────────────────────────────────────────────────────────────
function useSoundEngine() {
  const ctxRef = useRef<AudioContext | null>(null);

  const getContext = useCallback(() => {
    if (!ctxRef.current) {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) ctxRef.current = new AudioCtx();
    }
    return ctxRef.current;
  }, []);

  const tone = useCallback((opts: { frequency?: number; duration?: number; gain?: number; type?: OscillatorType; delay?: number }) => {
    const ctx = getContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const { frequency = 420, duration = 0.04, gain = 0.035, type = 'sine', delay = 0 } = opts;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    const start = ctx.currentTime + delay;
    const end = start + duration;
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    amp.gain.setValueAtTime(gain, start);
    amp.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(start);
    osc.stop(end);
  }, [getContext]);

  return {
    unlock: getContext,
    tick: (intensity = 1) => tone({ frequency: 520 - intensity * 70, duration: 0.025 + intensity * 0.01, gain: 0.018 + intensity * 0.014, type: 'triangle' }),
    start: () => {
      tone({ frequency: 160, duration: 0.12, gain: 0.04, type: 'sine' });
      tone({ frequency: 260, duration: 0.16, gain: 0.025, type: 'triangle', delay: 0.05 });
    },
    win: (rarity = 'common') => {
      const presets: Record<string, number[]> = {
        common: [420, 560],
        rare: [420, 620, 820],
        epic: [330, 520, 780, 980],
        legendary: [390, 590, 790, 1180],
        jackpot: [280, 420, 660, 880, 1320],
      };
      (presets[rarity] || presets.common).forEach((frequency, index) => {
        tone({ frequency, duration: 0.22, gain: 0.035, type: index % 2 ? 'triangle' : 'sine', delay: index * 0.08 });
      });
    },
  };
}

// ─── Wheel SVG ────────────────────────────────────────────────────────────────
function WheelSVG({
  prizes,
  rotation,
  winnerIndex,
  hasWinner,
  rotatorRef,
  prizeStates,
}: {
  prizes: WheelPrize[];
  rotation: number;
  winnerIndex: number | null;
  hasWinner: boolean;
  rotatorRef: React.Ref<SVGGElement>;
  prizeStates?: PrizeState[];
}) {
  const n = prizes.length;
  if (n === 0) return null;
  const slice = 360 / n;

  const sectors = prizes.map((prize, index) => {
    const start = index * slice;
    const end = start + slice;
    const mid = start + slice / 2;
    const iconPos = polar(CX, CY, 232, mid);
    const labelPos = polar(CX, CY, 164, mid);
    const labelColor = index % 2 === 0 ? '#2a1909' : '#f6e9cf';
    const fill = index % 2 === 0 ? 'url(#sectorGold)' : 'url(#sectorDark)';
    const isWinner = winnerIndex === index && hasWinner;
    const rarity = rarityForPrize(prize);
    const mode = prize.availability_mode ?? 'ALWAYS_ACTIVE';
    const state = prizeStates?.find(s => s.prize_id === prize.id);
    const isLocked = mode === 'LOCKED_BY_GOAL' && state && !state.is_unlocked;
    const isExhausted = (mode === 'LIMITED_STOCK' && state && state.current_stock !== null && state.current_stock <= 0)
      || (mode === 'LIMITED_WINNERS' && state && prize.max_winners && state.total_winners >= prize.max_winners);
    const isScheduledInactive = mode === 'SCHEDULED' && prize.starts_at && prize.ends_at
      && (new Date() < new Date(prize.starts_at) || new Date() > new Date(prize.ends_at));
    const showOverlay = isLocked || isExhausted || isScheduledInactive;

    return (
      <g
        key={prize.id}
        className={`wheel-sector rarity-${rarity} ${isWinner ? 'is-winner' : ''}`}
        data-index={index}
        data-prize-id={prize.id}
      >
        <path
          className="sector-face"
          d={arcPath(CX, CY, R_OUTER, R_INNER, start, end)}
          fill={fill}
          stroke="rgba(82,57,32,.55)"
          strokeWidth="2"
        />
        <path
          d={arcPath(CX, CY, R_OUTER - 12, R_INNER + 12, start + 0.6, end - 0.6)}
          fill="none"
          stroke="rgba(255,255,255,.05)"
          strokeWidth="2"
        />
        <g className="sector-icon" transform={`translate(${iconPos.x} ${iconPos.y})`}>
          <circle r="40" fill="url(#medallionBase)" stroke={prize.accent_color} strokeWidth="2.4" />
          <circle r="31" fill="rgba(12,8,5,.58)" stroke="rgba(255,255,255,.09)" strokeWidth="1.2" />
          {prize.primary_icon_url ? (
            <image
              href={prize.primary_icon_url}
              x={-22} y={-22} width={44} height={44}
              preserveAspectRatio="xMidYMid meet"
              clipPath="url(#segmentIconClip)"
            />
          ) : (
            <g transform="translate(-19 -19) scale(1.18)" style={{ color: prize.accent_color }} dangerouslySetInnerHTML={{ __html: iconHtml(prize.type, prize.accent_color) }} />
          )}
        </g>
        <g transform={`translate(${labelPos.x} ${labelPos.y})`}>
          <text
            textAnchor="middle"
            dominantBaseline="middle"
            direction="rtl"
            unicodeBidi="plaintext"
            fill={labelColor}
            fontFamily="'Playpen Sans Arabic', system-ui, sans-serif"
            fontSize="16"
            fontWeight="700"
          >
            {prize.short_label || (prize.name_ar.length > 8 ? prize.name_ar.slice(0, 8) : prize.name_ar)}
          </text>
        </g>
        {showOverlay && (
          <g>
            <path
              d={arcPath(CX, CY, R_OUTER, R_INNER, start, end)}
              fill="rgba(0,0,0,0.55)"
              style={{ pointerEvents: 'none' }}
            />
            <g transform={`translate(${iconPos.x} ${iconPos.y})`}>
              {isLocked ? (
                <g>
                  <rect x={-14} y={-14} width={28} height={28} rx={6}
                    fill="rgba(0,0,0,0.7)" stroke="#f59e0b" strokeWidth="1.5" />
                  <path d="M-5 2V-2a5 5 0 0 1 10 0v4" fill="none" stroke="#f59e0b" strokeWidth="1.8" strokeLinecap="round" />
                  <rect x={-6} y={2} width={12} height={9} rx={2} fill="#f59e0b" opacity={0.9} />
                </g>
              ) : isExhausted ? (
                <g>
                  <rect x={-14} y={-14} width={28} height={28} rx={6}
                    fill="rgba(0,0,0,0.7)" stroke="#ef4444" strokeWidth="1.5" />
                  <line x1={-6} y1={-6} x2={6} y2={6} stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
                  <line x1={6} y1={-6} x2={-6} y2={6} stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
                </g>
              ) : (
                <g>
                  <rect x={-14} y={-14} width={28} height={28} rx={6}
                    fill="rgba(0,0,0,0.7)" stroke="#60a5fa" strokeWidth="1.5" />
                  <circle cx={0} cy={0} r={7} fill="none" stroke="#60a5fa" strokeWidth="1.8" />
                  <path d="M0 -4V1L3 3" fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round" />
                </g>
              )}
            </g>
          </g>
        )}
      </g>
    );
  });

  return (
    <svg viewBox="0 0 760 760" className="w-full h-full" id="wheelSvg">
      <defs>
        <radialGradient id="outerGlow" cx="50%" cy="45%" r="65%">
          <stop offset="0%" stopColor="#fce8c5" stopOpacity=".22" />
          <stop offset="55%" stopColor="#ce9353" stopOpacity=".12" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="rimGold" x1="0" x2="1">
          <stop offset="0%" stopColor="#6c421d" />
          <stop offset="14%" stopColor="#e8c28a" />
          <stop offset="50%" stopColor="#9d6833" />
          <stop offset="86%" stopColor="#f6dfb7" />
          <stop offset="100%" stopColor="#6b431d" />
        </linearGradient>
        <linearGradient id="innerRim" x1="0" x2="1">
          <stop offset="0%" stopColor="#7d5027" />
          <stop offset="50%" stopColor="#f4d8af" />
          <stop offset="100%" stopColor="#6f461f" />
        </linearGradient>
        <linearGradient id="sectorGold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f2e1bf" />
          <stop offset="55%" stopColor="#d8ba8e" />
          <stop offset="100%" stopColor="#b98d57" />
        </linearGradient>
        <linearGradient id="sectorDark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2a1a11" />
          <stop offset="55%" stopColor="#17100b" />
          <stop offset="100%" stopColor="#3b2617" />
        </linearGradient>
        <radialGradient id="medallionBase" cx="32%" cy="28%" r="70%">
          <stop offset="0%" stopColor="#f9e4c0" stopOpacity=".38" />
          <stop offset="55%" stopColor="#85562d" stopOpacity=".25" />
          <stop offset="100%" stopColor="#1c120b" stopOpacity=".9" />
        </radialGradient>
        <radialGradient id="centerGlow" cx="32%" cy="28%" r="70%">
          <stop offset="0%" stopColor="#fbe6c3" />
          <stop offset="52%" stopColor="#bf8a4d" />
          <stop offset="100%" stopColor="#2d1a0d" />
        </radialGradient>
        <filter id="winnerGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="8" result="blur" />
          <feColorMatrix in="blur" type="matrix" values="1 0 0 0 .95  0 1 0 0 .65  0 0 1 0 .25  0 0 0 1.1 0" result="goldBlur" />
          <feMerge><feMergeNode in="goldBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="sectorShadow" x="-5%" y="-5%" width="110%" height="110%">
          <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="rgba(0,0,0,.35)" />
        </filter>
        <clipPath id="segmentIconClip">
          <circle cx="0" cy="0" r="29" />
        </clipPath>
        <linearGradient id="rimHighlight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="rgba(255,250,230,.38)" />
          <stop offset="40%"  stopColor="rgba(255,220,150,.12)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </linearGradient>
      </defs>

      <circle cx={CX} cy={CY} r="356" fill="url(#outerGlow)" opacity=".9" />
      <circle cx={CX} cy={CY} r="348" fill="#120b07" stroke="url(#rimGold)" strokeWidth="8" />
      <circle cx={CX} cy={CY} r="338" fill="#170f0a" stroke="rgba(255,255,255,.04)" strokeWidth="1.4" />
      <circle cx={CX} cy={CY} r={R_OUTER} fill="none" stroke="url(#rimGold)" strokeWidth="12" />
      <circle cx={CX} cy={CY} r="314" fill="#120c08" stroke="url(#innerRim)" strokeWidth="2" />
      {/* Rim specular highlight — static, gives depth */}
      <path
        d={`M ${polar(380,380,344,-52).x} ${polar(380,380,344,-52).y} A 344 344 0 0 1 ${polar(380,380,344,52).x} ${polar(380,380,344,52).y}`}
        fill="none"
        stroke="rgba(255,248,220,.28)"
        strokeWidth="7"
        strokeLinecap="round"
      />

      {/* ROTATING layer — sectors only */}
      <g
        id="wheelRotator"
        ref={rotatorRef}
        style={{
          transform: `rotate(${rotation}deg)`,
          transformOrigin: `${CX}px ${CY}px`,
        }}
      >
        {sectors}
        {/* Rotating dot ring (decorative, part of the wheel face) */}
        {Array.from({ length: 22 }, (_, i) => {
          const dot = polar(CX, CY, 122, i * (360 / 22));
          return <circle key={i} cx={dot.x} cy={dot.y} r="4.8" fill="#f4d7a6" opacity=".88" />;
        })}
      </g>

      {/* STATIC center hub — never rotates */}
      <g id="wheelCenterHub" style={{ pointerEvents: 'none' }}>
        <circle cx={CX} cy={CY} r="129" fill="#0c0806" stroke="url(#innerRim)" strokeWidth="8" />
        <circle cx={CX} cy={CY} r="114" fill="#140d08" stroke="rgba(255,255,255,.08)" strokeWidth="1.2" />
        <circle cx={CX} cy={CY} r="92" fill="url(#centerGlow)" />
        <circle cx={CX} cy={CY} r="86" fill="#24170d" stroke="rgba(255,255,255,.08)" strokeWidth="1.2" />
        <text x={CX} y="370" textAnchor="middle" fill="#f3ddba" fontFamily="'Playpen Sans Arabic', system-ui, sans-serif" fontSize="34" fontWeight="800">AXIE</text>
        <text x={CX} y="400" textAnchor="middle" fill="#b48a58" fontFamily="'Playpen Sans Arabic', system-ui, sans-serif" fontSize="14" fontWeight="700">Lucky Spin</text>
      </g>
    </svg>
  );
}

// ─── Rivets ───────────────────────────────────────────────────────────────────
function WheelRivets() {
  return (
    <div className="wheel-rivets">
      {Array.from({ length: 32 }, (_, index) => {
        const deg = (360 / 32) * index;
        return <span key={index} style={{ ['--deg' as any]: `${deg}deg` }} />;
      })}
    </div>
  );
}

// ─── Winner reveal modal ──────────────────────────────────────────────────────
function WinnerReveal({
  prize,
  onClose,
  language,
  fulfillmentCase,
  onOpenCase,
}: {
  prize: WheelPrize;
  onClose: () => void;
  language: string;
  fulfillmentCase?: { caseId: string; threadId: string; caseCode: string } | null;
  onOpenCase?: (caseId: string) => void;
}) {
  const rarity = rarityForPrize(prize);
  const isMiss = prize.type === 'miss';
  const isManual = fulfillmentCase != null;

  return (
    <section
      className="winner-reveal is-visible"
      data-rarity={rarity}
      aria-hidden="false"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'grid', placeItems: 'center', padding: '20px',
      }}
    >
      <div
        className="winner-backdrop"
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(5,3,2,.76)', backdropFilter: 'blur(10px) saturate(.8)' }}
      />
      <article
        className="winner-card"
        role="dialog"
        aria-modal="true"
        style={{
          position: 'relative',
          width: 'min(460px, calc(100vw - 28px))',
          padding: '34px 30px 28px',
          borderRadius: '32px',
          textAlign: 'center',
          overflow: 'hidden',
          background: 'linear-gradient(180deg, rgba(36,25,16,.98), rgba(15,10,7,.99))',
          border: '1px solid rgba(229,189,122,.42)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,.08), 0 45px 120px rgba(0,0,0,.62), 0 0 80px rgba(229,189,122,.12)',
        }}
      >
        <button
          onClick={onClose}
          className="winner-close"
          aria-label={language === 'ar' ? 'إغلاق' : 'Close'}
          style={{
            position: 'absolute', top: '16px', insetInlineEnd: '16px',
            width: '36px', height: '36px', borderRadius: '50%',
            border: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.03)',
            color: '#d7b991', fontSize: '24px', lineHeight: 1,
          }}
        >
          ×
        </button>

        <div
          className="result-orb"
          style={{
            width: '112px', height: '112px', margin: '8px auto 14px',
            borderRadius: '50%', display: 'grid', placeItems: 'center',
            background: `radial-gradient(circle at 34% 28%, rgba(255,255,255,.22), transparent 26%), radial-gradient(circle, ${prize.accent_color}38, #160e08 72%)`,
            border: `1px solid ${prize.accent_color}88`,
            boxShadow: `inset 0 0 0 8px rgba(255,255,255,.025), 0 18px 40px rgba(0,0,0,.28), 0 0 34px ${prize.accent_color}30`,
            color: prize.accent_color,
          }}
        >
          <PrizeIcon prize={prize} size={54} />
        </div>

        <span
          className="winner-rarity"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            minHeight: '28px', padding: '4px 12px', borderRadius: '999px',
            color: prize.accent_color, background: `${prize.accent_color}18`,
            border: `1px solid ${prize.accent_color}40`,
            fontFamily: 'system-ui, sans-serif', fontSize: '11px',
            letterSpacing: '.14em', fontWeight: 800,
          }}
        >
          {RARITY_LABELS[rarity] || RARITY_LABELS.common}
        </span>

        <h3 style={{ margin: '12px 0 4px', fontSize: '34px', color: '#f9ead4' }}>
          {isMiss ? (language === 'ar' ? 'حظ أوفر' : 'Better Luck') : (language === 'ar' ? 'مبروك' : 'Congratulations')}
        </h3>
        <p style={{ margin: 0, fontSize: '22px', color: prize.accent_color, fontWeight: 700 }}>
          {isMiss
            ? (language === 'ar' ? 'المحاولة القادمة ممكن تكون هي الرابحة' : 'Next time could be the winning one')
            : (language === 'ar' ? `ربحت ${prize.name_ar}` : `You won ${prize.name_en}`)}
        </p>
        <div className="winner-meta" style={{ marginTop: '8px', color: '#bc9a72', fontSize: '14px' }}>
          {isMiss
            ? (language === 'ar' ? 'جرّب مرة ثانية' : 'Try again')
            : isManual
            ? (language === 'ar' ? 'هذه الجائزة تحتاج إلى تسليم من فريق أكسي' : 'This prize requires manual delivery by AXIE team')
            : prize.value}
        </div>

        {isManual && fulfillmentCase && (
          <div style={{
            marginTop: '14px', padding: '10px 16px', borderRadius: '12px',
            background: 'rgba(214,170,98,0.08)', border: '1px solid rgba(214,170,98,0.2)',
            fontSize: '13px', color: '#bc9a72', textAlign: 'center',
          }}>
            <div style={{ fontFamily: 'monospace', color: '#D6AA62', fontWeight: 700 }}>
              {fulfillmentCase.caseCode || 'AX-CASE'}
            </div>
            <div style={{ marginTop: '4px', fontSize: '12px' }}>
              {language === 'ar' ? 'تم فتح محادثة خاصة لمتابعة التسليم' : 'A private conversation was opened for delivery tracking'}
            </div>
          </div>
        )}

        {isManual && onOpenCase && fulfillmentCase ? (
          <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
            <button
              onClick={() => { onOpenCase(fulfillmentCase.caseId); onClose(); }}
              className="dialog-btn"
              style={{
                flex: 2, padding: '14px 16px', borderRadius: '999px', fontWeight: 800,
                background: 'linear-gradient(180deg, #f3d8af, #cb965c)', color: '#2a1707',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,.42)',
                border: '1px solid rgba(255,235,203,.14)',
              }}
            >
              {language === 'ar' ? 'فتح محادثة الجائزة' : 'Open Prize Chat'}
            </button>
            <button onClick={onClose}
              style={{
                flex: 1, padding: '14px 16px', borderRadius: '999px', fontWeight: 700,
                background: 'rgba(255,255,255,0.05)', color: '#bc9a72',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              {language === 'ar' ? 'لاحقاً' : 'Later'}
            </button>
          </div>
        ) : (
          <button
            onClick={onClose}
            className="dialog-btn"
            style={{
              width: '100%', marginTop: '24px', padding: '14px 22px',
              borderRadius: '999px', fontWeight: 800,
              background: 'linear-gradient(180deg, #f3d8af, #cb965c)',
              color: '#2a1707',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,.42), 0 14px 28px rgba(0,0,0,.22)',
              border: '1px solid rgba(255,235,203,.14)',
            }}
          >
            {language === 'ar' ? 'رائع' : 'Awesome'}
          </button>
        )}
      </article>
    </section>
  );
}

// ─── History slot ─────────────────────────────────────────────────────────────
function HistorySlot({ prize }: { prize: WheelPrize | null }) {
  if (!prize) {
    return (
      <div
        className="history-item empty"
        style={{
          width: '58px', height: '58px', borderRadius: '14px',
          border: '1px solid rgba(235,197,131,.22)',
          background: 'linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.01))',
          display: 'grid', placeItems: 'center', color: '#9a744c', fontSize: '26px',
        }}
      >
        +
      </div>
    );
  }
  const rarity = rarityForPrize(prize);
  return (
    <div
      className={`history-item rarity-${rarity}`}
      style={{
        width: '58px', height: '58px', borderRadius: '14px',
        border: `1px solid ${prize.accent_color}38`,
        background: 'linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.01))',
        display: 'grid', placeItems: 'center', color: prize.accent_color,
        boxShadow: `inset 0 0 0 1px ${prize.accent_color}10`,
      }}
    >
      <PrizeIcon prize={prize} size={28} />
    </div>
  );
}

// ─── Prize list item ──────────────────────────────────────────────────────────
function PrizeListItem({ prize, language, prizeState }: { prize: WheelPrize; language: string; prizeState?: PrizeState }) {
  const rarity = rarityForPrize(prize);
  const isGrand = prize.type === 'grand';
  return (
    <div
      className={`prize-item rarity-${rarity} ${isGrand ? 'is-grand' : ''}`}
      style={{
        display: 'grid', gridTemplateColumns: '1fr auto 10px', alignItems: 'center',
        gap: '14px', padding: '14px 16px', borderRadius: '20px',
        border: `1px solid ${prize.accent_color}28`,
        background: `linear-gradient(135deg, ${prize.accent_color}06, rgba(255,255,255,.012))`,
        color: prize.accent_color,
        cursor: 'default',
      }}
    >
      <div className="prize-item__copy">
        <strong style={{ display: 'block', fontSize: '19px', color: '#f3e1c4' }}>
          {language === 'ar' ? prize.name_ar : prize.name_en}
        </strong>
        <small style={{ display: 'block', color: '#c5a17b', fontSize: '13px' }}>
          {prize.value}
        </small>
        {prize.availability_mode === 'LOCKED_BY_GOAL' && prizeState && !prizeState.is_unlocked && (
          <div className="mt-1.5">
            <div className="flex items-center gap-1.5 mb-1">
              <Lock className="w-3 h-3" style={{ color: '#f59e0b' }} />
              <span style={{ fontSize: '10px', color: '#f59e0b', fontWeight: 700 }}>
                {prizeState.current_progress}/{prize.unlock_target_value ?? 0}
              </span>
            </div>
            <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)', width: '100%' }}>
              <div className="h-full rounded-full" style={{
                width: `${Math.min(100, ((prizeState.current_progress || 0) / (prize.unlock_target_value || 1)) * 100)}%`,
                background: '#f59e0b',
              }} />
            </div>
          </div>
        )}
      </div>
      <div
        className="prize-item__medallion"
        style={{
          width: '56px', height: '56px', borderRadius: '50%',
          display: 'grid', placeItems: 'center',
          background: 'radial-gradient(circle at 30% 28%, rgba(255,255,255,.22), rgba(255,255,255,.02) 45%, rgba(0,0,0,.15))',
          border: '1px solid rgba(255,255,255,.1)',
          boxShadow: 'inset 0 0 0 6px rgba(255,255,255,.02), 0 8px 18px rgba(0,0,0,.25)',
        }}
      >
        <PrizeIcon prize={prize} size={34} />
      </div>
      <i
        className="prize-item__dot"
        style={{ width: '10px', height: '10px', borderRadius: '50%', background: prize.accent_color, boxShadow: `0 0 10px ${prize.accent_color}` }}
      />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function SpinWheelGame({ onOpenMyPrizes, onNavigate }: { onOpenMyPrizes?: (caseId?: string) => void; onNavigate?: (page: string) => void } = {}) {
  const { language } = useLanguage();
  const { user } = useAuth();
  const {
    settings,
    loading,
    spinning,
    freeSpinsLeft,
    canSpin,
    history,
    lastWin,
    error,
    doSpin,
    commitSpin,
    clearLastWin,
    lastFulfillmentCase,
    prizeStates,
  } = useSpinWheelGame();

  const onOpenPrizeCase = (caseId: string) => {
    if (onOpenMyPrizes) onOpenMyPrizes(caseId);
  };

  const [rotation, setRotation] = useState(0);
  const [winnerIndex, setWinnerIndex] = useState<number | null>(null);
  const [hasWinner, setHasWinner] = useState(false);
  const [gameState, setGameState] = useState<'ready' | 'spinning' | 'slowing' | 'revealing' | 'result'>('ready');
  const [showWinner, setShowWinner] = useState(false);
  const [winPrize, setWinPrize] = useState<WheelPrize | null>(null);
  const [particles, setParticles] = useState<Array<{ id: number; x: string; delay: string; duration: string; drift: string; size: string; rarity: string }>>([]);
  const [showProgressCenter, setShowProgressCenter] = useState(false);
  const [comboWins, setComboWins] = useState(0);
  const [comboMultiplier, setComboMultiplier] = useState(1.0);
  const [badgeQueue, setBadgeQueue] = useState<Badge[]>([]);
  const { badges: playerBadges, refresh: refreshBadges } = usePlayerBadges();

  const rotationRef = useRef(0);
  const animFrameRef = useRef<number | null>(null);
  const prevUnlockedIdsRef = useRef<Set<string>>(new Set());
  const gameStateRef = useRef<'ready' | 'spinning' | 'slowing' | 'revealing' | 'result'>('ready');
  const rotatorRef = useRef<SVGGElement>(null);
  const sound = useSoundEngine();

  // Keep gameStateRef in sync
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  // Detect newly unlocked badges and queue reveal
  useEffect(() => {
    if (prevUnlockedIdsRef.current.size === 0) return;
    const newlyUnlocked = playerBadges.filter(
      b => b.unlocked && !prevUnlockedIdsRef.current.has(b.id)
    );
    if (newlyUnlocked.length > 0) {
      setBadgeQueue(prev => [...prev, ...newlyUnlocked]);
      prevUnlockedIdsRef.current = new Set();
    }
  }, [playerBadges]);

  // Apply rotation directly to the DOM <g> element for smooth 60fps animation
  const applyRotation = useCallback((deg: number) => {
    rotationRef.current = deg;
    if (rotatorRef.current) {
      rotatorRef.current.style.transform = `rotate(${deg}deg)`;
    }
  }, []);

  // Inject the wheel CSS once
  useEffect(() => {
    const styleId = 'axie-wheel-styles';
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      /* ── Idle ambient ── */
      @keyframes rim-sweep {
        0%   { stroke-dashoffset: 1000; opacity: 0; }
        8%   { opacity: .72; }
        55%  { opacity: .24; }
        100% { stroke-dashoffset: -1000; opacity: 0; }
      }
      @keyframes wheel-glow-pulse {
        0%,100% { opacity: 0; transform: translate(-50%,-50%) scale(.82); }
        50%     { opacity: 1; transform: translate(-50%,-50%) scale(1.04); }
      }
      @keyframes pointer-glow-idle {
        0%,100% { opacity: .18; filter: blur(6px); }
        50%     { opacity: .44; filter: blur(10px); }
      }
      @keyframes btn-breathe {
        0%,100% { box-shadow: 0 18px 40px rgba(0,0,0,.26), inset 0 2px 0 rgba(255,255,255,.4), 0 0 0 0 rgba(248,223,183,0); }
        50%     { box-shadow: 0 22px 48px rgba(0,0,0,.32), inset 0 2px 0 rgba(255,255,255,.5), 0 0 28px 4px rgba(248,223,183,.14); }
      }
      @keyframes btn-shimmer {
        0%   { background-position: -200% center; }
        100% { background-position: 200% center; }
      }
      /* ── Pointer tick ── */
      @keyframes pointer-tick {
        0%   { transform: translateX(-50%) rotate(0deg) scaleY(1); }
        18%  { transform: translateX(-50%) rotate(8deg) scaleY(.96); }
        52%  { transform: translateX(-50%) rotate(-3deg) scaleY(1.02); }
        78%  { transform: translateX(-50%) rotate(1.5deg) scaleY(.99); }
        100% { transform: translateX(-50%) rotate(0deg) scaleY(1); }
      }
      /* ── Win FX ── */
      @keyframes winner-rays { to { transform: rotate(360deg); } }
      @keyframes halo-pulse   { to { transform: translateX(-50%) scale(1.14); opacity: .72; } }
      @keyframes particle-rise {
        0%   { opacity: 0; transform: translate3d(0, 20px, 0) scale(.6); }
        14%  { opacity: .95; }
        100% { opacity: 0; transform: translate3d(var(--drift), -420px, 0) scale(1.25); }
      }
      @keyframes beam-breathe {
        from { filter: blur(2px) brightness(.96); }
        to   { filter: blur(4px) brightness(1.22); }
      }
      @keyframes winner-icon-pulse {
        from { transform-box: fill-box; transform-origin: center; scale: 1; }
        to   { transform-box: fill-box; transform-origin: center; scale: 1.1; }
      }
      @keyframes spin-loader { to { transform: rotate(360deg); } }
      @keyframes card-reveal {
        from { opacity: 0; transform: translateY(8px) scale(.97); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }

      /* ── Wheel sector transitions ── */
      .axie-wheel .wheel-sector { transition: opacity .55s ease, filter .55s ease; }
      .axie-wheel .wheel.has-winner .wheel-sector:not(.is-winner) { opacity: .28; filter: saturate(.4) brightness(.65); }
      .axie-wheel .wheel.has-winner .wheel-sector.is-winner        { opacity: 1; filter: url(#winnerGlow) brightness(1.16) saturate(1.2); }
      .axie-wheel .wheel.has-winner .wheel-sector.is-winner .sector-icon { animation: winner-icon-pulse .72s ease-in-out infinite alternate; }

      /* ── Rivets ── */
      .axie-wheel .wheel-rivets { position: absolute; inset: 0; border-radius: 50%; pointer-events: none; }
      .axie-wheel .wheel-rivets span {
        --size: 10px; position: absolute; left: 50%; top: 50%;
        width: var(--size); height: var(--size); border-radius: 50%;
        background: radial-gradient(circle at 28% 28%, #fff4e2, #c69254 60%, #7b4d27);
        box-shadow: 0 0 10px rgba(244,210,150,.3);
        transform: translate(-50%, -50%) rotate(var(--deg)) translateY(-50.5%);
        transition: box-shadow .3s ease;
      }

      /* ── Pointer ── */
      .axie-wheel .pointer--top { transition: filter .2s ease; }
      .axie-wheel .pointer--top.is-ticking {
        animation: pointer-tick .18s cubic-bezier(.15,.85,.2,1.1);
      }
      .axie-wheel .pointer-glow {
        position: absolute; top: 40px; left: 50%; transform: translateX(-50%);
        width: 48px; height: 32px; border-radius: 50%;
        background: radial-gradient(ellipse, rgba(248,224,175,.55), transparent 70%);
        pointer-events: none; z-index: 19;
        animation: pointer-glow-idle 3.2s ease-in-out infinite;
      }

      /* ── Idle glow ring ── */
      .axie-wheel .idle-glow {
        position: absolute; left: 50%; top: 50%;
        width: 102%; height: 102%;
        border-radius: 50%; pointer-events: none; z-index: 6;
        background: radial-gradient(circle, rgba(245,210,150,.22) 0%, rgba(196,142,72,.06) 48%, transparent 68%);
        animation: wheel-glow-pulse 5.5s ease-in-out infinite;
      }
      .axie-wheel .idle-glow.is-spinning { animation: none; opacity: 0; }

      /* ── Metallic rim sweep (SVG overlay) ── */
      .axie-wheel .rim-sweep-arc {
        stroke-dasharray: 220 1200;
        animation: rim-sweep 5.5s ease-in-out infinite;
        animation-delay: .6s;
      }

      /* ── Win beam ── */
      .axie-wheel .win-beam {
        position: absolute; left: 50%; top: 50%;
        width: min(44%, 340px); height: min(44%, 340px);
        border-radius: 50%; transform: translate(-50%, -50%) scale(.7);
        opacity: 0; z-index: 7; pointer-events: none;
        background: radial-gradient(circle, rgba(245,214,163,.28), rgba(202,145,75,.09) 42%, transparent 70%);
        filter: blur(3px);
        transition: opacity .42s ease, transform .52s cubic-bezier(.2,.8,.2,1);
      }
      .axie-wheel .win-beam.is-active {
        opacity: 1; transform: translate(-50%, -50%) scale(1.3);
        animation: beam-breathe 1s ease-in-out infinite alternate;
      }

      /* ── FX particles ── */
      .axie-wheel .fx-particle {
        position: absolute; left: var(--x); bottom: 15%;
        width: var(--size); height: var(--size); border-radius: 50%;
        opacity: 0; background: #f3d3a3; box-shadow: 0 0 14px currentColor;
        animation: particle-rise var(--duration) ease-out var(--delay) forwards;
      }

      /* ── Spin loader ── */
      .axie-wheel .spin-loader {
        width: 18px; height: 18px; display: inline-block; vertical-align: middle;
        margin-inline-end: 8px; border: 2px solid rgba(42,23,7,.22);
        border-top-color: #2a1707; border-radius: 50%;
        animation: spin-loader .65s linear infinite;
      }

      /* ── Spin button ── */
      .axie-wheel .spin-btn-idle {
        animation: btn-breathe 3.8s ease-in-out infinite;
      }
      .axie-wheel .spin-btn-idle::after {
        content: ''; position: absolute; inset: 0; border-radius: inherit;
        background: linear-gradient(105deg, transparent 30%, rgba(255,255,255,.18) 50%, transparent 70%);
        background-size: 200% 100%;
        animation: btn-shimmer 4.2s ease-in-out infinite;
        pointer-events: none;
      }

      /* ── Prize list item hover ── */
      .axie-wheel .prize-item {
        transition: transform .22s cubic-bezier(.2,.8,.2,1), box-shadow .22s ease, border-color .22s ease;
      }
      .axie-wheel .prize-item:hover {
        transform: translateX(-3px);
        box-shadow: 4px 0 20px rgba(0,0,0,.22);
      }

      /* ── History slot hover ── */
      .axie-wheel .history-item {
        transition: transform .18s ease, box-shadow .18s ease;
      }
      .axie-wheel .history-item:not(.empty):hover {
        transform: scale(1.12) translateY(-2px);
        box-shadow: 0 6px 18px rgba(0,0,0,.28);
      }

      /* ── Winner card ── */
      .axie-wheel .winner-reveal { transition: opacity .3s ease, visibility .3s ease; }
      .axie-wheel .winner-card   {
        animation: card-reveal .46s cubic-bezier(.18,.86,.24,1.08) forwards;
        transition: transform .45s cubic-bezier(.18,.86,.24,1.12), opacity .32s ease;
      }
    `;
    document.head.appendChild(style);
    return () => { /* keep styles for remounts */ };
  }, []);

  const spinEase = (t: number) => {
    // Smooth cubic ease-in over first 9% then very slow exponential ease-out
    // giving a natural heavy-flywheel feel at the end
    const accelEnd = 0.09;
    if (t <= accelEnd) {
      const u = t / accelEnd;
      return 0.052 * u * u * u;              // cubic ease-in — smooth launch
    }
    const u = (t - accelEnd) / (1 - accelEnd);
    // Quint ease-out: exponent 5 makes the tail much longer/heavier
    return 0.052 + 0.948 * (1 - Math.pow(1 - u, 5.2));
  };

  const animateWheelTo = useCallback((targetRotation: number, onTick: (progress: number) => void) => {
    return new Promise<void>((resolve) => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

      const startRotation = rotationRef.current;
      const delta = targetRotation - startRotation;
      const startTime = performance.now();
      const stepAngle = 360 / (settings.prizes.length || 1);
      let lastBoundary = Math.floor(startRotation / stepAngle);
      let slowingSet = false;

      const frame = (now: number) => {
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / SPIN_DURATION_MS);
        const eased = spinEase(t);
        const current = startRotation + delta * eased;

        // Apply directly to DOM — no React re-render per frame
        applyRotation(current);

        const boundary = Math.floor(current / stepAngle);
        if (boundary !== lastBoundary) {
          onTick(t);
          lastBoundary = boundary;
          // Tick the pointer DOM element directly (no React re-render)
          const ptr = document.querySelector('.axie-wheel .pointer--top') as HTMLElement | null;
          if (ptr) {
            ptr.classList.remove('is-ticking');
            void ptr.offsetWidth; // force reflow to restart animation
            ptr.classList.add('is-ticking');
          }
        }

        if (t > 0.64 && !slowingSet && gameStateRef.current === 'spinning') {
          slowingSet = true;
          setGameState('slowing');
        }

        if (t < 1) {
          animFrameRef.current = requestAnimationFrame(frame);
        } else {
          applyRotation(targetRotation);
          setRotation(targetRotation); // sync React state for winner highlight
          animFrameRef.current = null;
          resolve();
        }
      };

      animFrameRef.current = requestAnimationFrame(frame);
    });
  }, [settings.prizes.length, applyRotation]);

  const handleSpin = useCallback(async () => {
    if (!canSpin || spinning || gameState !== 'ready') return;

    sound.unlock();
    setHasWinner(false);
    setWinnerIndex(null);
    setGameState('spinning');

    const result = await doSpin();
    if (!result) {
      setGameState('ready');
      return;
    }

    const { prizeIndex, prize } = result;
    const n = settings.prizes.length;
    const slice = 360 / n;
    const centerAngle = prizeIndex * slice + slice / 2;
    const safePad = slice * 0.22;
    const randomOffset = (Math.random() - 0.5) * (slice - safePad * 2);
    const desiredAngle = centerAngle + randomOffset;

    const current = ((rotationRef.current % 360) + 360) % 360;
    const targetMod = ((0 - desiredAngle) % 360 + 360) % 360;
    const delta = ((targetMod - current) % 360 + 360) % 360;
    const fullTurns = MIN_TURNS + Math.floor(Math.random() * (MAX_TURNS - MIN_TURNS + 1));
    const finalRotation = rotationRef.current + fullTurns * 360 + delta;

    // NOTE: do NOT update rotationRef here — animateWheelTo reads it as the start
    sound.start();

    await animateWheelTo(finalRotation, (progress) => {
      sound.tick(progress > 0.78 ? 1 : progress > 0.48 ? 0.65 : 0.35);
    });

    await commitSpin(prize);

    // Update local combo state
    const isWin = prize.type !== 'miss';
    setComboWins(prev => isWin ? prev + 1 : 0);
    if (!isWin) setComboMultiplier(1.0);

    // Record wheel score then check for new badge unlocks (non-blocking)
    if (user?.id) {
      const rarity = rarityForPrize(prize);
      const prevUnlockedIds = new Set(playerBadges.filter(b => b.unlocked).map(b => b.id));
      supabase.rpc('record_wheel_score', {
        p_user_id: user.id,
        p_spin_id: `game_log_${Date.now()}`,
        p_prize_type: prize.type,
        p_rarity: rarity,
      }).then(async () => {
        await refreshBadges();
        // Badge reveal is handled in a useEffect watching playerBadges
      });
      // Store pre-spin unlocked set for comparison in effect
      prevUnlockedIdsRef.current = prevUnlockedIds;
    }

    // Reveal winner
    setGameState('revealing');
    setWinnerIndex(prizeIndex);
    setHasWinner(true);
    sound.win(rarityForPrize(prize));

    // Create celebration particles
    const countByRarity: Record<string, number> = { common: 10, rare: 16, epic: 22, legendary: 28, jackpot: 38 };
    const count = countByRarity[rarityForPrize(prize)] || 12;
    const newParticles = Array.from({ length: count }, (_, i) => ({
      id: i,
      x: `${Math.random() * 92 + 4}%`,
      delay: `${Math.random() * 0.45}s`,
      duration: `${1.2 + Math.random() * 1.4}s`,
      drift: `${(Math.random() - 0.5) * 180}px`,
      size: `${4 + Math.random() * 7}px`,
      rarity: rarityForPrize(prize),
    }));
    setParticles(newParticles);

    await new Promise(r => setTimeout(r, prize.type === 'grand' ? 950 : 650));

    setWinPrize(prize);
    setShowWinner(true);
    setGameState('result');
  }, [canSpin, spinning, gameState, doSpin, commitSpin, settings.prizes.length, sound, animateWheelTo]);

  const closeWinner = useCallback(() => {
    setShowWinner(false);
    setWinPrize(null);
    setTimeout(() => {
      setHasWinner(false);
      setWinnerIndex(null);
      setParticles([]);
      setGameState('ready');
    }, 260);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div
          className="w-12 h-12 rounded-full border-2 border-transparent animate-spin"
          style={{ borderTopColor: '#C6A06A', borderRightColor: '#E7C38F' }}
        />
      </div>
    );
  }

  if (!settings.active) {
    return (
      <div className="glass-card p-12 text-center max-w-md mx-auto">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 text-amber-400" />
        <h2 className="text-2xl font-bold mb-2" style={{ color: '#f6e5cc' }}>
          {language === 'ar' ? 'اللعبة غير متوفرة حالياً' : 'Game Currently Unavailable'}
        </h2>
        <p className="text-sm" style={{ color: '#b19068' }}>
          {language === 'ar' ? 'عذراً، عجلة الحظ غير متاحة الآن.' : 'Sorry, the wheel is currently unavailable.'}
        </p>
      </div>
    );
  }

  const prizes = settings.prizes;
  const uniquePrizeTypes = prizes.filter(
    (p, i, arr) => arr.findIndex(x => x.type === p.type && x.name_ar === p.name_ar) === i
  );
  const paddedHistory = [...history.slice(0, 5)];
  while (paddedHistory.length < 5) paddedHistory.push(null as any);

  const isBusy = gameState === 'spinning' || gameState === 'slowing' || gameState === 'revealing';

  return (
    <div dir="rtl" className="axie-wheel relative w-full overflow-x-hidden" style={{ background: 'transparent' }}>
      {/* Ambient background — contained, not fixed */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            'radial-gradient(circle at 66% 82%, rgba(99,56,18,.32), transparent 21%), radial-gradient(circle at 50% 30%, rgba(196,142,80,.14), transparent 32%), linear-gradient(180deg, #0f0b08, #090604 60%, #060403)',
        }}
      />

      <div className="relative z-10 mx-auto max-w-7xl px-3 sm:px-4 py-5 sm:py-8">
        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="font-black" style={{ fontSize: 'clamp(36px, 5vw, 58px)', color: '#f8ecda', lineHeight: 1 }}>
            {language === 'ar' ? settings.title_ar : settings.title_en}
          </h1>
          <p className="mt-2" style={{ color: '#d1ab7b', fontSize: 'clamp(15px, 1.08vw, 20px)' }}>
            {freeSpinsLeft > 0
              ? (language === 'ar' ? `لديك ${freeSpinsLeft} دورة مجانية` : `You have ${freeSpinsLeft} free spin${freeSpinsLeft !== 1 ? 's' : ''}`)
              : (language === 'ar' ? `تكلفة الدوران: ${settings.spin_cost_points} نقطة` : `Spin cost: ${settings.spin_cost_points} points`)}
          </p>
        </div>

        {/* 3-column grid — shows side columns at lg (1024px) */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_1fr_240px] xl:grid-cols-[300px_1fr_280px]">
          {/* LEFT: stats */}
          <aside className="hidden lg:flex flex-col gap-4">
            <div
              className="rounded-3xl p-5 space-y-5"
              style={{
                background: 'linear-gradient(180deg, rgba(40,29,18,.78), rgba(18,12,8,.88))',
                border: '1px solid rgba(241,202,138,0.18)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,.05), 0 20px 50px rgba(0,0,0,.3)',
              }}
            >
              <div>
                <h3 className="font-black text-2xl" style={{ color: '#f8ecda' }}>Lucky Spin</h3>
                <p className="text-sm mt-1" style={{ color: '#c9a77f' }}>
                  {language === 'ar' ? 'أدر العجلة وافز بجوائز رائعة' : 'Spin the wheel, win amazing prizes'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div
                  className="rounded-2xl p-4 text-center"
                  style={{ border: '1px solid rgba(255,255,255,.08)', background: 'linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.008))' }}
                >
                  <p className="text-xs mb-1" style={{ color: '#c9a77f' }}>{language === 'ar' ? 'محاولاتك' : 'Free Spins'}</p>
                  <p className="text-4xl font-black" style={{ color: '#f8ecda' }}>{freeSpinsLeft}</p>
                </div>
                <div
                  className="rounded-2xl p-4 text-center"
                  style={{ border: '1px solid rgba(255,255,255,.08)', background: 'linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.008))' }}
                >
                  <p className="text-xs mb-1" style={{ color: '#c9a77f' }}>{language === 'ar' ? 'نقاطك' : 'Points'}</p>
                  <p className="text-4xl font-black" style={{ color: '#f8ecda' }}>{user?.points || 0}</p>
                </div>
              </div>

              {history.length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-3" style={{ color: '#b19068' }}>
                    {language === 'ar' ? 'آخر الجوائز' : 'Recent'}
                  </p>
                  <div className="space-y-2">
                    {history.slice(0, 5).map((p, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ background: `${p.accent_color}18`, border: `1px solid ${p.accent_color}30` }}
                        >
                          <PrizeIcon prize={p} size={24} />
                        </div>
                        <span className="text-sm font-semibold truncate" style={{ color: '#f6e5cc' }}>
                          {language === 'ar' ? p.name_ar : p.name_en}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>

          {/* CENTER: wheel */}
          <div
            className="rounded-[32px] sm:rounded-[40px] overflow-hidden"
            style={{
              background: 'linear-gradient(180deg, rgba(40,29,18,.78), rgba(18,12,8,.88))',
              border: '1px solid rgba(241,202,138,0.22)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,.06), inset 0 -1px 0 rgba(0,0,0,.3), 0 28px 64px rgba(0,0,0,.36), 0 0 0 1px rgba(0,0,0,.18)',
            }}
          >
            <div className="flex flex-col items-center px-3 sm:px-5 lg:px-8 pb-7 pt-5">
              {/* Wheel stage */}
              <div
                className="relative w-full flex items-center justify-center"
                style={{ minHeight: 'clamp(320px, 55vw, 680px)' }}
              >
                {/* Win beam */}
                <div
                  className={`win-beam ${hasWinner ? 'is-active' : ''}`}
                  data-rarity={winnerIndex !== null ? rarityForPrize(prizes[winnerIndex]) : 'common'}
                />

                {/* Particles */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 15 }}>
                  {particles.map((p) => (
                    <i
                      key={p.id}
                      className="fx-particle"
                      style={{
                        ['--x' as any]: p.x,
                        ['--delay' as any]: p.delay,
                        ['--duration' as any]: p.duration,
                        ['--drift' as any]: p.drift,
                        ['--size' as any]: p.size,
                        color: p.rarity === 'rare' ? '#8ed7ff' : p.rarity === 'epic' ? '#c58bff' : p.rarity === 'jackpot' ? '#ffd79c' : '#f3d3a3',
                        background: p.rarity === 'rare' ? '#8ed7ff' : p.rarity === 'epic' ? '#c58bff' : p.rarity === 'jackpot' ? '#ffd79c' : '#f3d3a3',
                      }}
                    />
                  ))}
                </div>

                {/* Wheel shadow — deeper and warmer */}
                <div
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    width: 'clamp(260px, 52vw, 620px)', height: 'clamp(260px, 52vw, 620px)',
                    background: 'radial-gradient(circle, rgba(220,155,70,.16) 0, rgba(131,74,31,.06) 42%, transparent 70%)',
                    filter: 'blur(12px)', transform: 'translateY(32px)',
                  }}
                />

                {/* Wheel shell — fills available column width, scales with container */}
                <div className="relative w-full" style={{ maxWidth: 'clamp(280px, 55vw, 640px)', aspectRatio: 1 }}>
                  {/* Idle ambient glow ring — disappears while spinning */}
                  <div className={`idle-glow ${isBusy ? 'is-spinning' : ''}`} />

                  {/* Metallic rim sweep — SVG overlay */}
                  {!isBusy && (
                    <svg
                      viewBox="0 0 760 760"
                      className="absolute inset-0 w-full h-full pointer-events-none"
                      style={{ zIndex: 8 }}
                      aria-hidden="true"
                    >
                      <circle
                        className="rim-sweep-arc"
                        cx="380" cy="380" r="334"
                        fill="none"
                        stroke="rgba(255,240,200,.55)"
                        strokeWidth="6"
                        strokeLinecap="round"
                      />
                    </svg>
                  )}

                  {/* Pointer glow (idle soft light beneath pointer) */}
                  {!isBusy && <div className="pointer-glow" />}

                  {/* Pointer */}
                  <div
                    className="pointer--top"
                    style={{
                      position: 'absolute', top: '4px', left: '50%',
                      width: 'clamp(46px, 4vw, 62px)', height: 'clamp(46px, 4vw, 62px)',
                      transform: 'translateX(-50%)', zIndex: 20, pointerEvents: 'none',
                      background: 'radial-gradient(circle at 50% 20px, #2b1608 0 5px, #f6ddb2 6px 11px, #8f582a 12px 16px, transparent 17px), linear-gradient(180deg, transparent 0 40px, #f9e4bf 40px, #d8a15d 62%, #845022 100%) center 40px / 12px 26px no-repeat',
                      borderRadius: '999px',
                      filter: 'drop-shadow(0 10px 20px rgba(0,0,0,.38)) drop-shadow(0 0 18px rgba(234,192,128,.24))',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute', top: '8px', left: '50%', transform: 'translateX(-50%)',
                        width: '58px', height: '34px', borderRadius: '18px 18px 14px 14px',
                        background: 'radial-gradient(circle at 50% 28%, rgba(255,255,255,.62) 0 14%, transparent 15%), linear-gradient(180deg, #fff0d0 0%, #f3d4a0 26%, #d99d57 55%, #925928 78%, #5a3012 100%)',
                        border: '1px solid rgba(255,239,209,.58)',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,.52), inset 0 -7px 10px rgba(85,47,18,.28), 0 8px 14px rgba(0,0,0,.2)',
                        clipPath: 'polygon(8% 0, 92% 0, 100% 48%, 72% 100%, 28% 100%, 0 48%)',
                      }}
                    />
                    <div
                      style={{
                        position: 'absolute', bottom: '6px', left: '50%', transform: 'translateX(-50%)',
                        width: '24px', height: '34px', borderRadius: '2px',
                        background: 'linear-gradient(180deg, #fff4dd 0%, #f0cf98 26%, #cb8740 65%, #77421d 100%)',
                        boxShadow: 'inset 1px 1px 0 rgba(255,255,255,.44), inset -1px -1px 0 rgba(86,44,14,.22), 0 8px 14px rgba(80,43,14,.26)',
                        clipPath: 'polygon(50% 100%, 0 0, 100% 0)',
                      }}
                    />
                  </div>

                  {/* Rivets */}
                  <WheelRivets />

                  {/* Wheel */}
                  <div
                    className={`wheel ${hasWinner ? 'has-winner' : ''}`}
                    style={{
                      position: 'relative', width: '100%', height: '100%',
                      filter: 'drop-shadow(0 40px 60px rgba(0,0,0,.55)) drop-shadow(0 0 2px rgba(200,150,70,.08))',
                    }}
                  >
                    <WheelSVG
                      prizes={prizes}
                      rotation={rotation}
                      winnerIndex={winnerIndex}
                      hasWinner={hasWinner}
                      rotatorRef={rotatorRef}
                      prizeStates={prizeStates}
                    />
                  </div>
                </div>
              </div>

              {/* Spin button */}
              <button
                onClick={handleSpin}
                disabled={!canSpin || isBusy}
                className={`mt-4 w-full py-5 rounded-[26px] font-black overflow-hidden relative
                  disabled:opacity-40 disabled:cursor-not-allowed
                  ${!isBusy && canSpin ? 'spin-btn-idle hover:scale-[1.025] hover:brightness-110 active:scale-[0.96] active:brightness-95' : ''}
                  transition-transform duration-150`}
                style={{
                  fontSize: 'clamp(18px, 2vw, 32px)',
                  maxWidth: 'clamp(280px, 55vw, 640px)',
                  background: isBusy
                    ? 'linear-gradient(180deg, #d8b47f, #b88349)'
                    : 'linear-gradient(160deg, #fce9c2 0%, #f3c97c 35%, #d3a165 70%, #b87c42 100%)',
                  color: '#291607',
                  border: '1px solid rgba(255,235,203,.22)',
                }}
              >
                <span className="relative flex items-center justify-center gap-2">
                  {isBusy ? (
                    <>
                      <span className="spin-loader" />
                      {language === 'ar' ? 'العجلة تدور...' : 'Spinning...'}
                    </>
                  ) : freeSpinsLeft > 0 ? (
                    language === 'ar' ? `ابدأ السحب (${freeSpinsLeft} مجاني)` : `Spin Free (${freeSpinsLeft})`
                  ) : (
                    language === 'ar' ? `ادفع ${settings.spin_cost_points} نقطة` : `Pay ${settings.spin_cost_points} pts`
                  )}
                </span>
              </button>

              {error && (
                <p className="mt-3 text-sm text-center px-4" style={{ color: '#F47067' }}>{error}</p>
              )}

              {/* Combo meter */}
              {comboWins > 0 && (
                <div className="mt-3 w-full max-w-[min(100%,640px)]">
                  <ComboMeter
                    consecutiveWins={comboWins}
                    multiplier={comboMultiplier}
                  />
                </div>
              )}

              {/* History */}
              <div className="mt-5 flex gap-3 items-center justify-center flex-wrap">
                {paddedHistory.map((prize, i) => (
                  <HistorySlot key={i} prize={prize} />
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT: leaderboard + prizes + engagement */}
          <aside className="hidden lg:flex flex-col gap-4">
            {/* Leaderboard panel */}
            <div
              className="rounded-[28px] p-5"
              style={{
                background: 'linear-gradient(180deg, rgba(40,29,18,.78), rgba(18,12,8,.88))',
                border: '1px solid rgba(241,202,138,0.18)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,.05), 0 20px 50px rgba(0,0,0,.3)',
              }}
            >
              <WheelLeaderboard compact />
            </div>

            {/* Prizes panel */}
            <div
              className="rounded-[28px] p-5 flex-1"
              style={{
                background: 'linear-gradient(180deg, rgba(40,29,18,.78), rgba(18,12,8,.88))',
                border: '1px solid rgba(241,202,138,0.18)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,.05), 0 20px 50px rgba(0,0,0,.3)',
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-black text-base" style={{ color: '#f8ecda' }}>
                  {language === 'ar' ? 'الجوائز' : 'Prizes'}
                </h3>
                <div className="flex items-center gap-1.5">
                  {onNavigate && (
                    <button
                      onClick={() => onNavigate('wheel-prizes')}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all hover:brightness-110"
                      style={{ background: 'rgba(214,170,98,.12)', color: '#D6AA62', border: '1px solid rgba(214,170,98,.22)' }}
                    >
                      {language === 'ar' ? 'كل الجوائز' : 'All'}
                    </button>
                  )}
                  <button
                    onClick={() => setShowProgressCenter(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all hover:brightness-110"
                    style={{ background: 'rgba(139,92,246,.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,.25)' }}
                  >
                    <Crown className="w-3 h-3" />
                    {language === 'ar' ? 'تقدمي' : 'Progress'}
                  </button>
                </div>
              </div>
              <div className="space-y-2.5 overflow-y-auto max-h-[280px] pe-0.5">
                {uniquePrizeTypes.filter(p => p.type !== 'miss').map(prize => (
                  <PrizeListItem key={prize.id} prize={prize} language={language} prizeState={prizeStates.find(s => s.prize_id === prize.id)} />
                ))}
              </div>
            </div>

            {/* Events + Live winners */}
            <div
              className="rounded-[28px] p-4 space-y-3"
              style={{
                background: 'linear-gradient(180deg, rgba(18,12,8,.85), rgba(12,8,5,.92))',
                border: '1px solid rgba(241,202,138,0.12)',
              }}
            >
              <EventStrip />
              <LiveWinnerFeed />
            </div>
          </aside>
        </div>

        {/* Mobile prizes */}
        <div className="lg:hidden mt-5">
          <div
            className="rounded-3xl p-4 sm:p-5"
            style={{
              background: 'linear-gradient(180deg, rgba(37,27,18,.74), rgba(20,14,10,.82))',
              border: '1px solid rgba(241,202,138,0.18)',
            }}
          >
            <h3 className="font-black text-base mb-3" style={{ color: '#f8ecda' }}>
              {language === 'ar' ? 'الجوائز المتاحة' : 'Available Prizes'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {uniquePrizeTypes.filter(p => p.type !== 'miss').map(prize => (
                <PrizeListItem key={prize.id} prize={prize} language={language} prizeState={prizeStates.find(s => s.prize_id === prize.id)} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile: events + winners strip */}
      <div className="lg:hidden px-3 sm:px-4 pb-3 space-y-3">
        <EventStrip />
        <div
          className="rounded-2xl p-4"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <LiveWinnerFeed />
        </div>
        <button
          onClick={() => setShowProgressCenter(true)}
          className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:brightness-110"
          style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(217,70,239,0.15))', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.25)' }}
        >
          <Crown className="w-4 h-4" />
          {language === 'ar' ? 'مركز التقدم' : 'Progress Center'}
        </button>
      </div>

      {/* Progress Center drawer */}
      {showProgressCenter && <ProgressCenter onClose={() => setShowProgressCenter(false)} />}

      {/* Winner reveal */}
      {showWinner && winPrize && (
        <WinnerReveal
          prize={winPrize}
          onClose={closeWinner}
          language={language}
          fulfillmentCase={lastFulfillmentCase}
          onOpenCase={onOpenPrizeCase}
        />
      )}

      {/* Badge unlock reveal — shows one at a time from the queue */}
      {badgeQueue.length > 0 && (
        <BadgeUnlockReveal
          badge={badgeQueue[0]}
          onDismiss={() => setBadgeQueue(prev => prev.slice(1))}
        />
      )}

      {/* Fallback for lastWin from hook (miss prizes don't trigger winner reveal) */}
      {lastWin && !showWinner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.8)', backdropFilter: 'blur(8px)' }} onClick={clearLastWin}>
          <div
            className="max-w-sm w-full rounded-3xl p-7 text-center"
            style={{
              background: 'linear-gradient(180deg, rgba(36,25,16,.98), rgba(15,10,7,.99))',
              border: `1px solid ${lastWin.accent_color}45`,
              boxShadow: `0 0 70px ${lastWin.accent_color}28, 0 32px 64px rgba(0,0,0,.7)`,
            }}
          >
            <button onClick={clearLastWin} className="absolute top-4 end-4 w-9 h-9 flex items-center justify-center rounded-xl" style={{ color: '#d7b991' }}>
              <X className="w-4 h-4" />
            </button>
            <div className="w-24 h-24 rounded-full mx-auto flex items-center justify-center mb-5" style={{ background: `radial-gradient(circle, ${lastWin.accent_color}22, transparent 70%)`, border: `2px solid ${lastWin.accent_color}55` }}>
              <PrizeIcon prize={lastWin} size={48} />
            </div>
            <h2 className="text-2xl font-black mb-1" style={{ color: '#f9ead4' }}>
              {language === 'ar' ? lastWin.name_ar : lastWin.name_en}
            </h2>
            <p className="text-sm mb-5" style={{ color: '#bc9a72' }}>{lastWin.value}</p>
            <button
              onClick={clearLastWin}
              className="w-full py-3.5 rounded-2xl font-black text-lg"
              style={{ background: 'linear-gradient(180deg, #f3d8af, #cb965c)', color: '#2a1707' }}
            >
              {language === 'ar' ? 'متابعة' : 'Continue'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
