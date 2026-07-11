import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../contexts/LanguageContext';
import { Crown, Flame, Zap } from 'lucide-react';

interface LeaderboardEntry {
  user_id: string;
  username: string;
  avatar_url: string;
  rank: number;
  level: number;
  value: number;
  metric: string;
}

const RANK_MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

export const EnhancedLeaderboard = () => {
  const { language } = useLanguage();
  const [selectedCategory, setSelectedCategory] = useState<'xp' | 'coins' | 'games' | 'wins'>('xp');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeaderboard();
  }, [selectedCategory]);

  const fetchLeaderboard = async () => {
    setLoading(true);
    try {
      let query = supabase.from('users').select('id, username, avatar_url, level');

      const { data, error } = await query.order(
        selectedCategory === 'xp'
          ? 'xp'
          : selectedCategory === 'coins'
            ? 'coins'
            : selectedCategory === 'games'
              ? 'games_played'
              : 'games_won',
        { ascending: false }
      );

      if (error) throw error;

      const ranked = (data || []).map((user: any, index) => ({
        user_id: user.id,
        username: user.username,
        avatar_url: user.avatar_url,
        rank: index + 1,
        level: user.level,
        value:
          selectedCategory === 'xp'
            ? user.xp || 0
            : selectedCategory === 'coins'
              ? user.coins || 0
              : selectedCategory === 'games'
                ? user.games_played || 0
                : user.games_won || 0,
        metric: selectedCategory,
      }));

      setLeaderboard(ranked.slice(0, 50));
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const categories = [
    { id: 'xp', label: language === 'ar' ? 'الخبرة' : 'Experience', icon: Zap, color: '#a78bfa' },
    { id: 'coins', label: language === 'ar' ? 'العملات' : 'Coins', icon: Crown, color: '#fcd34d' },
    { id: 'games', label: language === 'ar' ? 'الألعاب' : 'Games Played', icon: Flame, color: '#ff6b6b' },
    { id: 'wins', label: language === 'ar' ? 'الانتصارات' : 'Wins', icon: Flame, color: '#00e5ff' },
  ];

  const currentCategory = categories.find((c) => c.id === selectedCategory);

  return (
    <div className="space-y-5 sm:space-y-6 max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="space-y-2">
        <h2 className="page-title">{language === 'ar' ? 'لوحة المتصدرين' : 'Leaderboards'}</h2>
        <p className="text-white/50">{language === 'ar' ? 'أفضل اللاعبين' : 'Top players'}</p>
      </div>

      {/* Category Tabs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {categories.map((cat) => {
          const Icon = cat.icon;
          const isSelected = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id as any)}
              className={`p-4 rounded-xl transition-all flex items-center gap-2 justify-center ${
                isSelected
                  ? 'bg-white/20 border-2 border-white'
                  : 'glass-card hover:bg-white/10 border-2 border-transparent'
              }`}
            >
              <Icon className="w-5 h-5" style={{ color: cat.color }} />
              <span className="font-bold text-sm hidden sm:inline">{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Leaderboard */}
      {loading ? (
        <div className="glass-card p-12 text-center">
          <div className="inline-block w-8 h-8 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: '#8b5cf6', borderRightColor: '#d946ef' }} />
        </div>
      ) : leaderboard.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <p className="text-white/50">{language === 'ar' ? 'لا توجد بيانات' : 'No data available'}</p>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10" style={{ background: 'rgba(139,92,246,0.1)' }}>
                  <th className="px-4 py-3 text-left text-sm font-bold">{language === 'ar' ? 'الترتيب' : 'Rank'}</th>
                  <th className="px-4 py-3 text-left text-sm font-bold">{language === 'ar' ? 'اللاعب' : 'Player'}</th>
                  <th className="px-4 py-3 text-left text-sm font-bold">{language === 'ar' ? 'المستوى' : 'Level'}</th>
                  <th className="px-4 py-3 text-right text-sm font-bold" style={{ color: currentCategory?.color }}>
                    {currentCategory?.label}
                  </th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((entry, index) => {
                  const medal = RANK_MEDALS[entry.rank as keyof typeof RANK_MEDALS];
                  const isTopThree = entry.rank <= 3;

                  return (
                    <tr
                      key={entry.user_id}
                      className={`border-b border-white/5 transition-all hover:bg-white/5 ${isTopThree ? 'bg-white/[0.03]' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <span className="text-lg font-bold">{medal || `#${entry.rank}`}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <img
                            src={entry.avatar_url}
                            alt={entry.username}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                          <span className="font-bold text-white">{entry.username}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-white/70">Lv. {entry.level}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-bold text-lg" style={{ color: currentCategory?.color }}>
                          {entry.value.toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
