import { RewardType } from '../../config/luckyCardRewards';

interface RewardIconProps {
  type: RewardType;
  size?: number;
  className?: string;
}

export const CoinsIcon = ({ size = 64, className = '' }: Omit<RewardIconProps, 'type'>) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
    <defs>
      <linearGradient id="coins-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fcd34d" />
        <stop offset="50%" stopColor="#f59e0b" />
        <stop offset="100%" stopColor="#d97706" />
      </linearGradient>
      <filter id="coins-glow">
        <feGaussianBlur stdDeviation="2" result="coloredBlur" />
        <feMerge>
          <feMergeNode in="coloredBlur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <circle cx="32" cy="32" r="28" fill="url(#coins-grad)" filter="url(#coins-glow)" />
    <circle cx="32" cy="32" r="28" fill="none" stroke="#fef3c7" strokeWidth="2" opacity="0.5" />
    <text x="32" y="40" fontSize="32" fontWeight="bold" textAnchor="middle" fill="#0d0b1e">
      $
    </text>
  </svg>
);

export const GemsIcon = ({ size = 64, className = '' }: Omit<RewardIconProps, 'type'>) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
    <defs>
      <linearGradient id="gems-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#06b6d4" />
        <stop offset="50%" stopColor="#0ea5e9" />
        <stop offset="100%" stopColor="#0284c7" />
      </linearGradient>
      <filter id="gems-glow">
        <feGaussianBlur stdDeviation="2" result="coloredBlur" />
        <feMerge>
          <feMergeNode in="coloredBlur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <polygon points="32,8 48,24 48,48 32,56 16,48 16,24" fill="url(#gems-grad)" filter="url(#gems-glow)" />
    <polygon points="32,8 48,24 48,48 32,56 16,48 16,24" fill="none" stroke="#cffafe" strokeWidth="2" opacity="0.6" />
  </svg>
);

export const XpIcon = ({ size = 64, className = '' }: Omit<RewardIconProps, 'type'>) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
    <defs>
      <linearGradient id="xp-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#a78bfa" />
        <stop offset="50%" stopColor="#8b5cf6" />
        <stop offset="100%" stopColor="#7c3aed" />
      </linearGradient>
      <filter id="xp-glow">
        <feGaussianBlur stdDeviation="2" result="coloredBlur" />
        <feMerge>
          <feMergeNode in="coloredBlur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <circle cx="32" cy="32" r="24" fill="url(#xp-grad)" filter="url(#xp-glow)" />
    <circle cx="32" cy="32" r="24" fill="none" stroke="#e9d5ff" strokeWidth="2" opacity="0.5" />
    <text x="32" y="42" fontSize="28" fontWeight="bold" textAnchor="middle" fill="#0d0b1e">
      XP
    </text>
  </svg>
);

export const BoosterIcon = ({ size = 64, className = '' }: Omit<RewardIconProps, 'type'>) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
    <defs>
      <linearGradient id="booster-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#f97316" />
        <stop offset="50%" stopColor="#ea580c" />
        <stop offset="100%" stopColor="#c2410c" />
      </linearGradient>
      <filter id="booster-glow">
        <feGaussianBlur stdDeviation="2" result="coloredBlur" />
        <feMerge>
          <feMergeNode in="coloredBlur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <path d="M 32 8 L 44 24 L 32 32 L 44 40 L 32 56 L 20 40 L 32 32 L 20 24 Z" fill="url(#booster-grad)" filter="url(#booster-glow)" />
    <circle cx="32" cy="32" r="12" fill="none" stroke="#ffedd5" strokeWidth="1.5" opacity="0.6" />
  </svg>
);

export const MultiplierIcon = ({ size = 64, className = '' }: Omit<RewardIconProps, 'type'>) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
    <defs>
      <linearGradient id="mult-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ec4899" />
        <stop offset="50%" stopColor="#db2777" />
        <stop offset="100%" stopColor="#be185d" />
      </linearGradient>
      <filter id="mult-glow">
        <feGaussianBlur stdDeviation="2" result="coloredBlur" />
        <feMerge>
          <feMergeNode in="coloredBlur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <rect x="12" y="12" width="40" height="40" rx="8" fill="url(#mult-grad)" filter="url(#mult-glow)" />
    <rect x="12" y="12" width="40" height="40" rx="8" fill="none" stroke="#fbcfe8" strokeWidth="2" opacity="0.5" />
    <text x="32" y="42" fontSize="24" fontWeight="bold" textAnchor="middle" fill="#0d0b1e">
      x2
    </text>
  </svg>
);

export const TicketIcon = ({ size = 64, className = '' }: Omit<RewardIconProps, 'type'>) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
    <defs>
      <linearGradient id="ticket-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#3b82f6" />
        <stop offset="50%" stopColor="#2563eb" />
        <stop offset="100%" stopColor="#1d4ed8" />
      </linearGradient>
      <filter id="ticket-glow">
        <feGaussianBlur stdDeviation="2" result="coloredBlur" />
        <feMerge>
          <feMergeNode in="coloredBlur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <rect x="10" y="16" width="44" height="32" rx="4" fill="url(#ticket-grad)" filter="url(#ticket-glow)" />
    <rect x="10" y="16" width="44" height="32" rx="4" fill="none" stroke="#bfdbfe" strokeWidth="2" opacity="0.5" />
    <circle cx="32" cy="20" r="3" fill="#bfdbfe" />
    <circle cx="32" cy="44" r="3" fill="#bfdbfe" />
    <line x1="32" y1="23" x2="32" y2="41" stroke="#bfdbfe" strokeWidth="1" opacity="0.6" strokeDasharray="2,2" />
  </svg>
);

