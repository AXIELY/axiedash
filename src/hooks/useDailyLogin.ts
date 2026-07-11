import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export interface DailyLoginStatus {
  currentStreak: number;
  alreadyClaimed: boolean;
  lastClaimDate: string | null;
}

export interface ClaimResult {
  success: boolean;
  alreadyClaimed: boolean;
  pointsAwarded: number;
  dayNumber: number;
  currentStreak: number;
}

export const DAILY_REWARDS = [50, 75, 100, 150, 200, 250, 500] as const;

export const useDailyLogin = () => {
  const { user, refreshUser } = useAuth();
  const [status, setStatus] = useState<DailyLoginStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);

  const fetchStatus = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase.rpc('get_daily_login_status');
      if (error) throw error;
      setStatus({
        currentStreak:  data.current_streak  ?? 0,
        alreadyClaimed: data.already_claimed ?? false,
        lastClaimDate:  data.last_claim_date  ?? null,
      });
    } catch (err) {
      console.error('Error fetching daily login status:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const claim = useCallback(async (): Promise<ClaimResult> => {
    setClaiming(true);
    try {
      const { data, error } = await supabase.rpc('claim_daily_login');
      if (error) throw error;

      const result: ClaimResult = {
        success:        data.success        ?? false,
        alreadyClaimed: data.already_claimed ?? false,
        pointsAwarded:  data.points_awarded  ?? 0,
        dayNumber:      data.day_number      ?? 0,
        currentStreak:  data.current_streak  ?? 0,
      };

      if (result.success) {
        setStatus({
          currentStreak:  result.currentStreak,
          alreadyClaimed: true,
          lastClaimDate:  new Date().toISOString().split('T')[0],
        });
        await refreshUser();
      }

      return result;
    } catch (err) {
      console.error('Error claiming daily login:', err);
      return { success: false, alreadyClaimed: false, pointsAwarded: 0, dayNumber: 0, currentStreak: 0 };
    } finally {
      setClaiming(false);
    }
  }, [refreshUser]);

  return { status, loading, claiming, claim, refetch: fetchStatus };
};
