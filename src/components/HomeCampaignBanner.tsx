import { useState, useEffect, useRef } from 'react';
import { Lock, ExternalLink, Sparkles, Coins, Gem, Gift, Tag, Zap } from 'lucide-react';
import type { HomeCampaign, CampaignChip, ChipType, ContentAlignment, ContentWidth, OverlayStrength, CountdownMode } from '../hooks/useHomeCampaign';
import { useHomeCampaign } from '../hooks/useHomeCampaign';
import { useLanguage } from '../contexts/LanguageContext';

interface HomeCampaignBannerProps {
  setCurrentPage: (page: string) => void;
  /* For admin preview — pass a campaign directly to bypass the DB fetch */
  previewCampaign?: HomeCampaign | null;
}

/* ── Helpers ─────────────────────────────────────────────────── */

const OVERLAY_VALUES: Record<OverlayStrength, string> = {
  NONE:   '0',
  LIGHT:  '0.28',
  MEDIUM: '0.50',
  STRONG: '0.70',
};

const CONTENT_WIDTHS: Record<ContentWidth, string> = {
  NARROW: '300px',
  NORMAL: '480px',
  WIDE:   '640px',
};

const CHIP_ICONS: Record<ChipType, typeof Coins> = {
  POINTS:      Coins,
  COINS:       Gem,
  RARE_REWARD: Gift,
  DISCOUNT:    Tag,
  CUSTOM:      Zap,
};

const CHIP_COLORS: Record<ChipType, string> = {
  POINTS:      '#D6B47B',
  COINS:       '#58A6FF',
  RARE_REWARD: '#A371F7',
  DISCOUNT:    '#3FB950',
  CUSTOM:      '#E7C38F',
};

/* ── Countdown component ─────────────────────────────────────── */

function CampaignCountdown({ mode, startsAt, endsAt, isAr }: {
  mode: CountdownMode;
  startsAt: string | null;
  endsAt: string | null;
  isAr: boolean;
}) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const [targetLabel, setTargetLabel] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const compute = () => {
      const now = Date.now();
      let target: number | null = null;
      let label = '';

      if (mode === 'COUNTDOWN_TO_END' && endsAt) {
        target = new Date(endsAt).getTime();
        label = isAr ? 'ينتهي خلال' : 'Ends in';
      } else if (mode === 'COUNTDOWN_TO_START' && startsAt) {
        target = new Date(startsAt).getTime();
        label = isAr ? 'يبدأ خلال' : 'Starts in';
      } else if (mode === 'AUTO') {
        if (startsAt && new Date(startsAt).getTime() > now) {
          target = new Date(startsAt).getTime();
          label = isAr ? 'يبدأ خلال' : 'Starts in';
        } else if (endsAt && new Date(endsAt).getTime() > now) {
          target = new Date(endsAt).getTime();
          label = isAr ? 'ينتهي خلال' : 'Ends in';
        }
      }

      if (target && target > now) {
        setRemaining(Math.max(0, Math.floor((target - now) / 1000)));
        setTargetLabel(label);
      } else {
        setRemaining(null);
      }
    };

    compute();
    if (mode !== 'NONE') {
      timerRef.current = setInterval(compute, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [mode, startsAt, endsAt, isAr]);

  if (mode === 'NONE' || remaining === null || remaining <= 0) return null;

  const days    = Math.floor(remaining / 86400);
  const hours   = Math.floor((remaining % 86400) / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[11px] font-semibold" style={{ color: 'rgba(220,200,165,0.7)' }}>{targetLabel}</span>
      <div className="flex items-center gap-1">
        {days > 0 && (
          <>
            <span className="countdown-unit">{pad(days)}</span>
            <span className="countdown-sep">{isAr ? 'ي' : 'd'}</span>
          </>
        )}
        <span className="countdown-unit">{pad(hours)}</span>
        <span className="countdown-sep">:</span>
        <span className="countdown-unit">{pad(minutes)}</span>
        <span className="countdown-sep">:</span>
        <span className="countdown-unit">{pad(seconds)}</span>
      </div>
    </div>
  );
}

