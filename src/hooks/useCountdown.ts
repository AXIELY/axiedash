import { useState, useEffect } from 'react';

export interface Countdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isFinished: boolean;
}

export function useCountdown(targetDate: string | null): Countdown | null {
  const [countdown, setCountdown] = useState<Countdown | null>(null);

  useEffect(() => {
    if (!targetDate) {
      setCountdown(null);
      return;
    }

    const calculate = (): Countdown => {
      const diff = new Date(targetDate).getTime() - Date.now();
      if (diff <= 0) {
        return { days: 0, hours: 0, minutes: 0, seconds: 0, isFinished: true };
      }
      return {
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((diff / (1000 * 60)) % 60),
        seconds: Math.floor((diff / 1000) % 60),
        isFinished: false,
      };
    };

    setCountdown(calculate());
    const interval = setInterval(() => setCountdown(calculate()), 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  return countdown;
}
