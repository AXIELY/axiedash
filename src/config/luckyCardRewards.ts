export type RewardType = 'coins' | 'gems' | 'xp' | 'booster' | 'multiplier' | 'ticket' | 'mystery' | 'jackpot' | 'badge' | 'skin';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'divine';

export interface LuckyCardReward {
  id: string;
  nameAr: string;
  nameEn: string;
  type: RewardType;
  value: number;
  rarity: Rarity;
  dropChance: number;
  svgIcon: RewardType;
  animationLevel: 1 | 2 | 3;
  active: boolean;
}

export interface LuckyCardSettings {
  id: string;
  active: boolean;
  titleAr: string;
  titleEn: string;
  minBet: number;
  maxBet: number;
  winRate: number;
  dailyPlayLimit: number;
  cooldownSeconds: number;
  rewards: LuckyCardReward[];
  rarityChances: {
    common: number;
    rare: number;
    epic: number;
    legendary: number;
    mythic: number;
    divine: number;
  };
  pitySettings: {
    epicPityThreshold: number;
    epicPityBoost: number;
    legendaryPityThreshold: number;
    legendaryPityGuarantee: boolean;
    resetAfterLegendary: boolean;
  };
  maxDailyCoinsOutput: number;
  maxDailyGemsOutput: number;
  visualEffectsLevel: 1 | 2 | 3;
  created_at: string;
  updated_at: string;
}

export const defaultRewards: LuckyCardReward[] = [
  {
    id: 'reward_1',
    nameAr: 'عملات ذهبية',
    nameEn: 'Gold Coins',
    type: 'coins',
    value: 50,
    rarity: 'common',
    dropChance: 25,
    svgIcon: 'coins',
    animationLevel: 1,
    active: true,
  },
  {
    id: 'reward_2',
    nameAr: 'نقاط خبرة',
    nameEn: 'Experience Points',
    type: 'xp',
    value: 100,
    rarity: 'common',
    dropChance: 20,
    svgIcon: 'xp',
    animationLevel: 1,
    active: true,
  },
  {
    id: 'reward_3',
    nameAr: 'عملات نادرة',
    nameEn: 'Rare Coins',
    type: 'coins',
    value: 250,
    rarity: 'rare',
    dropChance: 15,
    svgIcon: 'coins',
    animationLevel: 2,
    active: true,
  },
  {
    id: 'reward_4',
    nameAr: 'معزز قوة',
    nameEn: 'Power Booster',
    type: 'booster',
    value: 1,
    rarity: 'rare',
    dropChance: 12,
    svgIcon: 'booster',
    animationLevel: 2,
    active: true,
  },
  {
    id: 'reward_5',
    nameAr: 'أحجار كريمة',
    nameEn: 'Gemstones',
    type: 'gems',
    value: 25,
    rarity: 'epic',
    dropChance: 10,
    svgIcon: 'gems',
    animationLevel: 2,
    active: true,
  },
  {
    id: 'reward_6',
    nameAr: 'مضاعف النقاط',
    nameEn: 'Point Multiplier',
    type: 'multiplier',
    value: 2,
    rarity: 'epic',
    dropChance: 8,
    svgIcon: 'multiplier',
    animationLevel: 2,
    active: true,
  },
  {
    id: 'reward_7',
    nameAr: 'عملات أسطورية',
    nameEn: 'Legendary Coins',
    type: 'coins',
    value: 2000,
    rarity: 'legendary',
    dropChance: 5,
    svgIcon: 'coins',
    animationLevel: 3,
    active: true,
  },
  {
    id: 'reward_8',
    nameAr: 'تذكرة الحظ',
    nameEn: 'Lucky Ticket',
    type: 'ticket',
    value: 1,
    rarity: 'legendary',
    dropChance: 3,
    svgIcon: 'ticket',
    animationLevel: 3,
    active: true,
  },
  {
    id: 'reward_9',
    nameAr: 'كنز غامض',
    nameEn: 'Mysterious Treasure',
    type: 'mystery',
    value: 500,
    rarity: 'mythic',
    dropChance: 1.5,
    svgIcon: 'mystery',
    animationLevel: 3,
    active: true,
  },
  {
    id: 'reward_10',
    nameAr: 'الجائزة الإلهية',
    nameEn: 'Divine Prize',
    type: 'jackpot',
    value: 5000,
    rarity: 'divine',
    dropChance: 0.5,
    svgIcon: 'jackpot',
    animationLevel: 3,
    active: true,
  },
];

export const rarityColors: Record<Rarity, { gradient: string; glow: string; border: string }> = {
  common: {
    gradient: 'from-slate-600 to-slate-700',
    glow: 'rgba(100,116,139,0.4)',
    border: 'rgba(100,116,139,0.5)',
  },
  rare: {
    gradient: 'from-blue-500 to-cyan-600',
    glow: 'rgba(6,182,212,0.5)',
    border: 'rgba(6,182,212,0.6)',
  },
  epic: {
    gradient: 'from-violet-500 to-purple-600',
    glow: 'rgba(139,92,246,0.5)',
    border: 'rgba(139,92,246,0.6)',
  },
  legendary: {
    gradient: 'from-amber-400 to-yellow-500',
    glow: 'rgba(245,158,11,0.6)',
    border: 'rgba(245,158,11,0.7)',
  },
  mythic: {
    gradient: 'from-pink-500 via-red-500 to-rose-600',
    glow: 'rgba(236,72,153,0.6)',
    border: 'rgba(236,72,153,0.7)',
  },
  divine: {
    gradient: 'from-cyan-400 via-purple-400 to-pink-400',
    glow: 'rgba(0,229,255,0.7)',
    border: 'rgba(0,229,255,0.8)',
  },
};

export const defaultLuckyCardSettings: LuckyCardSettings = {
  id: 'default_settings',
  active: true,
  titleAr: 'أكسي الحظ',
  titleEn: 'Axie Fortune',
  minBet: 0,
  maxBet: 100,
  winRate: 85,
  dailyPlayLimit: 10,
  cooldownSeconds: 0,
  rewards: defaultRewards,
  rarityChances: {
    common: 45,
    rare: 27,
    epic: 18,
    legendary: 8,
    mythic: 1.5,
    divine: 0.5,
  },
  pitySettings: {
    epicPityThreshold: 20,
    epicPityBoost: 15,
    legendaryPityThreshold: 50,
    legendaryPityGuarantee: true,
    resetAfterLegendary: true,
  },
  maxDailyCoinsOutput: 10000,
  maxDailyGemsOutput: 500,
  visualEffectsLevel: 2,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
