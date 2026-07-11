import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export interface ActivityEvent {
  id: string;
  user_id: string;
  activity_type: string;
  activity_data: any;
  is_public: boolean;
  created_at: string;
  username?: string;
  avatar_url?: string;
}

export const useActivityFeed = () => {
  const { user } = useAuth();
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActivityFeed();
    const subscription = supabase
      .channel('activity_feed_updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'activity_feed',
        },
        (payload) => {
          if (payload.new.is_public) {
            setActivities((prev) => [payload.new as ActivityEvent, ...prev.slice(0, 49)]);
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchActivityFeed = async () => {
    try {
      const { data, error } = await supabase
        .from('activity_feed')
        .select(
          `
          *,
          users:user_id(username, avatar_url)
        `
        )
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setActivities(
        (data as any[])?.map((item) => ({
          ...item,
          username: item.users?.username,
          avatar_url: item.users?.avatar_url,
        })) || []
      );
    } catch (error) {
      console.error('Error fetching activity feed:', error);
    } finally {
      setLoading(false);
    }
  };

  const logActivity = async (activityType: string, activityData: any, isPublic: boolean = true) => {
    if (!user?.id) return;

    try {
      await supabase.from('activity_feed').insert({
        user_id: user.id,
        activity_type: activityType,
        activity_data: activityData,
        is_public: isPublic,
      });
    } catch (error) {
      console.error('Error logging activity:', error);
    }
  };

  return {
    activities,
    loading,
    logActivity,
  };
};
