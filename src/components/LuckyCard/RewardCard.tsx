import { LuckyCardReward, rarityColors, Rarity } from '../../config/luckyCardRewards';
import { RewardIcon } from './RewardIcons';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { X } from 'lucide-react';

interface RewardCardProps {
  reward: LuckyCardReward;
  onClose: () => void;
  isVisible?: boolean;
}

export const RewardCard = ({ reward, onClose, isVisible = true }: RewardCardProps) => {
  const { language } = useLanguage();
  const { user } = useAuth();
  const rarityInfo = rarityColors[reward.rarity as Rarity];

  const handleCollect = async () => {
    // Log activity to feed
    if (user?.id) {
      await supabase.from('activity_feed').insert({
        user_id: user.id,
        activity_type: 'reward_won',
        activity_data: {
          rewardName: language === 'ar' ? reward.nameAr : reward.nameEn,
          value: reward.value,
          rarity: reward.rarity,
        },
        is_public: true,
      });
    }
    onClose();
  };

  const rarityLabels: Record<Rarity, { ar: string; en: string }> = {
    common: { ar: 'عام', en: 'Common' },
    rare: { ar: 'نادر', en: 'Rare' },
    epic: { ar: 'ملحمي', en: 'Epic' },
    legendary: { ar: 'أسطوري', en: 'Legendary' },
    mythic: { ar: 'أسطوري خرافي', en: 'Mythic' },
    divine: { ar: 'إلهي', en: 'Divine' },
  };

  const getAnimationLevel = (level: 1 | 2 | 3) => {
    switch (level) {
      case 1:
        return 'scale-in';
      case 2:
        return 'bounce-in';
      case 3:
        return 'cosmic-burst';
      default:
        return 'scale-in';
    }
  };

  return (
    <>
      {/* Overlay */}
      {isVisible && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 animate-fade-in"
          onClick={onClose}
        />
      )}

      {/* Reward Card */}
      <div
        className={`fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 ${
          isVisible ? 'animate-fade-in' : 'opacity-0 pointer-events-none'
        }`}
        style={{
          transition: 'opacity 0.3s ease-out',
        }}
      >
        <div
          className="relative w-80 rounded-3xl overflow-hidden p-6 md:p-8"
          style={{
            background: `linear-gradient(135deg, rgba(13,11,30,0.95), rgba(26,15,58,0.95))`,
            border: `2.5px solid ${rarityInfo.border}`,
            boxShadow: `0 0 40px ${rarityInfo.glow}, inset 0 0 20px ${rarityInfo.glow}40, 0 20px 60px rgba(0,0,0,0.8)`,
          }}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/10 transition-all z-10"
          >
            <X className="w-5 h-5 text-white/60 hover:text-white" />
          </button>

          {/* Rarity aura glow */}
          <div
            className="absolute inset-0 opacity-20 pointer-events-none"
            style={{
              background: `radial-gradient(ellipse at center, ${rarityInfo.glow}, transparent 70%)`,
            }}
          />

          {/* Content */}
          <div className="relative space-y-6">
            {/* Header */}
            <div className="text-center space-y-2">
              <div
                className="inline-block px-4 py-1.5 rounded-full text-xs font-bold tracking-widest backdrop-blur-sm"
                style={{
                  background: `linear-gradient(135deg, ${rarityInfo.glow}40, transparent)`,
                  border: `1px solid ${rarityInfo.border}`,
                  color: rarityInfo.glow,
                  textTransform: 'uppercase',
                }}
              >
                {language === 'ar'
                  ? rarityLabels[reward.rarity as Rarity].ar
                  : rarityLabels[reward.rarity as Rarity].en}
              </div>

              <h2 className="text-2xl md:text-3xl font-changa font-bold text-white leading-tight">
                {language === 'ar' ? reward.nameAr : reward.nameEn}
              </h2>
            </div>

            {/* Icon area with animation */}
            <div
              className={`flex justify-center py-6 ${getAnimationLevel(reward.animationLevel)}`}
              style={{
                animation: `${getAnimationLevel(reward.animationLevel)} 0.6s ease-out`,
              }}
            >
              <div
                className="relative w-28 h-28 flex items-center justify-center"
                style={{
                  filter: `drop-shadow(0 0 16px ${rarityInfo.glow})`,
                }}
              >
                {/* Rarity-based particle effects */}
                {reward.rarity === 'mythic' && (
                  <div className="absolute inset-0 rounded-full animate-spin opacity-30">
                    <div className="w-full h-full border-2 border-pink-500 border-t-transparent rounded-full" />
                  </div>
                )}
                {reward.rarity === 'divine' && (
                  <>
                    <div className="absolute inset-0 rounded-full animate-pulse opacity-40">
                      <div className="w-full h-full border-2 border-cyan-400 rounded-full" />
                    </div>
                    <div
                      className="absolute inset-0 rounded-full opacity-20"
                      style={{
                        background: `conic-gradient(from 0deg, cyan, purple, magenta, cyan)`,
                        animation: 'spin 3s linear infinite',
                      }}
                    />
                  </>
                )}

                <RewardIcon type={reward.svgIcon} size={112} />
              </div>
            </div>

            {/* Reward value */}
            <div className="text-center">
              <p className="text-sm text-white/60 mb-1">
                {language === 'ar' ? 'قيمة الجائزة' : 'Reward Value'}
              </p>
              <p
                className="text-4xl font-bold font-changa"
                style={{
                  background: `linear-gradient(135deg, ${rarityInfo.glow}ff, ${rarityInfo.glow}80)`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                +{reward.value}
              </p>
            </div>

            {/* Info section */}
            <div
              className="grid grid-cols-2 gap-3 p-4 rounded-xl"
              style={{
                background: `linear-gradient(135deg, ${rarityInfo.glow}10, transparent)`,
                border: `1px solid ${rarityInfo.border}40`,
              }}
            >
              <div>
                <p className="text-xs text-white/40 mb-1">
                  {language === 'ar' ? 'النوع' : 'Type'}
                </p>
                <p className="text-sm font-semibold text-white capitalize">
                  {reward.type}
                </p>
              </div>
              <div>
                <p className="text-xs text-white/40 mb-1">
                  {language === 'ar' ? 'الندرة' : 'Rarity'}
                </p>
                <p className="text-sm font-semibold text-white capitalize">
                  {reward.rarity}
                </p>
              </div>
            </div>

            {/* Action button */}
            <button
              onClick={handleCollect}
              className="w-full py-3 px-4 rounded-xl font-bold transition-all duration-300 relative overflow-hidden group"
              style={{
                background: `linear-gradient(135deg, ${rarityInfo.glow}80, ${rarityInfo.glow}60)`,
                color: reward.rarity === 'common' ? '#1a1a2e' : '#fff',
                boxShadow: `0 4px 16px ${rarityInfo.glow}40, inset 0 1px 0 ${rarityInfo.glow}80`,
              }}
            >
              <span className="relative z-10">
                {language === 'ar' ? 'تم الاستلام!' : 'Collect!'}
              </span>
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-50 transition-opacity"
                style={{
                  background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)`,
                }}
              />
            </button>

            {/* Celebration text */}
            <div className="text-center pt-2">
              <p className="text-lg font-changa font-bold" style={{ color: rarityInfo.glow }}>
                {language === 'ar' ? 'مبروك!' : 'Congratulations!'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes scale-in {
          from {
            transform: scale(0.8);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }

        @keyframes bounce-in {
          0% {
            transform: scale(0.5) translateY(20px);
            opacity: 0;
          }
          50% {
            transform: scale(1.1);
          }
          100% {
            transform: scale(1) translateY(0);
            opacity: 1;
          }
        }

        @keyframes cosmic-burst {
          0% {
            transform: scale(0) rotate(-180deg);
            opacity: 0;
          }
          50% {
            transform: scale(1.2) rotate(0deg);
          }
          100% {
            transform: scale(1) rotate(0deg);
            opacity: 1;
          }
        }

        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </>
  );
};
