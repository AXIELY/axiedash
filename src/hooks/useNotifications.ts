import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export interface Notification {
  id: string;
  user_id: string;
  event_key: string;
  category: string;
  title_ar: string;
  title_en: string;
  body_ar: string;
  body_en: string;
  icon_url: string | null;
  image_url: string | null;
  deep_link: string | null;
  entity_type: string | null;
  entity_id: string | null;
  priority: string;
  is_read: boolean;
  read_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export function useNotifications(pageSize = 20) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);
  const pageRef = useRef(0);

  const fetchUnreadCount = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase.rpc('get_unread_notification_count');
    if (!error && data !== null) {
      setUnreadCount(data);
    }
  }, [user?.id]);

  const fetchNotifications = useCallback(async (reset = false) => {
    if (!user?.id) return;
    setLoading(true);

    const page = reset ? 0 : pageRef.current;
    let query = supabase
      .from('notification_inbox')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (filter) {
      query = query.eq('category', filter);
    }

    const { data, error } = await query;

    if (!error && data) {
      if (reset) {
        setNotifications(data);
        pageRef.current = 1;
      } else {
        setNotifications(prev => [...prev, ...data]);
        pageRef.current = page + 1;
      }
      setHasMore(data.length === pageSize);
    }
    setLoading(false);
  }, [user?.id, filter, pageSize]);

  const markAsRead = useCallback(async (notificationId: string) => {
    const { error } = await supabase.rpc('mark_notification_read', {
      p_notification_id: notificationId,
    });
    if (!error) {
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, is_read: true, read_at: new Date().toISOString() } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
  }, []);

  const markAllRead = useCallback(async () => {
    const { error } = await supabase.rpc('mark_all_notifications_read');
    if (!error) {
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true, read_at: new Date().toISOString() })));
      setUnreadCount(0);
    }
  }, []);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      fetchNotifications(false);
    }
  }, [loading, hasMore, fetchNotifications]);

  // Initial load + refetch on filter change
  useEffect(() => {
    if (user?.id) {
      fetchNotifications(true);
      fetchUnreadCount();
    }
  }, [user?.id, filter, fetchNotifications, fetchUnreadCount]);

  // Realtime subscription for new notifications
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('notification_inbox_realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notification_inbox',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotif = payload.new as Notification;
          setNotifications(prev => [newNotif, ...prev]);
          setUnreadCount(prev => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return {
    notifications,
    unreadCount,
    loading,
    hasMore,
    filter,
    setFilter,
    markAsRead,
    markAllRead,
    loadMore,
    refetch: () => fetchNotifications(true),
  };
}
