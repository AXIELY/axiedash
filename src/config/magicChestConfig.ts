import { MagicChestTheme } from '../hooks/useMagicChest';

export interface ThemeConfig {
  primary: string;
  primaryLight: string;
  glow: string;
  gradient: string;
  border: string;
  particle: string;
}

export const themeConfigs: Record<MagicChestTheme, ThemeConfig> = {
  purple: {
    primary: '#a855f7',
    primaryLight: '#c084fc',
    glow: 'rgba(168,85,247,0.35)',
    gradient: 'linear-gradient(135deg, rgba(88,28,135,0.4) 0%, rgba(20,10,30,0.95) 50%, rgba(40,20,60,0.6) 100%)',
    border: 'rgba(168,85,247,0.3)',
    particle: 'rgba(192,132,252,0.5)',
  },
  gold: {
    primary: '#D6B47B',
    primaryLight: '#E7C38F',
    glow: 'rgba(214,180,123,0.35)',
    gradient: 'linear-gradient(135deg, rgba(120,90,40,0.4) 0%, rgba(20,15,5,0.95) 50%, rgba(60,45,15,0.6) 100%)',
    border: 'rgba(214,180,123,0.3)',
    particle: 'rgba(231,195,143,0.5)',
  },
  cyan: {
    primary: '#22d3ee',
    primaryLight: '#67e8f9',
    glow: 'rgba(34,211,238,0.35)',
    gradient: 'linear-gradient(135deg, rgba(8,47,73,0.4) 0%, rgba(5,20,30,0.95) 50%, rgba(15,40,55,0.6) 100%)',
    border: 'rgba(34,211,238,0.3)',
    particle: 'rgba(103,232,249,0.5)',
  },
  red: {
    primary: '#ef4444',
    primaryLight: '#f87171',
    glow: 'rgba(239,68,68,0.35)',
    gradient: 'linear-gradient(135deg, rgba(127,29,29,0.4) 0%, rgba(25,5,5,0.95) 50%, rgba(60,15,15,0.6) 100%)',
    border: 'rgba(239,68,68,0.3)',
    particle: 'rgba(248,113,113,0.5)',
  },
};

export const rewardIconMap: Record<string, string> = {
  crown: '👑',
  diamond: '💎',
  star: '⭐',
  coin: '🪙',
  gift: '🎁',
  trophy: '🏆',
  zap: '⚡',
  gem: '💠',
  chest: '🧰',
  card: '🃏',
};

export const rewardColorMap: Record<string, string> = {
  gold: '#D6B47B',
  cyan: '#22d3ee',
  purple: '#a855f7',
  red: '#ef4444',
  green: '#22c55e',
  blue: '#3b82f6',
};
