import { useLanguage } from '../../contexts/LanguageContext';

interface CardBackProps {
  isHovered?: boolean;
  isFlipped?: boolean;
}

export const CardBack = ({ isHovered = false, isFlipped = false }: CardBackProps) => {
  const { language } = useLanguage();

  return (
    <div
      className="w-full h-full rounded-2xl relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #1a0f3a 0%, #0d0b1e 50%, #1a0f3a 100%)',
        border: '2px solid rgba(139,92,246,0.4)',
        boxShadow: isHovered
          ? '0 0 24px rgba(139,92,246,0.6), inset 0 0 16px rgba(217,70,239,0.2)'
          : '0 0 16px rgba(139,92,246,0.4), inset 0 0 12px rgba(217,70,239,0.1)',
        transition: 'all 0.3s ease-out',
      }}
    >
      {/* Cyber frame corners */}
      <div className="absolute top-2 left-2 w-6 h-6 border-l-2 border-t-2 border-amber-400 opacity-60" />
      <div className="absolute top-2 right-2 w-6 h-6 border-r-2 border-t-2 border-amber-400 opacity-60" />
      <div className="absolute bottom-2 left-2 w-6 h-6 border-l-2 border-b-2 border-amber-400 opacity-60" />
      <div className="absolute bottom-2 right-2 w-6 h-6 border-r-2 border-b-2 border-amber-400 opacity-60" />

      {/* Animated shine sweep */}
      <div
        className="absolute inset-0 opacity-0 pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)',
          animation: 'shimmer 3s infinite',
          transformOrigin: 'center',
        }}
      />

      {/* Center mystery symbol area */}
      <div className="absolute inset-0 flex items-center justify-center">
        {/* Animated glow ring */}
        <div
          className="absolute w-20 h-20 rounded-full"
          style={{
            border: '2px solid rgba(217,70,239,0.4)',
            boxShadow: '0 0 16px rgba(217,70,239,0.5)',
            animation: isHovered ? 'pulse 1.5s ease-in-out infinite' : 'pulse 2s ease-in-out infinite',
          }}
        />

        {/* Mystery icon */}
        <div
          className="relative z-10 text-5xl font-bold"
          style={{
            background: 'linear-gradient(135deg, #a78bfa, #e879f9)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            textShadow: '0 0 20px rgba(217,70,239,0.5)',
            animation: isHovered ? 'bounce 0.8s ease-in-out infinite' : 'bounce 1.2s ease-in-out infinite',
          }}
        >
          ?
        </div>
      </div>

      {/* Brand text - "أكسي الحظ" */}
      <div className="absolute inset-0 flex flex-col items-center justify-between p-4">
        {/* Top text */}
        <div
          className="text-center font-changa font-bold text-sm tracking-wider"
          style={{
            color: 'rgba(255,255,255,0.6)',
            textShadow: '0 0 8px rgba(139,92,246,0.5)',
          }}
        >
          FORTUNE CARD
        </div>

        {/* Bottom brand text */}
        <div
          className="text-center font-changa font-bold text-lg tracking-wider"
          style={{
            background: 'linear-gradient(135deg, #fcd34d, #f59e0b)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            textShadow: '0 0 12px rgba(245,158,11,0.6)',
            letterSpacing: '2px',
          }}
        >
          {language === 'ar' ? 'أكسي الحظ' : 'AXIE'}
        </div>
      </div>

      {/* Decorative lines */}
      <div className="absolute top-0 left-1/2 w-1/3 h-px bg-gradient-to-r from-transparent via-purple-500 to-transparent opacity-30" />
      <div className="absolute bottom-0 left-1/2 w-1/3 h-px bg-gradient-to-r from-transparent via-purple-500 to-transparent opacity-30" />

      {/* Glow particle effects */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 rounded-full bg-purple-400"
            style={{
              left: `${25 + i * 25}%`,
              top: `${30 + Math.sin(i) * 20}%`,
              opacity: 0.4,
              animation: `float ${3 + i}s ease-in-out infinite`,
            }}
          />
        ))}
      </div>

      <style>{`
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
            opacity: 0;
          }
          50% {
            opacity: 1;
          }
          100% {
            transform: translateX(100%);
            opacity: 0;
          }
        }

        @keyframes float {
          0%, 100% {
            transform: translateY(0px);
            opacity: 0.3;
          }
          50% {
            transform: translateY(-10px);
            opacity: 0.7;
          }
        }
      `}</style>
    </div>
  );
};
