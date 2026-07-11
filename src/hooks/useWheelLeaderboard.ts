import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export type LeaderboardPeriod = 'daily' | 'weekly' | 'all_time';

export interface LeaderboardEntry {
  user_id: string;
  username: string;
  avatar_url: string;
  level: number;
  rank: string;
  total_score: number;
  rare_wins: number;
  rank_position: number;
}

export interface PlayerPosition {
  position: number;
  score: number;
  period: string;
  has_entry: boolean;
}

export function useWheelLeaderboard(period: LeaderboardPeriod = 'weekly') {
  const { user } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [playerPosition, setPlayerPosition] = useState<PlayerPosition | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const [lbRes, posRes] = await Promise.all([
      supabase.rpc('get_wheel_leaderboard', { p_period: period, p_limit: 10 }),
      user?.id
        ? supabase.rpc('get_player_leaderboard_position', { p_user_id: user.id, p_period: period })
        : Promise.resolve({ data: null }),
    ]);

    setEntries((lbRes.data as LeaderboardEntry[] | null) ?? []);
    setPlayerPosition((posRes.data as PlayerPosition | null));
    setLoading(false);
  }, [period, user?.id]);

  useEffect(() => {
    setLoading(true);
    fetch();
    const interval = setInterval(fetch, 60_000);
    return () => clearInterval(interval);
  }, [fetch]);

  return { entries, playerPosition, loading, refresh: fetch };
}
