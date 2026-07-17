import { useState, useRef, useCallback, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useSpinWheelGame, WheelPrize, SpinResultEntry } from '../hooks/useSpinWheelGame';
import { AlertCircle, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { EventStrip } from './EventStrip';
import { WheelLeaderboard } from './WheelLeaderboard';

// ─── Wheel geometry (520x520 viewBox) ──────────────────────────────────────────
const CX = 260;
const CY = 260;
const R = 236;
const SPIN_DURATION_MS = 5600;
const MIN_TURNS = 6;
const MAX_TURNS = 8;

function polar(angleDeg: number, r: number): [number, number] {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
}

// ─── Rarity mapping ───────────────────────────────────────────────────────────
function rarityForPrize(prize: WheelPrize): string {
  if (prize.type === 'grand') return 'jackpot';
  if (prize.is_strong) return 'epic';
  if (prize.type === 'coins') return 'rare';
  if (prize.type === 'service') return 'rare';
  if (prize.type === 'points') return 'common';
  if (prize.type === 'miss') return 'common';
  return 'rare';
}

const RARITY_LABELS_AR: Record<string, string> = {
  common: 'شائعة',
  rare: 'نادرة',
  epic: 'مميزة',
  legendary: 'أسطورية',
  jackpot: 'أسطورية',
};

const RARITY_COLORS: Record<string, string> = {
  common: '#cdbfa0',
  rare: '#e6455c',
  epic: '#31d8c5',
  legendary: '#d9ab4e',
  jackpot: '#d9ab4e',
};

// ─── PrizeBadge: unified circular badge for HTML contexts ─────────────────────
function PrizeBadge({
  prize,
  size = 36,
  locked = false,
  glow: glowOverride,
}: {
  prize: WheelPrize;
  size?: number;
  locked?: boolean;
  glow?: string;
}) {
  const [imgErr, setImgErr] = useState(false);
  const rarity = rarityForPrize(prize);
  const glowColor = glowOverride || prize.glow_color || RARITY_COLORS[rarity] || '#d9ab4e';
  const ringThickness = Math.max(2, size * 0.08);
  const innerPadding = size * 0.18;

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        position: 'relative',
        flexShrink: 0,
        display: 'grid',
        placeItems: 'center',
        background: `conic-gradient(from 215deg, #f8e7b4, #d9ab4e, #9a7220, #d9ab4e, #f8e7b4)`,
        padding: ringThickness,
        boxShadow: `0 0 10px ${glowColor}55, 0 2px 6px rgba(0,0,0,.4)`,
      }}
    >
      {/* Inner disc */}
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          background: 'radial-gradient(circle at 30% 25%, #33230f, #120b05)',
          position: 'relative',
          overflow: 'hidden',
          display: 'grid',
          placeItems: 'center',
          boxShadow: 'inset 0 -2px 4px rgba(0,0,0,.5)',
        }}
      >
        {/* Glass highlight */}
        <div
          style={{
            position: 'absolute',
            top: '8%',
            left: '18%',
            width: '64%',
            height: '38%',
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.13)',
            pointerEvents: 'none',
            filter: 'blur(2px)',
          }}
        />
        {/* Content */}
        {locked ? (
          <span style={{ fontSize: size * 0.4, lineHeight: 1 }}>🔒</span>
        ) : prize.primary_icon_url && !imgErr ? (
          <img
            src={prize.primary_icon_url}
            alt=""
            onError={() => setImgErr(true)}
            style={{
              width: `calc(100% - ${innerPadding * 2}px)`,
              height: `calc(100% - ${innerPadding * 2}px)`,
              objectFit: 'contain',
              borderRadius: '50%',
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.5))',
              transform: `scale(${prize.icon_scale || 1})`,
            }}
          />
        ) : (
          <span
            style={{
              fontFamily: "'Lalezar', cursive",
              fontSize: size * 0.38,
              color: glowColor,
              textShadow: `0 0 8px ${glowColor}88`,
              lineHeight: 1,
            }}
          >
            {(prize.name_ar || prize.name_en || '?').charAt(0)}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── SVG medallion for wheel segments ───────────────────────────────────────────
function badgeSvgHtml(prize: WheelPrize, size = 78): string {
  const rarity = rarityForPrize(prize);
  const glow = prize.glow_color || RARITY_COLORS[rarity] || '#d9ab4e';
  const userScale = prize.icon_scale || 1;
  const s = size;
  const outerR = s / 2;
  const rimW = s * 0.06;
  const innerR = outerR - rimW;
  const artPad = s * 0.04;
  const clipR = innerR - artPad;
  const artSize = clipR * 2 * Math.min(Math.max(userScale, 1.0), 1.25);
  const uid = prize.id.replace(/[^a-zA-Z0-9_]/g, '_');
  const isGrand = prize.type === 'grand';
  const isRare = rarity === 'rare' || rarity === 'epic';
  const pulseClass = isGrand ? 'aw-med-grand-pulse' : isRare ? 'aw-med-rare-pulse' : '';

  const rimFill = isGrand ? 'url(#aw-rimGrand)' : 'url(#aw-badgeRing)';
  const innerBgFill = isGrand ? '#1a0e04' : '#160d04';
  const glowOpacity = isGrand ? 0.6 : isRare ? 0.4 : 0.2;
  const glowBlur = isGrand ? 6 : isRare ? 4 : 2.5;

  let content: string;
  if (prize.primary_icon_url) {
    content = `<clipPath id="aw-mc-${uid}"><circle r="${clipR}"/></clipPath><image href="${prize.primary_icon_url}" x="${-artSize/2}" y="${-artSize/2}" width="${artSize}" height="${artSize}" preserveAspectRatio="xMidYMid meet" clip-path="url(#aw-mc-${uid})"/>`;
  } else {
    const c = glow;
    content = `<text y="${s*0.16}" text-anchor="middle" font-family="'Lalezar',cursive" font-size="${s*0.42}" fill="${c}" style="filter:drop-shadow(0 0 8px ${c})">${(prize.name_ar || '?').charAt(0)}</text>`;
  }

  return `
    <g class="${pulseClass}">
      <defs>
        <radialGradient id="aw-rimGrand-${uid}" cx="35%" cy="28%">
          <stop offset="0%" stop-color="#ffdf88"/><stop offset="40%" stop-color="#d9ab4e"/><stop offset="80%" stop-color="#7c5a13"/><stop offset="100%" stop-color="#cfa04a"/>
        </radialGradient>
        <filter id="aw-glow-${uid}" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="${glowBlur}" result="blur"/>
          <feFlood flood-color="${glow}" flood-opacity="${glowOpacity}" result="color"/>
          <feComposite in="color" in2="blur" operator="in" result="glow"/>
          <feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <circle r="${outerR + 3}" fill="none" stroke="${glow}" stroke-width="1.5" opacity="0.25" style="filter:blur(3px)"/>
      <circle r="${outerR}" fill="${rimFill}" stroke="${glow}" stroke-width="0.8" opacity="0.9"/>
      <circle r="${outerR - 1}" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="0.5"/>
      <circle r="${innerR}" fill="${innerBgFill}"/>
      <circle r="${innerR}" fill="url(#aw-badge-bg)" opacity="0.5"/>
      <ellipse cx="${-innerR * 0.22}" cy="${-innerR * 0.4}" rx="${innerR * 0.5}" ry="${innerR * 0.28}" fill="rgba(255,255,255,0.08)"/>
      <g filter="url(#aw-glow-${uid})">${content}</g>
      <circle r="${innerR}" fill="none" stroke="rgba(0,0,0,0.3)" stroke-width="1"/>
    </g>
  `;
}

// ─── Sound engine ─────────────────────────────────────────────────────────────
function useSoundEngine() {
  const ctxRef = useRef<AudioContext | null>(null);
  const getContext = useCallback(() => {
    if (!ctxRef.current) {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AC) ctxRef.current = new AC();
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

// ─── Confetti ─────────────────────────────────────────────────────────────────
function useConfetti() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const partsRef = useRef<any[]>([]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const cvs = document.createElement('canvas');
    cvs.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:60';
    document.body.appendChild(cvs);
    canvasRef.current = cvs;
    const resize = () => { cvs.width = innerWidth; cvs.height = innerHeight; };
    resize();
    window.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); cvs.remove(); if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  const burst = useCallback(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;
    const colors = ['#d9ab4e', '#f8e7b4', '#31d8c5', '#e6455c', '#fff6dd'];
    for (let i = 0; i < 150; i++) {
      partsRef.current.push({
        x: innerWidth / 2, y: innerHeight / 2.4,
        vx: (Math.random() - 0.5) * 15, vy: -Math.random() * 13 - 4,
        g: 0.35, size: 4 + Math.random() * 6, rot: Math.random() * 360, vr: (Math.random() - 0.5) * 18,
        color: colors[i % colors.length], life: 1,
      });
    }
    if (rafRef.current) return;
    const loop = () => {
      ctx.clearRect(0, 0, cvs.width, cvs.height);
      partsRef.current.forEach((p: any) => {
        p.x += p.vx; p.y += p.vy; p.vy += p.g; p.rot += p.vr; p.life -= 0.008;
      });
      partsRef.current = partsRef.current.filter((p: any) => p.life > 0 && p.y < cvs.height + 30);
      partsRef.current.forEach((p: any) => {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot * Math.PI / 180);
        ctx.globalAlpha = Math.max(p.life, 0); ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.6); ctx.restore();
      });
      if (partsRef.current.length) { rafRef.current = requestAnimationFrame(loop); }
      else { rafRef.current = null; }
    };
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  return { burst };
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function useToast() {
  const [toast, setToast] = useState<{ html: string; mode: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((html: string, mode = '') => {
    setToast({ html, mode });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(null), 4200);
  }, []);
  return { toast, show };
}

// ─── Countdown hook ────────────────────────────────────────────────────────────
function useCountdown() {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const compute = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      setSecs(Math.max(0, Math.floor((tomorrow.getTime() - now.getTime()) / 1000)));
    };
    compute();
    const id = setInterval(compute, 1000);
    return () => clearInterval(id);
  }, []);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return { h, m, s };
}

