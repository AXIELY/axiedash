import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export interface Badge {
  id: string;
  name: string;
  name_en: string | null;
  name_ar: string | null;
  description: string;
  icon: string;
  category: string;
  rarity: string;
  badge_code: string | null;
  is_secret: boolean;
  is_active: boolean;
  xp_reward: number;
  rule_type: string | null;
  rule_value: number | null;
  unlocked: boolean;
  unlocked_at: string | null;
}

export function usePlayerBadges() {
  const { user } = useAuth();
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    fetchBadges();
  }, [user?.id]);

  const fetchBadges = async () => {
    try {
      const { data: allBadges } = await supabase
        .from('achievements')
        .select('*')
        .eq('is_active', true)
        .order('rarity', { ascending: true });

      const { data: userBadges } = await supabase
        .from('user_achievements')
        .select('achievement_id, unlocked_at')
        .eq('user_id', user!.id);

      const unlockedMap = new Map(
        (userBadges || []).map(ua => [ua.achievement_id, ua.unlocked_at])
      );

      const merged = (allBadges || []).map(b => ({
        ...b,
        name_en: b.name_en ?? b.name,
        name_ar: b.name_ar ?? b.name,
        unlocked: unlockedMap.has(b.id),
        unlocked_at: unlockedMap.get(b.id) ?? null,
      })) as Badge[];

      setBadges(merged);
    } catch (err) {
      console.error('Error fetching badges:', err);
    } finally {
      setLoading(false);
    }
  };

  const unlockedCount = badges.filter(b => b.unlocked).length;

  return { badges, loading, unlockedCount, refresh: fetchBadges };
}
