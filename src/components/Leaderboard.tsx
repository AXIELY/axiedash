import { useState, useEffect } from 'react';
import { supabase, User } from '../lib/supabase';
import { useLanguage } from '../contexts/LanguageContext';
import { Trophy, Crown, Medal } from 'lucide-react';

const RANK_ICONS: Record<string,string> = { Bronze:'🥉',Silver:'🥈',Gold:'🥇',Diamond:'💎',Legend:'👑' };
const RANK_COLORS: Record<string,string> = {
  Bronze:'from-yellow-700 to-yellow-600', Silver:'from-gray-400 to-gray-300',
  Gold:'from-yellow-500 to-yellow-400', Diamond:'from-cyan-400 to-blue-500',
  Legend:'from-yellow-400 via-purple-500 to-cyan-400',
};

export const Leaderboard = () => {
  const [players, setPlayers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const { t } = useLanguage();

  useEffect(() => { loadLeaderboard(); }, []);

  const loadLeaderboard = async () => {
    const { data, error } = await supabase.from('users').select('*').order('total_score', { ascending: false }).limit(50);
    if (!error) setPlayers(data || []);
    setLoading(false);
  };

  const getPositionDisplay = (pos: number) => {
    if (pos === 1) return <Crown className="w-6 h-6 text-amber-400" style={{ filter: 'drop-shadow(0 0 8px rgba(245,158,11,0.5))' }} />;
    if (pos === 2) return <Medal className="w-6 h-6 text-gray-300" />;
    if (pos === 3) return <Trophy className="w-5 h-5 text-amber-700" />;
    return <span className="text-sm font-bold text-white/30 font-mono">#{pos}</span>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-10 h-10 rounded-full border-2 border-transparent animate-spin"
          style={{ borderTopColor: '#8b5cf6', borderRightColor: '#d946ef' }} />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 animate-fade-in">
      <div className="mb-8">
        <h1 className="page-title">{t('leaderboard.title')}</h1>
        <p className="text-white/40 text-sm mt-1">{t('leaderboard.subtitle')}</p>
      </div>

      <div className="space-y-2.5">
        {players.map((player, index) => {
          const pos = index + 1;
          const isTop3 = pos <= 3;
          const rankColor = RANK_COLORS[player.rank] || RANK_COLORS.Bronze;

          return (
            <div key={player.id}
              className={`glass-card px-5 py-4 flex items-center gap-4 transition-all duration-200 ${isTop3 ? 'hover:border-amber-500/25' : ''}`}
              style={isTop3 ? { boxShadow: '0 4px 24px rgba(0,0,0,0.3), 0 0 16px rgba(245,158,11,0.08)' } : {}}>

              <div className="w-10 flex justify-center flex-shrink-0">{getPositionDisplay(pos)}</div>

              <div className="relative flex-shrink-0">
                <img src={player.avatar_url} alt={player.username}
                  className={`w-12 h-12 rounded-xl object-cover`}
                  style={{
                    border: isTop3 ? '2px solid rgba(245,158,11,0.5)' : '2px solid rgba(139,92,246,0.25)',
                    boxShadow: isTop3 ? '0 0 12px rgba(245,158,11,0.25)' : 'none',
                  }} />
                <span className="absolute -bottom-1 -end-1 text-base leading-none">{RANK_ICONS[player.rank]}</span>
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-white text-sm truncate">{player.username}</h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full bg-gradient-to-r ${rankColor} font-semibold`}>
                    {player.rank}
                  </span>
                  <span className="text-xs text-white/30">Lv.{player.level}</span>
                </div>
              </div>

              <div className="text-end flex-shrink-0">
                <p className="font-bold text-amber-400 font-changa">{player.total_score.toLocaleString()}</p>
                <p className="text-xs text-white/30">{t('leaderboard.totalScore')}</p>
              </div>

              <div className="text-end flex-shrink-0 hidden sm:block">
                <p className="font-bold text-cyan-400">{player.games_won}</p>
                <p className="text-xs text-white/30">{t('leaderboard.wins')}</p>
              </div>

              <div className="text-end flex-shrink-0 hidden md:block">
                <p className="font-bold text-white/60">{player.games_played}</p>
                <p className="text-xs text-white/30">{t('leaderboard.games')}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