// ─── Inject CSS ───────────────────────────────────────────────────────────────
const STYLE_ID = 'axie-wheel-v2-styles';
function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes aw-shine { to { background-position: 220% center; } }
    @keyframes aw-pulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
    @keyframes aw-breath { 0%,100% { transform: scale(1); opacity: .85; } 50% { transform: scale(1.07); opacity: 1; } }
    @keyframes aw-blink { 0%,100% { opacity: 1; } 50% { opacity: .22; } }
    @keyframes aw-spin-blink { 0%,100% { opacity: 1; } 50% { opacity: .22; } }
    @keyframes aw-tick-spring { 0% { transform: translateX(-50%) rotate(0deg); } 30% { transform: translateX(-50%) rotate(14deg); } 60% { transform: translateX(-50%) rotate(-4deg); } 100% { transform: translateX(-50%) rotate(0deg); } }
    @keyframes aw-btn-pulse {
      0%,100% { box-shadow: 0 7px 0 #5d420c, 0 16px 36px rgba(217,171,78,.24); }
      50% { box-shadow: 0 7px 0 #5d420c, 0 16px 54px rgba(217,171,78,.55); }
    }
    @keyframes aw-sweep { 0% { left: -80%; } 60%,100% { left: 150%; } }
    @keyframes aw-bar-shine { to { background-position: -200% 0; } }
    @keyframes aw-rays { to { transform: rotate(360deg); } }
    @keyframes aw-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
    @keyframes aw-card-in { from { transform: scale(.72); } to { transform: scale(1); } }
    @keyframes aw-lock-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
    @keyframes aw-chain-spin { to { stroke-dashoffset: -52; } }
    @keyframes aw-lock-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.14); } }
    @keyframes aw-med-grand-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.85; } }
    @keyframes aw-med-rare-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.92; } }
    .aw-med-grand-pulse { animation: aw-med-grand-pulse 3s ease-in-out infinite; }
    .aw-med-rare-pulse { animation: aw-med-rare-pulse 4s ease-in-out infinite; }
    @keyframes aw-aura-pulse { 0%,100% { opacity: .25; } 50% { opacity: .85; } }
    @keyframes aw-open-glow { 0%,100% { opacity: .35; } 50% { opacity: 1; } }
    @keyframes aw-cta-blink { 0%,100% { opacity: 1; } 50% { opacity: .55; } }
    @keyframes aw-flash { 0% { opacity: 0; } 18% { opacity: 1; } 100% { opacity: 0; } }
    @keyframes aw-float-particle { 0% { transform: translateY(0) translateX(0); opacity: 0; } 15% { opacity: .7; } 85% { opacity: .5; } 100% { transform: translateY(-80px) translateX(12px); opacity: 0; } }
    @keyframes aw-seg-glow { 0%,100% { filter: brightness(1); } 50% { filter: brightness(1.3) drop-shadow(0 0 6px currentColor); } }
    @keyframes aw-pill-shine { 0% { transform: translateX(-150%) skewX(-15deg); } 60%,100% { transform: translateX(250%) skewX(-15deg); } }
    @keyframes aw-pill-pulse { 0% { box-shadow: 0 0 24px rgba(217,171,78,.25), 0 0 0 0 rgba(248,231,180,.6); } 40% { box-shadow: 0 0 24px rgba(217,171,78,.25), 0 0 0 6px rgba(248,231,180,.3); } 100% { box-shadow: 0 0 24px rgba(217,171,78,.25), 0 0 0 0 rgba(248,231,180,0); } }
    @keyframes aw-winner-fade-out { to { opacity: 0; transform: translateY(-10px); } }
    @keyframes aw-winner-fade-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes aw-live-dot { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: .4; transform: scale(.7); } }
    .aw-spinning .aw-bulb { animation-duration: .26s !important; }
    .aw-ticking { animation: aw-tick-spring .22s ease-out; }
    .aw-seg-winner { animation: aw-seg-glow .6s ease-in-out 2; }
    .aw-pill-shine-layer::after {
      content: ''; position: absolute; top: 0; left: -150%; width: 60%; height: 100%;
      background: linear-gradient(100deg, transparent, rgba(255,255,255,0.08), transparent);
      animation: aw-pill-shine 4s ease-in-out infinite; pointer-events: none;
    }
    .aw-winner-text-out { animation: aw-winner-fade-out .4s ease forwards; }
    .aw-winner-text-in { animation: aw-winner-fade-in .4s ease forwards; }
    .aw-pill-flash { animation: aw-pill-pulse .8s ease-out 1; }
    @media (max-width: 767px) {
      .aw-mobile-wheel-zone { padding: 14px 10px 16px !important; border-radius: 16px !important; }
      .aw-mobile-wheel-zone .aw-halo-mobile { display: none !important; }
      .aw-mobile-wheel-zone .aw-particles-mobile { display: none !important; }
      .aw-mobile-wheel-zone .aw-bulb { animation-duration: 1.5s !important; }
      .aw-mobile-wheel-zone .aw-vignette-mobile { display: none !important; }
      .aw-spin-btn { width: 100% !important; min-width: 0 !important; min-height: 54px !important; font-size: 22px !important; }
      .aw-multispin-row { width: 100% !important; }
      .aw-multispin-row button { flex: 1 1 0 !important; min-height: 44px !important; font-size: 11.5px !important; padding: 8px 6px !important; }
      .aw-winner-modal { padding: 28px 20px !important; border-radius: 18px !important; max-width: calc(100vw - 40px) !important; }
      .aw-winner-modal img { max-width: 110px !important; }
      .aw-toast { bottom: 100px !important; max-width: calc(100vw - 32px) !important; }
      .aw-wheel-grid { grid-template-columns: 1fr !important; max-width: 100% !important; gap: 0 !important; margin: 14px auto 0 !important; }
      .aw-wheel-wrap-mobile { width: min(92vw, 400px) !important; max-width: 100% !important; }
      .aw-header-mobile h1 { font-size: 38px !important; }
      .aw-header-mobile { margin-bottom: 12px !important; }
    }
    @media (max-width: 390px) {
      .aw-wheel-wrap-mobile { width: min(90vw, 340px) !important; }
      .aw-mobile-wheel-zone { padding: 12px 8px 14px !important; }
    }
    @media (max-width: 360px) {
      .aw-wheel-wrap-mobile { width: calc(100vw - 48px) !important; }
      .aw-mobile-wheel-zone { padding: 10px 6px 12px !important; }
      .aw-header-mobile h1 { font-size: 32px !important; }
    }
  `;
  document.head.appendChild(style);
}

// ─── Floating particles for wheel card ─────────────────────────────────────────
function FloatingParticles() {
  const particles = Array.from({ length: 8 }, (_, i) => ({
    id: i,
    left: 8 + Math.random() * 84,
    top: 15 + Math.random() * 70,
    delay: Math.random() * 4,
    duration: 5 + Math.random() * 4,
    size: 2 + Math.random() * 3,
  }));
  return (
    <div className="aw-particles-mobile" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {particles.map(p => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            background: 'rgba(217,171,78,0.6)',
            pointerEvents: 'none',
            animation: `aw-float-particle ${p.duration}s ease-in-out ${p.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

// ─── WinnerPill: luxurious gold capsule for latest winners ──────────────────────
interface WinnerEvent {
  id: string;
  masked_username: string;
  prize_type: string;
  prize_name_en: string;
  prize_name_ar: string;
  prize_value: string;
  points_awarded: number;
  avatar_seed: string;
  created_at: string;
}

function timeAgoAr(isoDate: string): string {
  const diff = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (diff < 60) return 'قبل قليل';
  if (diff < 3600) { const m = Math.floor(diff / 60); return `قبل ${m} دقيقة`; }
  const h = Math.floor(diff / 3600);
  return `قبل ${h} ساعة`;
}

const DUMMY_WINNERS: WinnerEvent[] = [
  { id: 'd1', masked_username: 'محمد ر***', prize_type: 'coins', prize_name_ar: '1000 عملة تيك توك', prize_name_en: '1000 TikTok coins', prize_value: '1000', points_awarded: 0, avatar_seed: 'moh1', created_at: new Date(Date.now() - 3 * 60000).toISOString() },
  { id: 'd2', masked_username: 'سارة ع***', prize_type: 'points', prize_name_ar: '500 نقطة', prize_name_en: '500 points', prize_value: '500', points_awarded: 500, avatar_seed: 'sara2', created_at: new Date(Date.now() - 7 * 60000).toISOString() },
  { id: 'd3', masked_username: 'أحمد م***', prize_type: 'service', prize_name_ar: 'كرت ليبيانا 5 د.ل', prize_name_en: 'Libyana 5 LYD', prize_value: '5', points_awarded: 0, avatar_seed: 'ahm3', created_at: new Date(Date.now() - 11 * 60000).toISOString() },
  { id: 'd4', masked_username: 'فاطمة خ***', prize_type: 'coins', prize_name_ar: '500 عملة تيك توك', prize_name_en: '500 TikTok coins', prize_value: '500', points_awarded: 0, avatar_seed: 'fat4', created_at: new Date(Date.now() - 18 * 60000).toISOString() },
  { id: 'd5', masked_username: 'عمر ب***', prize_type: 'points', prize_name_ar: '250 نقطة', prize_name_en: '250 points', prize_value: '250', points_awarded: 250, avatar_seed: 'omar5', created_at: new Date(Date.now() - 24 * 60000).toISOString() },
  { id: 'd6', masked_username: 'نور ط***', prize_type: 'grand', prize_name_ar: 'عضوية VIP أسبوع', prize_name_en: 'VIP Week', prize_value: 'vip', points_awarded: 0, avatar_seed: 'nour6', created_at: new Date(Date.now() - 31 * 60000).toISOString() },
  { id: 'd7', masked_username: 'خالد س***', prize_type: 'coins', prize_name_ar: '2000 عملة تيك توك', prize_name_en: '2000 TikTok coins', prize_value: '2000', points_awarded: 0, avatar_seed: 'khal7', created_at: new Date(Date.now() - 38 * 60000).toISOString() },
  { id: 'd8', masked_username: 'ريم ح***', prize_type: 'service', prize_name_ar: 'كرت ليبيانا 10 د.ل', prize_name_en: 'Libyana 10 LYD', prize_value: '10', points_awarded: 0, avatar_seed: 'reem8', created_at: new Date(Date.now() - 44 * 60000).toISOString() },
  { id: 'd9', masked_username: 'يوسف غ***', prize_type: 'points', prize_name_ar: '1000 نقطة', prize_name_en: '1000 points', prize_value: '1000', points_awarded: 1000, avatar_seed: 'yous9', created_at: new Date(Date.now() - 52 * 60000).toISOString() },
  { id: 'd10', masked_username: 'منى ص***', prize_type: 'coins', prize_name_ar: '300 عملة تيك توك', prize_name_en: '300 TikTok coins', prize_value: '300', points_awarded: 0, avatar_seed: 'mona10', created_at: new Date(Date.now() - 61 * 60000).toISOString() },
  { id: 'd11', masked_username: 'إبراهيم ف***', prize_type: 'service', prize_name_ar: 'شحن مجاني 5GB', prize_name_en: '5GB Free Data', prize_value: '5gb', points_awarded: 0, avatar_seed: 'ibr11', created_at: new Date(Date.now() - 70 * 60000).toISOString() },
  { id: 'd12', masked_username: 'هدى ق***', prize_type: 'coins', prize_name_ar: '750 عملة تيك توك', prize_name_en: '750 TikTok coins', prize_value: '750', points_awarded: 0, avatar_seed: 'huda12', created_at: new Date(Date.now() - 78 * 60000).toISOString() },
];

function WinnerPill() {
  const [realWinners, setRealWinners] = useState<WinnerEvent[]>([]);
  const [idx, setIdx] = useState(0);
  const [fadeState, setFadeState] = useState<'in' | 'out'>('in');
  const [flashKey, setFlashKey] = useState(0);
  const seenIds = useRef(new Set<string>());

  useEffect(() => {
    const fetchRecent = async () => {
      const { data } = await supabase
        .from('public_winner_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      if (data) {
        data.forEach((w: WinnerEvent) => seenIds.current.add(w.id));
        setRealWinners(data);
      }
    };
    fetchRecent();

    const channel = supabase
      .channel('live-winners-pill')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'public_winner_events' },
        (payload) => {
          const event = payload.new as WinnerEvent;
          if (seenIds.current.has(event.id)) return;
          seenIds.current.add(event.id);
          setRealWinners(prev => [event, ...prev].slice(0, 10));
          setFlashKey(k => k + 1);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Merge real winners first, then fill with dummy winners (no duplicates by id)
  const winners: WinnerEvent[] = [
    ...realWinners,
    ...DUMMY_WINNERS.filter(d => !realWinners.find(r => r.id === d.id)),
  ].slice(0, 15);

  useEffect(() => {
    if (winners.length <= 1) return;
    const id = setInterval(() => {
      setFadeState('out');
      setTimeout(() => {
        setIdx(prev => (prev + 1) % winners.length);
        setFadeState('in');
      }, 400);
    }, 4500);
    return () => clearInterval(id);
  }, [winners.length]);

  const winner = winners[idx];
  const isEmpty = winners.length === 0;

  return (
    <div
      key={flashKey}
      className="aw-pill-flash aw-pill-shine-layer"
      style={{
        position: 'relative',
        maxWidth: 620, margin: '0 auto',
        borderRadius: 999,
        background: 'linear-gradient(180deg, #241708, #140d06)',
        border: '1.5px solid',
        borderImage: 'linear-gradient(135deg, #f8e7b4, #d9ab4e) 1',
        boxShadow: '0 0 24px rgba(217,171,78,.25)',
        padding: '10px 22px 10px 18px',
        display: 'flex', alignItems: 'center', gap: 12,
        overflow: 'hidden',
      }}
    >
      {/* Gold trophy badge */}
      <div style={{
        width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
        background: 'radial-gradient(circle at 35% 30%, #fdf0c8, #d9ab4e 60%, #9a7220)',
        display: 'grid', placeItems: 'center', fontSize: 16,
        boxShadow: '0 0 10px rgba(217,171,78,.4), inset 0 -2px 4px rgba(0,0,0,.3)',
      }}>🏆</div>

      {/* Live dot */}
      <div style={{
        width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
        background: '#d9ab4e', boxShadow: '0 0 8px #d9ab4e',
        animation: 'aw-live-dot 1.4s ease-in-out infinite',
      }} />

      {/* Text content */}
      <div style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
        {!isEmpty && winner ? (
          <div
            className={fadeState === 'out' ? 'aw-winner-text-out' : 'aw-winner-text-in'}
            style={{ fontSize: 13.5, lineHeight: 1.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            <span style={{ color: '#f8e7b4', fontWeight: 800 }}>تهانينا! </span>
            <span style={{ color: '#d9ab4e', fontWeight: 700 }}>«{winner.masked_username}»</span>
            <span style={{ color: '#9c8b6e' }}> فاز بـ </span>
            <span style={{ color: '#efe6d2', fontWeight: 700 }}>{winner.prize_name_ar || winner.prize_value || `+${winner.points_awarded}`}</span>
            <span style={{ color: '#9c8b6e', fontSize: 11.5, marginRight: 4 }}> {timeAgoAr(winner.created_at)}</span>
          </div>
        ) : null}

      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export function SpinWheelGame({ onOpenMyPrizes, onNavigate }: { onOpenMyPrizes?: (caseId?: string) => void; onNavigate?: (page: string) => void } = {}) {
  const { language } = useLanguage();
  const { user } = useAuth();
  const {
    settings,
    publishedVersion,
    fetchPublishedVersion,
    loading,
    spinning,
    freeSpinsLeft,
    canSpin,
    lastWin,
    error,
    doSpin,
    commitSpin,
    clearLastWin,
    lastFulfillmentCase,
    prizeStates,
    fetchUserGrandPrizeProgress,
    getSpinCost,
    canAffordSpin,
  } = useSpinWheelGame();

  const [rotation, setRotation] = useState(0);
  const [gameState, setGameState] = useState<'ready' | 'spinning' | 'revealing' | 'result'>('ready');
  const [showWinner, setShowWinner] = useState(false);
  const [winPrize, setWinPrize] = useState<WheelPrize | null>(null);
  const [streak, setStreak] = useState(0);
  const [bonusSpin, setBonusSpin] = useState(0);
  const [jackpotValue, setJackpotValue] = useState(5000);
  const [lockedPrizeId, setLockedPrizeId] = useState<string | null>(null);
  const [unlockFlash, setUnlockFlash] = useState(false);
  const [winningIndex, setWinningIndex] = useState<number | null>(null);
  const [batchResults, setBatchResults] = useState<Array<{ prizeIndex: number; prize: WheelPrize }> | null>(null);
  const [spinQuantity, setSpinQuantity] = useState(1);
  const [userGrandPrizeProgress, setUserGrandPrizeProgress] = useState<Array<Record<string, unknown>>>([]);
  const [showMultiSpinConfirm, setShowMultiSpinConfirm] = useState<number | null>(null);

  const rotationRef = useRef(0);
  const animFrameRef = useRef<number | null>(null);
  const gameStateRef = useRef(gameState);
  const rotatorRef = useRef<SVGGElement>(null);
  const sound = useSoundEngine();
  const confetti = useConfetti();
  const { toast, show: showToast } = useToast();
  const countdown = useCountdown();

  // ─── Ticker removed — replaced by WinnerPill component ─────────────────────

  // Fetch per-user grand prize progress
  useEffect(() => {
    fetchUserGrandPrizeProgress().then(setUserGrandPrizeProgress);
  }, [fetchUserGrandPrizeProgress, settings.active]);

  useEffect(() => { injectStyles(); }, []);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  // Jackpot increment
  useEffect(() => {
    const id = setInterval(() => {
      setJackpotValue(prev => prev + Math.floor(Math.random() * 7) + 1);
    }, 1800);
    return () => clearInterval(id);
  }, []);

  // Detect locked grand prize
  useEffect(() => {
    const grandPrize = (publishedVersion?.prizes ?? settings.prizes).find(p => p.type === 'grand');
    if (!grandPrize) { setLockedPrizeId(null); return; }
    const state = prizeStates.find(s => s.prize_id === grandPrize.id);
    const mode = grandPrize.availability_mode ?? 'ALWAYS_ACTIVE';
    const isLocked = mode === 'LOCKED_BY_GOAL' && state && !state.is_unlocked;
    setLockedPrizeId(isLocked ? grandPrize.id : null);
  }, [publishedVersion, settings.prizes, prizeStates]);

  // Entry toast
  useEffect(() => {
    if (lockedPrizeId) {
      const publishedPrizes = publishedVersion?.prizes ?? settings.prizes;
      const gp = publishedPrizes.find(p => p.id === lockedPrizeId);
      const target = publishedPrizes.find(p => p.id === lockedPrizeId)?.unlock_target_value ?? 30;
      const t = setTimeout(() => showToast(`🔒 جائزة <b>${gp?.name_ar ?? '5000 نقطة'}</b> مقفلة — أكمل <b>${target} لفة</b> لفتحها`), 1200);
      return () => clearTimeout(t);
    }
  }, [lockedPrizeId]);

  // Use the PUBLISHED snapshot as the authoritative prize list for rendering sectors.
  // Falls back to settings.prizes only if no published version is loaded yet.
  const prizes = Array.isArray(publishedVersion?.prizes) && publishedVersion!.prizes!.length > 0
    ? publishedVersion!.prizes
    : (Array.isArray(settings?.prizes) ? settings.prizes : []);
  const activePrizes = prizes.filter(p => !p.disabled && ((p.probability_bp ?? 0) > 0 || p.weight > 0));
  const totalBp = activePrizes.reduce((s, p) => s + (p.probability_bp ?? 0), 0);
  const useProportional = totalBp === 10000;
  const n = activePrizes.length;

  // Build cumulative angle map for proportional sectors
  const sectorAngles = (() => {
    if (!useProportional || n === 0) return activePrizes.map((_, i) => ({ start: i * (360 / (n || 1)), size: 360 / (n || 1) }));
    let cumDeg = 0;
    return activePrizes.map(p => {
      const size = ((p.probability_bp ?? 0) / 10000) * 360;
      const start = cumDeg;
      cumDeg += size;
      return { start, size };
    });
  })();

  const applyRotation = useCallback((deg: number) => {
    rotationRef.current = deg;
    if (rotatorRef.current) rotatorRef.current.style.transform = `rotate(${deg}deg)`;
  }, []);

  const spinEase = (t: number) => {
    const accelEnd = 0.09;
    if (t <= accelEnd) { const u = t / accelEnd; return 0.052 * u * u * u; }
    const u = (t - accelEnd) / (1 - accelEnd);
    return 0.052 + 0.948 * (1 - Math.pow(1 - u, 5.2));
  };

  const animateWheelTo = useCallback((targetRotation: number, onTick: (progress: number) => void) => {
    return new Promise<void>((resolve) => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      const startRotation = rotationRef.current;
      const delta = targetRotation - startRotation;
      const startTime = performance.now();
      const stepAngle = 360 / (activePrizes.length || 1);
      let lastBoundary = Math.floor(startRotation / stepAngle);
      const frame = (now: number) => {
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / SPIN_DURATION_MS);
        const eased = spinEase(t);
        const current = startRotation + delta * eased;
        applyRotation(current);
        const boundary = Math.floor(current / stepAngle);
        if (boundary !== lastBoundary) {
          onTick(t);
          lastBoundary = boundary;
          const ptr = document.querySelector('.aw-pointer') as HTMLElement | null;
          if (ptr) { ptr.classList.remove('aw-ticking'); void ptr.offsetWidth; ptr.classList.add('aw-ticking'); }
        }
        if (t < 1) { animFrameRef.current = requestAnimationFrame(frame); }
        else { applyRotation(targetRotation); setRotation(targetRotation); animFrameRef.current = null; resolve(); }
      };
      animFrameRef.current = requestAnimationFrame(frame);
    });
  }, [activePrizes.length, applyRotation]);

  const handleSpin = useCallback(async (quantity = 1) => {
    if (!canSpin || spinning || gameState !== 'ready') return;
    sound.unlock();
    setGameState('spinning');
    setWinningIndex(null);
    setSpinQuantity(quantity);
    setBatchResults(null);
    document.getElementById('aw-zone')?.classList.add('aw-spinning');

    const result = await doSpin(quantity);
    if (!result) { setGameState('ready'); document.getElementById('aw-zone')?.classList.remove('aw-spinning'); return; }

    const { prize } = result;
    // Find the winning prize index in activePrizes by prize_id
    const winIdx = activePrizes.findIndex(p => p.id === prize.id);
    const sectorInfo = sectorAngles[winIdx >= 0 ? winIdx : 0] || { start: 0, size: 360 / Math.max(activePrizes.length, 1) };
    const centerAngle = sectorInfo.start + sectorInfo.size / 2;
    const safePad = sectorInfo.size * 0.22;
    const randomOffset = (Math.random() - 0.5) * (sectorInfo.size - safePad * 2);
    const desiredAngle = centerAngle + randomOffset;
    const current = ((rotationRef.current % 360) + 360) % 360;
    const targetMod = ((0 - desiredAngle) % 360 + 360) % 360;
    const delta = ((targetMod - current) % 360 + 360) % 360;
    const fullTurns = MIN_TURNS + Math.floor(Math.random() * (MAX_TURNS - MIN_TURNS + 1));
    const finalRotation = rotationRef.current + fullTurns * 360 + delta;

    sound.start();
    await animateWheelTo(finalRotation, (progress) => {
      sound.tick(progress > 0.78 ? 1 : progress > 0.48 ? 0.65 : 0.35);
    });

    await commitSpin(prize);

    // Show cost/reward breakdown toast for paid spins
    if (result.payment?.mode === 'POINTS' && result.payment.points_deducted > 0) {
      const cost = result.payment.points_deducted;
      const reward = result.pointsAwarded ?? 0;
      const net = reward - cost;
      const msg = language === 'ar'
        ? `تم خصم ${cost.toLocaleString('en')} نقطة — الجائزة: ${reward.toLocaleString('en')} نقطة${net !== 0 ? ` — الصافي: ${net > 0 ? '+' : ''}${net.toLocaleString('en')}` : ''}`
        : `Cost: -${cost} pts — Prize: +${reward} pts${net !== 0 ? ` — Net: ${net > 0 ? '+' : ''}${net}` : ''}`;
      showToast(msg, net >= 0 ? 'gold' : 'red');
    }

    // Store batch results for the winner modal
    if (result.allResults && result.allResults.length > 1) {
      setBatchResults(result.allResults);
    }

    // Always refresh per-user grand prize progress after any spin
    fetchUserGrandPrizeProgress().then(setUserGrandPrizeProgress);

    // Highlight winning segment by finding index in activePrizes
    setWinningIndex(activePrizes.findIndex(p => p.id === prize.id));

    // Streak logic
    const isWin = prize.type !== 'miss';
    if (isWin) {
      const newStreak = Math.min(100, streak + 34);
      setStreak(newStreak);
      if (newStreak >= 100) {
        setBonusSpin(prev => prev + 1);
        setStreak(0);
        setTimeout(() => showToast('🔥 <b>سلسلة الحظ!</b> حصلت على دورة إضافية مضمونة', 'gold'), 600);
      }
    } else {
      setStreak(0);
    }

    // Badge recording
    if (user?.id) {
      supabase.rpc('record_wheel_score', {
        p_user_id: user.id,
        p_spin_id: `game_log_${Date.now()}`,
        p_prize_type: prize.type,
        p_rarity: rarityForPrize(prize),
      }).then(() => {});
    }

    setGameState('revealing');
    sound.win(rarityForPrize(prize));
    confetti.burst();

    await new Promise(r => setTimeout(r, prize.type === 'grand' ? 950 : 650));
    setWinPrize(prize);
    setShowWinner(true);
    setGameState('result');
    document.getElementById('aw-zone')?.classList.remove('aw-spinning');
  }, [canSpin, spinning, gameState, doSpin, commitSpin, activePrizes.length, sound, animateWheelTo, confetti, streak, user?.id, fetchUserGrandPrizeProgress]);

  const closeWinner = useCallback(() => {
    setShowWinner(false);
    setWinPrize(null);
    setWinningIndex(null);
    setBatchResults(null);
    setTimeout(() => { setGameState('ready'); }, 260);
  }, []);

  useEffect(() => {
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, []);

  // ─── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-12 h-12 rounded-full border-2 border-transparent animate-spin"
          style={{ borderTopColor: '#d9ab4e', borderRightColor: '#f8e7b4' }} />
      </div>
    );
  }

  if (!settings.active) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center max-w-md mx-auto">
        <AlertCircle className="w-12 h-12 mx-auto mb-4" style={{ color: '#e6455c' }} />
        <h2 className="text-2xl font-bold mb-2" style={{ color: '#efe6d2', fontFamily: "'Tajawal', sans-serif" }}>
          {language === 'ar' ? 'اللعبة غير متوفرة حالياً' : 'Game Currently Unavailable'}
        </h2>
        <p className="text-sm" style={{ color: '#9c8b6e' }}>
          {language === 'ar' ? 'عذراً، عجلة الحظ غير متاحة الآن.' : 'Sorry, the wheel is currently unavailable.'}
        </p>
      </div>
    );
  }

  if (activePrizes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center max-w-md mx-auto">
        <AlertCircle className="w-12 h-12 mx-auto mb-4" style={{ color: '#e6a84e' }} />
        <h2 className="text-2xl font-bold mb-2" style={{ color: '#efe6d2', fontFamily: "'Tajawal', sans-serif" }}>
          {language === 'ar' ? 'لا توجد جوائز للعرض' : 'No Prizes Available'}
        </h2>
        <p className="text-sm" style={{ color: '#9c8b6e' }}>
          {language === 'ar' ? 'لا توجد نسخة منشورة للعجلة حاليًا' : 'No published wheel version available.'}
        </p>
      </div>
    );
  }

  const isBusy = gameState === 'spinning' || gameState === 'revealing';
  const effectiveFreeSpins = freeSpinsLeft;
  const spinCost = settings.single_spin_cost || settings.spin_cost_points || 100;
  const userPoints = user?.points || 0;

  // Grand prize info — read from published config
  const grandPrize = prizes.find(p => p.type === 'grand' || p.is_grand_prize);
  const grandState = grandPrize ? prizeStates.find(s => s.prize_id === grandPrize.id) : undefined;

  // Per-user grand prize progress (server-side, per-user unlock)
  const userGrandProgress = grandPrize
    ? userGrandPrizeProgress.find((p: any) => p.prize_id === grandPrize.id)
    : undefined;
  const grandTarget = grandPrize?.unlock_after_completed_spins ?? grandPrize?.unlock_target_value ?? 30;
  const grandProgress = (userGrandProgress as any)?.spin_count ?? grandState?.current_progress ?? 0;
  const grandLocked = grandPrize
    ? !(userGrandProgress as any)?.is_unlocked && grandProgress < grandTarget
    : lockedPrizeId !== null;
  const ringLen = 345.6;
  const ringOffset = grandLocked ? ringLen * (1 - Math.min(grandProgress / grandTarget, 1)) : 0;

  return (
    <div dir="rtl" className="relative w-full overflow-x-hidden" style={{ fontFamily: "'Tajawal', sans-serif", color: '#efe6d2', background: 'transparent' }}>
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0 z-0"
        style={{ background: 'radial-gradient(900px 500px at 50% -5%, rgba(214,178,94,.07), transparent 60%), radial-gradient(700px 500px at 90% 100%, rgba(120,80,20,.08), transparent 55%), #0c0805' }} />

      <div className="relative z-10 mx-auto max-w-[1180px] px-3 sm:px-4 py-5 sm:py-8">
        {/* Header */}
        <div className="text-center mb-5 aw-header-mobile">
          <h1 style={{
            fontFamily: "'Lalezar', cursive",
            fontSize: 'clamp(40px, 4.6vw, 60px)',
            lineHeight: 1.1,
            background: 'linear-gradient(100deg, #9a7220, #f8e7b4 35%, #fff8e2 50%, #f8e7b4 65%, #9a7220)',
            backgroundSize: '220% auto',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            animation: 'aw-shine 5s linear infinite',
          }}>
            {language === 'ar' ? settings.title_ar : settings.title_en}
          </h1>
          <div style={{ color: '#9c8b6e', fontSize: '14.5px' }}>
            {effectiveFreeSpins > 0
              ? (language === 'ar' ? <>لديك <b style={{ color: '#d9ab4e' }}>{effectiveFreeSpins}</b> دورات مجانية — أدر العجلة واربح جوائز فورية</> : <>You have <b style={{ color: '#d9ab4e' }}>{effectiveFreeSpins}</b> free spins</>)
              : (language === 'ar' ? <>كل لفة = <b style={{ color: '#d9ab4e' }}>{spinCost}</b> نقطة</> : <>Spin cost: <b style={{ color: '#d9ab4e' }}>{spinCost}</b> pts</>)}
          </div>
          {/* Winner pill */}
          <div className="mt-3"><WinnerPill /></div>
        </div>

        {/* 3-column grid (desktop) / stacked (mobile) */}
        <div className="grid gap-5 aw-wheel-grid" style={{
          gridTemplateColumns: n > 0 ? '250px minmax(480px,1fr) 250px' : '1fr',
          maxWidth: 1180, margin: '22px auto 0',
        }}>
          {/* ── RIGHT (in RTL: first child): Leaderboard + Prizes ── */}
          <div className="hidden lg:block">
            {/* Leaderboard */}
            <div className="rounded-2xl p-4 mb-4"
              style={{ background: '#181008', border: '1px solid rgba(214,178,94,.16)', boxShadow: '0 14px 34px rgba(0,0,0,.4)' }}>
              <h3 style={{ fontFamily: "'Lalezar', cursive", fontSize: 18, color: '#f8e7b4', marginBottom: 12 }}>🏅 {language === 'ar' ? 'أبطال العجلة' : 'Leaders'}</h3>
              <WheelLeaderboard compact />
            </div>
            {/* Prizes */}
            <div className="rounded-2xl p-4"
              style={{ background: '#181008', border: '1px solid rgba(214,178,94,.16)', boxShadow: '0 14px 34px rgba(0,0,0,.4)' }}>
              <div className="flex items-center justify-between mb-3">
                <h3 style={{ fontFamily: "'Lalezar', cursive", fontSize: 18, color: '#f8e7b4' }}>🎁 {language === 'ar' ? 'الجوائز' : 'Prizes'}</h3>
                {onNavigate && (
                  <button onClick={() => onNavigate('wheel-prizes')}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all hover:brightness-110"
                    style={{ background: 'rgba(214,170,98,.12)', color: '#d9ab4e', border: '1px solid rgba(214,170,98,.22)' }}>
                    {language === 'ar' ? 'كل الجوائز' : 'All'}
                  </button>
                )}
              </div>
              <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 280 }}>
                {activePrizes.filter(p => p.type !== 'miss').map(prize => {
                  const rarity = rarityForPrize(prize);
                  const rColor = RARITY_COLORS[rarity] || '#d9ab4e';
                  const state = prizeStates.find(s => s.prize_id === prize.id);
                  const isLockedPrize = prize.availability_mode === 'LOCKED_BY_GOAL' && state && !state.is_unlocked;
                  return (
                    <div key={prize.id} className="flex items-center gap-3 p-2.5 rounded-xl transition-all hover:translate-x-1"
                      style={{ background: '#0c0805', border: '1px solid rgba(214,178,94,.16)' }}>
                      <PrizeBadge prize={prize} size={36} locked={isLockedPrize} glow={rColor} />
                      <div className="flex-1 min-w-0">
                        <div style={{ fontWeight: 700, fontSize: 13.5, color: '#efe6d2' }}>{language === 'ar' ? prize.name_ar : prize.name_en}</div>
                        <div style={{ fontSize: 11, color: '#9c8b6e' }}>{isLockedPrize ? `مقفلة — ${state?.current_progress ?? 0}/${prize.unlock_target_value ?? 30}` : prize.value}</div>
                      </div>
                      <span style={{ fontSize: 9.5, padding: '3px 8px', borderRadius: 999, fontWeight: 700, background: `${rColor}22`, color: rColor, flexShrink: 0 }}>
                        {RARITY_LABELS_AR[rarity] || rarity}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── CENTER: Wheel ── */}
          <div id="aw-zone" className="aw-mobile-wheel-zone flex flex-col items-center"
            style={{
              position: 'relative', overflow: 'hidden',
              background: 'radial-gradient(55% 42% at 50% 36%, rgba(217,171,78,.09), transparent 70%), #181008',
              border: '1px solid rgba(214,178,94,.38)',
              borderRadius: 24, padding: '32px 22px 26px',
              boxShadow: '0 24px 60px rgba(0,0,0,.5), inset 0 1px 0 rgba(248,231,180,.07)',
            }}>
            {/* Halo */}
            <div className="aw-halo-mobile" style={{
              position: 'absolute', top: 46, width: 520, height: 520, borderRadius: '50%', pointerEvents: 'none',
              background: 'radial-gradient(circle, rgba(217,171,78,.16) 0%, rgba(217,171,78,.04) 45%, transparent 70%)',
              animation: 'aw-breath 4.2s ease-in-out infinite',
            }} />

            {/* Vignette */}
            <div className="aw-vignette-mobile" style={{
              position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: 24,
              background: 'radial-gradient(circle at 50% 45%, transparent 50%, rgba(0,0,0,.35) 100%)',
            }} />

            {/* Floating particles */}
            <FloatingParticles />

            {/* Wheel wrap */}
            <div className="relative aw-wheel-wrap-mobile" style={{ width: 'min(480px, 84vw)', maxWidth: 'min(92vw, 420px)', aspectRatio: 1, zIndex: 1 }}>
              {/* Pointer — metallic with spring bounce */}
              <div className="aw-pointer" style={{
                position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', zIndex: 6,
                filter: 'drop-shadow(0 5px 10px rgba(0,0,0,.6))', transformOrigin: '50% 20%',
              }}>
                <svg width="48" height="58" viewBox="0 0 52 62">
                  <defs>
                    <linearGradient id="aw-pg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#fdf0c8" /><stop offset=".35" stopColor="#f8e7b4" /><stop offset=".65" stopColor="#d9ab4e" /><stop offset="1" stopColor="#7c5a13" />
                    </linearGradient>
                    <linearGradient id="aw-pg-shine" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0" stopColor="rgba(255,255,255,0)" /><stop offset=".5" stopColor="rgba(255,255,255,0.4)" /><stop offset="1" stopColor="rgba(255,255,255,0)" />
                    </linearGradient>
                  </defs>
                  <path d="M26 60 L4 16 A26 26 0 0 1 48 16 Z" fill="url(#aw-pg)" stroke="#4a3405" strokeWidth="1.5" />
                  <path d="M26 58 L10 18 A22 22 0 0 1 42 18 Z" fill="url(#aw-pg-shine)" opacity="0.3" />
                  <circle cx="26" cy="17" r="7" fill="#fff6dd" />
                  <circle cx="24" cy="15" r="3" fill="rgba(255,255,255,0.6)" />
                </svg>
              </div>

              {/* Wheel SVG */}
              <svg viewBox="0 0 520 520" style={{ width: '100%', height: '100%', display: 'block', filter: 'drop-shadow(0 20px 36px rgba(0,0,0,.55))' }}>
                <defs>
                  <radialGradient id="aw-rim" cx="35%" cy="30%">
                    <stop offset="0%" stopColor="#ffedb5" /><stop offset=".3%" stopColor="#f8e7b4" /><stop offset="45%" stopColor="#cfa04a" />
                    <stop offset="75%" stopColor="#6e4f10" /><stop offset="100%" stopColor="#a8801f" />
                  </radialGradient>
                  <radialGradient id="aw-rim-inner" cx="40%" cy="30%">
                    <stop offset="0%" stopColor="#fdf0c8" /><stop offset="50%" stopColor="#d9ab4e" /><stop offset="100%" stopColor="#9a7220" />
                  </radialGradient>
                  <radialGradient id="aw-hub" cx="40%" cy="32%">
                    <stop offset="0%" stopColor="#3a2a12" /><stop offset="100%" stopColor="#100a05" />
                  </radialGradient>
                  <radialGradient id="aw-hub-rim" cx="35%" cy="28%">
                    <stop offset="0%" stopColor="#fdf0c8" /><stop offset="50%" stopColor="#d9ab4e" /><stop offset="100%" stopColor="#7c5a13" />
                  </radialGradient>
                  <linearGradient id="aw-cream" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#f2e3bd" /><stop offset="1" stopColor="#d6ba82" />
                  </linearGradient>
                  <linearGradient id="aw-brown" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#2e2010" /><stop offset="1" stopColor="#170f07" />
                  </linearGradient>
                  <linearGradient id="aw-jack" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#ffdf88" /><stop offset="1" stopColor="#dfa311" />
                  </linearGradient>
                  <linearGradient id="aw-vip" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#43101c" /><stop offset="1" stopColor="#230710" />
                  </linearGradient>
                  <linearGradient id="aw-coins" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#0a4a44" /><stop offset="1" stopColor="#063a35" />
                  </linearGradient>
                  <radialGradient id="aw-sheen" cx="50%" cy="50%">
                    <stop offset="0%" stopColor="rgba(255,255,255,0.06)" /><stop offset="100%" stopColor="rgba(255,255,255,0)" />
                  </radialGradient>
                  <radialGradient id="aw-badge-bg" cx="30%" cy="25%">
                    <stop offset="0%" stopColor="#33230f" /><stop offset="100%" stopColor="#120b05" />
                  </radialGradient>
                  <linearGradient id="aw-badgeRing" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#f8e7b4" /><stop offset=".5" stopColor="#d9ab4e" /><stop offset="1" stopColor="#9a7220" />
                  </linearGradient>
                  <radialGradient id="aw-rimGrand" cx="35%" cy="28%">
                    <stop offset="0%" stopColor="#ffdf88" /><stop offset="40%" stopColor="#d9ab4e" /><stop offset="80%" stopColor="#7c5a13" /><stop offset="100%" stopColor="#cfa04a" />
                  </radialGradient>
                </defs>

                {/* Outer gold ring (wide) */}
                <circle cx={CX} cy={CY} r="258" fill="url(#aw-rim)" />
                {/* Inner gold ring (thin, shiny) */}
                <circle cx={CX} cy={CY} r="242" fill="none" stroke="url(#aw-rim-inner)" strokeWidth="3" />
                {/* Dark backdrop */}
                <circle cx={CX} cy={CY} r="236" fill="#100a05" />

                {/* Rotating segments */}
                <g ref={rotatorRef} id="aw-rotor" style={{ transform: `rotate(${rotation}deg)`, transformOrigin: `${CX}px ${CY}px` }}>
                  {activePrizes.map((prize, i) => {
                    const { start: a0, size: sliceSize } = sectorAngles[i] || { start: i * (360 / n), size: 360 / n };
                    const a1 = a0 + sliceSize;
                    const [x0, y0] = polar(a0, R);
                    const [x1, y1] = polar(a1, R);
                    const mid = a0 + sliceSize / 2;
                    const isGrand = prize.type === 'grand';
                    const medSize = isGrand ? 92 : 78;
                    const medRadius = isGrand ? 152 : 158;
                    const [tx, ty] = polar(mid, medRadius);
                    const largeArc = sliceSize > 180 ? 1 : 0;
                    const fill = isGrand ? 'url(#aw-jack)' : prize.type === 'coins' ? 'url(#aw-coins)' : prize.type === 'miss' ? 'url(#aw-brown)' : i % 2 === 0 ? 'url(#aw-cream)' : 'url(#aw-brown)';
                    const textColor = isGrand ? '#241705' : prize.type === 'coins' ? '#31d8c5' : prize.type === 'miss' ? '#f8e7b4' : i % 2 === 0 ? '#241705' : '#f8e7b4';
                    const label = prize.short_label || (prize.name_ar.length > 5 ? prize.name_ar.slice(0, 5) : prize.name_ar);
                    const subText = prize.type === 'points' ? 'نقطة' : prize.type === 'miss' ? 'حظ أوفر' : prize.type === 'grand' ? 'الكبرى' : prize.type === 'coins' ? 'عملات' : 'خدمة';
                    const midNormalized = ((mid % 360) + 360) % 360;
                    const needsFlip = midNormalized > 90 && midNormalized < 270;
                    const isWinner = winningIndex === i;
                    const labelOffset = medSize / 2 + 14;
                    return (
                      <g key={prize.id} className={isWinner ? 'aw-seg-winner' : ''}>
                        <path d={`M${CX} ${CY} L${x0} ${y0} A${R} ${R} 0 ${largeArc} 1 ${x1} ${y1} Z`}
                          fill={fill} stroke="rgba(217,171,78,.55)" strokeWidth="1.5" />
                        <path d={`M${CX} ${CY} L${x0} ${y0} A${R} ${R} 0 ${largeArc} 1 ${x1} ${y1} Z`}
                          fill="url(#aw-sheen)" />
                        <line x1={CX} y1={CY} x2={x0} y2={y0} stroke="rgba(248,231,180,.4)" strokeWidth="1" />
                        <circle cx={x0} cy={y0} r="3" fill="url(#aw-badgeRing)" stroke="rgba(0,0,0,.3)" strokeWidth="0.5" />
                        <g transform={`translate(${tx},${ty}) rotate(${mid})`}>
                          <g transform={needsFlip ? 'rotate(180)' : ''}>
                            <g dangerouslySetInnerHTML={{ __html: badgeSvgHtml(prize, medSize) }} />
                            <text y={needsFlip ? -labelOffset : labelOffset} textAnchor="middle" fontFamily="'Lalezar', cursive"
                              fontSize={label.length > 4 ? 13 : 15} fill={textColor} style={{ filter: isGrand ? `drop-shadow(0 0 4px ${textColor})` : `drop-shadow(0 1px 2px rgba(0,0,0,.6))` }}>{label}</text>
                            {subText && <text y={needsFlip ? -(labelOffset + 14) : labelOffset + 14} textAnchor="middle" fontFamily="'Tajawal', sans-serif"
                              fontWeight="700" fontSize="9" fill={textColor} opacity=".7">{subText}</text>}
                          </g>
                        </g>
                      </g>
                    );
                  })}

                  {/* Lock overlay for grand prize */}
                  {grandPrize && grandLocked && (() => {
                    const gi = activePrizes.findIndex(p => p.id === grandPrize.id);
                    if (gi < 0) return null;
                    const { start: a0, size: sliceSize } = sectorAngles[gi] || { start: 0, size: 360 / n };
                    const a1 = a0 + sliceSize;
                    const mid = a0 + sliceSize / 2;
                    const largeArc = sliceSize > 180 ? 1 : 0;
                    const [x0, y0] = polar(a0, R);
                    const [x1, y1] = polar(a1, R);
                    const [lx, ly] = polar(mid, 168);
                    const [cA1x, cA1y] = polar(a0 + 6, 225);
                    const [cA2x, cA2y] = polar(a0 + 6, 110);
                    const [cB1x, cB1y] = polar(a1 - 6, 225);
                    const [cB2x, cB2y] = polar(a1 - 6, 110);
                    return (
                      <g id="aw-lockGroup" style={{ transition: 'opacity .6s, transform .6s', transformOrigin: 'center' }}>
                        <path d={`M${CX} ${CY} L${x0} ${y0} A${R} ${R} 0 ${largeArc} 1 ${x1} ${y1} Z`} fill="rgba(10,6,3,.62)" />
                        <line x1={cA1x} y1={cA1y} x2={cA2x} y2={cA2y} stroke="#c9c2b4" strokeWidth="5" strokeLinecap="round"
                          strokeDasharray="7 6" style={{ animation: 'aw-chain-spin 6s linear infinite', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.8))' }} />
                        <line x1={cB1x} y1={cB1y} x2={cB2x} y2={cB2y} stroke="#c9c2b4" strokeWidth="5" strokeLinecap="round"
                          strokeDasharray="7 6" style={{ animation: 'aw-chain-spin 6s linear infinite', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.8))' }} />
                        <g transform={`translate(${lx},${ly}) rotate(${mid})`}>
                          <circle r="26" fill="rgba(20,12,6,.9)" stroke="#e6455c" strokeWidth="2"
                            style={{ animation: 'aw-lock-pulse 1.8s ease-in-out infinite', transformOrigin: 'center', transformBox: 'fill-box' }} />
                          <text y="9" textAnchor="middle" fontSize="26">🔒</text>
                          <text y="44" textAnchor="middle" fontFamily="'Tajawal', sans-serif" fontWeight="800" fontSize="11" fill="#ff97a8">
                            {grandTarget} لفة للفتح
                          </text>
                        </g>
                      </g>
                    );
                  })()}

                  {/* Aura for grand prize */}
                  {grandPrize && (() => {
                    const gi = activePrizes.findIndex(p => p.id === grandPrize.id);
                    if (gi < 0) return null;
                    const { start: a0, size: sliceSize } = sectorAngles[gi] || { start: 0, size: 360 / n };
                    const a1 = a0 + sliceSize;
                    const largeArc = sliceSize > 180 ? 1 : 0;
                    const [x0, y0] = polar(a0, R);
                    const [x1, y1] = polar(a1, R);
                    return (
                      <path d={`M${CX} ${CY} L${x0} ${y0} A${R} ${R} 0 ${largeArc} 1 ${x1} ${y1} Z`}
                        fill="none" stroke={grandLocked ? '#e6455c' : '#ffdf88'} strokeWidth="4"
                        style={{ filter: `drop-shadow(0 0 10px ${grandLocked ? '#e6455c' : '#ffdf88'})`, animation: 'aw-aura-pulse 2s ease-in-out infinite' }} />
                    );
                  })()}
                </g>

                {/* Bulbs between rings */}
                <g>
                  {Array.from({ length: 24 }, (_, i) => {
                    const [bx, by] = polar(i * 15, 250);
                    return (
                      <g key={i}>
                        <circle cx={bx} cy={by} r="5" fill="#fdf0c8"
                          className="aw-bulb" style={{ filter: 'drop-shadow(0 0 6px #d9ab4e)', animation: `aw-blink 1.15s infinite${i % 2 ? ' .57s' : ''}` }} />
                        <circle cx={bx} cy={by} r="2" fill="rgba(255,255,255,0.7)" />
                      </g>
                    );
                  })}
                </g>

                {/* Center hub — dual gold rim + metallic disc */}
                <circle cx={CX} cy={CY} r="88" fill="url(#aw-hub-rim)" />
                <circle cx={CX} cy={CY} r="80" fill="url(#aw-hub)" stroke="rgba(217,171,78,.5)" strokeWidth="1.5" />
                <circle cx={CX} cy={CY} r="72" fill="none" stroke="rgba(217,171,78,.3)" strokeWidth="1" />
                {/* Hub inner shadow */}
                <circle cx={CX} cy={CY} r="72" fill="none" stroke="rgba(0,0,0,.3)" strokeWidth="2" style={{ transform: 'translate(0,2px)', transformOrigin: 'center' }} />
                <text x={CX} y="252" textAnchor="middle" fontFamily="'Lalezar', cursive" fontSize="32" fill="#f8e7b4"
                  style={{ filter: 'drop-shadow(0 0 6px rgba(217,171,78,.4))' }}>AXIE</text>
                <text x={CX} y="278" textAnchor="middle" fontFamily="'Tajawal', sans-serif" fontWeight="700" fontSize="13" fill="#9c8b6e">Lucky Spin</text>
              </svg>
            </div>

            {/* Spin button */}
            <button onClick={() => handleSpin(1)} disabled={!canSpin || isBusy}
              className="relative mt-5 aw-spin-btn"
              style={{
                fontFamily: "'Lalezar', cursive", fontSize: 24, color: '#241705',
                background: isBusy ? 'rgba(217,171,78,.3)' : 'linear-gradient(180deg, #fdf0c8 0%, #d9ab4e 50%, #9a7220 100%)',
                border: 'none', borderRadius: 16, padding: '14px 58px', cursor: canSpin && !isBusy ? 'pointer' : 'not-allowed',
                boxShadow: isBusy ? 'none' : '0 7px 0 #5d420c, 0 16px 36px rgba(217,171,78,.28)',
                animation: canSpin && !isBusy ? 'aw-btn-pulse 2.1s ease-in-out infinite' : 'none',
                opacity: !canSpin || isBusy ? 0.6 : 1,
                zIndex: 2, width: 'auto', minWidth: 280,
              }}>
              {isBusy
                ? (language === 'ar' ? 'العجلة تدور...' : 'Spinning...')
                : effectiveFreeSpins > 0
                  ? (language === 'ar' ? 'ابدأ السحب — مجاني' : 'Spin — Free')
                  : userPoints >= spinCost
                    ? (language === 'ar' ? `🎰 أدر العجلة — ${spinCost} نقطة` : `Spin — ${spinCost} pts`)
                    : (language === 'ar' ? '🔒 رصيد النقاط غير كافٍ' : 'Insufficient points')}
            </button>

            <div style={{ marginTop: 10, fontSize: 13, color: '#9c8b6e' }}>
              {language === 'ar' ? 'دورات مجانية متبقية: ' : 'Free spins left: '}
              <b style={{ color: '#31d8c5', fontSize: 15 }}>{effectiveFreeSpins}</b>
              {effectiveFreeSpins === 0 && (
                <span style={{ marginTop: 4, fontSize: 11, color: '#9c8b6e', display: 'block' }}>
                  {language === 'ar' ? `بعد انتهاء دوراتك المجانية: كل لفة = ${spinCost} نقطة` : `Each spin costs ${spinCost} points`}
                </span>
              )}
            </div>

            {/* Multi-spin buttons — costs from Admin settings */}
            <div className="flex gap-2 mt-3.5 aw-multispin-row">
              {[1, 5, 10].map(mult => {
                const cost = getSpinCost(mult);
                const isDisabled = mult > 1 && !settings.multi_spin_enabled;
                const affordable = canAffordSpin(mult);
                const isFree = mult === 1 && effectiveFreeSpins > 0;
                return (
                  <button key={mult} disabled={!affordable || isBusy || isDisabled}
                    onClick={() => mult > 1 ? setShowMultiSpinConfirm(mult) : handleSpin(1)}
                    style={{
                      background: '#0c0805', border: `1px solid ${affordable && !isDisabled ? 'rgba(214,178,94,.16)' : 'rgba(100,80,50,.1)'}`,
                      color: affordable && !isDisabled ? '#9c8b6e' : '#5d420c',
                      borderRadius: 10, padding: '7px 14px', fontFamily: "'Tajawal', sans-serif",
                      fontSize: 12, fontWeight: 700, cursor: affordable && !isBusy && !isDisabled ? 'pointer' : 'not-allowed',
                      opacity: affordable && !isDisabled ? 1 : 0.4, transition: '.2s',
                    }}>
                    سحب ×{mult}{isFree ? ' (مجاني)' : cost > 0 ? ` — ${cost.toLocaleString('en')}` : ''}
                  </button>
                );
              })}
            </div>

            {/* Multi-spin confirmation modal */}
            {showMultiSpinConfirm && (
              <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={() => setShowMultiSpinConfirm(null)}>
                <div onClick={e => e.stopPropagation()} style={{
                  background: '#181008', border: '1px solid rgba(214,178,94,.25)', borderRadius: 18,
                  padding: '24px 28px', maxWidth: 360, width: '90%', textAlign: 'center',
                }}>
                  <h3 style={{ fontFamily: "'Lalezar', cursive", fontSize: 22, color: '#f8e7b4', marginBottom: 16 }}>
                    تنفيذ {showMultiSpinConfirm} لفات
                  </h3>
                  <div style={{ display: 'grid', gap: 8, marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#9c8b6e' }}>
                      <span>عدد اللفات:</span>
                      <span style={{ color: '#f8e7b4', fontWeight: 700 }}>{showMultiSpinConfirm}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#9c8b6e' }}>
                      <span>سعر اللفة:</span>
                      <span style={{ color: '#f8e7b4', fontWeight: 700 }}>{spinCost.toLocaleString('en')} نقطة</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#9c8b6e' }}>
                      <span>الإجمالي:</span>
                      <span style={{ color: '#f8e7b4', fontWeight: 700 }}>{getSpinCost(showMultiSpinConfirm).toLocaleString('en')} نقطة</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#9c8b6e' }}>
                      <span>رصيدك الحالي:</span>
                      <span style={{ color: '#f8e7b4', fontWeight: 700 }}>{userPoints.toLocaleString('en')}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#9c8b6e', borderTop: '1px solid rgba(214,178,94,.1)', paddingTop: 8 }}>
                      <span>الرصيد بعد السحب:</span>
                      <span style={{ color: canAffordSpin(showMultiSpinConfirm) ? '#34d399' : '#f87171', fontWeight: 700 }}>
                        {(userPoints - getSpinCost(showMultiSpinConfirm)).toLocaleString('en')}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => setShowMultiSpinConfirm(null)} style={{
                      flex: 1, padding: '10px', borderRadius: 10, background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)', color: '#9c8b6e', fontWeight: 700, cursor: 'pointer',
                    }}>إلغاء</button>
                    <button disabled={!canAffordSpin(showMultiSpinConfirm) || isBusy || gameState !== 'ready'}
                      onClick={() => { if (gameState !== 'ready') return; const q = showMultiSpinConfirm; setShowMultiSpinConfirm(null); handleSpin(q); }}
                      style={{
                        flex: 1, padding: '10px', borderRadius: 10,
                        background: canAffordSpin(showMultiSpinConfirm) && gameState === 'ready' ? 'linear-gradient(135deg, #D6AA62, #8B6B2E)' : '#333',
                        border: 'none', color: '#fff', fontWeight: 700, cursor: canAffordSpin(showMultiSpinConfirm) && gameState === 'ready' ? 'pointer' : 'not-allowed',
                      }}>تأكيد السحب</button>
                  </div>
                </div>
              </div>
            )}

            {error && <p className="mt-3 text-sm text-center" style={{ color: '#F47067' }}>{error}</p>}
          </div>

          {/* ── LEFT (in RTL: last child): Lucky Spin + Jackpot + Timer + Streak ── */}
          <div className="hidden lg:flex flex-col gap-4">
            {/* Lucky Spin stats */}
            <div className="rounded-2xl p-4"
              style={{ background: '#181008', border: '1px solid rgba(214,178,94,.16)', boxShadow: '0 14px 34px rgba(0,0,0,.4)' }}>
              <h3 style={{ fontFamily: "'Lalezar', cursive", fontSize: 18, color: '#f8e7b4', textAlign: 'center' }}>Lucky Spin</h3>
              <p style={{ fontSize: 11, color: '#9c8b6e', textAlign: 'center', margin: '-8px 0 12px' }}>
                {language === 'ar' ? 'أدر العجلة وافز بجوائز رائعة' : 'Spin and win'}
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-xl p-3 text-center" style={{ background: '#0c0805', border: '1px solid rgba(214,178,94,.16)' }}>
                  <b style={{ fontFamily: "'Lalezar', cursive", fontSize: 26, color: '#f8e7b4', display: 'block', lineHeight: 1.1 }}>
                    {userPoints.toLocaleString('en')}
                  </b>
                  <span style={{ fontSize: 11, color: '#9c8b6e' }}>{language === 'ar' ? 'نقاطك' : 'Points'}</span>
                </div>
                <div className="rounded-xl p-3 text-center" style={{ background: '#0c0805', border: '1px solid rgba(214,178,94,.16)' }}>
                  <b style={{ fontFamily: "'Lalezar', cursive", fontSize: 26, color: '#f8e7b4', display: 'block', lineHeight: 1.1 }}>
                    {effectiveFreeSpins}
                  </b>
                  <span style={{ fontSize: 11, color: '#9c8b6e' }}>{language === 'ar' ? 'محاولاتك' : 'Tries'}</span>
                </div>
              </div>
            </div>

            {/* Jackpot card */}
            {grandPrize && (
              <div className="rounded-2xl p-4 relative overflow-hidden"
                style={{
                  background: '#181008',
                  border: `1px solid ${grandLocked ? 'rgba(230,69,92,.45)' : 'rgba(214,178,94,.38)'}`,
                  boxShadow: '0 14px 34px rgba(0,0,0,.4)',
                }}>
                {/* Sweep effect */}
                <div style={{
                  position: 'absolute', top: 0, left: '-80%', width: '55%', height: '100%',
                  background: 'linear-gradient(100deg, transparent, rgba(248,231,180,.10), transparent)',
                  animation: 'aw-sweep 3.8s ease-in-out infinite',
                }} />
                <h3 style={{ fontFamily: "'Lalezar', cursive", fontSize: 18, textAlign: 'center', marginBottom: 8,
                  color: grandLocked ? '#ff97a8' : '#f8e7b4' }}>
                  {grandLocked ? '🔒 ' : '💎 '}{language === 'ar' ? 'الجائزة الكبرى' : 'Jackpot'}
                </h3>
                <div style={{
                  fontFamily: "'Lalezar', cursive", fontSize: 40, lineHeight: 1.15, textAlign: 'center',
                  background: 'linear-gradient(180deg, #fff8e2, #d9ab4e 60%, #9a7220)',
                  WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
                  filter: 'drop-shadow(0 2px 8px rgba(217,171,78,.35))',
                }}>
                  {grandPrize ? (language === 'ar' ? grandPrize.name_ar : grandPrize.name_en) : jackpotValue.toLocaleString('en')}
                </div>
                {grandPrize?.value && (
                  <div style={{ fontSize: '12.5px', color: '#d9ab4e', textAlign: 'center' }}>
                    {grandPrize.value}
                  </div>
                )}

                {/* Grand Prize image/icon */}
                {grandPrize?.primary_icon_url && (
                  <div style={{ display: 'flex', justifyContent: 'center', margin: '10px 0' }}>
                    <div style={{
                      width: 80, height: 80, borderRadius: '50%', overflow: 'hidden',
                      border: `3px solid ${grandLocked ? 'rgba(214,178,94,.3)' : '#d6aa62'}`,
                      boxShadow: grandLocked ? 'none' : '0 0 20px rgba(214,170,98,.4), 0 0 40px rgba(214,170,98,.15)',
                      animation: grandLocked ? 'none' : 'aw-lock-bob 3s ease-in-out infinite',
                    }}>
                      <img src={grandPrize.primary_icon_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  </div>
                )}

                {/* Progress ring */}
                <div style={{ position: 'relative', width: 128, height: 128, margin: '6px auto' }}>
                  <svg width="128" height="128" viewBox="0 0 128 128" style={{ transform: 'rotate(-90deg)' }}>
                    <defs>
                      <linearGradient id="aw-ringGrad" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stopColor="#f8e7b4" /><stop offset="1" stopColor="#d9ab4e" />
                      </linearGradient>
                    </defs>
                    <circle cx="64" cy="64" r="55" fill="none" stroke="#0d0906" strokeWidth="9" />
                    <circle cx="64" cy="64" r="55" fill="none" stroke="url(#aw-ringGrad)" strokeWidth="9" strokeLinecap="round"
                      strokeDasharray={ringLen} strokeDashoffset={ringOffset}
                      style={{ transition: 'stroke-dashoffset .9s cubic-bezier(.2,.9,.2,1)', filter: 'drop-shadow(0 0 6px rgba(217,171,78,.6))' }} />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
                    <div>
                      <div style={{ fontSize: 26, animation: 'aw-lock-bob 2s ease-in-out infinite' }}>
                        {grandLocked ? '🔒' : '🔓'}
                      </div>
                      <b style={{ fontFamily: "'Lalezar', cursive", fontSize: 20, color: '#f8e7b4', display: 'block', lineHeight: 1 }}>
                        {grandLocked ? `${grandProgress}/${grandTarget}` : (language === 'ar' ? 'متاحة' : 'Unlocked')}
                      </b>
                      <span style={{ fontSize: 10, color: '#9c8b6e' }}>{language === 'ar' ? 'لفة' : 'spins'}</span>
                    </div>
                  </div>
                </div>

                <div style={{
                  marginTop: 10, fontSize: 12, textAlign: 'center', fontWeight: 700,
                  color: grandLocked ? '#9c8b6e' : '#f8e7b4',
                  animation: grandLocked ? 'none' : 'aw-cta-blink 2.2s ease-in-out infinite',
                }}>
                  {grandLocked
                    ? (language === 'ar' ? `اكمل ${Math.max(0, grandTarget - grandProgress)} لفة اضافية لفتح فرصة الفوز` : `Complete ${Math.max(0, grandTarget - grandProgress)} more spins to unlock`)
                    : (language === 'ar' ? 'اصبحت مؤهلا للفوز بهذه الجائزة' : 'You are now eligible to win!')}
                </div>
              </div>
            )}

            {/* Timer card */}
            <div className="rounded-2xl p-4"
              style={{ background: '#181008', border: '1px solid rgba(214,178,94,.16)', boxShadow: '0 14px 34px rgba(0,0,0,.4)' }}>
              <h3 style={{ fontFamily: "'Lalezar', cursive", fontSize: 18, color: '#f8e7b4', textAlign: 'center' }}>⏳ {language === 'ar' ? 'تجديد الدورات' : 'Reset'}</h3>
              <div className="flex justify-center gap-1.5 mt-2.5">
                {[
                  { v: countdown.h, l: language === 'ar' ? 'ساعة' : 'hr' },
                  { v: countdown.m, l: language === 'ar' ? 'دقيقة' : 'min' },
                  { v: countdown.s, l: language === 'ar' ? 'ثانية' : 'sec' },
                ].map((t, i) => (
                  <div key={i} className="rounded-lg text-center" style={{ background: '#0c0805', border: '1px solid rgba(214,178,94,.16)', minWidth: 48, padding: '6px 4px' }}>
                    <b style={{ fontFamily: "'Lalezar', cursive", fontSize: 19, color: '#f8e7b4', display: 'block' }}>
                      {String(t.v).padStart(2, '0')}
                    </b>
                    <span style={{ fontSize: '9.5px', color: '#9c8b6e' }}>{t.l}</span>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 11, color: '#9c8b6e', textAlign: 'center', marginTop: 6 }}>
                {language === 'ar' ? 'حتى تجديد دوراتك المجانية' : 'Until free spins reset'}
              </p>
            </div>

            {/* Streak card */}
            <div className="rounded-2xl p-4"
              style={{ background: '#181008', border: '1px solid rgba(214,178,94,.16)', boxShadow: '0 14px 34px rgba(0,0,0,.4)' }}>
              <div className="flex justify-between items-center mb-1.5" style={{ fontSize: 12, color: '#9c8b6e' }}>
                <span>🔥 {language === 'ar' ? 'سلسلة الحظ' : 'Lucky Streak'}</span>
                <b style={{ color: '#f8e7b4' }}>{streak}%</b>
              </div>
              <div style={{ height: 12, borderRadius: 999, background: '#0c0805', border: '1px solid rgba(214,178,94,.16)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${streak}%`, borderRadius: 999,
                  transition: 'width .9s cubic-bezier(.2,.9,.2,1)',
                  background: 'linear-gradient(90deg, #9a7220, #d9ab4e, #f8e7b4)',
                  boxShadow: '0 0 12px rgba(217,171,78,.55)', position: 'relative',
                }}>
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'linear-gradient(90deg, transparent 40%, rgba(255,255,255,.45) 50%, transparent 60%)',
                    backgroundSize: '200% 100%', animation: 'aw-bar-shine 1.8s linear infinite',
                  }} />
                </div>
              </div>
              <p style={{ fontSize: 11, color: '#9c8b6e', textAlign: 'center', marginTop: 6 }}>
                {language === 'ar' ? 'أكمل 3 دورات واحصل على دورة إضافية مضمونة' : 'Complete 3 spins for a bonus spin'}
              </p>
            </div>
          </div>
        </div>

        {/* Mobile: 3 stat cards + jackpot + timer + streak + prizes + leaderboard */}
        <div className="lg:hidden mt-5 space-y-3">
          {/* 3 stat cards: points | tries | jackpot */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="rounded-xl p-3 text-center" style={{ background: '#181008', border: '1px solid rgba(214,178,94,.16)' }}>
              <b style={{ fontFamily: "'Lalezar', cursive", fontSize: 22, color: '#f8e7b4', display: 'block', lineHeight: 1.1 }}>
                {userPoints.toLocaleString('en')}
              </b>
              <span style={{ fontSize: 10, color: '#9c8b6e' }}>{language === 'ar' ? 'نقاطك' : 'Points'}</span>
            </div>
            <div className="rounded-xl p-3 text-center" style={{ background: '#181008', border: '1px solid rgba(214,178,94,.16)' }}>
              <b style={{ fontFamily: "'Lalezar', cursive", fontSize: 22, color: '#f8e7b4', display: 'block', lineHeight: 1.1 }}>
                {effectiveFreeSpins}
              </b>
              <span style={{ fontSize: 10, color: '#9c8b6e' }}>{language === 'ar' ? 'محاولاتك' : 'Tries'}</span>
            </div>
            <div className="rounded-xl p-3 text-center" style={{ background: '#181008', border: grandLocked ? '1px solid rgba(230,69,92,.35)' : '1px solid rgba(214,178,94,.25)' }}>
              <b style={{ fontFamily: "'Lalezar', cursive", fontSize: 18, color: grandLocked ? '#ff97a8' : '#f8e7b4', display: 'block', lineHeight: 1.1 }}>
                {grandLocked ? '🔒' : jackpotValue.toLocaleString('en')}
              </b>
              <span style={{ fontSize: 10, color: '#9c8b6e' }}>{language === 'ar' ? 'الكبرى' : 'Jackpot'}</span>
            </div>
          </div>

          {/* Timer card (full width) */}
          <div className="rounded-2xl p-4" style={{ background: '#181008', border: '1px solid rgba(214,178,94,.16)' }}>
            <h3 style={{ fontFamily: "'Lalezar', cursive", fontSize: 18, color: '#f8e7b4', textAlign: 'center' }}>⏳ {language === 'ar' ? 'تجديد الدورات' : 'Reset'}</h3>
            <div className="flex justify-center gap-1.5 mt-2.5">
              {[
                { v: countdown.h, l: language === 'ar' ? 'ساعة' : 'hr' },
                { v: countdown.m, l: language === 'ar' ? 'دقيقة' : 'min' },
                { v: countdown.s, l: language === 'ar' ? 'ثانية' : 'sec' },
              ].map((t, i) => (
                <div key={i} className="rounded-lg text-center" style={{ background: '#0c0805', border: '1px solid rgba(214,178,94,.16)', minWidth: 48, padding: '6px 4px' }}>
                  <b style={{ fontFamily: "'Lalezar', cursive", fontSize: 19, color: '#f8e7b4', display: 'block' }}>
                    {String(t.v).padStart(2, '0')}
                  </b>
                  <span style={{ fontSize: '9.5px', color: '#9c8b6e' }}>{t.l}</span>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11, color: '#9c8b6e', textAlign: 'center', marginTop: 6 }}>
              {language === 'ar' ? 'حتى تجديد دوراتك المجانية' : 'Until free spins reset'}
            </p>
          </div>

          {/* Streak card (full width) */}
          <div className="rounded-2xl p-4" style={{ background: '#181008', border: '1px solid rgba(214,178,94,.16)' }}>
            <div className="flex justify-between items-center mb-1.5" style={{ fontSize: 12, color: '#9c8b6e' }}>
              <span>🔥 {language === 'ar' ? 'سلسلة الحظ' : 'Lucky Streak'}</span>
              <b style={{ color: '#f8e7b4' }}>{streak}%</b>
            </div>
            <div style={{ height: 12, borderRadius: 999, background: '#0c0805', border: '1px solid rgba(214,178,94,.16)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${streak}%`, borderRadius: 999,
                transition: 'width .9s cubic-bezier(.2,.9,.2,1)',
                background: 'linear-gradient(90deg, #9a7220, #d9ab4e, #f8e7b4)',
                boxShadow: '0 0 12px rgba(217,171,78,.55)', position: 'relative',
              }}>
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(90deg, transparent 40%, rgba(255,255,255,.45) 50%, transparent 60%)',
                  backgroundSize: '200% 100%', animation: 'aw-bar-shine 1.8s linear infinite',
                }} />
              </div>
            </div>
            <p style={{ fontSize: 11, color: '#9c8b6e', textAlign: 'center', marginTop: 6 }}>
              {language === 'ar' ? 'أكمل 3 دورات واحصل على دورة إضافية مضمونة' : 'Complete 3 spins for a bonus spin'}
            </p>
          </div>

          {/* Leaderboard (full width) */}
          <div className="rounded-2xl p-4" style={{ background: '#181008', border: '1px solid rgba(214,178,94,.16)' }}>
            <h3 style={{ fontFamily: "'Lalezar', cursive", fontSize: 18, color: '#f8e7b4', marginBottom: 12 }}>🏅 {language === 'ar' ? 'أبطال العجلة' : 'Leaders'}</h3>
            <WheelLeaderboard compact />
          </div>

          {/* Prizes (full width) */}
          <div className="rounded-2xl p-4" style={{ background: '#181008', border: '1px solid rgba(214,178,94,.16)' }}>
            <h3 style={{ fontFamily: "'Lalezar', cursive", fontSize: 18, color: '#f8e7b4', marginBottom: 12 }}>🎁 {language === 'ar' ? 'الجوائز المتاحة' : 'Available Prizes'}</h3>
            <div className="grid grid-cols-1 gap-2.5">
              {activePrizes.filter(p => p.type !== 'miss').map(prize => {
                const rarity = rarityForPrize(prize);
                const rColor = RARITY_COLORS[rarity] || '#d9ab4e';
                const state = prizeStates.find(s => s.prize_id === prize.id);
                const isLockedPrize = prize.availability_mode === 'LOCKED_BY_GOAL' && state && !state.is_unlocked;
                return (
                  <div key={prize.id} className="flex items-center gap-3 p-2.5 rounded-xl" style={{ background: '#0c0805', border: '1px solid rgba(214,178,94,.16)' }}>
                    <PrizeBadge prize={prize} size={36} locked={isLockedPrize} glow={rColor} />
                    <div className="flex-1 min-w-0">
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: '#efe6d2' }}>{language === 'ar' ? prize.name_ar : prize.name_en}</div>
                      <div style={{ fontSize: 11, color: '#9c8b6e' }}>{isLockedPrize ? `مقفلة — ${state?.current_progress ?? 0}/${prize.unlock_target_value ?? 30}` : prize.value}</div>
                    </div>
                    <span style={{ fontSize: 9.5, padding: '3px 8px', borderRadius: 999, fontWeight: 700, background: `${rColor}22`, color: rColor, flexShrink: 0 }}>
                      {RARITY_LABELS_AR[rarity] || rarity}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <EventStrip />
        </div>
      </div>

      {/* Winner reveal overlay */}
      {showWinner && winPrize && (
        <div onClick={closeWinner}
          style={{
            position: 'fixed', inset: 0, zIndex: 50, display: 'grid', placeItems: 'center',
            background: 'rgba(8,5,2,.84)', backdropFilter: 'blur(6px)',
            opacity: showWinner ? 1 : 0, pointerEvents: showWinner ? 'auto' : 'none',
            transition: 'opacity .35s',
          }}>
          <div onClick={e => e.stopPropagation()}
            className="aw-winner-modal"
            style={{
              textAlign: 'center', padding: '40px 54px', borderRadius: 24, position: 'relative',
              background: 'radial-gradient(120% 120% at 50% 0%, rgba(217,171,78,.20), transparent 55%), linear-gradient(180deg, #221708, #120c06)',
              border: '1.5px solid rgba(214,178,94,.38)',
              boxShadow: '0 0 80px rgba(217,171,78,.30)',
              transform: showWinner ? 'scale(1)' : 'scale(.72)',
              transition: 'transform .45s cubic-bezier(.18,1.4,.3,1)',
              maxWidth: 'calc(100vw - 40px)',
            }}>
            {/* Rays */}
            <div style={{
              position: 'absolute', inset: -70, zIndex: -1, borderRadius: '50%',
              background: 'repeating-conic-gradient(from 0deg, transparent 0 12deg, rgba(217,171,78,.10) 12deg 20deg)',
              animation: 'aw-rays 15s linear infinite',
            }} />
            {/* Prize badge in winner modal */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
              <PrizeBadge prize={winPrize} size={72} glow={winPrize.glow_color || RARITY_COLORS[rarityForPrize(winPrize)]} />
            </div>
            <div style={{ fontFamily: "'Lalezar', cursive", fontSize: 30, color: '#f8e7b4', marginTop: 6 }}>
              {winPrize.type === 'miss' ? (language === 'ar' ? 'حظ أوفر' : 'Better Luck') : (language === 'ar' ? 'مبروووك!' : 'Congratulations!')}
            </div>
            <div style={{
              fontFamily: "'Lalezar', cursive", fontSize: 56, lineHeight: 1.1,
              background: 'linear-gradient(180deg, #fff8e2, #d9ab4e, #9a7220)',
              WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
            }}>
              {winPrize.type === 'miss' ? (language === 'ar' ? 'المرة القادمة' : 'Next time') : (language === 'ar' ? winPrize.name_ar : winPrize.name_en)}
            </div>
            <div style={{ color: '#9c8b6e', fontSize: 14, marginBottom: batchResults && batchResults.length > 1 ? 8 : 20 }}>
              {winPrize.type === 'miss'
                ? (language === 'ar' ? 'جرّب مرة ثانية' : 'Try again')
                : winPrize.type === 'coins'
                  ? (language === 'ar' ? 'تم فتح محادثة مع الدعم لتسليم العملات' : 'Support chat opened for coin delivery')
                  : lastFulfillmentCase
                    ? (language === 'ar' ? 'هذه الجائزة تحتاج إلى تسليم من فريق أكسي' : 'This prize requires manual delivery')
                    : (language === 'ar' ? 'أُضيفت الجائزة إلى رصيدك فورًا' : 'Prize added to your balance instantly')}
            </div>

            {/* Batch results summary (for x5 or x10) — grouped */}
            {batchResults && batchResults.length > 1 && (() => {
              const groups = new Map<string, { prize: WheelPrize; count: number; fallbackCount: number }>();
              for (const r of batchResults) {
                const key = r.prize.id;
                const g = groups.get(key) || { prize: r.prize, count: 0, fallbackCount: 0 };
                g.count++;
                if ((r as any).fallbackUsed) g.fallbackCount++;
                groups.set(key, g);
              }
              const grouped = Array.from(groups.values()).sort((a, b) => b.count - a.count);
              const totalPointsWon = batchResults.reduce((s, r) => s + (r.prize.type === 'points' ? (parseInt(r.prize.value) || 0) : 0), 0);
              return (
                <div style={{
                  marginBottom: 14, padding: '12px 16px', borderRadius: 12,
                  background: 'rgba(217,171,78,0.07)', border: '1px solid rgba(217,171,78,0.18)',
                  textAlign: 'right',
                }}>
                  <div style={{ fontSize: 13, color: '#d6aa62', marginBottom: 10, textAlign: 'center', fontWeight: 700 }}>
                    {language === 'ar' ? `نتائج ${batchResults.length} لفات` : `${batchResults.length} Spin Results`}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {grouped.map(g => (
                      <div key={g.prize.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <PrizeBadge prize={g.prize} size={26} />
                        <span style={{ fontSize: 13, color: '#efe6d2', flex: 1 }}>{language === 'ar' ? g.prize.name_ar : g.prize.name_en}</span>
                        <span style={{ fontSize: 13, color: '#d9ab4e', fontWeight: 700, fontFamily: 'monospace' }}>
                          x{g.count}
                        </span>
                      </div>
                    ))}
                  </div>
                  {totalPointsWon > 0 && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(217,171,78,0.15)', textAlign: 'center', fontSize: 13, color: '#34d399' }}>
                      {language === 'ar' ? `إجمالي النقاط: +${totalPointsWon.toLocaleString('en')}` : `Total Points: +${totalPointsWon.toLocaleString('en')}`}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Fulfillment case info */}
            {lastFulfillmentCase && (
              <div style={{
                marginTop: 14, padding: '10px 16px', borderRadius: 12,
                background: 'rgba(214,170,98,0.08)', border: '1px solid rgba(214,170,98,0.2)',
                fontSize: 13, color: '#bc9a72', textAlign: 'center', marginBottom: 16,
              }}>
                <div style={{ fontFamily: 'monospace', color: '#d6aa62', fontWeight: 700 }}>
                  {lastFulfillmentCase.caseCode || 'AX-CASE'}
                </div>
                <div style={{ marginTop: 4, fontSize: 12 }}>
                  {language === 'ar' ? 'تم فتح محادثة خاصة لمتابعة التسليم' : 'A private conversation was opened for delivery'}
                </div>
              </div>
            )}

            {/* Buttons */}
            {lastFulfillmentCase && onOpenMyPrizes ? (
              <div className="flex gap-2.5" style={{ marginTop: 18 }}>
                <button onClick={() => { onOpenMyPrizes(lastFulfillmentCase.caseId); closeWinner(); }}
                  style={{
                    flex: 2, padding: '14px 16px', borderRadius: 999, fontWeight: 800, fontSize: 15,
                    background: 'linear-gradient(180deg, #fdf0c8, #d9ab4e, #9a7220)', color: '#241705',
                    border: 'none', cursor: 'pointer', boxShadow: '0 5px 0 #5d420c',
                  }}>
                  {language === 'ar' ? 'فتح محادثة الجائزة' : 'Open Prize Chat'}
                </button>
                <button onClick={closeWinner}
                  style={{
                    flex: 1, padding: '14px 16px', borderRadius: 999, fontWeight: 700,
                    background: 'rgba(255,255,255,0.05)', color: '#bc9a72',
                    border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
                  }}>
                  {language === 'ar' ? 'لاحقاً' : 'Later'}
                </button>
              </div>
            ) : (
              <button onClick={() => { closeWinner(); setTimeout(() => handleSpin(spinQuantity), 350); }}
                style={{
                  fontFamily: "'Tajawal', sans-serif", fontWeight: 800, fontSize: 15, color: '#241705',
                  background: 'linear-gradient(180deg, #fdf0c8, #d9ab4e, #9a7220)',
                  border: 'none', borderRadius: 12, padding: '12px 36px', cursor: 'pointer',
                  boxShadow: '0 5px 0 #5d420c',
                }}>
                {winPrize.type === 'miss'
                  ? (language === 'ar' ? 'أدر مرة أخرى 🔄' : 'Spin Again 🔄')
                  : (language === 'ar' ? 'أدر مرة أخرى 🔄' : 'Spin Again 🔄')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Fallback for lastWin from hook (miss prizes) */}
      {lastWin && !showWinner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.8)', backdropFilter: 'blur(8px)' }} onClick={clearLastWin}>
          <div className="max-w-sm w-full rounded-3xl p-7 text-center relative"
            style={{ background: 'linear-gradient(180deg, #221708, #120c06)', border: `1px solid ${lastWin.accent_color}45` }}>
            <button onClick={clearLastWin} className="absolute top-4 end-4 w-9 h-9 flex items-center justify-center rounded-xl" style={{ color: '#d7b991' }}>
              <X className="w-4 h-4" />
            </button>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <PrizeBadge prize={lastWin} size={80} glow={lastWin.glow_color || lastWin.accent_color} />
            </div>
            <h2 className="text-2xl font-bold mb-1" style={{ color: '#f9ead4', fontFamily: "'Tajawal', sans-serif" }}>
              {language === 'ar' ? lastWin.name_ar : lastWin.name_en}
            </h2>
            <p className="text-sm mb-5" style={{ color: '#bc9a72' }}>{lastWin.value}</p>
            <button onClick={clearLastWin}
              className="w-full py-3.5 rounded-2xl font-bold text-lg"
              style={{ background: 'linear-gradient(180deg, #fdf0c8, #d9ab4e)', color: '#241705', fontFamily: "'Tajawal', sans-serif" }}>
              {language === 'ar' ? 'متابعة' : 'Continue'}
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="aw-toast"
          style={{
            position: 'fixed', bottom: 26, left: '50%', transform: 'translateX(-50%)',
            background: 'linear-gradient(180deg, #221708, #140d06)',
            border: `1px solid ${toast.mode === 'gold' ? 'rgba(214,178,94,.38)' : 'rgba(230,69,92,.55)'}`,
            borderRadius: 14, color: '#efe6d2', padding: '13px 22px', fontSize: '13.5px', fontWeight: 700,
            zIndex: 70, display: 'flex', gap: 9, alignItems: 'center',
            boxShadow: '0 16px 40px rgba(0,0,0,.6)',
            opacity: 1, transition: '.35s',
            maxWidth: 'calc(100vw - 32px)',
          }}
          dangerouslySetInnerHTML={{ __html: toast.html }} />
      )}

      {/* Unlock flash */}
      {unlockFlash && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 65, pointerEvents: 'none',
          background: 'radial-gradient(circle at 50% 45%, rgba(255,223,136,.5), transparent 60%)',
          animation: 'aw-flash 1.1s ease-out',
        }}
          onAnimationEnd={() => setUnlockFlash(false)} />
      )}
    </div>
  );
}
