import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export interface CollectionStats {
  totalItems: number;
  completionPercentage: number;
  rarityScore: number;
  itemsByRarity: {
    common: number;
    rare: number;
    epic: number;
    legendary: number;
    mythic: number;
    divine: number;
  };
  userRank: number | null;
  totalPlayers: number;
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  avatar_url: string;
  completion_percentage: number;
  total_items: number;
  rarity_score: number;
  is_current_user: boolean;
}

export interface CollectionAchievement {
  id: string;
  achievement_type: string;
  milestone_value: number | null;
  unlocked_at: string;
}

// Rarity scoring system: divine(6) > mythic(5) > legendary(4) > epic(3) > rare(2) > common(1)
const RARITY_WEIGHTS: Record<string, number> = {
  common: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
  mythic: 5,
  divine: 6,
};

export const useCollectionProgress = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<CollectionStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [achievements, setAchievements] = useState<CollectionAchievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.id) {
      fetchCollectionProgress();
    }
  }, [user?.id]);

  const calculateRarityScore = (items: any[]): number => {
    return items.reduce((total, item) => {
      const weight = RARITY_WEIGHTS[item.rarity] || 1;
      return total + weight * item.quantity;
    }, 0);
  };

  const fetchCollectionProgress = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      setError(null);

      // Fetch user's inventory
      const { data: inventory, error: inventoryError } = await supabase
        .from('player_inventory')
        .select('*')
        .eq('user_id', user.id);

      if (inventoryError) throw inventoryError;

      // Calculate stats
      const itemsByRarity = {
        common: 0,
        rare: 0,
        epic: 0,
        legendary: 0,
        mythic: 0,
        divine: 0,
      };

      let totalItems = 0;
      const items = inventory || [];

      items.forEach((item) => {
        const rarity = item.rarity as keyof typeof itemsByRarity;
        if (itemsByRarity.hasOwnProperty(rarity)) {
          itemsByRarity[rarity] += item.quantity;
        }
        totalItems += item.quantity;
      });

      const rarityScore = calculateRarityScore(items);

      // Fetch or create collection progress record
      let { data: progressData, error: progressError } = await supabase
        .from('collection_progress')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (progressError && progressError.code !== 'PGRST116') throw progressError;

      // If no progress record exists, create one
      if (!progressData) {
        const { data: newProgress, error: createError } = await supabase
          .from('collection_progress')
          .insert({
            user_id: user.id,
            total_items_collected: totalItems,
            completion_percentage: 0,
            rarity_score: rarityScore,
            common_count: itemsByRarity.common,
            rare_count: itemsByRarity.rare,
            epic_count: itemsByRarity.epic,
            legendary_count: itemsByRarity.legendary,
            mythic_count: itemsByRarity.mythic,
            divine_count: itemsByRarity.divine,
          })
          .select()
          .maybeSingle();

        if (createError) throw createError;
        progressData = newProgress;
      } else {
        // Update existing progress record
        const { error: updateError } = await supabase
          .from('collection_progress')
          .update({
            total_items_collected: totalItems,
            rarity_score: rarityScore,
            common_count: itemsByRarity.common,
            rare_count: itemsByRarity.rare,
            epic_count: itemsByRarity.epic,
            legendary_count: itemsByRarity.legendary,
            mythic_count: itemsByRarity.mythic,
            divine_count: itemsByRarity.divine,
            last_updated: new Date().toISOString(),
          })
          .eq('user_id', user.id);

        if (updateError) throw updateError;
      }

      // Fetch leaderboard data
      const { data: leaderboardData, error: leaderboardError } = await supabase
        .from('collection_leaderboard')
        .select('*')
        .order('rank', { ascending: true })
        .limit(50);

      if (leaderboardError) throw leaderboardError;

      // Find user's rank
      const userRankEntry = leaderboardData?.find((entry) => entry.user_id === user.id);
      const userRank = userRankEntry?.rank || null;

      // Format leaderboard entries
      const formattedLeaderboard: LeaderboardEntry[] = (leaderboardData || []).map((entry) => ({
        rank: entry.rank || 0,
        username: entry.username,
        avatar_url: entry.avatar_url || '',
        completion_percentage: Number(entry.completion_percentage) || 0,
        total_items: entry.total_items || 0,
        rarity_score: entry.rarity_score || 0,
        is_current_user: entry.user_id === user.id,
      }));

      // Fetch achievements
      const { data: achievementsData, error: achievementsError } = await supabase
        .from('collection_achievements')
        .select('*')
        .eq('user_id', user.id)
        .order('unlocked_at', { ascending: false });

      if (achievementsError) throw achievementsError;

      setStats({
        totalItems,
        completionPercentage: progressData?.completion_percentage || 0,
        rarityScore,
        itemsByRarity,
        userRank,
        totalPlayers: leaderboardData?.length || 0,
      });

      setLeaderboard(formattedLeaderboard);
      setAchievements(achievementsData || []);
    } catch (err) {
      console.error('Error fetching collection progress:', err);
      setError('Failed to load collection progress');
    } finally {
      setLoading(false);
    }
  };

  const updateLeaderboard = async () => {
    try {
      // This would typically be called by an admin function or trigger
      // to recalculate and update the leaderboard
      const { data: allProgress, error: fetchError } = await supabase
        .from('collection_progress')
        .select('*')
        .order('rarity_score', { ascending: false });

      if (fetchError) throw fetchError;

      // Delete old leaderboard
      const { error: deleteError } = await supabase
        .from('collection_leaderboard')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (deleteError) throw deleteError;

      // Insert new leaderboard entries
      const leaderboardInserts = (allProgress || []).map((progress, index) => ({
        user_id: progress.user_id,
        username: '', // Will be filled from users table
        avatar_url: '',
        rank: index + 1,
        completion_percentage: progress.completion_percentage,
        total_items: progress.total_items_collected,
        rarity_score: progress.rarity_score,
      }));

      if (leaderboardInserts.length > 0) {
        const { error: insertError } = await supabase
          .from('collection_leaderboard')
          .insert(leaderboardInserts);

        if (insertError) throw insertError;
      }

      await fetchCollectionProgress();
    } catch (err) {
      console.error('Error updating leaderboard:', err);
      throw err;
    }
  };

  return {
    stats,
    leaderboard,
    achievements,
    loading,
    error,
    fetchCollectionProgress,
    updateLeaderboard,
  };
};
