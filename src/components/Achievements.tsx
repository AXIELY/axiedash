import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { defaultAchievements, achievementCategories } from '../config/achievementsConfig';
import { Lock } from 'lucide-react';
import { rarityColors } from '../config/luckyCardRewards';

export const Achievements = () => {
  const { user } = useAuth();
  const { language } = useLanguage();
  const [unlockedIds, setUnlockedIds] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.id) {
      fetchUnlockedAchievements();
    }
  }, [user?.id]);

  const fetchUnlockedAchievements = async () => {
    try {
      const { data } = await supabase
        .from('user_achievements')
        .select('achievement_id')
        .eq('user_id', user?.id);

      setUnlockedIds(data?.map((a: any) => a.achievement_id) || []);
    } catch (error) {
      console.error('Error fetching achievements:', error);
    } finally {
      setLoading(false);
    }
  };

  const achievements = defaultAchievements;
  const categories = Object.keys(achievementCategories);

  const filteredAchievements = selectedCategory
    ? achievements.filter((a) => a.category === selectedCategory)
    : achievements;

  const categoryStats = categories.map((cat) => {
    const catAchievements = achievements.filter((a) => a.category === cat);
    const unlockedCount = catAchievements.filter((a) => unlockedIds.includes(a.id)).length;
    return {
      category: cat,
      total: catAchievements.length,
      unlocked: unlockedCount,
    };
  });

  const totalAchievements = achievements.length;
  const totalUnlocked = unlockedIds.length;

  if (loading) {
    return (
      <div className="glass-card p-12 text-center">
        <div className="inline-block w-8 h-8 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: '#8b5cf6', borderRightColor: '#d946ef' }} />
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6 max-w-5xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="space-y-2">
        <h2 className="page-title">{language === 'ar' ? 'الإنجازات' : 'Achievements'}</h2>
        <p className="text-white/50">{`${totalUnlocked}/${totalAchievements} ${language === 'ar' ? 'إنجازات' : 'achievements'}`}</p>
      </div>

      {/* Overall Progress */}
      <div className="glass-card p-6">
        <div className="space-y-3">
          <p className="text-sm font-bold text-white">{language === 'ar' ? 'التقدم الإجمالي' : 'Overall Progress'}</p>
          <div className="h-3 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${(totalUnlocked / totalAchievements) * 100}%`,
                background: 'linear-gradient(90deg, #8b5cf6, #d946ef)',
                boxShadow: '0 0 12px rgba(217,70,239,0.6)',
              }}
            />
          </div>
          <p className="text-xs text-white/40">{Math.round((totalUnlocked / totalAchievements) * 100)}% complete</p>
        </div>
      </div>

      {/* Category Filter */}
      <div className="glass-card p-6">
        <p className="text-sm font-bold text-white mb-3">{language === 'ar' ? 'الفئات' : 'Categories'}</p>
        <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory -mx-1 px-1 md:grid md:grid-cols-5 md:overflow-visible md:pb-0">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`flex-shrink-0 snap-start p-3 rounded-lg transition-all text-xs font-bold min-w-[80px] md:min-w-0 ${
              selectedCategory === null
                ? 'bg-white/20 border-2 border-white'
                : 'bg-white/5 border-2 border-white/10 hover:border-white/30'
            }`}
          >
            {language === 'ar' ? 'الكل' : 'All'} ({totalUnlocked}/{totalAchievements})
          </button>
          {categoryStats.map((stat) => (
            <button
              key={stat.category}
              onClick={() => setSelectedCategory(stat.category)}
              className={`flex-shrink-0 snap-start p-3 rounded-lg transition-all text-xs font-bold min-w-[80px] md:min-w-0 ${
                selectedCategory === stat.category
                  ? 'bg-blue-500/30 border-2 border-blue-400'
                  : 'bg-white/5 border-2 border-white/10 hover:border-white/30'
              }`}
            >
              <div>{language === 'ar' ? achievementCategories[stat.category as keyof typeof achievementCategories].ar : achievementCategories[stat.category as keyof typeof achievementCategories].en}</div>
              <div className="text-xs opacity-70">
                {stat.unlocked}/{stat.total}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Achievements Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredAchievements.map((achievement) => {
          const isUnlocked = unlockedIds.includes(achievement.id);
          const rarityColor = rarityColors[achievement.rarity];

          return (
            <div
              key={achievement.id}
              className={`glass-card p-6 relative overflow-hidden transition-all ${
                isUnlocked ? 'hover:scale-105' : 'opacity-60'
              }`}
              style={{
                border: isUnlocked ? `2px solid ${rarityColor.border}` : '2px solid rgba(255,255,255,0.1)',
                boxShadow: isUnlocked ? `0 0 20px ${rarityColor.glow}40` : 'none',
              }}
            >
              {/* Locked Badge */}
              {!isUnlocked && (
                <div className="absolute top-3 right-3 p-2 rounded-full" style={{ background: 'rgba(0,0,0,0.5)' }}>
                  <Lock className="w-4 h-4 text-white/60" />
                </div>
              )}

              {/* Content */}
              <div className="space-y-3 text-center">
                {/* Icon */}
                <div className="text-5xl animate-bounce">{achievement.icon}</div>

                {/* Name */}
                <h3 className="font-bold text-white">{language === 'ar' ? achievement.nameAr : achievement.nameEn}</h3>

                {/* Description */}
                <p className="text-xs text-white/60">{language === 'ar' ? achievement.descriptionAr : achievement.descriptionEn}</p>

                {/* XP Reward */}
                <div className="pt-2 border-t border-white/10">
                  <p className="text-xs font-bold text-purple-400">+{achievement.xpReward} XP</p>
                </div>

                {/* Rarity Badge */}
                <div
                  className="inline-block px-3 py-1 rounded-full text-xs font-bold"
                  style={{
                    background: `${rarityColor.glow}20`,
                    color: rarityColor.glow,
                  }}
                >
                  {language === 'ar'
                    ? {
                        common: 'عام',
                        rare: 'نادر',
                        epic: 'ملحمي',
                        legendary: 'أسطوري',
                        mythic: 'أسطوري خرافي',
                        divine: 'إلهي',
                      }[achievement.rarity]
                    : achievement.rarity.charAt(0).toUpperCase() + achievement.rarity.slice(1)}
                </div>

                {/* Unlock Status */}
                {isUnlocked && (
                  <div className="text-xs text-green-400 font-bold">✓ {language === 'ar' ? 'مفتوح' : 'Unlocked'}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filteredAchievements.length === 0 && (
        <div className="glass-card p-12 text-center">
          <p className="text-white/50">{language === 'ar' ? 'لا توجد إنجازات في هذه الفئة' : 'No achievements in this category'}</p>
        </div>
      )}
    </div>
  );
};
