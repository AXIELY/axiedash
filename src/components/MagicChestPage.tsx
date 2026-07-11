import { useState, useEffect } from 'react';
import { useMagicChest, MagicChestStatus } from '../hooks/useMagicChest';
import { useCountdown } from '../hooks/useCountdown';
import { themeConfigs, rewardIconMap, rewardColorMap } from '../config/magicChestConfig';
import { Package, Lock, Clock, Sparkles } from 'lucide-react';

const STATUS_CONFIG: Record<MagicChestStatus, { label: string; disabled: boolean }> = {
  locked: { label: 'قريبًا', disabled: true },
  coming_soon: { label: 'يفتح قريبًا', disabled: true },
  active: { label: 'افتح الصندوق الآن', disabled: false },
  ended: { label: 'انتهى الحدث', disabled: true },
};

export const MagicChestPage = () => {
  const { settings, loading } = useMagicChest();
  const [toast, setToast] = useState<string | null>(null);
  const countdown = useCountdown(settings.countdown_enabled ? settings.countdown_end_date : null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: '#a855f7', borderRightColor: '#c084fc' }} />
      </div>
    );
  }

  const theme = themeConfigs[settings.theme_color] || themeConfigs.purple;
  const statusCfg = STATUS_CONFIG[settings.status];
  const isLocked = settings.status !== 'active';

  const handleButtonClick = () => {
    if (settings.status === 'active') {
      setToast('سيتم ربط لعبة الصندوق السحري لاحقًا');
    } else {
      setToast('الصندوق السحري قيد التطوير وسيتم فتحه قريبًا');
    }
  };

  const timeUnits = countdown
    ? [
        { label: 'يوم', value: countdown.days },
        { label: 'ساعة', value: countdown.hours },
        { label: 'دقيقة', value: countdown.minutes },
        { label: 'ثانية', value: countdown.seconds },
      ]
    : [];

  return (
    <div className="p-4 sm:p-6 lg:p-8 animate-fade-in" dir="rtl">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Main locked card */}
        <div
          className="relative overflow-hidden rounded-[28px] p-6 sm:p-10 text-center"
          style={{
            background: theme.gradient,
            border: `1.5px solid ${theme.border}`,
            boxShadow: `0 0 50px ${theme.glow}, 0 12px 40px rgba(0,0,0,0.4)`,
          }}
        >
          {/* Radial glow */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: `radial-gradient(ellipse at 50% 30%, ${theme.glow}, transparent 65%)` }}
          />

          {/* Particles */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="absolute rounded-full"
                style={{
                  width: `${3 + Math.random() * 4}px`,
                  height: `${3 + Math.random() * 4}px`,
                  background: theme.particle,
                  left: `${5 + i * 12}%`,
                  top: `${15 + Math.random() * 70}%`,
                  opacity: 0.35,
                  animation: `chest-float-page ${5 + i}s ease-in-out infinite`,
                  animationDelay: `${i * 0.4}s`,
                }}
              />
            ))}
          </div>

          {/* Gold corners */}
          <div className="absolute top-4 left-4 w-8 h-8 border-l-2 border-t-2 rounded-tl-xl" style={{ borderColor: 'rgba(214,180,123,0.4)' }} />
          <div className="absolute top-4 right-4 w-8 h-8 border-r-2 border-t-2 rounded-tr-xl" style={{ borderColor: 'rgba(214,180,123,0.4)' }} />
          <div className="absolute bottom-4 left-4 w-8 h-8 border-l-2 border-b-2 rounded-bl-xl" style={{ borderColor: 'rgba(214,180,123,0.4)' }} />
          <div className="absolute bottom-4 right-4 w-8 h-8 border-r-2 border-b-2 rounded-br-xl" style={{ borderColor: 'rgba(214,180,123,0.4)' }} />

          <div className="relative z-10 flex flex-col items-center">
            {/* Badge */}
            <span
              className="inline-flex items-center gap-1.5 text-xs font-bold px-4 py-1.5 rounded-full mb-6"
              style={{
                background: 'rgba(214,180,123,0.12)',
                border: '1px solid rgba(214,180,123,0.25)',
                color: '#E7C38F',
              }}
            >
              <Lock className="w-3.5 h-3.5" strokeWidth={1.5} />
              مغلق مؤقتًا
            </span>

            {/* Chest image / placeholder */}
            <div
              className="w-36 h-36 sm:w-44 sm:h-44 rounded-[24px] flex items-center justify-center mb-6"
              style={{
                background: 'rgba(0,0,0,0.35)',
                border: `2px solid ${theme.border}`,
                boxShadow: `inset 0 0 30px ${theme.glow}`,
              }}
            >
              {settings.chest_image_url ? (
                <img
                  src={settings.chest_image_url}
                  alt="Magic Chest"
                  className="w-full h-full object-contain p-3"
                  style={{ animation: 'chest-float-page 4s ease-in-out infinite' }}
                />
              ) : (
                <div
                  className="flex flex-col items-center gap-3"
                  style={{ animation: 'chest-float-page 4s ease-in-out infinite' }}
                >
                  <Package className="w-16 h-16" style={{ color: theme.primaryLight }} strokeWidth={1} />
                  <span className="text-xs" style={{ color: 'var(--text-3)' }}>صندوق سحري</span>
                </div>
              )}
            </div>

            {/* Title */}
            <h1
              className="text-2xl sm:text-3xl font-black mb-2"
              style={{ color: 'var(--text-1)', letterSpacing: '-0.02em' }}
            >
              {settings.title}
            </h1>

            {/* Description */}
            <p className="text-sm sm:text-base mb-6 max-w-md" style={{ color: 'var(--text-2)' }}>
              اللعبة قيد التطوير وسيتم إطلاقها قريبًا
            </p>

            {/* Countdown */}
            {settings.countdown_enabled && countdown && !countdown.isFinished && (
              <div className="flex gap-3 mb-6">
                {timeUnits.map((unit) => (
                  <div
                    key={unit.label}
                    className="rounded-[14px] px-3 py-2.5 text-center min-w-[60px]"
                    style={{
                      background: 'rgba(0,0,0,0.4)',
                      border: `1px solid ${theme.border}`,
                    }}
                  >
                    <p className="text-xl font-black font-mono leading-none" style={{ color: theme.primaryLight }}>
                      {String(unit.value).padStart(2, '0')}
                    </p>
                    <p className="text-[10px] mt-1" style={{ color: 'var(--text-3)' }}>{unit.label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Button */}
            <button
              onClick={handleButtonClick}
              disabled={statusCfg.disabled}
              className="flex items-center gap-2 px-8 py-3.5 rounded-[16px] font-bold text-sm transition-all duration-200 disabled:cursor-not-allowed"
              style={
                statusCfg.disabled
                  ? {
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: 'var(--text-3)',
                    }
                  : {
                      background: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryLight})`,
                      color: '#0a0a0a',
                      boxShadow: `0 0 28px ${theme.glow}, 0 4px 16px rgba(0,0,0,0.3)`,
                    }
              }
            >
              {isLocked && <Lock className="w-4 h-4" strokeWidth={1.5} />}
              {!isLocked && <Package className="w-4 h-4" strokeWidth={1.5} />}
              {settings.status === 'active' ? settings.button_text : statusCfg.label}
            </button>
          </div>
        </div>

        {/* Rewards section */}
        <div
          className="rounded-[24px] p-5 sm:p-6"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-2.5 mb-4">
            <div
              className="w-9 h-9 rounded-[12px] flex items-center justify-center"
              style={{ background: 'rgba(214,180,123,0.08)', border: '1px solid rgba(214,180,123,0.15)' }}
            >
              <Sparkles className="w-[18px] h-[18px]" style={{ color: 'var(--gold)' }} strokeWidth={1.5} />
            </div>
            <h2 className="font-bold text-base" style={{ color: 'var(--text-1)' }}>الجوائز المحتملة</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {settings.rewards.map((reward, i) => {
              const icon = rewardIconMap[reward.icon] || '🎁';
              const color = rewardColorMap[reward.color] || theme.primary;
              return (
                <div
                  key={i}
                  className="rounded-[18px] p-4 flex items-center gap-3 transition-all duration-200 hover:-translate-y-0.5"
                  style={{ background: `${color}08`, border: `1px solid ${color}18` }}
                >
                  <div
                    className="w-12 h-12 rounded-[14px] flex items-center justify-center text-2xl flex-shrink-0"
                    style={{ background: `${color}0D`, border: `1px solid ${color}1A` }}
                  >
                    {icon}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm" style={{ color: 'var(--text-1)' }}>{reward.name}</p>
                    <p className="text-sm font-mono mt-0.5" style={{ color }}>{reward.value}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-5 py-3.5 rounded-[16px] animate-fade-up"
          style={{
            background: 'var(--card)',
            border: `1px solid ${theme.border}`,
            boxShadow: `0 12px 40px rgba(0,0,0,0.5), 0 0 20px ${theme.glow}`,
          }}
        >
          <Clock className="w-4 h-4 flex-shrink-0" style={{ color: theme.primaryLight }} strokeWidth={1.5} />
          <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{toast}</span>
        </div>
      )}

      <style>{`
        @keyframes chest-float-page {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
      `}</style>
    </div>
  );
};
