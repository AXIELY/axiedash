export type CosmeticCategory = 'avatar' | 'banner' | 'border' | 'effect' | 'frame' | 'badge' | 'title';
export type ItemRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'divine';

export interface CosmeticItem {
  id: string;
  nameAr: string;
  nameEn: string;
  category: CosmeticCategory;
  rarity: ItemRarity;
  season?: string;
  isLimited: boolean;
  dropChance: number;
  description?: string;
  unlockMethod: 'gameplay' | 'shop' | 'achievement' | 'seasonal';
  active: boolean;
}

export const defaultCosmetics: CosmeticItem[] = [
  // Avatars
  {
    id: 'avatar_neon_1',
    nameAr: 'الأيقونة النيون',
    nameEn: 'Neon Avatar',
    category: 'avatar',
    rarity: 'common',
    isLimited: false,
    dropChance: 15,
    unlockMethod: 'gameplay',
    active: true,
  },
  {
    id: 'avatar_cyber_legend',
    nameAr: 'الأسطورة السيبر',
    nameEn: 'Cyber Legend Avatar',
    category: 'avatar',
    rarity: 'legendary',
    isLimited: true,
    dropChance: 0.5,
    season: 'Cyber Season',
    unlockMethod: 'seasonal',
    active: true,
  },

  // Borders
  {
    id: 'border_gold_glow',
    nameAr: 'حد الذهب المتألق',
    nameEn: 'Golden Glow Border',
    category: 'border',
    rarity: 'rare',
    isLimited: false,
    dropChance: 5,
    unlockMethod: 'shop',
    active: true,
  },
  {
    id: 'border_divine_aura',
    nameAr: 'هالة الإله',
    nameEn: 'Divine Aura Border',
    category: 'border',
    rarity: 'divine',
    isLimited: true,
    dropChance: 0.1,
    unlockMethod: 'achievement',
    active: true,
  },

  // Effects
  {
    id: 'effect_particles_blue',
    nameAr: 'جزيئات زرقاء',
    nameEn: 'Blue Particles',
    category: 'effect',
    rarity: 'rare',
    isLimited: false,
    dropChance: 8,
    unlockMethod: 'gameplay',
    active: true,
  },
  {
    id: 'effect_cosmic_aura',
    nameAr: 'الهالة الكونية',
    nameEn: 'Cosmic Aura',
    category: 'effect',
    rarity: 'mythic',
    isLimited: true,
    dropChance: 0.3,
    unlockMethod: 'seasonal',
    active: true,
  },

  // Titles/Badges
  {
    id: 'title_fortune_master',
    nameAr: 'سيد الحظ',
    nameEn: 'Fortune Master',
    category: 'title',
    rarity: 'legendary',
    isLimited: false,
    dropChance: 1,
    unlockMethod: 'achievement',
    active: true,
  },
  {
    id: 'title_collector',
    nameAr: 'جامع الكنوز',
    nameEn: 'Treasure Collector',
    category: 'title',
    rarity: 'epic',
    isLimited: false,
    dropChance: 2,
    unlockMethod: 'gameplay',
    active: true,
  },
];

export const cosmeticCategories = {
  avatar: { ar: 'الصورة الشخصية', en: 'Avatar' },
  banner: { ar: 'الراية', en: 'Banner' },
  border: { ar: 'الحد', en: 'Border' },
  effect: { ar: 'التأثير', en: 'Effect' },
  frame: { ar: 'الإطار', en: 'Frame' },
  badge: { ar: 'الشارة', en: 'Badge' },
  title: { ar: 'اللقب', en: 'Title' },
};
