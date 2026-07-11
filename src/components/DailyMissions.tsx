import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { CheckCircle, Circle, Gift, Zap } from 'lucide-react';

interface Mission {
  id: string;
  mission_id: string;
  name_ar: string;
  name_en: string;
  description_ar: string;
  description_en: string;
  objective_type: string;
  objective_target: number;
  reward_xp: number;
  reward_coins: number;
  tier: string;
}

interface PlayerMission {
  id: string;
  user_id: string;
  mission_id: string;
  progress: number;
  completed: boolean;
  claimed_reward: boolean;
}

export const DailyMissions = () => {
  const { user } = useAuth();
  const { language } = useLanguage();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [playerMissions, setPlayerMissions] = useState<PlayerMission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.id) {
      fetchMissionsData();
    }
  }, [user?.id]);

  const fetchMissionsData = async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data: missionsData } = await supabase
        .from('daily_missions')
        .select('*')
        .eq('is_active', true);

      const { data: playerData } = await supabase
        .from('player_missions')
        .select('*')
        .eq('user_id', user?.id)
        .gte('date', today.toISOString().split('T')[0]);

      setMissions((missionsData || []) as Mission[]);
      setPlayerMissions((playerData || []) as PlayerMission[]);
    } catch (error) {
      console.error('Error fetching missions:', error);
    } finally {
      setLoading(false);
    }
  };

  const claimReward = async (playerMissionId: string, _xpReward: number, _coinReward: number) => {
    if (!user?.id) return;

    try {
      const { data } = await supabase.rpc('claim_mission_reward', {
        p_player_mission_id: playerMissionId,
      });

      if (data?.success || data?.already_claimed) {
        fetchMissionsData();
      }
    } catch (error) {
      console.error('Error claiming reward:', error);
    }
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'easy':
        return { bg: 'from-green-500 to-emerald-600', glow: 'rgba(34,197,94,0.5)' };
      case 'normal':
        return { bg: 'from-blue-500 to-cyan-600', glow: 'rgba(6,182,212,0.5)' };
      case 'hard':
        return { bg: 'from-orange-500 to-red-600', glow: 'rgba(245,158,11,0.5)' };
      default:
        return { bg: 'from-purple-500 to-pink-600', glow: 'rgba(217,70,239,0.5)' };
    }
  };

  if (loading) {
    return (
      <div className="glass-card p-12 text-center">
        <div className="inline-block w-8 h-8 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: '#8b5cf6', borderRightColor: '#d946ef' }} />
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6 max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="space-y-2">
        <h2 className="section-title">{language === 'ar' ? 'المهام اليومية' : 'Daily Missions'}</h2>
        <p className="text-white/50 text-sm">{language === 'ar' ? 'أكمل المهام اليومية لكسب المكافآت' : 'Complete daily tasks to earn rewards'}</p>
      </div>

      {/* Missions List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {missions.map((mission) => {
          const playerMission = playerMissions.find((pm) => pm.mission_id === mission.mission_id);
          const progress = playerMission?.progress || 0;
          const completed = playerMission?.completed || false;
          const claimed = playerMission?.claimed_reward || false;
          const tierColor = getTierColor(mission.tier);

          return (
            <div
              key={mission.id}
              className="glass-card p-6 relative overflow-hidden group hover:scale-[1.02] transition-transform"
              style={{
                borderLeft: `4px solid ${tierColor.glow}`,
                boxShadow: `inset 0 0 16px ${tierColor.glow}20`,
              }}
            >
              {/* Tier indicator */}
              <div
                className="absolute top-0 right-0 px-3 py-1 text-xs font-bold uppercase"
                style={{
                  background: tierColor.glow,
                  color: '#0d0b1e',
                }}
              >
                {mission.tier}
              </div>

              {/* Content */}
              <div className="space-y-3 pt-4">
                <div className="flex items-start gap-3">
                  <div>
                    {completed ? (
                      <CheckCircle className="w-6 h-6 text-green-400 flex-shrink-0 mt-1" />
                    ) : (
                      <Circle className="w-6 h-6 text-white/30 flex-shrink-0 mt-1" />
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-white">{language === 'ar' ? mission.name_ar : mission.name_en}</h3>
                    <p className="text-xs text-white/50 mt-1">{language === 'ar' ? mission.description_ar : mission.description_en}</p>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-white/60">
                    <span>
                      {mission.objective_type} {completed ? '✓' : `${progress}/${mission.objective_target}`}
                    </span>
                  </div>
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min(100, (progress / mission.objective_target) * 100)}%`,
                        background: completed ? 'linear-gradient(90deg, #10b981, #34d399)' : tierColor.glow,
                      }}
                    />
                  </div>
                </div>

                {/* Rewards */}
                <div className="flex items-center gap-3 pt-2">
                  {mission.reward_xp > 0 && (
                    <div className="flex items-center gap-1 text-xs font-bold text-purple-400">
                      <Zap className="w-4 h-4" />
                      +{mission.reward_xp} XP
                    </div>
                  )}
                  {mission.reward_coins > 0 && (
                    <div className="flex items-center gap-1 text-xs font-bold text-amber-400">
                      <Gift className="w-4 h-4" />
                      +{mission.reward_coins}
                    </div>
                  )}
                </div>

                {/* Claim Button */}
                {completed && !claimed && (
                  <button
                    onClick={() => claimReward(playerMission?.id || '', mission.reward_xp, mission.reward_coins)}
                    className="w-full py-2 mt-3 rounded-lg font-bold text-sm transition-all"
                    style={{
                      background: `linear-gradient(135deg, ${tierColor.glow}, ${tierColor.glow}80)`,
                      color: '#0d0b1e',
                    }}
                  >
                    {language === 'ar' ? 'استلم المكافأة' : 'Claim Reward'}
                  </button>
                )}

                {claimed && (
                  <div className="w-full py-2 mt-3 rounded-lg font-bold text-sm text-center text-green-400" style={{ background: 'rgba(34,197,94,0.1)' }}>
                    {language === 'ar' ? '✓ تم الاستلام' : '✓ Claimed'}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {missions.length === 0 && (
        <div className="glass-card p-12 text-center">
          <p className="text-white/50">{language === 'ar' ? 'لا توجد مهام متاحة حالياً' : 'No missions available'}</p>
        </div>
      )}
    </div>
  );
};