export const MysteryIcon = ({ size = 64, className = '' }: Omit<RewardIconProps, 'type'>) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
    <defs>
      <linearGradient id="mystery-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#d946ef" />
        <stop offset="50%" stopColor="#c026d3" />
        <stop offset="100%" stopColor="#a21caf" />
      </linearGradient>
      <filter id="mystery-glow">
        <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
        <feMerge>
          <feMergeNode in="coloredBlur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <rect x="12" y="12" width="40" height="40" rx="6" fill="url(#mystery-grad)" filter="url(#mystery-glow)" />
    <rect x="12" y="12" width="40" height="40" rx="6" fill="none" stroke="#f0d9ff" strokeWidth="2" opacity="0.6" />
    <text x="32" y="42" fontSize="32" fontWeight="bold" textAnchor="middle" fill="#fef2d9">
      ?
    </text>
  </svg>
);

export const JackpotIcon = ({ size = 64, className = '' }: Omit<RewardIconProps, 'type'>) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
    <defs>
      <linearGradient id="jackpot-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fbbf24" />
        <stop offset="50%" stopColor="#f59e0b" />
        <stop offset="100%" stopColor="#d97706" />
      </linearGradient>
      <filter id="jackpot-glow">
        <feGaussianBlur stdDeviation="3" result="coloredBlur" />
        <feMerge>
          <feMergeNode in="coloredBlur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <polygon points="32,8 42,22 58,24 46,34 50,50 32,42 14,50 18,34 6,24 22,22" fill="url(#jackpot-grad)" filter="url(#jackpot-glow)" />
    <polygon points="32,8 42,22 58,24 46,34 50,50 32,42 14,50 18,34 6,24 22,22" fill="none" stroke="#fef3c7" strokeWidth="2" opacity="0.7" />
  </svg>
);

export const BadgeIcon = ({ size = 64, className = '' }: Omit<RewardIconProps, 'type'>) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
    <defs>
      <linearGradient id="badge-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#10b981" />
        <stop offset="50%" stopColor="#059669" />
        <stop offset="100%" stopColor="#047857" />
      </linearGradient>
      <filter id="badge-glow">
        <feGaussianBlur stdDeviation="2" result="coloredBlur" />
        <feMerge>
          <feMergeNode in="coloredBlur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <circle cx="32" cy="28" r="20" fill="url(#badge-grad)" filter="url(#badge-glow)" />
    <circle cx="32" cy="28" r="20" fill="none" stroke="#a7f3d0" strokeWidth="2" opacity="0.6" />
    <polygon points="32,48 26,56 28,48 22,48 28,44 26,36 32,40 38,36 36,44 42,48 36,48 38,56" fill="#a7f3d0" opacity="0.8" />
  </svg>
);

export const SkinIcon = ({ size = 64, className = '' }: Omit<RewardIconProps, 'type'>) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
    <defs>
      <linearGradient id="skin-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#8b5cf6" />
        <stop offset="50%" stopColor="#7c3aed" />
        <stop offset="100%" stopColor="#6d28d9" />
      </linearGradient>
      <filter id="skin-glow">
        <feGaussianBlur stdDeviation="2" result="coloredBlur" />
        <feMerge>
          <feMergeNode in="coloredBlur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <path d="M 32 12 Q 44 12 48 24 Q 48 36 32 52 Q 16 36 16 24 Q 20 12 32 12 Z" fill="url(#skin-grad)" filter="url(#skin-glow)" />
    <circle cx="26" cy="28" r="3" fill="#e0e7ff" opacity="0.8" />
    <circle cx="38" cy="28" r="3" fill="#e0e7ff" opacity="0.8" />
    <path d="M 32 36 Q 28 40 32 42 Q 36 40 32 36" fill="none" stroke="#e0e7ff" strokeWidth="1.5" opacity="0.7" />
  </svg>
);

export const RewardIcon = ({ type, size = 64, className = '' }: RewardIconProps) => {
  switch (type) {
    case 'coins':
      return <CoinsIcon size={size} className={className} />;
    case 'gems':
      return <GemsIcon size={size} className={className} />;
    case 'xp':
      return <XpIcon size={size} className={className} />;
    case 'booster':
      return <BoosterIcon size={size} className={className} />;
    case 'multiplier':
      return <MultiplierIcon size={size} className={className} />;
    case 'ticket':
      return <TicketIcon size={size} className={className} />;
    case 'mystery':
      return <MysteryIcon size={size} className={className} />;
    case 'jackpot':
      return <JackpotIcon size={size} className={className} />;
    case 'badge':
      return <BadgeIcon size={size} className={className} />;
    case 'skin':
      return <SkinIcon size={size} className={className} />;
    default:
      return <CoinsIcon size={size} className={className} />;
  }
};
