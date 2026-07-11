import { useState, useEffect, useMemo } from 'react';
import { useMagicChest, MagicChestStatus } from '../hooks/useMagicChest';
import { themeConfigs, ThemeConfig } from '../config/magicChestConfig';
import { Package, Lock, Clock, Sparkles, ChevronLeft, Gem, Star } from 'lucide-react';
import { CountdownTimer } from './MagicChest/CountdownTimer';
import { RewardPill } from './MagicChest/RewardPill';
import { FloatingParticles } from './MagicChest/FloatingParticles';

interface MagicChestBannerProps {
  onNavigate: () => void;
}

const STATUS_CONFIG: Record<MagicChestStatus, { label: string; badge: string; disabled: boolean }> = {
  locked:      { label: 'قريبًا',        badge: 'قريبًا',       disabled: true  },
  coming_soon: { label: 'يفتح قريبًا',   badge: 'قريبًا',       disabled: true  },
  active:      { label: 'افتح الصندوق',  badge: 'متاح الآن',    disabled: false },
  ended:       { label: 'انتهى الحدث',   badge: 'انتهى',        disabled: true  },
};

export const MagicChestBanner = ({ onNavigate }: MagicChestBannerProps) => {
  const { settings, loading } = useMagicChest();
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const coins = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => ({
        id: i,
        angle: (i / 6) * Math.PI * 2,
        radiusX: 110 + (i % 3) * 18,
        radiusY: 65 + (i % 2) * 12,
        delay: i * 0.4,
        size: 6 + (i % 3) * 3,
      })),
    [],
  );

  if (loading || !settings.show_banner) return null;

  const theme: ThemeConfig = themeConfigs[settings.theme_color] || themeConfigs.gold;
  const statusCfg = STATUS_CONFIG[settings.status];
  const isActive = settings.status === 'active';
  const isEnded = settings.status === 'ended';

  const handleButtonClick = () => {
    if (isActive) {
      setToast('سيتم ربط لعبة الصندوق السحري لاحقًا');
    } else {
      setToast('الصندوق السحري قيد التطوير وسيتم فتحه قريبًا');
    }
  };

  return (
    <>
      <div
        className="magic-banner relative overflow-hidden animate-fade-up"
        style={{
          background: `linear-gradient(145deg, rgba(18,12,4,0.98) 0%, rgba(28,18,6,0.96) 35%, rgba(22,14,4,0.98) 70%, rgba(14,9,2,0.99) 100%)`,
          border: `1.5px solid rgba(214,180,123,0.22)`,
          borderRadius: '26px',
          boxShadow: `0 0 0 1px rgba(0,0,0,0.6), 0 8px 40px rgba(0,0,0,0.55), inset 0 1px 0 rgba(214,180,123,0.08)`,
        }}
      >

        {/* === Background art layer === */}

        {/* Warm cinematic radial light source — behind the box zone */}
        <div className="magic-bg-light absolute inset-0 pointer-events-none" style={{
          background: `radial-gradient(ellipse 55% 90% at 38% 55%, rgba(214,160,80,0.13) 0%, rgba(180,120,50,0.06) 40%, transparent 65%)`,
        }} />

        {/* Secondary warm fill */}
        <div className="magic-bg-fill absolute inset-0 pointer-events-none" style={{
          background: `radial-gradient(ellipse 30% 60% at 38% 50%, rgba(240,180,80,0.07) 0%, transparent 55%)`,
        }} />

        {/* Right-zone text legibility gradient — soft dark wash behind text */}
        <div className="magic-bg-text absolute inset-0 pointer-events-none" style={{
          background: `linear-gradient(to left, rgba(10,6,2,0.72) 0%, rgba(10,6,2,0.4) 35%, transparent 60%)`,
        }} />

        {/* Top horizontal light sweep */}
        <div className="absolute inset-x-0 top-0 h-px pointer-events-none" style={{
          background: `linear-gradient(90deg, transparent 5%, rgba(214,180,123,0.18) 30%, rgba(214,180,123,0.32) 50%, rgba(214,180,123,0.18) 70%, transparent 95%)`,
        }} />

        {/* Bottom light line */}
        <div className="absolute inset-x-0 bottom-0 h-px pointer-events-none" style={{
          background: `linear-gradient(90deg, transparent 15%, rgba(214,180,123,0.10) 40%, rgba(214,180,123,0.15) 55%, rgba(214,180,123,0.10) 70%, transparent 85%)`,
        }} />

        {/* Vignette edges */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: `radial-gradient(ellipse 90% 80% at 50% 50%, transparent 55%, rgba(0,0,0,0.45) 100%)`,
        }} />

        {/* Noise texture */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.025]" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }} />

        {/* Floating particles */}
        <div style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}>
          <FloatingParticles theme={theme} count={7} />
        </div>

        {/* Corner metallic brackets */}
        <div className="absolute top-3.5 left-3.5 pointer-events-none" style={{ zIndex: 2 }}>
          <svg width="20" height="20" fill="none">
            <path d="M0 20 L0 0 L20 0" stroke="rgba(214,180,123,0.38)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="absolute top-3.5 right-3.5 pointer-events-none" style={{ zIndex: 2 }}>
          <svg width="20" height="20" fill="none">
            <path d="M20 20 L20 0 L0 0" stroke="rgba(214,180,123,0.38)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="absolute bottom-3.5 left-3.5 pointer-events-none" style={{ zIndex: 2 }}>
          <svg width="20" height="20" fill="none">
            <path d="M0 0 L0 20 L20 20" stroke="rgba(214,180,123,0.38)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="absolute bottom-3.5 right-3.5 pointer-events-none" style={{ zIndex: 2 }}>
          <svg width="20" height="20" fill="none">
            <path d="M20 0 L20 20 L0 20" stroke="rgba(214,180,123,0.38)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        {/* Thin vertical decorative line — separates box zone from text zone on desktop */}
        <div className="magic-divider absolute hidden lg:block pointer-events-none" style={{
          top: '18%', bottom: '18%', width: '1px',
          background: 'linear-gradient(180deg, transparent, rgba(214,180,123,0.14) 30%, rgba(214,180,123,0.22) 50%, rgba(214,180,123,0.14) 70%, transparent)',
          zIndex: 2,
        }} />

        {/* === CHEST ZONE — absolutely centered-left on desktop, stacked on mobile === */}
        <div className="magic-chest-zone" style={{ zIndex: 5, pointerEvents: 'none' }}>

          {/* Warm radial light bloom */}
          <div className="absolute pointer-events-none" style={{
            width: '380px', height: '380px',
            left: '50%', top: '50%',
            transform: 'translate(-50%, -50%)',
            background: `radial-gradient(circle, rgba(220,165,80,0.12) 0%, rgba(214,140,50,0.05) 35%, transparent 60%)`,
          }} />

          {/* Inner glow halo */}
          <div className="absolute pointer-events-none" style={{
            width: '220px', height: '220px',
            left: '50%', top: '50%',
            transform: 'translate(-50%, -50%)',
            background: `radial-gradient(circle, rgba(240,180,80,0.1) 0%, transparent 55%)`,
          }} />

          {/* Elliptical ground shadow — creates depth */}
          <div className="absolute pointer-events-none" style={{
            width: '180px', height: '28px',
            left: '50%', bottom: '-6px',
            transform: 'translateX(-50%)',
            background: `radial-gradient(ellipse at center, rgba(180,130,60,0.4) 0%, transparent 70%)`,
            filter: 'blur(8px)',
            opacity: 0.65,
          }} />

          {/* Orbiting gold dust particles */}
          {coins.map(coin => (
            <div
              key={coin.id}
              className="absolute pointer-events-none rounded-full magic-no-motion"
              style={{
                width: `${coin.size}px`, height: `${coin.size}px`,
                left: '50%', top: '50%',
                background: 'radial-gradient(circle at 30% 30%, #F3D49A, #D6B47B 55%, #B89A5A)',
                boxShadow: `0 0 ${coin.size * 1.5}px rgba(214,180,123,0.45)`,
                transform: `translate(${Math.cos(coin.angle) * coin.radiusX - coin.size / 2}px, ${Math.sin(coin.angle) * coin.radiusY - coin.size / 2}px)`,
                animation: `banner-coin-drift ${6 + coin.delay}s ease-in-out infinite`,
                animationDelay: `${coin.delay}s`,
              }}
            />
          ))}

          {/* Accent sparkles */}
          <div className="absolute pointer-events-none magic-no-motion" style={{ top: '-4px', right: '8px', animation: 'banner-float 3.2s ease-in-out infinite', animationDelay: '0.2s' }}>
            <Sparkles className="w-[14px] h-[14px]" style={{ color: '#E7C38F', opacity: 0.65 }} strokeWidth={1.5} />
          </div>
          <div className="absolute pointer-events-none magic-no-motion" style={{ bottom: '2px', left: '8px', animation: 'banner-float 3.8s ease-in-out infinite', animationDelay: '1s' }}>
            <Star className="w-[10px] h-[10px]" style={{ color: '#D6B47B', opacity: 0.5 }} strokeWidth={1.5} />
          </div>
          <div className="absolute pointer-events-none magic-no-motion" style={{ top: '20%', left: '-8px', animation: 'banner-float 4.5s ease-in-out infinite', animationDelay: '0.6s' }}>
            <Gem className="w-[11px] h-[11px]" style={{ color: '#C6A06A', opacity: 0.45 }} strokeWidth={1.5} />
          </div>

          {/* Chest image / placeholder */}
          {settings.chest_image_url ? (
            <img
              src={settings.chest_image_url}
              alt="صندوق سحري"
              className="magic-chest-img magic-no-motion relative"
              style={{
                zIndex: 5,
                animation: 'banner-breathe 7s ease-in-out infinite',
                filter: `drop-shadow(0 14px 28px rgba(0,0,0,0.65)) drop-shadow(0 0 22px rgba(214,160,70,0.28))`,
              }}
            />
          ) : (
            <div
              className="magic-chest-img magic-no-motion relative flex flex-col items-center justify-center"
              style={{
                zIndex: 5,
                animation: 'banner-breathe 7s ease-in-out infinite',
                filter: `drop-shadow(0 12px 24px rgba(0,0,0,0.6)) drop-shadow(0 0 18px rgba(214,160,70,0.22))`,
              }}
            >
              {/* Decorative chest SVG placeholder */}
              <div className="relative flex items-center justify-center" style={{
                width: '120px', height: '120px',
                background: 'radial-gradient(circle at 40% 35%, rgba(214,180,123,0.15) 0%, rgba(120,80,30,0.1) 60%, transparent 80%)',
                borderRadius: '20px',
                border: '1.5px solid rgba(214,180,123,0.2)',
              }}>
                <Package style={{
                  width: '72px', height: '72px',
                  color: '#D6B47B', opacity: 0.85,
                  strokeWidth: 0.8,
                }} />
                {/* Rim light on top of box */}
                <div className="absolute inset-x-0 top-0 h-px rounded-full" style={{
                  background: 'linear-gradient(90deg, transparent 15%, rgba(240,190,90,0.35) 50%, transparent 85%)',
                }} />
              </div>
              <span className="mt-2 text-[10px] font-semibold tracking-widest uppercase" style={{ color: 'rgba(214,180,123,0.45)', letterSpacing: '0.12em' }}>
                صندوق سحري
              </span>
            </div>
          )}
        </div>

        {/* === TEXT ZONE — right side on desktop, stacked on mobile === */}
        <div className="magic-text-zone" style={{ zIndex: 6 }}>

          {/* Status badge */}
          <div className="flex justify-center lg:justify-start mb-3">
            <span
              className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1 rounded-full"
              style={{
                background: isActive
                  ? 'rgba(63,185,80,0.1)'
                  : isEnded
                    ? 'rgba(161,161,170,0.08)'
                    : 'rgba(214,180,123,0.1)',
                border: isActive
                  ? '1px solid rgba(63,185,80,0.22)'
                  : isEnded
                    ? '1px solid rgba(161,161,170,0.18)'
                    : '1px solid rgba(214,180,123,0.22)',
                color: isActive ? '#3FB950' : isEnded ? '#a1a1aa' : '#E7C38F',
              }}
            >
              {isActive
                ? <span className="w-1.5 h-1.5 rounded-full bg-[#3FB950] inline-block" />
                : <Sparkles className="w-3 h-3" strokeWidth={1.5} />
              }
              {settings.badge_text || statusCfg.badge}
            </span>
          </div>

          {/* Event label (eyebrow) */}
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-1.5 text-center lg:text-start"
            style={{ color: 'rgba(214,180,123,0.55)' }}>
            حدث محدود
          </p>

          {/* Title */}
          <h2
            className="font-black leading-tight mb-2 text-center lg:text-start"
            style={{
              color: '#FFFFFF',
              fontSize: 'clamp(20px, 2.2vw, 32px)',
              letterSpacing: '-0.025em',
              textShadow: '0 2px 20px rgba(0,0,0,0.7)',
            }}
          >
            {settings.title}
          </h2>

          {/* Subtitle */}
          <p className="text-sm leading-relaxed mb-4 text-center lg:text-start"
            style={{
              color: 'rgba(220,200,165,0.75)',
              textShadow: '0 1px 8px rgba(0,0,0,0.5)',
              maxWidth: '320px',
            }}>
            {settings.description}
          </p>

          {/* Countdown */}
          <div className="mb-4 flex justify-center lg:justify-start">
            <CountdownTimer
              enabled={settings.countdown_enabled}
              endDate={settings.countdown_end_date}
              theme={theme}
            />
          </div>

          {/* CTA Button */}
          <div className="flex justify-center lg:justify-start">
            <button
              onClick={handleButtonClick}
              disabled={statusCfg.disabled}
              className="magic-cta group relative flex items-center gap-2.5 px-7 py-3 rounded-[16px] font-black text-sm transition-all duration-200 disabled:cursor-not-allowed"
              style={
                isActive
                  ? {
                      background: 'linear-gradient(135deg, #C6A06A 0%, #E7C38F 45%, #D4A855 100%)',
                      color: '#0a0806',
                      boxShadow: '0 4px 20px rgba(214,180,123,0.35), 0 1px 0 rgba(255,255,255,0.15) inset, 0 -1px 0 rgba(0,0,0,0.3) inset',
                      border: '1px solid rgba(240,200,120,0.3)',
                    }
                  : isEnded
                    ? {
                        background: 'rgba(161,161,170,0.08)',
                        border: '1px solid rgba(161,161,170,0.18)',
                        color: '#a1a1aa',
                      }
                    : {
                        background: 'linear-gradient(135deg, rgba(120,90,40,0.5) 0%, rgba(80,55,20,0.6) 100%)',
                        border: '1px solid rgba(214,180,123,0.28)',
                        color: '#D6B47B',
                        boxShadow: '0 2px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(214,180,123,0.1)',
                      }
              }
            >
              {isActive
                ? <Package className="w-4 h-4" strokeWidth={2} />
                : <Lock className="w-4 h-4" strokeWidth={1.5} />
              }
              {isActive ? settings.button_text : statusCfg.label}
            </button>
          </div>
        </div>

        {/* === REWARDS CHIPS — bottom strip, sits over the lower banner area === */}
        {settings.rewards && settings.rewards.length > 0 && (
          <div className="magic-rewards" style={{ zIndex: 4 }}>
            {settings.rewards.map((reward, i) => (
              <RewardPill key={i} reward={reward} theme={theme} />
            ))}
          </div>
        )}

        {/* View page link */}
        <button
          onClick={onNavigate}
          className="absolute top-4 left-1/2 -translate-x-1/2 lg:left-auto lg:right-5 lg:translate-x-0 flex items-center gap-1 text-[11px] font-semibold transition-all hover:opacity-80"
          style={{ color: 'rgba(214,180,123,0.45)', zIndex: 7 }}
        >
          عرض الصفحة
          <ChevronLeft className="w-3 h-3" style={{ transform: 'scaleX(-1)' }} />
        </button>

      </div>

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-5 py-3.5 rounded-[16px] animate-fade-up"
          style={{
            background: 'var(--card)',
            border: `1px solid rgba(214,180,123,0.22)`,
            boxShadow: `0 12px 40px rgba(0,0,0,0.5), 0 0 20px rgba(214,180,123,0.1)`,
          }}
        >
          <Clock className="w-4 h-4 flex-shrink-0" style={{ color: '#D6B47B' }} strokeWidth={1.5} />
          <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{toast}</span>
        </div>
      )}

      <style>{`
        /* ── Keyframes ── */
        @keyframes banner-float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-7px); }
        }
        @keyframes banner-breathe {
          0%, 100% { transform: translateY(0px) scale(1); filter: drop-shadow(0 14px 28px rgba(0,0,0,0.65)) drop-shadow(0 0 22px rgba(214,160,70,0.28)); }
          50%       { transform: translateY(-6px) scale(1.012); filter: drop-shadow(0 18px 32px rgba(0,0,0,0.6)) drop-shadow(0 0 30px rgba(214,160,70,0.38)); }
        }
        @keyframes banner-coin-drift {
          0%, 100% { opacity: 0.75; }
          50%       { opacity: 1; }
        }

        /* ── reduced-motion: kill decorative animations ── */
        @media (prefers-reduced-motion: reduce) {
          .magic-no-motion { animation: none !important; }
          .magic-bg-light  { display: none; }
        }

        /* ── Banner root sizing ── */
        .magic-banner {
          position: relative;
          min-height: 220px;
        }

        /* ── Chest zone ── */
        .magic-chest-zone {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px 0 56px;   /* bottom pad for reward chips */
        }
        .magic-chest-img {
          width: 160px;
          height: auto;
          max-height: 200px;
          object-fit: contain;
        }

        /* ── Text zone ── */
        .magic-text-zone {
          position: relative;
          padding: 28px 20px 60px;
          text-align: center;
        }

        /* ── Rewards strip ── */
        .magic-rewards {
          position: absolute;
          bottom: 16px;
          left: 0;
          right: 0;
          display: flex;
          justify-content: center;
          flex-wrap: wrap;
          gap: 8px;
          padding: 0 16px;
        }

        /* ── Divider line (desktop only) ── */
        .magic-divider { left: 42%; }

        /* ── CTA hover ── */
        .magic-cta:not(:disabled):hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 28px rgba(214,180,123,0.45), 0 1px 0 rgba(255,255,255,0.2) inset !important;
        }

        /* ════════════════════════════════════
           TABLET: 640px+
        ════════════════════════════════════ */
        @media (min-width: 640px) {
          .magic-banner { min-height: 240px; }
          .magic-chest-img { width: 200px; max-height: 220px; }
          .magic-text-zone { padding: 32px 32px 64px; }
        }

        /* ════════════════════════════════════
           DESKTOP: 1024px+
           Side-by-side: chest LEFT, text RIGHT
        ════════════════════════════════════ */
        @media (min-width: 1024px) {
          .magic-banner {
            min-height: 260px;
            max-height: 290px;
            display: flex;
            flex-direction: row;
            align-items: stretch;
          }

          /* Chest occupies left ~42% */
          .magic-chest-zone {
            position: absolute;
            left: 0;
            top: 0;
            bottom: 0;
            width: 42%;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 5;
          }

          /* Text occupies right ~58% */
          .magic-text-zone {
            margin-left: 42%;
            width: 58%;
            padding: 32px 40px 72px 24px;
            text-align: start;
            display: flex;
            flex-direction: column;
            justify-content: center;
          }

          .magic-chest-img {
            width: clamp(220px, 20vw, 300px);
            max-height: 240px;
          }

          /* Rewards aligned under text, not full width center */
          .magic-rewards {
            left: 42%;
            right: 0;
            justify-content: flex-start;
            padding: 0 40px 0 24px;
            bottom: 18px;
          }
        }

        /* ════════════════════════════════════
           LARGE DESKTOP: 1280px+
        ════════════════════════════════════ */
        @media (min-width: 1280px) {
          .magic-banner { min-height: 270px; max-height: 300px; }
          .magic-chest-img { width: clamp(240px, 18vw, 320px); }
          .magic-text-zone { padding: 36px 48px 76px 28px; }
        }
      `}</style>
    </>
  );
};
