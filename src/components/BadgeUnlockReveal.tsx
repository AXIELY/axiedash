import { useEffect, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { Shield } from 'lucide-react';
import type { Badge } from '../hooks/usePlayerBadges';

interface BadgeUnlockRevealProps {
  badge: Badge;
  onDismiss: () => void;
}

const RARITY_STYLE: Record<string, { color: string; glow: string; label: { en: string; ar: string }; gradient: string }> = {
  common:    { color: '#94a3b8', glow: 'rgba(148,163,184,0.4)', gradient: 'from-slate-400 to-slate-500',  label: { en: 'Common',    ar: 'عادي'    } },
  uncommon:  { color: '#34d399', glow: 'rgba(52,211,153,0.4)',  gradient: 'from-emerald-400 to-green-500', label: { en: 'Uncommon',  ar: 'غير شائع' } },
  rare:      { color: '#60a5fa', glow: 'rgba(96,165,250,0.4)',  gradient: 'from-blue-400 to-blue-600',     label: { en: 'Rare',      ar: 'نادر'    } },
  epic:      { color: '#c084fc', glow: 'rgba(192,132,252,0.5)', gradient: 'from-purple-400 to-violet-600', label: { en: 'Epic',      ar: 'ملحمي'   } },
  legendary: { color: '#fbbf24', glow: 'rgba(251,191,36,0.6)',  gradient: 'from-amber-400 to-yellow-500',  label: { en: 'Legendary', ar: 'أسطوري'  } },
};

export function BadgeUnlockReveal({ badge, onDismiss }: BadgeUnlockRevealProps) {
  const { language } = useLanguage();
  const [visible, setVisible] = useState(false);
  const rs = RARITY_STYLE[badge.rarity] ?? RARITY_STYLE.common;
  const name = language === 'ar' ? (badge.name_ar ?? badge.name) : (badge.name_en ?? badge.name);

  useEffect(() => {
    // Animate in
    const t1 = setTimeout(() => setVisible(true), 30);
    // Auto-dismiss after 4s
    const t2 = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 350);
    }, 4000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none"
      style={{ background: visible ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0)', transition: 'background 0.35s ease', backdropFilter: visible ? 'blur(6px)' : 'none' }}
    >
      <div
        className="pointer-events-auto w-full max-w-[360px] mx-4 rounded-2xl overflow-hidden"
        style={{
          animation: visible ? 'badgeReveal 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards' : 'none',
          opacity: 0,
          background: `linear-gradient(145deg, ${rs.glow.replace('0.4', '0.12')}, rgba(10,8,20,0.96))`,
          border: `1px solid ${rs.color}50`,
          boxShadow: `0 0 60px ${rs.glow}, 0 20px 40px rgba(0,0,0,0.6)`,
        }}
        onClick={() => { setVisible(false); setTimeout(onDismiss, 350); }}
      >
        {/* Rarity sweep bar */}
        <div
          className={`h-1 w-full bg-gradient-to-r ${rs.gradient}`}
          style={{ boxShadow: `0 0 12px ${rs.glow}` }}
        />

        <div className="px-6 py-8 text-center">
          {/* Unlock label */}
          <div
            className="inline-block text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full mb-5"
            style={{ background: `${rs.color}20`, color: rs.color, border: `1px solid ${rs.color}40` }}
          >
            {language === 'ar' ? 'شارة جديدة مفتوحة!' : 'Badge Unlocked!'}
          </div>

          {/* Badge icon */}
          <div
            className="w-24 h-24 rounded-2xl flex items-center justify-center mx-auto mb-4 relative"
            style={{
              background: `radial-gradient(circle at 35% 35%, ${rs.color}30, ${rs.color}10)`,
              border: `2px solid ${rs.color}60`,
              boxShadow: `0 0 30px ${rs.glow}, inset 0 0 20px ${rs.color}10`,
            }}
          >
            {/* Pulsing outer ring */}
            <div
              className="absolute inset-0 rounded-2xl"
              style={{
                border: `2px solid ${rs.color}30`,
                animation: 'rarityPulse 2s ease-in-out infinite',
                transform: 'scale(1.12)',
              }}
            />
            <span className="text-5xl leading-none relative z-10">{badge.icon}</span>
          </div>

          {/* Name */}
          <h3 className="font-black text-xl text-white mb-1">{name}</h3>

          {/* Rarity */}
          <div
            className="inline-block text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wide mb-3"
            style={{ background: `${rs.color}15`, color: rs.color }}
          >
            {language === 'ar' ? rs.label.ar : rs.label.en}
          </div>

          {/* Description */}
          {badge.description && (
            <p className="text-sm text-white/50 mb-5 leading-relaxed">{badge.description}</p>
          )}

          {/* XP reward */}
          {badge.xp_reward > 0 && (
            <div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl"
              style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.25)' }}
            >
              <Shield className="w-4 h-4 text-amber-400" />
              <span className="font-black text-amber-400">+{badge.xp_reward} XP</span>
            </div>
          )}

          <p className="text-[11px] text-white/20 mt-5">
            {language === 'ar' ? 'اضغط للإغلاق' : 'Tap to dismiss'}
          </p>
        </div>
      </div>
    </div>
  );
}
