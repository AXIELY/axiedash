import { useMemo } from 'react';
import { ThemeConfig } from '../../config/magicChestConfig';

interface FloatingParticlesProps {
  theme: ThemeConfig;
  count?: number;
}

export const FloatingParticles = ({ theme, count = 8 }: FloatingParticlesProps) => {
  const particles = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        x: 5 + Math.random() * 90,
        y: 10 + Math.random() * 80,
        size: 2 + Math.random() * 3,
        delay: Math.random() * 4,
        duration: 4 + Math.random() * 4,
        opacity: 0.15 + Math.random() * 0.25,
      })),
    [count],
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full"
          style={{
            width: `${p.size}px`,
            height: `${p.size}px`,
            left: `${p.x}%`,
            top: `${p.y}%`,
            background: theme.particle,
            opacity: p.opacity,
            boxShadow: `0 0 ${p.size * 2}px ${theme.particle}`,
            animation: `chest-float ${p.duration}s ease-in-out infinite`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
};
