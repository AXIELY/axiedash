import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../contexts/LanguageContext';
import { Clock, Zap, Star, Crown } from 'lucide-react';

interface GameEvent {
  id: string;
  event_type: string;
  name_en: string;
  name_ar: string;
  description_en: string;
  description_ar: string;
  starts_at: string;
  ends_at: string;
  config: Record<string, unknown>;
  status: 'upcoming' | 'active' | 'ended';
  seconds_remaining: number;
}

const EVENT_STYLES: Record<string, { gradient: string; icon: typeof Zap; glow: string }> = {
  lucky_hour: {
    gradient: 'from-amber-500 to-orange-600',
    icon: Clock,
    glow: 'rgba(251,191,36,0.4)',
  },
  golden_wheel: {
    gradient: 'from-yellow-400 to-amber-500',
    icon: Star,
    glow: 'rgba(234,179,8,0.4)',
  },
  double_xp: {
    gradient: 'from-purple-500 to-violet-600',
    icon: Zap,
    glow: 'rgba(139,92,246,0.4)',
  },
  bonus_spins: {
    gradient: 'from-cyan-500 to-blue-600',
    icon: Crown,
    glow: 'rgba(6,182,212,0.4)',
  },
};

interface EventStripProps {
  onGoldenWheelActivate?: () => void;
}

export function EventStrip({ onGoldenWheelActivate }: EventStripProps) {
  const { language } = useLanguage();
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [countdowns, setCountdowns] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchEvents();
    const interval = setInterval(fetchEvents, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (events.length === 0) return;

    const timer = setInterval(() => {
      setCountdowns(prev => {
        const next = { ...prev };
        for (const ev of events) {
          if (ev.status !== 'ended') {
            next[ev.id] = Math.max(0, (next[ev.id] ?? ev.seconds_remaining) - 1);
          }
        }
        return next;
      });
    }, 1000);

    // Init
    const init: Record<string, number> = {};
    events.forEach(ev => { init[ev.id] = ev.seconds_remaining; });
    setCountdowns(init);

    return () => clearInterval(timer);
  }, [events]);

  const fetchEvents = async () => {
    const { data } = await supabase.rpc('get_active_game_events');
    if (data) setEvents((data as GameEvent[]).filter(e => e.status !== 'ended'));
  };

  if (events.length === 0) return null;

  return (
    <div className="space-y-2">
      {events.map(ev => {
        const style = EVENT_STYLES[ev.event_type] ?? EVENT_STYLES.lucky_hour;
        const Icon = style.icon;
        const secs = countdowns[ev.id] ?? ev.seconds_remaining;
        const timeLabel = formatCountdown(secs, language);
        const isActive = ev.status === 'active';
        const name = language === 'ar' ? ev.name_ar : ev.name_en;
        const desc = language === 'ar' ? ev.description_ar : ev.description_en;

        return (
          <div
            key={ev.id}
            className="rounded-xl overflow-hidden cursor-pointer group transition-transform hover:scale-[1.01]"
            style={{
              background: `linear-gradient(135deg, ${style.glow.replace('0.4', '0.15')}, rgba(0,0,0,0.3))`,
              border: `1px solid ${style.glow}`,
              boxShadow: isActive ? `0 0 20px ${style.glow}` : 'none',
            }}
            onClick={() => {
              if (ev.event_type === 'golden_wheel' && isActive) {
                onGoldenWheelActivate?.();
              }
            }}
          >
            <div className="flex items-center gap-3 px-4 py-3">
              {/* Icon */}
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center bg-gradient-to-br ${style.gradient} flex-shrink-0`}
                style={{ boxShadow: `0 4px 12px ${style.glow}` }}
              >
                <Icon className="w-4 h-4 text-white" />
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-sm">{name}</span>
                  {isActive && (
                    <span
                      className="text-[10px] font-black px-1.5 py-0.5 rounded uppercase"
                      style={{ background: style.glow, color: '#0d0b1e' }}
                    >
                      {language === 'ar' ? 'نشط' : 'LIVE'}
                    </span>
                  )}
                  {ev.status === 'upcoming' && (
                    <span className="text-[10px] font-bold text-white/40 uppercase">
                      {language === 'ar' ? 'قادم' : 'SOON'}
                    </span>
                  )}
                </div>
                {desc && <p className="text-xs text-white/50 truncate mt-0.5">{desc}</p>}
              </div>

              {/* Countdown */}
              <div className="flex-shrink-0 text-right">
                <div className="text-xs font-mono font-bold" style={{ color: style.glow.replace('0.4', '1') }}>
                  {timeLabel}
                </div>
                <div className="text-[10px] text-white/30">
                  {isActive
                    ? (language === 'ar' ? 'متبقي' : 'left')
                    : (language === 'ar' ? 'يبدأ في' : 'starts in')}
                </div>
              </div>
            </div>

            {/* Active pulse bar */}
            {isActive && (
              <div className="h-0.5 w-full" style={{ background: `linear-gradient(90deg, transparent, ${style.glow}, transparent)`, animation: 'shimmer 2s linear infinite' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatCountdown(seconds: number, language: string): string {
  if (seconds <= 0) return language === 'ar' ? 'انتهى' : 'Ended';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
