import { useState } from 'react';
import { useWheelLeaderboard, LeaderboardPeriod } from '../hooks/useWheelLeaderboard';
import { useLanguage } from '../contexts/LanguageContext';
import { Crown, Medal, Trophy } from 'lucide-react';

const PERIOD_LABELS = {
  daily:    { ar: 'اليوم',  en: 'Today'  },
  weekly:   { ar: 'الأسبوع', en: 'Week'  },
  all_time: { ar: 'الكل',   en: 'All'   },
};

const RANK_STYLE: Record<number, { bg: string; text: string; icon: React.ReactNode }> = {
  1: { bg: 'linear-gradient(135deg,rgba(251,191,36,.2),rgba(251,191,36,.06))', text: '#fbbf24', icon: <Crown className="w-3.5 h-3.5" /> },
  2: { bg: 'linear-gradient(135deg,rgba(148,163,184,.15),rgba(148,163,184,.04))', text: '#94a3b8', icon: <Medal className="w-3.5 h-3.5" /> },
  3: { bg: 'linear-gradient(135deg,rgba(180,120,60,.18),rgba(180,120,60,.05))', text: '#b4783c', icon: <Trophy className="w-3.5 h-3.5" /> },
};

interface WheelLeaderboardProps {
  compact?: boolean;
}

export function WheelLeaderboard({ compact = false }: WheelLeaderboardProps) {
  const { language } = useLanguage();
  const [period, setPeriod] = useState<LeaderboardPeriod>('weekly');
  const { entries, playerPosition, loading } = useWheelLeaderboard(period);

  const visibleEntries = compact ? entries.slice(0, 5) : entries;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-black text-base" style={{ color: '#f8ecda' }}>
          {language === 'ar' ? 'أبطال العجلة' : 'Wheel Champions'}
        </h3>
        <div className="flex gap-1">
          {(Object.keys(PERIOD_LABELS) as LeaderboardPeriod[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className="px-2 py-1 rounded-lg text-[11px] font-bold transition-all"
              style={period === p
                ? { background: 'rgba(251,191,36,.2)', color: '#fbbf24', border: '1px solid rgba(251,191,36,.3)' }
                : { color: 'rgba(255,255,255,.3)', border: '1px solid transparent' }
              }
            >
              {language === 'ar' ? PERIOD_LABELS[p].ar : PERIOD_LABELS[p].en}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,.04)' }} />
          ))}
        </div>
      ) : visibleEntries.length === 0 ? (
        <div className="py-8 text-center">
          <Trophy className="w-8 h-8 mx-auto mb-2 opacity-20" style={{ color: '#f8ecda' }} />
          <p className="text-xs" style={{ color: 'rgba(255,255,255,.3)' }}>
            {language === 'ar' ? 'لا يوجد لاعبون بعد' : 'No players yet'}
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {visibleEntries.map((entry) => {
            const pos = entry.rank_position;
            const rs = RANK_STYLE[pos];
            const isSelf = playerPosition && pos === playerPosition.position;

            return (
              <div
                key={entry.user_id}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all"
                style={{
                  background: rs?.bg ?? (isSelf ? 'rgba(139,92,246,.1)' : 'rgba(255,255,255,.03)'),
                  border: isSelf ? '1px solid rgba(139,92,246,.25)' : '1px solid rgba(255,255,255,.05)',
                }}
              >
                {/* Rank */}
                <div
                  className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 text-[11px] font-black"
                  style={{ color: rs?.text ?? 'rgba(255,255,255,.4)', background: 'rgba(0,0,0,.25)' }}
                >
                  {rs ? rs.icon : pos}
                </div>

                {/* Avatar */}
                <img
                  src={entry.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(entry.username)}`}
                  alt=""
                  className="w-7 h-7 rounded-full flex-shrink-0"
                  style={{ background: 'rgba(255,255,255,.08)' }}
                />

                {/* Name + level */}
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-xs truncate" style={{ color: rs?.text ?? '#f0e8d8' }}>
                    {entry.username}
                  </div>
                  <div className="text-[10px]" style={{ color: 'rgba(255,255,255,.3)' }}>
                    Lv.{entry.level} · {entry.rank}
                  </div>
                </div>

                {/* Score */}
                <div className="text-right flex-shrink-0">
                  <div className="font-black text-sm" style={{ color: rs?.text ?? '#d4c4a4' }}>
                    {entry.total_score.toLocaleString()}
                  </div>
                  <div className="text-[10px]" style={{ color: 'rgba(255,255,255,.25)' }}>pts</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Player position */}
      {playerPosition && (
        <div
          className="mt-2 px-3 py-2 rounded-xl text-center text-xs"
          style={{
            background: playerPosition.has_entry ? 'rgba(139,92,246,.1)' : 'rgba(255,255,255,.03)',
            border: '1px solid rgba(255,255,255,.07)',
          }}
        >
          {playerPosition.has_entry ? (
            <span style={{ color: '#a78bfa' }}>
              {language === 'ar' ? `مركزك: #${playerPosition.position}` : `Your rank: #${playerPosition.position}`}
              {' · '}
              <span style={{ color: '#fbbf24' }}>{playerPosition.score.toLocaleString()} pts</span>
            </span>
          ) : (
            <span style={{ color: 'rgba(255,255,255,.3)' }}>
              {language === 'ar' ? 'لم تدخل الترتيب بعد' : 'Not ranked yet'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
