import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Coins, Zap, Trophy, Users, Clock } from 'lucide-react';

export const CoinRushGame = () => {
  const { user, refreshUser } = useAuth();
  const [gameState, setGameState] = useState<'lobby' | 'playing' | 'finished'>('lobby');
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const [boosterActive, setBoosterActive] = useState(false);
  const [roomPlayers, setRoomPlayers] = useState<any[]>([]);
  const [currentRoom, setCurrentRoom] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (gameState === 'playing' && timeLeft > 0) {
      const timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
      return () => clearInterval(timer);
    } else if (timeLeft === 0 && gameState === 'playing') {
      endGame();
    }
  }, [gameState, timeLeft]);

  const startGame = async () => {
    const { data: room } = await supabase
      .from('game_rooms')
      .insert([{ game_type: 'coin_rush', status: 'active', current_players: 1 }])
      .select()
      .single();

    if (room) {
      setCurrentRoom(room.id);
      await supabase.from('room_players').insert([
        { room_id: room.id, user_id: user!.id, score: 0 },
      ]);
      setGameState('playing');
      setScore(0);
      setTimeLeft(60);
    }
  };

  const handleClick = async () => {
    if (gameState !== 'playing') return;

    const increment = boosterActive ? 10 : 1;
    const newScore = score + increment;
    setScore(newScore);

    if (currentRoom) {
      await supabase
        .from('room_players')
        .update({ score: newScore })
        .eq('room_id', currentRoom)
        .eq('user_id', user!.id);
    }
  };

  const activateBooster = async () => {
    if (boosterActive || !user || user.boosters <= 0 || user.points < 50) return;

    await supabase
      .from('users')
      .update({ boosters: user.boosters - 1, points: user.points - 50 })
      .eq('id', user.id);

    await supabase.from('transactions').insert([
      {
        user_id: user.id,
        transaction_type: 'spend',
        amount: 50,
        item: 'booster',
        description: 'Activated 10x booster in Coin Rush',
      },
    ]);

    setBoosterActive(true);
    await refreshUser();

    setTimeout(() => {
      setBoosterActive(false);
    }, 15000);
  };

  const endGame = async () => {
    setGameState('finished');

    const xpEarned = Math.floor(score / 10) + 150;
    const coinsEarned = score;

    await supabase
      .from('users')
      .update({
        xp: (user!.xp || 0) + xpEarned,
        coins: (user!.coins || 0) + coinsEarned,
        games_played: (user!.games_played || 0) + 1,
        games_won: (user!.games_won || 0) + 1,
        total_score: (user!.total_score || 0) + score,
      })
      .eq('id', user!.id);

    await supabase.from('xp_log').insert([
      { user_id: user!.id, source: 'coin_rush_win', xp_value: xpEarned },
    ]);

    const newLevel = Math.floor((user!.xp + xpEarned) / 500) + 1;
    if (newLevel > user!.level) {
      const ranks = ['Bronze', 'Bronze', 'Bronze', 'Bronze', 'Bronze', 'Silver', 'Silver', 'Silver', 'Silver', 'Silver', 'Gold'];
      const newRank = newLevel <= 5 ? 'Bronze' : newLevel <= 10 ? 'Silver' : newLevel <= 20 ? 'Gold' : newLevel <= 40 ? 'Diamond' : 'Legend';

      await supabase
        .from('users')
        .update({ level: newLevel, rank: newRank })
        .eq('id', user!.id);
    }

    if (currentRoom) {
      await supabase
        .from('game_rooms')
        .update({ status: 'finished', finished_at: new Date().toISOString() })
        .eq('id', currentRoom);
    }

    setShowConfetti(true);
    await refreshUser();
  };

  const playAgain = () => {
    setGameState('lobby');
    setScore(0);
    setTimeLeft(60);
    setBoosterActive(false);
    setCurrentRoom(null);
    setShowConfetti(false);
  };

  if (gameState === 'finished') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 sm:p-8 relative">
        {showConfetti && (
          <div className="fixed inset-0 pointer-events-none z-50">
            {[...Array(50)].map((_, i) => (
              <div
                key={i}
                className="absolute animate-float"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `-20px`,
                  animationDelay: `${Math.random() * 2}s`,
                  animationDuration: `${3 + Math.random() * 2}s`,
                }}
              >
                {['🎉', '🎊', '✨', '💰', '🏆'][Math.floor(Math.random() * 5)]}
              </div>
            ))}
          </div>
        )}
        <div className="glass-panel p-6 sm:p-12 max-w-2xl w-full text-center animate-slide-up">
          <Trophy className="w-16 h-16 sm:w-24 sm:h-24 mx-auto mb-4 sm:mb-6 text-amber-400 animate-pulse-glow glow-gold" />
          <h1 className="text-3xl sm:text-5xl font-changa font-bold mb-3 sm:mb-4 bg-gradient-to-r from-amber-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent">
            انتهت اللعبة!
          </h1>
          <p className="text-lg sm:text-2xl text-white/60 mb-6 sm:mb-8">أداء رائع!</p>

          <div className="grid grid-cols-2 gap-3 sm:gap-6 mb-6 sm:mb-8">
            <div className="glass-panel p-4 sm:p-6">
              <Coins className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-2 text-cyan-400" />
              <div className="text-2xl sm:text-3xl font-bold text-cyan-400">{score}</div>
              <div className="text-xs sm:text-sm text-white/50">إجمالي العملات</div>
            </div>
            <div className="glass-panel p-4 sm:p-6">
              <Zap className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-2 text-amber-400" />
              <div className="text-2xl sm:text-3xl font-bold text-amber-400">+{Math.floor(score / 10) + 150}</div>
              <div className="text-xs sm:text-sm text-white/50">نقاط الخبرة</div>
            </div>
          </div>

          <div className="space-y-3 sm:space-y-4">
            <button onClick={playAgain} className="btn-gold w-full text-base sm:text-xl py-3 sm:py-4">
              العب مرة أخرى
            </button>
            <button onClick={() => setGameState('lobby')} className="btn-primary w-full text-base sm:text-xl py-3 sm:py-4">
              العودة للردهة
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'playing') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-8">
        <div className="glass-panel p-4 sm:p-8 max-w-4xl w-full">
          <div className="flex items-center justify-between gap-2 mb-6 sm:mb-8">
            <div className="glass-panel p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
              <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-amber-400" />
              <div>
                <div className="text-2xl sm:text-3xl font-changa font-bold text-amber-400">{timeLeft}ث</div>
                <div className="text-xs text-white/50">الوقت المتبقي</div>
              </div>
            </div>

            <div className="glass-panel p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
              <Coins className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-400" />
              <div>
                <div className="text-2xl sm:text-3xl font-changa font-bold text-cyan-400">{score}</div>
                <div className="text-xs text-white/50">النقاط</div>
              </div>
            </div>

            <button
              onClick={activateBooster}
              disabled={boosterActive || !user || user.boosters <= 0}
              className={`glass-panel p-3 sm:p-4 min-h-[44px] ${
                boosterActive ? 'glow-gold' : 'hover:glow-purple'
              } transition-all disabled:opacity-50`}
            >
              <Zap className={`w-5 h-5 sm:w-6 sm:h-6 ${boosterActive ? 'text-amber-400' : 'text-white/60'}`} />
              <div className="text-xs sm:text-sm font-bold">
                {boosterActive ? 'نشط!' : `x10 (${user?.boosters || 0})`}
              </div>
            </button>
          </div>

          <button
            onClick={handleClick}
            className={`w-full aspect-square max-w-[280px] sm:max-w-md mx-auto rounded-full bg-gradient-to-br from-amber-500 via-amber-400 to-amber-600 text-6xl sm:text-8xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all glow-gold cursor-pointer shadow-2xl block`}
          >
            💰
          </button>

          <p className="text-center mt-4 sm:mt-6 text-white/60 text-sm sm:text-lg">
            {boosterActive ? 'المعزز نشط! اضغط للحصول على 10 أضعاف العملات!' : 'اضغط على العملة لجمعها!'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-8">
      <div className="glass-panel p-6 sm:p-12 max-w-2xl w-full text-center">
        <div className="text-6xl sm:text-8xl mb-4 sm:mb-6 animate-fade-in">💰</div>
        <h1 className="text-3xl sm:text-5xl font-changa font-bold mb-3 sm:mb-4 bg-gradient-to-r from-amber-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent">
          سباق العملات
        </h1>
        <p className="text-base sm:text-xl text-white/60 mb-6 sm:mb-8">
          اضغط بأسرع ما يمكن في 60 ثانية!
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <div className="glass-panel p-4">
            <Users className="w-8 h-8 mx-auto mb-2 text-axie-blue" />
            <div className="text-2xl font-bold">234</div>
            <div className="text-sm text-axie-purple-light">اللاعبون المتصلون</div>
          </div>
          <div className="glass-panel p-4">
            <Trophy className="w-8 h-8 mx-auto mb-2 text-axie-gold" />
            <div className="text-2xl font-bold">{user?.games_won || 0}</div>
            <div className="text-sm text-axie-purple-light">انتصاراتك</div>
          </div>
          <div className="glass-panel p-4">
            <Coins className="w-8 h-8 mx-auto mb-2 text-axie-blue" />
            <div className="text-2xl font-bold">{user?.coins || 0}</div>
            <div className="text-sm text-axie-purple-light">إجمالي العملات</div>
          </div>
        </div>

        <button onClick={startGame} className="btn-gold w-full text-lg sm:text-2xl py-4 sm:py-6 font-changa">
          ابدأ اللعبة
        </button>

        <div className="mt-6 glass-panel p-4 text-right">
          <h3 className="font-bold mb-2">قواعد اللعبة:</h3>
          <ul className="text-sm text-axie-purple-light space-y-1">
            <li>• اضغط على العملة أكبر عدد ممكن في 60 ثانية</li>
            <li>• كل ضغطة = عملة واحدة (أو 10 مع المعزز)</li>
            <li>• استخدم المعززات للحصول على مضاعف 10x (15 ثانية)</li>
            <li>• اكسب نقاط الخبرة وارتقِ بالمستوى حسب أدائك</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
