import { useCountdown } from '../../hooks/useCountdown';
import { ThemeConfig } from '../../config/magicChestConfig';

interface CountdownTimerProps {
  enabled: boolean;
  endDate: string | null;
  theme: ThemeConfig;
}

export const CountdownTimer = ({ enabled, endDate, theme }: CountdownTimerProps) => {
  const countdown = useCountdown(enabled ? endDate : null);

  if (!enabled || !countdown || countdown.isFinished) return null;

  const units = [
    { label: 'يوم', value: countdown.days },
    { label: 'ساعة', value: countdown.hours },
    { label: 'دقيقة', value: countdown.minutes },
    { label: 'ثانية', value: countdown.seconds },
  ];

  return (
    <div className="flex justify-center lg:justify-start gap-2">
      {units.map((unit) => (
        <div
          key={unit.label}
          className="rounded-[12px] px-3 py-2 text-center min-w-[56px]"
          style={{
            background: 'rgba(0,0,0,0.4)',
            border: `1px solid ${theme.border}`,
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.05)`,
          }}
        >
          <p className="text-xl font-black font-mono leading-none" style={{ color: theme.primaryLight }}>
            {String(unit.value).padStart(2, '0')}
          </p>
          <p className="text-[10px] mt-1" style={{ color: 'var(--text-3)' }}>{unit.label}</p>
        </div>
      ))}
    </div>
  );
};
