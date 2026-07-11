import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase, TypingStatus } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface UseTypingIndicatorOptions {
  roomId?: string;
  debounceMs?: number;
}

interface TypingUser {
  userId: string;
  username: string;
  avatarUrl?: string;
}

export const useTypingIndicator = (options: UseTypingIndicatorOptions = {}) => {
  const { roomId = null } = options;
  const { user } = useAuth();
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef(false);

  const updateTypingStatus = useCallback(
    async (isTyping: boolean) => {
      if (!user) return;

      try {
        const query = supabase
          .from('chat_typing_status')
          .select('id')
          .eq('user_id', user.id);

        if (roomId) {
          query.eq('room_id', roomId);
        } else {
          query.is('room_id', null);
        }

        const { data: existing } = await query.maybeSingle();

        const statusData = {
          user_id: user.id,
          username: user.user_metadata?.username || 'User',
          avatar_url: user.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`,
          room_id: roomId,
          is_typing: isTyping,
          last_activity: new Date().toISOString(),
        };

        if (existing) {
          const { error } = await supabase
            .from('chat_typing_status')
            .update(statusData)
            .eq('id', existing.id);

          if (error) {
            console.error('Error updating typing status:', error);
          }
        } else {
          const { error } = await supabase
            .from('chat_typing_status')
            .insert([statusData]);

          if (error) {
            console.error('Error inserting typing status:', error);
          }
        }
      } catch (err) {
        console.error('Failed to update typing status:', err);
      }
    },
    [user, roomId]
  );

  const handleTyping = useCallback(() => {
    if (!user) return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    if (!isTypingRef.current) {
      isTypingRef.current = true;
      updateTypingStatus(true);
    }

    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      updateTypingStatus(false);
    }, 3000);
  }, [updateTypingStatus, user]);

  const stopTyping = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    isTypingRef.current = false;
    updateTypingStatus(false);
  }, [updateTypingStatus]);

  useEffect(() => {
    if (!user) return;

    const query = supabase
      .from('chat_typing_status')
      .select('*')
      .eq('is_typing', true);

    if (roomId) {
      query.eq('room_id', roomId);
    } else {
      query.is('room_id', null);
    }

    query.then(({ data }) => {
      if (data) {
        const users = data
          .filter((status: TypingStatus) => status.user_id !== user.id)
          .map((status: TypingStatus) => ({
            userId: status.user_id,
            username: status.username,
            avatarUrl: status.avatar_url,
          }));
        setTypingUsers(users);
      }
    });

    const channel = supabase
      .channel(`typing-${roomId || 'general'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_typing_status',
          filter: roomId ? `room_id=eq.${roomId}` : 'room_id=is.null',
        },
        (payload) => {
          const status = payload.new as TypingStatus;

          if (payload.eventType === 'DELETE' || !status.is_typing) {
            setTypingUsers((prev) =>
              prev.filter((u) => u.userId !== (payload.old as TypingStatus)?.user_id || status.user_id)
            );
          } else if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            if (status.user_id !== user.id && status.is_typing) {
              setTypingUsers((prev) => {
                const exists = prev.find((u) => u.userId === status.user_id);
                if (exists) {
                  return prev.map((u) =>
                    u.userId === status.user_id
                      ? { userId: status.user_id, username: status.username, avatarUrl: status.avatar_url }
                      : u
                  );
                }
                return [...prev, { userId: status.user_id, username: status.username, avatarUrl: status.avatar_url }];
              });
            } else if (status.user_id !== user.id && !status.is_typing) {
              setTypingUsers((prev) => prev.filter((u) => u.userId !== status.user_id));
            }
          }
        }
      )
      .subscribe();

    return () => {
      stopTyping();
      supabase.removeChannel(channel);
    };
  }, [user, roomId, stopTyping]);

  return {
    typingUsers,
    handleTyping,
    stopTyping,
  };
};
