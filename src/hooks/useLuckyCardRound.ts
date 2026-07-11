import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

export interface LuckyCardRound {
  id: string;
  slug: string | null;
  title: string;
  description: string | null;
  prize_title: string;
  prize_description: string | null;
  prize_image_url: string | null;
  total_cards: number;
  winners_count: number;
  starts_at: string;
  closes_at: string;
  draw_at: string | null;
  status: 'active' | 'closed' | 'drawn' | 'published' | 'draft' | 'cancelled';
  winning_card_number: number | null;
  winner_user_id: string | null;
  fulfillment_case_id: string | null;
  drawn_at: string | null;
  published_at: string | null;
}

export interface DrawWinner {
  winner_id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  winner_position: number;
  winning_card: number;
  joined_at: string;
  fulfillment_case_id: string | null;
  draw_status: string;
}

export interface DrawResult {
  draw_id: string;
  draw_status: string;
  winning_card_number: number;
  requested_winners_count: number;
  eligible_count: number;
  selected_winners_count: number;
  executed_at: string;
  published_at: string | null;
  winners: DrawWinner[] | null;
}

export interface LuckyCardEntry {
  id: string;
  round_id: string;
  user_id: string;
  selected_card_number: number;
  username_snapshot: string | null;
  avatar_url_snapshot: string | null;
  created_at: string;
}

export interface Participant {
  id: string;
  username_snapshot: string | null;
  avatar_url_snapshot: string | null;
  selected_card_number: number | null; // null when round not yet closed
  created_at: string;
}

interface UseLuckyCardRoundState {
  round: LuckyCardRound | null;
  myEntry: LuckyCardEntry | null;
  participants: Participant[];
  participantCount: number;
  drawResult: DrawResult | null;
  loading: boolean;
  error: string | null;
  joining: boolean;
  /** Join the round with a card number — server-authoritative */
  joinRound: (cardNumber: number) => Promise<{ success: boolean; error?: string; alreadyEntered?: boolean }>;
  refreshRound: () => Promise<void>;
}

export function useLuckyCardRound(userId: string | null | undefined): UseLuckyCardRoundState {
  const [round, setRound]                 = useState<LuckyCardRound | null>(null);
  const [myEntry, setMyEntry]             = useState<LuckyCardEntry | null>(null);
  const [participants, setParticipants]   = useState<Participant[]>([]);
  const [participantCount, setCount]      = useState(0);
  const [drawResult, setDrawResult]       = useState<DrawResult | null>(null);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);
  const [joining, setJoining]             = useState(false);
  const roundIdRef                        = useRef<string | null>(null);

  const loadRound = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Current public round
      const { data: roundData, error: roundErr } = await supabase
        .from('lucky_card_rounds')
        .select('*')
        .in('status', ['active', 'closed', 'drawn', 'published'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (roundErr) throw roundErr;
      setRound(roundData as LuckyCardRound | null);
      roundIdRef.current = roundData?.id ?? null;

      if (!roundData) { setLoading(false); return; }

      // 2. My entry (if authenticated)
      if (userId) {
        const { data: entryData } = await supabase
          .from('lucky_card_entries')
          .select('*')
          .eq('round_id', roundData.id)
          .eq('user_id', userId)
          .maybeSingle();
        setMyEntry(entryData as LuckyCardEntry | null);
      }

      // 3. Participant count
      const { count } = await supabase
        .from('lucky_card_entries')
        .select('*', { count: 'exact', head: true })
        .eq('round_id', roundData.id);
      setCount(count ?? 0);

      // 4. Latest participants (20)
      const showCardNumbers = ['closed','drawn','published'].includes(roundData.status);
      const { data: parts } = await supabase
        .from('lucky_card_entries')
        .select('id, username_snapshot, avatar_url_snapshot, selected_card_number, created_at')
        .eq('round_id', roundData.id)
        .order('created_at', { ascending: false })
        .limit(20);

      setParticipants((parts ?? []).map((p: LuckyCardEntry) => ({
        id: p.id,
        username_snapshot: p.username_snapshot,
        avatar_url_snapshot: p.avatar_url_snapshot,
        selected_card_number: showCardNumbers ? p.selected_card_number : null,
        created_at: p.created_at,
      })));

      // 5. Draw result (published rounds)
      if (roundData.status === 'published') {
        const { data: drawData } = await supabase.rpc('get_lucky_card_draw_result', { p_round_id: roundData.id });
        if (drawData && !(drawData as any).error) {
          setDrawResult(drawData as DrawResult);
        }
      }

    } catch (e) {
      setError('failed_to_load');
      console.error('[useLuckyCardRound]', e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadRound();
  }, [loadRound]);

  // Realtime: watch round status/result changes
  useEffect(() => {
    const sub = supabase
      .channel('lucky_card_round_watch')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'lucky_card_rounds' },
        (payload) => {
          if (payload.new.id === roundIdRef.current) {
            setRound(prev => ({ ...prev, ...(payload.new as LuckyCardRound) }));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'lucky_card_entries' },
        (payload) => {
          const entry = payload.new as LuckyCardEntry;
          if (entry.round_id !== roundIdRef.current) return;
          setCount(prev => prev + 1);
          setParticipants(prev => {
            if (prev.some(p => p.id === entry.id)) return prev;
            return [{
              id: entry.id,
              username_snapshot: entry.username_snapshot,
              avatar_url_snapshot: entry.avatar_url_snapshot,
              selected_card_number: null, // hide card number in open rounds
              created_at: entry.created_at,
            }, ...prev].slice(0, 20);
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, []);

  const joinRound = useCallback(async (cardNumber: number) => {
    if (!round) return { success: false, error: 'no_round' };
    setJoining(true);
    try {
      const { data, error: rpcErr } = await supabase.rpc('join_lucky_card_round', {
        p_round_id:    round.id,
        p_card_number: cardNumber,
      });

      if (rpcErr) return { success: false, error: rpcErr.message };

      const result = data as { success: boolean; error?: string; already_entered?: boolean; entry_id?: string };

      if (!result.success) {
        return { success: false, error: result.error };
      }

      // Fetch confirmed entry
      if (userId) {
        const { data: entryData } = await supabase
          .from('lucky_card_entries')
          .select('*')
          .eq('round_id', round.id)
          .eq('user_id', userId)
          .maybeSingle();
        setMyEntry(entryData as LuckyCardEntry | null);
      }

      if (!result.already_entered) {
        setCount(prev => prev + 1);
      }

      return { success: true, alreadyEntered: result.already_entered };
    } finally {
      setJoining(false);
    }
  }, [round, userId]);

  return {
    round,
    myEntry,
    participants,
    participantCount,
    drawResult,
    loading,
    error,
    joining,
    joinRound,
    refreshRound: loadRound,
  };
}
