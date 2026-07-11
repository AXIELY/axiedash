import { useState } from 'react';
import { X, Lock, Check, Gift, CalendarDays, Coins, Loader2 } from 'lucide-react';
import { useDailyLogin, DAILY_REWARDS } from '../hooks/useDailyLogin';
import { useLanguage } from '../contexts/LanguageContext';

interface DailyLoginModalProps {
  onClose: () => void;
}

const DAY_LABELS_AR = ['اليوم 1', 'اليوم 2', 'اليوم 3', 'اليوم 4', 'اليوم 5', 'اليوم 6', 'اليوم 7'];
const DAY_LABELS_EN = ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'];

function RewardIcon({ day, size = 32 }: { day: number; size?: number }) {
  const s = size;
  if (day === 7) {
    // Treasure chest SVG for day 7
    return (
      <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
        <rect x="4" y="18" width="32" height="18" rx="4" fill="#C6A06A" opacity="0.9" />
        <rect x="4" y="18" width="32" height="8" rx="2" fill="#D6B47B" />
        <rect x="4" y="8" width="32" height="12" rx="4" fill="#D6B47B" />
        <rect x="13" y="22" width="14" height="10" rx="2" fill="#A07840" />
        <circle cx="20" cy="27" r="3" fill="#E7C38F" />
        <circle cx="20" cy="27" r="1.5" fill="#C6A06A" />
        {/* Glow lines */}
        <line x1="10" y1="6" x2="8" y2="2" stroke="#E7C38F" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
        <line x1="20" y1="5" x2="20" y2="1" stroke="#E7C38F" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
        <line x1="30" y1="6" x2="32" y2="2" stroke="#E7C38F" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      </svg>
    );
  }
  // Coin stack SVG scaled by day
  const stacks = Math.ceil(day / 2);
  return (
    <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
      {Array.from({ length: stacks }).map((_, i) => (
        <ellipse
          key={i}
          cx="20"
          cy={32 - i * 7}
          rx="10"
          ry="4"
          fill={i % 2 === 0 ? '#D6B47B' : '#C6A06A'}
          opacity={1 - i * 0.05}
        />
      ))}
      {/* Shine */}
      <ellipse cx="17" cy={32 - (stacks - 1) * 7 - 1} rx="3" ry="1" fill="#E7C38F" opacity="0.6" />
    </svg>
  );
}

