import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../contexts/LanguageContext';
import { Trophy, Zap, Gift } from 'lucide-react';

interface WinnerEvent {
  id: string;
  masked_username: string;
  prize_type: string;
  prize_name_en: string;
  prize_name_ar: string;
  prize_value: string;
  points_awarded: number;
  avatar_seed: string;
  created_at: string;
}

const PRIZE_ICON = {
  points: Zap,
  grand: Trophy,
  service: Gift,
  miss: null,
};

const PRIZE_COLOR: Record<string, string> = {
  points: '#22d3ee',
  grand: '#fbbf24',
  service: '#a78bfa',
};

export function LiveWinnerFeed() {
  const { language } = useLanguage();
  const [winners, setWinners] = useState<WinnerEvent[]>([]);
  const [visible, setVisible] = useState(true);
  const seenIds = useRef(new Set<string>());
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchRecent();

    const channel = supabase
      .channel('live-winners')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'public_winner_events' },
        (payload) => {
          const event = payload.new as WinnerEvent;
          if (seenIds.current.has(event.id)) return;
          seenIds.current.add(event.id);
          setWinners(prev => [event, ...prev].slice(0, 20));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchRecent = async () => {
    const { data } = await supabase
      .from('public_winner_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (data) {
      data.forEach(w => seenIds.current.add(w.id));
      setWinners(data);
    }
  };

  if (!visible) return null;
  if (winners.length === 0) {
    return (
      <div className="flex items-center gap-2 py-1">
        <div className="w-2 h-2 rounded-full bg-green-400/30 animate-pulse" />
        <span className="text-xs text-white/20 uppercase tracking-widest">
          {language === 'ar' ? 'الفائزون المباشر' : 'Live Winners'}
        </span>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs font-bold text-white/60 uppercase tracking-widest">
            {language === 'ar' ? 'الفائزون المباشر' : 'Live Winners'}
          </span>
        </div>
        <button
          onClick={() => setVisible(false)}
          className="text-white/20 hover:text-white/50 text-xs transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Scrolling feed */}
      <div
        ref={feedRef}
        className="space-y-2 max-h-48 overflow-y-auto scrollbar-hide"
        style={{ scrollbarWidth: 'none' }}
      >
        {winners.map((w, i) => {
          const Icon = PRIZE_ICON[w.prize_type as keyof typeof PRIZE_ICON] ?? Zap;
          const color = PRIZE_COLOR[w.prize_type] ?? '#22d3ee';
          const prizeName = language === 'ar' ? w.prize_name_ar : w.prize_name_en;
          const timeAgo = getTimeAgo(w.created_at, language);

          return (
            <div
              key={w.id}
              className="flex items-center gap-3 px-3 py-2 rounded-xl transition-all"
              style={{
                background: i === 0
                  ? `linear-gradient(135deg, ${color}15, rgba(255,255,255,0.03))`
                  : 'rgba(255,255,255,0.025)',
                border: i === 0 ? `1px solid ${color}30` : '1px solid rgba(255,255,255,0.05)',
                animation: i === 0 ? 'winnerSlideIn 0.4s ease-out' : 'none',
              }}
            >
              {/* Avatar */}
              <img
                src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(w.avatar_seed)}`}
                alt=""
                className="w-7 h-7 rounded-full flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.1)' }}
              />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <span className="text-white/80 font-semibold text-xs">{w.masked_username}</span>
                <span className="text-white/40 text-xs mx-1">
                  {language === 'ar' ? 'فاز بـ' : 'won'}
                </span>
                <span className="font-bold text-xs" style={{ color }}>
                  {prizeName || (w.points_awarded > 0 ? `+${w.points_awarded}` : '')}
                </span>
              </div>

              {/* Icon + time */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Icon className="w-3.5 h-3.5" style={{ color }} />
                <span className="text-white/25 text-[10px]">{timeAgo}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getTimeAgo(isoDate: string, language: string): string {
  const diff = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (diff < 60) return language === 'ar' ? 'الآن' : 'now';
  if (diff < 3600) {
    const m = Math.floor(diff / 60);
    return language === 'ar' ? `${m}د` : `${m}m`;
  }
  const h = Math.floor(diff / 3600);
  return language === 'ar' ? `${h}س` : `${h}h`;
}
