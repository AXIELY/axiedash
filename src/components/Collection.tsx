import { useState } from 'react';
import { usePlayerInventory } from '../hooks/usePlayerInventory';
import { useCollectionProgress } from '../hooks/useCollectionProgress';
import { useLanguage } from '../contexts/LanguageContext';
import { rarityColors } from '../config/luckyCardRewards';
import { Filter, Grid3x3, Trophy, TrendingUp } from 'lucide-react';

export const Collection = () => {
  const { inventory, loading: inventoryLoading } = usePlayerInventory();
  const { stats, leaderboard, loading: progressLoading } = useCollectionProgress();
  const { language } = useLanguage();
  const [selectedRarity, setSelectedRarity] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  const rarities = ['common', 'rare', 'epic', 'legendary', 'mythic', 'divine'];
  const rarityLabels: Record<string, { ar: string; en: string }> = {
    common: { ar: 'عام', en: 'Common' },
    rare: { ar: 'نادر', en: 'Rare' },
    epic: { ar: 'ملحمي', en: 'Epic' },
    legendary: { ar: 'أسطوري', en: 'Legendary' },
    mythic: { ar: 'أسطوري خرافي', en: 'Mythic' },
    divine: { ar: 'إلهي', en: 'Divine' },
  };

  const getRarityLabel = (rarity: string) => rarityLabels[rarity] || { ar: rarity, en: rarity };

  const filteredInventory = selectedRarity
    ? inventory.filter((item) => item.rarity === selectedRarity)
    : inventory;

  const grouped = rarities.map((rarity) => ({
    rarity,
    count: inventory.filter((i) => i.rarity === rarity).length,
  }));

  const loading = inventoryLoading || progressLoading;

  if (loading) {
    return (
      <div className="glass-card p-12 text-center">
        <div className="inline-block w-8 h-8 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: '#8b5cf6', borderRightColor: '#d946ef' }} />
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="space-y-3">
        <h2 className="page-title">{language === 'ar' ? 'مجموعتي' : 'My Collection'}</h2>
        <p className="text-white/60">{language === 'ar' ? `لديك ${inventory.length} عنصر` : `You have ${inventory.length} items`}</p>
      </div>

      {/* Collection Progress Card */}
      {stats && (
        <div className="glass-card p-6 space-y-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              <h3 className="font-bold">{language === 'ar' ? 'تقدم مجموعتك' : 'Collection Progress'}</h3>
            </div>
            <button
              onClick={() => setShowLeaderboard(!showLeaderboard)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-sm"
            >
              <Trophy className="w-4 h-4" />
              {language === 'ar' ? 'الترتيب' : 'Rank'}: #{stats.userRank || '?'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Completion */}
            <div className="space-y-2">
              <p className="text-xs text-white/60">{language === 'ar' ? 'نسبة الاكتمال' : 'Completion'}</p>
              <div className="relative w-full h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500"
                  style={{ width: `${stats.completionPercentage}%` }}
                />
              </div>
              <p className="text-sm font-bold">{stats.completionPercentage.toFixed(1)}%</p>
            </div>

            {/* Rarity Score */}
            <div className="space-y-2">
              <p className="text-xs text-white/60">{language === 'ar' ? 'درجة الندرة' : 'Rarity Score'}</p>
              <div className="text-2xl font-bold text-amber-400">{stats.rarityScore}</div>
              <p className="text-xs text-white/40">{stats.totalItems} {language === 'ar' ? 'عنصر' : 'items'}</p>
            </div>

            {/* Overall Rank */}
            <div className="space-y-2">
              <p className="text-xs text-white/60">{language === 'ar' ? 'ترتيبك العام' : 'Your Rank'}</p>
              <div className="text-2xl font-bold text-purple-400">#{stats.userRank || '-'}</div>
              <p className="text-xs text-white/40">{language === 'ar' ? `من ${stats.totalPlayers}` : `of ${stats.totalPlayers}`}</p>
            </div>
          </div>

          {/* Rarity Breakdown */}
          <div className="pt-2 border-t border-white/10">
            <p className="text-xs text-white/60 mb-3">{language === 'ar' ? 'توزيع الندرة' : 'Rarity Distribution'}</p>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {Object.entries(stats.itemsByRarity).map(([rarity, count]) => {
                const colors = rarityColors[rarity as any];
                return (
                  <div
                    key={rarity}
                    className="text-center p-2 rounded-lg"
                    style={{ background: `${colors.glow}15`, border: `1px solid ${colors.border}` }}
                  >
                    <p className="text-xs font-bold" style={{ color: colors.glow }}>
                      {count}
                    </p>
                    <p className="text-xs text-white/50">{language === 'ar' ? rarityLabels[rarity].ar : rarityLabels[rarity].en}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Leaderboard Preview */}
      {showLeaderboard && leaderboard.length > 0 && (
        <div className="glass-card p-6 space-y-4">
          <h3 className="font-bold flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            {language === 'ar' ? 'أفضل المجموعات' : 'Top Collections'}
          </h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {leaderboard.slice(0, 10).map((entry) => (
              <div
                key={entry.rank}
                className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                  entry.is_current_user ? 'bg-white/15 border border-white/30' : 'bg-white/5 hover:bg-white/10'
                }`}
              >
                <div className="text-lg font-bold w-8">{entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}</div>
                <img src={entry.avatar_url} alt={entry.username} className="w-10 h-10 rounded-full" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{entry.username}</p>
                  <p className="text-xs text-white/50">{entry.completion_percentage.toFixed(1)}% • {entry.total_items} items</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-amber-400">{entry.rarity_score}</p>
                  <p className="text-xs text-white/50">{language === 'ar' ? 'النقاط' : 'Score'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rarity Filter */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-amber-400" />
          <h3 className="font-bold">{language === 'ar' ? 'الفلترة حسب الندرة' : 'Filter by Rarity'}</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedRarity(null)}
            className={`p-3 rounded-lg transition-all font-bold text-sm ${
              selectedRarity === null
                ? 'bg-white/20 border-2 border-white'
                : 'bg-white/5 border-2 border-white/10 hover:border-white/30'
            }`}
          >
            {language === 'ar' ? 'الكل' : 'All'} ({inventory.length})
          </button>
          {grouped.map((group) => {
            const colors = rarityColors[group.rarity as any];
            return (
              <button
                key={group.rarity}
                onClick={() => setSelectedRarity(group.rarity)}
                className={`p-3 rounded-lg transition-all font-bold text-sm`}
                style={{
                  background: selectedRarity === group.rarity ? `${colors.glow}30` : `${colors.glow}10`,
                  border: `2px solid ${colors.border}`,
                  color: selectedRarity === group.rarity ? colors.glow : 'white',
                }}
              >
                {language === 'ar' ? rarityLabels[group.rarity].ar : rarityLabels[group.rarity].en}
                <br />
                <span className="text-xs">({group.count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* View Mode Toggle */}
      <div className="flex justify-between items-center">
        <p className="text-sm text-white/50">
          {language === 'ar' ? `عرض ${filteredInventory.length} عنصر` : `Showing ${filteredInventory.length} items`}
        </p>
        <button
          onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
          className="p-2 rounded-lg hover:bg-white/10 transition-colors"
        >
          <Grid3x3 className="w-5 h-5" />
        </button>
      </div>

      {/* Collection Grid */}
      {filteredInventory.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <p className="text-white/50">{language === 'ar' ? 'لم تجد عناصر هنا' : 'No items found'}</p>
        </div>
      ) : (
        <div className={`grid gap-4 ${viewMode === 'grid' ? 'grid-cols-2 md:grid-cols-4 lg:grid-cols-6' : 'grid-cols-1'}`}>
          {filteredInventory.map((item) => {
            const rarity = rarityColors[item.rarity as any];
            return (
              <div
                key={item.id}
                className="glass-card p-4 hover:scale-105 transition-transform cursor-pointer group relative overflow-hidden"
                style={{
                  border: `2px solid ${rarity.border}`,
                  boxShadow: `0 0 16px ${rarity.glow}40`,
                }}
              >
                {/* Rarity glow background */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity pointer-events-none"
                  style={{
                    background: `radial-gradient(ellipse at center, ${rarity.glow}, transparent 70%)`,
                  }}
                />

                <div className="relative space-y-2 text-center">
                  {/* Item Icon/Preview */}
                  <div className="w-full h-20 rounded-lg flex items-center justify-center text-3xl mb-2" style={{ background: `${rarity.glow}15` }}>
                    {item.item_type === 'avatar' ? '👤' : item.item_type === 'effect' ? '✨' : item.item_type === 'border' ? '⭐' : item.item_type === 'title' ? '🏆' : '📦'}
                  </div>

                  {/* Item Details */}
                  <p className="text-xs font-bold text-white truncate">{item.item_id}</p>
                  <p className="text-xs text-white/50">{item.item_type}</p>

                  {/* Quantity Badge */}
                  {item.quantity > 1 && (
                    <div
                      className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{
                        background: rarity.glow,
                        color: '#0d0b1e',
                      }}
                    >
                      ×{item.quantity}
                    </div>
                  )}

                  {/* Equipped Badge */}
                  {item.equipped && (
                    <div className="text-xs font-bold text-amber-400 mt-1">
                      {language === 'ar' ? '✓ مجهز' : '✓ Equipped'}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Collection Stats */}
      <div className="glass-card p-6 grid grid-cols-2 md:grid-cols-6 gap-4">
        {grouped.map((group) => {
          const colors = rarityColors[group.rarity as any];
          return (
            <div key={group.rarity} className="text-center p-3 rounded-lg" style={{ background: `${colors.glow}10` }}>
              <p className="text-xs text-white/60 mb-1">{language === 'ar' ? rarityLabels[group.rarity].ar : rarityLabels[group.rarity].en}</p>
              <p className="text-2xl font-bold" style={{ color: colors.glow }}>
                {group.count}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};
