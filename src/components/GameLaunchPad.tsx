import { useRef, useEffect, useCallback } from 'react';
import { Users, Coins, Layers, CircleDot, Zap, Trophy, Package, ArrowRight, ArrowLeft, Lock } from 'lucide-react';

export interface GameCardData {
  id: string;
  titleAr: string;
  titleEn: string;
  descAr: string;
  descEn: string;
  page: string;
  accentColor: string;
  players: number | null;
  tag: string;
  theme: 'green' | 'gold' | 'cyan' | 'red' | 'violet' | 'neutral';
  badge?: string;
  isPlaceholder?: boolean;
}

function GameIcon({ id }: { id: string }) {
  const cls = 'w-6 h-6';
  if (id === 'wheel')           return <CircleDot className={cls} strokeWidth={1.5} />;
  if (id === 'lucky-card')      return <Layers    className={cls} strokeWidth={1.5} />;
  if (id === 'coin-rush')       return <Coins     className={cls} strokeWidth={1.5} />;
  if (id === 'speed-challenge') return <Zap       className={cls} strokeWidth={1.5} />;
  if (id === 'tournament')      return <Trophy    className={cls} strokeWidth={1.5} />;
  return <Package className={cls} strokeWidth={1.5} />;
}

interface TrapButtonProps {
  game: GameCardData;
  side: 'right' | 'left';
  isAr: boolean;
  isRTL: boolean;
  onNavigate: (page: string) => void;
}

export function GameLaunchPad({ game, side, isAr, isRTL, onNavigate }: TrapButtonProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const fxRef  = useRef<HTMLDivElement>(null);

  /*
   * Per-button lerp state — plain object in a ref, never triggers React renders.
   * Mirrors the reference's Map<button, state> approach exactly.
   */
  const s = useRef({ mx:0, my:0, px:0, py:0, tmx:0, tmy:0, tpx:0, tpy:0, over:false });
  const rafId = useRef(0);
  const reduced = useRef(
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  /* rAF lerp loop — one loop per mounted button, updates CSS vars directly */
  useEffect(() => {
    if (reduced.current) return;
    const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

    const loop = () => {
      const btn = btnRef.current;
      if (btn) {
        const q = s.current;
        const k = q.over ? 0.18 : 0.12;
        q.mx = lerp(q.mx, q.tmx, k);
        q.my = lerp(q.my, q.tmy, k);
        q.px = lerp(q.px, q.tpx, k);
        q.py = lerp(q.py, q.tpy, k);
        const delta = Math.abs(q.mx) + Math.abs(q.my) + Math.abs(q.px) + Math.abs(q.py);
        if (delta > 0.01 || q.over) {
          btn.style.setProperty('--mx', q.mx.toFixed(2) + 'deg');
          btn.style.setProperty('--my', q.my.toFixed(2) + 'deg');
          btn.style.setProperty('--px', q.px.toFixed(1) + 'px');
          btn.style.setProperty('--py', q.py.toFixed(1) + 'px');
        }
      }
      rafId.current = requestAnimationFrame(loop);
    };

    rafId.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId.current);
  }, []);

  /* pointermove: update lerp targets + glare (immediate) */
  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width  * 2 - 1;
    const ny = (e.clientY - r.top)  / r.height * 2 - 1;
    const q = s.current;
    q.tmy =  nx * 7;
    q.tmx = -ny * 7;
    q.tpx =  nx * 6;
    q.tpy =  ny * 6;
    q.over = true;
    btn.style.setProperty('--gx', ((nx + 1) / 2 * 100).toFixed(1) + '%');
    btn.style.setProperty('--gy', ((ny + 1) / 2 * 100).toFixed(1) + '%');
  }, []);

  const handlePointerLeave = useCallback(() => {
    const q = s.current;
    q.tmx = q.tmy = q.tpx = q.tpy = 0;
    q.over = false;
  }, []);

  /* click: ripple effect — imperative DOM, no React state */
  const spawnRipple = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const fx = fxRef.current;
    const btn = btnRef.current;
    if (!fx || !btn) return;
    const r = btn.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 1.4;
    const rip = document.createElement('span');
    rip.className = 'trap-ripple';
    rip.style.cssText =
      `width:${size}px;height:${size}px;` +
      `left:${(e.clientX - r.left).toFixed(0)}px;` +
      `top:${(e.clientY - r.top).toFixed(0)}px;`;
    fx.appendChild(rip);
    setTimeout(() => rip.remove(), 650);
  }, []);

  /* CTA arrow: right-bank points inward (←), left-bank points inward (→) */
  const CtaArrow = side === 'right' ? ArrowLeft : ArrowRight;

  return (
    <button
      ref={btnRef}
      className={`trap-btn trap-${game.theme} trap-${side}`}
      data-placeholder={game.isPlaceholder ? 'true' : undefined}
      onClick={(e) => {
        spawnRipple(e);
        if (!game.isPlaceholder) onNavigate(game.page);
      }}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      aria-label={isAr ? game.titleAr : game.titleEn}
      aria-disabled={game.isPlaceholder}
    >
      {game.badge && (
        <span className="trap-badge" aria-hidden="true">{game.badge}</span>
      )}

      {/* Effects layer — overflow:hidden, intentionally flat (not in 3D context) */}
      <div ref={fxRef} className="trap-fx" aria-hidden="true">
        <div className="trap-glare" />
        <div className="trap-sheen" />
      </div>

      {/*
       * trap-inner: grid layout.
       * RIGHT bank: [text cols] [icon] — icon on outer-right edge.
       * LEFT bank:  [icon] [text cols] — icon on outer-left edge.
       * Achieved via CSS data-side attribute without changing JSX order.
       */}
      <div className="trap-inner" data-side={side}>
        <div className="trap-icon">
          <GameIcon id={game.id} />
        </div>

        <div className="trap-topline">
          <span className="trap-title">{isAr ? game.titleAr : game.titleEn}</span>
          <span className="trap-status">{game.tag}</span>
        </div>

        <p className="trap-desc">{isAr ? game.descAr : game.descEn}</p>

        <div className="trap-bottomline">
          <span className="trap-players">
            {game.players !== null ? (
              <><Users className="w-3 h-3" strokeWidth={1.5} />{game.players}</>
            ) : (
              /* Locked state for placeholder games */
              <span className="trap-locked">
                <Lock className="w-3 h-3" strokeWidth={2} />
                {isAr ? 'قريبًا' : 'Soon'}
              </span>
            )}
          </span>
          <span className="trap-cta">
            {game.isPlaceholder
              ? (isAr ? 'قريبًا' : 'Coming Soon')
              : (isAr ? 'العب الآن' : 'Play now')}
            <CtaArrow className="trap-arrow" strokeWidth={2} />
          </span>
        </div>
      </div>
    </button>
  );
}
