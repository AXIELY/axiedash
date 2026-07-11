import { useState, useEffect } from 'react';
import { Save, Plus, Trash2, Edit2, Gamepad2 } from 'lucide-react';
import { supabase, GameSettings } from '../../lib/supabase';

export const GameManagement = () => {
  const [games, setGames] = useState<GameSettings[]>([]);
  const [editingGame, setEditingGame] = useState<GameSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGames();
  }, []);

  const fetchGames = async () => {
    try {
      const { data, error } = await supabase
        .from('game_settings')
        .select('*')
        .order('game_type');

      if (error) throw error;
      setGames(data || []);
    } catch (error) {
      console.error('Error fetching games:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editingGame) return;

    try {
      const { error } = await supabase
        .from('game_settings')
        .update({
          win_rate: editingGame.win_rate,
          min_bet: editingGame.min_bet,
          max_bet: editingGame.max_bet,
          prizes: editingGame.prizes,
          is_active: editingGame.is_active,
        })
        .eq('id', editingGame.id);

      if (error) throw error;

      await fetchGames();
      setEditingGame(null);
      alert('تم حفظ التغييرات بنجاح');
    } catch (error) {
      console.error('Error saving game:', error);
      alert('حدث خطأ أثناء الحفظ');
    }
  };

  const getGameName = (type: string) => {
    const names: Record<string, string> = {
      'coin-rush': 'سباق العملات',
      'lucky-card': 'بطاقة الحظ',
      'wheel': 'عجلة الحظ',
      'ai-battle': 'معركة الذكاء الاصطناعي',
    };
    return names[type] || type;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-axie-gold border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-changa font-bold">إدارة الألعاب</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {games.map((game) => (
          <div key={game.id} className="glass-panel p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-axie-gold to-axie-purple flex items-center justify-center">
                  <Gamepad2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">{getGameName(game.game_type)}</h3>
                  <p className="text-sm text-axie-purple-light">{game.game_type}</p>
                </div>
              </div>
              <button
                onClick={() => setEditingGame(game)}
                className="p-2 hover:bg-white/10 rounded-lg transition-all"
              >
                <Edit2 className="w-5 h-5 text-axie-gold" />
              </button>
            </div>

            {editingGame?.id === game.id ? (
              <div className="space-y-4 pt-4 border-t border-white/10">
                <div>
                  <label className="block text-sm font-bold mb-2">نسبة الفوز (%)</label>
                  <input
                    type="number"
                    value={editingGame.win_rate}
                    onChange={(e) =>
                      setEditingGame({ ...editingGame, win_rate: parseFloat(e.target.value) })
                    }
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-axie-gold"
                    min="0"
                    max="100"
                    step="0.1"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold mb-2">الحد الأدنى للرهان</label>
                    <input
                      type="number"
                      value={editingGame.min_bet}
                      onChange={(e) =>
                        setEditingGame({ ...editingGame, min_bet: parseInt(e.target.value) })
                      }
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-axie-gold"
                      min="0"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold mb-2">الحد الأقصى للرهان</label>
                    <input
                      type="number"
                      value={editingGame.max_bet}
                      onChange={(e) =>
                        setEditingGame({ ...editingGame, max_bet: parseInt(e.target.value) })
                      }
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-axie-gold"
                      min="0"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`active-${game.id}`}
                    checked={editingGame.is_active}
                    onChange={(e) =>
                      setEditingGame({ ...editingGame, is_active: e.target.checked })
                    }
                    className="w-5 h-5 rounded border-white/20 text-axie-gold focus:ring-axie-gold"
                  />
                  <label htmlFor={`active-${game.id}`} className="text-sm font-bold">
                    اللعبة نشطة
                  </label>
                </div>

                <div className="flex gap-3 pt-4">
                  <button onClick={handleSave} className="btn-primary flex-1 flex items-center justify-center gap-2">
                    <Save className="w-4 h-4" />
                    حفظ التغييرات
                  </button>
                  <button
                    onClick={() => setEditingGame(null)}
                    className="btn-secondary flex-1"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
                <div>
                  <p className="text-sm text-axie-purple-light">نسبة الفوز</p>
                  <p className="text-lg font-bold text-axie-gold">{game.win_rate}%</p>
                </div>
                <div>
                  <p className="text-sm text-axie-purple-light">الحالة</p>
                  <p className={`text-lg font-bold ${game.is_active ? 'text-green-400' : 'text-red-400'}`}>
                    {game.is_active ? 'نشطة' : 'غير نشطة'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-axie-purple-light">الحد الأدنى</p>
                  <p className="text-lg font-bold">{game.min_bet} عملة</p>
                </div>
                <div>
                  <p className="text-sm text-axie-purple-light">الحد الأقصى</p>
                  <p className="text-lg font-bold">{game.max_bet} عملة</p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