/* ── Chip component ──────────────────────────────────────────── */

function CampaignChipItem({ chip, isAr }: { chip: CampaignChip; isAr: boolean }) {
  const Icon = CHIP_ICONS[chip.chip_type] || Zap;
  const color = CHIP_COLORS[chip.chip_type] || '#E7C38F';

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-[12px] flex-shrink-0"
      style={{
        background: `${color}0D`,
        border: `1px solid ${color}26`,
        backdropFilter: 'blur(8px)',
      }}
    >
      <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} strokeWidth={1.5} />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold leading-tight" style={{ color: 'rgba(220,200,165,0.65)' }}>
          {isAr ? chip.label_ar : chip.label_en}
        </p>
        <p className="text-xs font-black leading-tight" style={{ color }}>{chip.value}</p>
      </div>
    </div>
  );
}

/* ── Banner renderer (shared by Home + Admin preview) ────────── */

export function CampaignBannerRenderer({
  campaign,
  isAr,
  isMobile,
  onCta,
}: {
  campaign: HomeCampaign;
  isAr: boolean;
  isMobile?: boolean;
  onCta: () => void;
}) {
  const [imgError, setImgError] = useState(false);

  const imageUrl = (isMobile && campaign.mobile_image_url) ? campaign.mobile_image_url : campaign.desktop_image_url;
  const overlayAlpha = OVERLAY_VALUES[campaign.overlay_strength];

  const alignment = campaign.content_alignment;
  const px = campaign.image_position_x;
  const py = campaign.image_position_y;

  /* Gradient direction for overlay behind text based on alignment */
  const overlayGradient = alignment === 'LEFT'
    ? `linear-gradient(to right, rgba(10,6,2,${overlayAlpha}) 0%, rgba(10,6,2,${parseFloat(overlayAlpha) * 0.6}) 45%, transparent 70%)`
    : alignment === 'CENTER'
      ? `radial-gradient(ellipse 70% 100% at 50% 50%, rgba(10,6,2,${overlayAlpha}) 0%, transparent 70%)`
      : `linear-gradient(to left, rgba(10,6,2,${overlayAlpha}) 0%, rgba(10,6,2,${parseFloat(overlayAlpha) * 0.6}) 45%, transparent 70%)`;

  const title = isAr ? campaign.title_ar : campaign.title_en;
  const subtitle = isAr ? campaign.subtitle_ar : campaign.subtitle_en;
  const badge = isAr ? campaign.badge_ar : campaign.badge_en;
  const ctaLabel = isAr ? campaign.cta_label_ar : campaign.cta_label_en;

  const chips = (campaign.chips || []).slice(0, 3);

  const now = Date.now();
  const hasStarted = !campaign.starts_at || new Date(campaign.starts_at).getTime() <= now;
  const isExpired = campaign.ends_at && new Date(campaign.ends_at).getTime() <= now;
  const ctaDisabled = !hasStarted || !!isExpired;

  /* Content flex alignment (from content_alignment) */
  const contentJustify = alignment === 'LEFT' ? 'flex-start' : alignment === 'CENTER' ? 'center' : 'flex-end';

  /* Text alignment within the content box (independent field, falls back to content_alignment) */
  const tAlign = campaign.text_alignment ?? alignment;
  const textAlign = tAlign === 'LEFT' ? 'start' : tAlign === 'CENTER' ? 'center' : 'end';

  /* Max width of the content box */
  const contentMaxWidth = CONTENT_WIDTHS[campaign.content_width ?? 'NORMAL'];

  return (
    <div
      className="campaign-banner-root relative overflow-hidden"
      style={{
        background: imageUrl && !imgError
          ? `url("${imageUrl}") center/cover no-repeat`
          : 'linear-gradient(145deg, rgba(18,12,4,0.98) 0%, rgba(28,18,6,0.96) 50%, rgba(14,9,2,0.99) 100%)',
        backgroundPosition: imageUrl && !imgError ? `${px}% ${py}%` : 'center',
        borderRadius: '24px',
        border: '1.5px solid rgba(214,180,123,0.2)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(214,180,123,0.06)',
        minHeight: '230px',
      }}
    >
      {/* Hidden img for error detection */}
      {imageUrl && !imgError && (
        <img
          src={imageUrl}
          alt=""
          className="absolute opacity-0 pointer-events-none w-0 h-0"
          onError={() => setImgError(true)}
        />
      )}

      {/* Fallback gradient when no image */}
      {(!imageUrl || imgError) && (
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse 55% 90% at 38% 55%, rgba(214,160,80,0.13) 0%, rgba(180,120,50,0.06) 40%, transparent 65%)',
        }} />
      )}

      {/* Text-zone legibility overlay */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: overlayGradient }} />

      {/* Vignette */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 90% 80% at 50% 50%, transparent 50%, rgba(0,0,0,0.35) 100%)',
      }} />

      {/* Top accent line */}
      <div className="absolute inset-x-0 top-0 h-px pointer-events-none" style={{
        background: 'linear-gradient(90deg, transparent 5%, rgba(214,180,123,0.2) 35%, rgba(214,180,123,0.32) 50%, rgba(214,180,123,0.2) 65%, transparent 95%)',
      }} />

      {/* Corner brackets */}
      {['tl','tr','bl','br'].map(pos => (
        <div key={pos} className={`absolute pointer-events-none ${
          pos === 'tl' ? 'top-3 left-3' : pos === 'tr' ? 'top-3 right-3' : pos === 'bl' ? 'bottom-3 left-3' : 'bottom-3 right-3'
        }`} style={{ zIndex: 2 }}>
          <svg width="18" height="18" fill="none">
            <path
              d={pos === 'tl' ? 'M0 18 L0 0 L18 0' : pos === 'tr' ? 'M18 18 L18 0 L0 0' : pos === 'bl' ? 'M0 0 L0 18 L18 18' : 'M18 0 L18 18 L0 18'}
              stroke="rgba(214,180,123,0.32)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            />
          </svg>
        </div>
      ))}

      {/* === Content layer === */}
      <div
        className="relative h-full px-6 py-7 sm:px-8 sm:py-8 flex flex-col justify-between"
        style={{ zIndex: 5, minHeight: '230px' }}
      >
        <div className="flex" style={{ justifyContent: contentJustify }}>
          <div style={{ textAlign, maxWidth: contentMaxWidth }}>

            {/* Badge */}
            {badge && (
              <div className="inline-flex items-center gap-1.5 mb-3 px-3 py-1 rounded-full"
                style={{
                  background: 'rgba(214,180,123,0.1)',
                  border: '1px solid rgba(214,180,123,0.22)',
                  display: 'inline-flex',
                }}>
                <Sparkles className="w-3 h-3" style={{ color: '#E7C38F' }} strokeWidth={1.5} />
                <span className="text-[11px] font-bold" style={{ color: '#E7C38F' }}>{badge}</span>
              </div>
            )}

            {/* Title */}
            <h2
              className="font-black leading-tight mb-2"
              style={{
                color: '#FFFFFF',
                fontSize: 'clamp(19px, 2.2vw, 31px)',
                letterSpacing: '-0.025em',
                textShadow: '0 2px 20px rgba(0,0,0,0.8)',
              }}
            >
              {title || (isAr ? 'حملة جديدة' : 'New Campaign')}
            </h2>

            {/* Subtitle */}
            {subtitle && (
              <p className="text-sm leading-relaxed mb-4"
                style={{
                  color: 'rgba(220,200,165,0.75)',
                  textShadow: '0 1px 8px rgba(0,0,0,0.6)',
                  maxWidth: '340px',
                  display: textAlign === 'center' ? 'block' : undefined,
                  margin: textAlign === 'center' ? '0 auto 1rem' : undefined,
                }}>
                {subtitle}
              </p>
            )}

            {/* Countdown */}
            <div className={`mb-4 ${textAlign === 'center' ? 'flex justify-center' : textAlign === 'end' ? 'flex justify-end' : ''}`}>
              <CampaignCountdown
                mode={campaign.countdown_mode}
                startsAt={campaign.starts_at}
                endsAt={campaign.ends_at}
                isAr={isAr}
              />
            </div>

            {/* CTA */}
            {campaign.cta_enabled && ctaLabel && (
              <div className={textAlign === 'center' ? 'flex justify-center' : textAlign === 'end' ? 'flex justify-end' : ''}>
                <button
                  onClick={ctaDisabled ? undefined : onCta}
                  disabled={ctaDisabled}
                  className="campaign-cta group relative flex items-center gap-2.5 px-6 py-3 rounded-[15px] font-black text-sm transition-all duration-200 disabled:cursor-not-allowed"
                  style={
                    ctaDisabled
                      ? {
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          color: 'rgba(255,255,255,0.35)',
                        }
                      : {
                          background: 'linear-gradient(135deg, #C6A06A 0%, #E7C38F 45%, #D4A855 100%)',
                          color: '#0a0806',
                          border: '1px solid rgba(240,200,120,0.3)',
                          boxShadow: '0 4px 20px rgba(214,180,123,0.35), inset 0 1px 0 rgba(255,255,255,0.15)',
                        }
                  }
                >
                  {ctaDisabled
                    ? <Lock className="w-4 h-4" strokeWidth={1.5} />
                    : campaign.cta_action_type === 'EXTERNAL_URL'
                      ? <ExternalLink className="w-4 h-4" strokeWidth={2} />
                      : <Sparkles className="w-4 h-4" strokeWidth={2} />
                  }
                  {!hasStarted ? (isAr ? 'قريبًا' : 'Coming Soon') : isExpired ? (isAr ? 'انتهى' : 'Ended') : ctaLabel}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Chips row — bottom */}
        {chips.length > 0 && (
          <div className={`flex gap-2 flex-wrap mt-4 ${
            textAlign === 'center' ? 'justify-center' : textAlign === 'end' ? 'justify-end' : 'justify-start'
          }`}>
            {chips.map(chip => (
              <CampaignChipItem key={chip.id} chip={chip} isAr={isAr} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main public banner (used by DashboardHome) ──────────────── */

export const HomeCampaignBanner = ({ setCurrentPage, previewCampaign }: HomeCampaignBannerProps) => {
  const { campaign: fetchedCampaign, loading } = useHomeCampaign();
  const { language } = useLanguage();
  const campaign = previewCampaign !== undefined ? previewCampaign : fetchedCampaign;
  const isAr = language === 'ar';

  // Detect mobile viewport
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  if (loading && previewCampaign === undefined) return null;
  if (!campaign) return null;

  const handleCta = () => {
    if (campaign.cta_action_type === 'INTERNAL_ROUTE' && campaign.cta_target) {
      setCurrentPage(campaign.cta_target);
    } else if (campaign.cta_action_type === 'EXTERNAL_URL' && campaign.cta_target) {
      const url = campaign.cta_target;
      if (/^https?:\/\//i.test(url)) {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    }
  };

  return (
    <>
      <CampaignBannerRenderer
        campaign={campaign}
        isAr={isAr}
        isMobile={isMobile}
        onCta={handleCta}
      />
      <style>{`
        .campaign-banner-root { display: block; }
        .campaign-cta:not(:disabled):hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 28px rgba(214,180,123,0.45), inset 0 1px 0 rgba(255,255,255,0.2) !important;
        }
        .countdown-unit {
          font-family: ui-monospace, SFMono-Regular, monospace;
          font-weight: 800;
          font-size: 13px;
          color: #E7C38F;
          background: rgba(214,180,123,0.1);
          border: 1px solid rgba(214,180,123,0.18);
          border-radius: 6px;
          padding: 2px 5px;
          min-width: 26px;
          text-align: center;
          display: inline-block;
        }
        .countdown-sep {
          font-weight: 700;
          font-size: 12px;
          color: rgba(214,180,123,0.5);
          padding: 0 1px;
        }
      `}</style>
    </>
  );
};
