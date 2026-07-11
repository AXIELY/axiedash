import { useActivityFeed, ActivityEvent } from '../hooks/useActivityFeed';
import { useLanguage } from '../contexts/LanguageContext';
import { Star, Award, Zap, Crown } from 'lucide-react';
import { rarityColors } from '../config/luckyCardRewards';

const getActivityIcon = (type: string) => {
  switch (type) {
    case 'reward_won':
      return Star;
    case 'achievement_unlocked':
      return Award;
    case 'level_up':
      return Zap;
    case 'jackpot_won':
      return Crown;
    default:
      return Star;
  }
};

const getActivityMessage = (activity: ActivityEvent, language: string) => {
  const data = activity.activity_data || {};

  switch (activity.activity_type) {
    case 'reward_won':
      return language === 'ar'
        ? `فاز بـ ${data.rewardName || 'جائزة'} ${data.value || ''}`
        : `Won ${data.rewardName || 'reward'} ${data.value || ''}`;
    case 'achievement_unlocked':
      return language === 'ar'
        ? `أطلق إنجاز: ${data.achievementName || 'إنجاز'}`
        : `Unlocked: ${data.achievementName || 'Achievement'}`;
    case 'level_up':
      return language === 'ar'
        ? `وصل للمستوى ${data.newLevel || ''}`
        : `Reached Level ${data.newLevel || ''}`;
    case 'jackpot_won':
      return language === 'ar'
        ? `فاز بـ الجائزة الكبرى! 🎉`
        : `Won the Jackpot! 🎉`;
    default:
      return data.description || (language === 'ar' ? 'نشاط جديد' : 'New Activity');
  }
};

export const ActivityFeed = () => {
  const { activities, loading } = useActivityFeed();
  const { language } = useLanguage();

  if (loading) {
    return (
      <div className="glass-card p-6 text-center">
        <div className="inline-block w-8 h-8 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: '#8b5cf6', borderRightColor: '#d946ef' }} />
      </div>
    );
  }

  return (
    <div className="glass-card p-6 space-y-4 max-h-[500px] overflow-y-auto">
      <h3 className="section-title">{language === 'ar' ? 'النشاط المباشر' : 'Live Activity'}</h3>

      {activities.length === 0 ? (
        <p className="text-white/50 text-center py-8">{language === 'ar' ? 'لا توجد أنشطة حالياً' : 'No activities yet'}</p>
      ) : (
        <div className="space-y-3">
          {activities.map((activity) => {
            const Icon = getActivityIcon(activity.activity_type);
            const rarityData = rarityColors[activity.activity_data?.rarity || 'common'] as any;

            return (
              <div
                key={activity.id}
                className="flex items-center gap-3 p-3 rounded-lg transition-all hover:bg-white/5"
                style={{
                  borderLeft: `3px solid ${rarityData?.glow || 'rgba(139,92,246,0.5)'}`,
                }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{
                    background: `linear-gradient(135deg, ${rarityData?.glow}30, transparent)`,
                  }}
                >
                  <Icon className="w-5 h-5" style={{ color: rarityData?.glow }} />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">
                    {activity.username || 'Player'}
                  </p>
                  <p className="text-xs text-white/60 truncate">
                    {getActivityMessage(activity, language)}
                  </p>
                </div>

                <div className="text-xs text-white/40 flex-shrink-0">
                  {new Date(activity.created_at).toLocaleTimeString(language === 'ar' ? 'ar-SA' : 'en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