export const DailyLoginModal = ({ onClose }: DailyLoginModalProps) => {
  const { language } = useLanguage();
  const { status, loading, claiming, claim } = useDailyLogin();
  const [claimResult, setClaimResult] = useState<{ points: number; day: number } | null>(null);
  const isAr = language === 'ar';

  const currentDay = status?.currentStreak ?? 0;
  const alreadyClaimed = status?.alreadyClaimed ?? false;

  const handleClaim = async () => {
    if (alreadyClaimed || claiming) return;
    const result = await claim();
    if (result.success) {
      setClaimResult({ points: result.pointsAwarded, day: result.dayNumber });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(8px)' }}
    >
      <div
        className="relative w-full max-w-2xl rounded-[28px] overflow-hidden animate-fade-up"
        style={{
          background: 'linear-gradient(160deg, #1A1510 0%, #120F0A 50%, #0E0B08 100%)',
          border: '1px solid rgba(214,180,123,0.18)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(214,180,123,0.06)',
        }}
        dir={isAr ? 'rtl' : 'ltr'}
      >
        {/* Ambient gold glow top */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-32 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse, rgba(214,180,123,0.12) 0%, transparent 70%)' }}
        />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-5 end-5 z-10 w-8 h-8 flex items-center justify-center rounded-xl transition-all duration-200"
          style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-3)' }}
        >
          <X className="w-4 h-4" strokeWidth={1.5} />
        </button>

        <div className="p-6 sm:p-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-center gap-5 mb-6 sm:mb-8">
            {/* Calendar icon */}
            <div
              className="w-20 h-20 rounded-[22px] flex items-center justify-center flex-shrink-0 relative"
              style={{
                background: 'linear-gradient(135deg, #2A1F0E 0%, #1A1408 100%)',
                border: '1px solid rgba(214,180,123,0.25)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}
            >
              <CalendarDays className="w-9 h-9" style={{ color: '#D6B47B' }} strokeWidth={1.5} />
              {/* Star badge */}
              <div
                className="absolute -top-2 -end-2 w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #C6A06A, #E7C38F)', boxShadow: '0 4px 10px rgba(214,180,123,0.4)' }}
              >
                <span className="text-[10px] font-bold text-[#0a0a0a]">★</span>
              </div>
            </div>

            <div className={isAr ? 'text-right' : 'text-left'}>
              <h2
                className="text-2xl sm:text-3xl font-bold mb-1 leading-tight"
                style={{ color: 'var(--text-1)', letterSpacing: '-0.02em' }}
              >
                {isAr ? (
                  <>تسجيل <span style={{ color: '#D6B47B' }}>الدخول</span> اليومي</>
                ) : (
                  <>Daily <span style={{ color: '#D6B47B' }}>Login</span> Reward</>
                )}
              </h2>
              <p className="text-sm" style={{ color: 'var(--text-3)' }}>
                {isAr
                  ? 'سجل دخولك كل يوم واحصل على مكافآت رائعة'
                  : 'Sign in every day to earn amazing rewards'}
              </p>

              {/* Streak banner */}
              <div
                className="inline-flex items-center gap-2 mt-3 px-3.5 py-1.5 rounded-full text-xs font-bold"
                style={{
                  background: 'rgba(214,180,123,0.1)',
                  border: '1px solid rgba(214,180,123,0.22)',
                  color: '#D6B47B',
                }}
              >
                <Gift className="w-3.5 h-3.5" strokeWidth={1.5} />
                {isAr
                  ? 'تابع 7 أيام متتالية للحصول على مكافأة خاصة!'
                  : 'Complete 7 days for a special reward!'}
              </div>
            </div>
          </div>

          {/* Day cards grid */}
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-7 h-7 animate-spin" style={{ color: 'var(--text-3)' }} />
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 sm:gap-3 mb-6">
              {DAILY_REWARDS.map((pts, i) => {
                const dayNum = i + 1;
                const isCompleted = currentDay >= dayNum && alreadyClaimed
                  ? dayNum <= currentDay
                  : dayNum < currentDay;
                const isToday = dayNum === (alreadyClaimed ? currentDay : currentDay + 1);
                const isSpecial = dayNum === 7;
                const isLocked = !isCompleted && !isToday;

                return (
                  <div
                    key={dayNum}
                    className="relative flex flex-col items-center rounded-[18px] p-3 sm:p-3.5 transition-all duration-200"
                    style={{
                      background: isSpecial
                        ? 'linear-gradient(160deg, #1F1608 0%, #150F05 100%)'
                        : isToday
                          ? 'linear-gradient(160deg, #1C1508 0%, #130F05 100%)'
                          : 'rgba(255,255,255,0.03)',
                      border: isToday
                        ? '2px solid rgba(214,180,123,0.5)'
                        : isSpecial
                          ? '1px solid rgba(214,180,123,0.25)'
                          : '1px solid rgba(255,255,255,0.06)',
                      boxShadow: isToday ? '0 0 20px rgba(214,180,123,0.12)' : 'none',
                    }}
                  >
                    {/* Special badge */}
                    {isSpecial && (
                      <div
                        className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[9px] font-bold whitespace-nowrap"
                        style={{ background: '#D6B47B', color: '#0a0a0a' }}
                      >
                        {isAr ? 'مكافأة خاصة' : 'Special'}
                      </div>
                    )}

                    {/* Day label */}
                    <p
                      className="text-[11px] font-bold mb-2 mt-1"
                      style={{ color: isToday || isSpecial ? '#D6B47B' : 'var(--text-3)' }}
                    >
                      {isAr ? DAY_LABELS_AR[i] : DAY_LABELS_EN[i]}
                    </p>

                    {/* Icon */}
                    <div
                      className="mb-2"
                      style={{ opacity: isLocked && !isCompleted ? 0.4 : 1 }}
                    >
                      <RewardIcon day={dayNum} size={isSpecial ? 38 : 32} />
                    </div>

                    {/* Points */}
                    <p
                      className="text-base font-bold leading-tight"
                      style={{ color: isToday || isSpecial ? '#D6B47B' : isLocked ? 'var(--text-3)' : 'var(--text-1)' }}
                    >
                      {pts}
                    </p>
                    <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                      {isAr ? 'نقطة' : 'pts'}
                    </p>

                    {/* Status indicator */}
                    <div className="mt-2">
                      {isCompleted ? (
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center"
                          style={{ background: 'rgba(63,185,80,0.15)', border: '1px solid rgba(63,185,80,0.3)' }}
                        >
                          <Check className="w-3.5 h-3.5" style={{ color: '#3FB950' }} strokeWidth={2.5} />
                        </div>
                      ) : isToday && alreadyClaimed ? (
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center"
                          style={{ background: 'rgba(63,185,80,0.15)', border: '1px solid rgba(63,185,80,0.3)' }}
                        >
                          <Check className="w-3.5 h-3.5" style={{ color: '#3FB950' }} strokeWidth={2.5} />
                        </div>
                      ) : isToday ? (
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center animate-pulse"
                          style={{ background: 'rgba(214,180,123,0.15)', border: '1px solid rgba(214,180,123,0.35)' }}
                        >
                          <div className="w-2 h-2 rounded-full" style={{ background: '#D6B47B' }} />
                        </div>
                      ) : (
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center"
                          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                        >
                          <Lock className="w-3 h-3" style={{ color: 'var(--text-4)' }} strokeWidth={1.5} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Bottom row */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            {/* Warning notice */}
            <div
              className="flex items-start gap-3 p-3.5 rounded-[16px] flex-1"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <CalendarDays className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--text-3)' }} strokeWidth={1.5} />
              <div>
                <p className="text-xs font-bold" style={{ color: 'var(--text-2)' }}>
                  {isAr ? 'لا تفوت يوماً!' : "Don't miss a day!"}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-3)' }}>
                  {isAr
                    ? 'ستبدأ سلسلة المكافآت من جديد إذا فاتك يوماً واحداً'
                    : 'Missing a day will reset your reward streak'}
                </p>
              </div>
            </div>

            {/* CTA button */}
            {claimResult ? (
              <div
                className="flex items-center gap-3 px-6 py-3.5 rounded-[16px] flex-shrink-0"
                style={{ background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.25)' }}
              >
                <Coins className="w-5 h-5" style={{ color: '#3FB950' }} strokeWidth={1.5} />
                <div>
                  <p className="text-xs" style={{ color: 'rgba(63,185,80,0.7)' }}>
                    {isAr ? 'حصلت على' : 'You earned'}
                  </p>
                  <p className="text-lg font-bold" style={{ color: '#3FB950' }}>
                    +{claimResult.points} {isAr ? 'نقطة' : 'pts'}
                  </p>
                </div>
              </div>
            ) : (
              <button
                onClick={handleClaim}
                disabled={alreadyClaimed || claiming || loading}
                className="flex items-center gap-2 px-7 py-3.5 rounded-[16px] font-bold text-sm transition-all duration-200 flex-shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
                style={alreadyClaimed ? {
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: 'var(--text-3)',
                } : {
                  background: 'linear-gradient(135deg, #C6A06A 0%, #D6B47B 60%, #E7C38F 100%)',
                  color: '#0a0a0a',
                  boxShadow: '0 4px 20px rgba(214,180,123,0.3)',
                }}
              >
                {claiming ? (
                  <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
                ) : alreadyClaimed ? (
                  <Check className="w-4 h-4" strokeWidth={2} />
                ) : (
                  <CalendarDays className="w-4 h-4" strokeWidth={2} />
                )}
                {claiming
                  ? (isAr ? 'جاري...' : 'Claiming...')
                  : alreadyClaimed
                    ? (isAr ? 'تم التسجيل اليوم' : 'Claimed today')
                    : (isAr ? 'سجل دخولك اليوم' : 'Claim today')
                }
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
