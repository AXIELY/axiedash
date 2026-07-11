import { Rarity } from './luckyCardRewards';

export interface Achievement {
  id: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  category: string;
  rarity: Rarity;
  xpReward: number;
  threshold?: number;
  icon: string;
  isSecret?: boolean;
}

export const defaultAchievements: Achievement[] = [
  // Lucky Card Achievements
  {
    id: 'ach_first_card',
    nameAr: 'البطاقة الأولى',
    nameEn: 'First Card',
    descriptionAr: 'فتح بطاقة الحظ للمرة الأولى',
    descriptionEn: 'Open your first Lucky Card',
    category: 'lucky-card',
    rarity: 'common',
    xpReward: 50,
    icon: '🎴',
  },
  {
    id: 'ach_mythic_seeker',
    nameAr: 'صياد الأساطير',
    nameEn: 'Mythic Seeker',
    descriptionAr: 'اكسب مكافأة أسطورية خرافية',
    descriptionEn: 'Win a Mythic reward',
    category: 'lucky-card',
    rarity: 'mythic',
    xpReward: 500,
    icon: '✨',
  },
  {
    id: 'ach_divine_collector',
    nameAr: 'جامع الإلهيات',
    nameEn: 'Divine Collector',
    descriptionAr: 'اكسب جائزة إلهية',
    descriptionEn: 'Win a Divine reward',
    category: 'lucky-card',
    rarity: 'divine',
    xpReward: 1000,
    isSecret: true,
    icon: '👑',
  },

  // Progression Achievements
  {
    id: 'ach_level_10',
    nameAr: 'الصعود الأول',
    nameEn: 'First Ascent',
    descriptionAr: 'وصل للمستوى 10',
    descriptionEn: 'Reach Level 10',
    category: 'progression',
    rarity: 'rare',
    xpReward: 200,
    threshold: 10,
    icon: '📈',
  },
  {
    id: 'ach_level_50',
    nameAr: 'التتويج',
    nameEn: 'Coronation',
    descriptionAr: 'وصل للمستوى 50',
    descriptionEn: 'Reach Level 50',
    category: 'progression',
    rarity: 'legendary',
    xpReward: 1000,
    threshold: 50,
    icon: '👑',
  },

  // Collection Achievements
  {
    id: 'ach_collector_rare',
    nameAr: 'جامع الندرات',
    nameEn: 'Rare Collector',
    descriptionAr: 'اجمع 10 عناصر نادرة',
    descriptionEn: 'Collect 10 Rare items',
    category: 'collection',
    rarity: 'rare',
    xpReward: 300,
    threshold: 10,
    icon: '💎',
  },

  // Mission Achievements
  {
    id: 'ach_mission_master',
    nameAr: 'معلم المهام',
    nameEn: 'Mission Master',
    descriptionAr: 'أكمل 50 مهمة يومية',
    descriptionEn: 'Complete 50 daily missions',
    category: 'missions',
    rarity: 'epic',
    xpReward: 500,
    threshold: 50,
    icon: '🎯',
  },

  // Social Achievements
  {
    id: 'ach_fortune_master',
    nameAr: 'سيد الحظ',
    nameEn: 'Fortune Master',
    descriptionAr: 'اكسب 10 مكافآت أسطورية',
    descriptionEn: 'Win 10 Legendary rewards',
    category: 'social',
    rarity: 'legendary',
    xpReward: 750,
    threshold: 10,
    icon: '🌟',
  },
];

export const achievementCategories = {
  'lucky-card': { ar: 'لعبة الحظ', en: 'Lucky Card' },
  progression: { ar: 'التقدم', en: 'Progression' },
  collection: { ar: 'المجموعة', en: 'Collection' },
  missions: { ar: 'المهام', en: 'Missions' },
  social: { ar: 'اجتماعي', en: 'Social' },
};
