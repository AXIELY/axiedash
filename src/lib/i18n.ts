export type Language = 'ar' | 'en';

export const translations = {
  ar: {
    nav: {
      home: 'الرئيسية', profile: 'ملفي', games: 'ألعابي',
      leaderboard: 'المتصدرون', statistics: 'الإحصائيات',
      history: 'السجل', support: 'الدعم', admin: 'التحكم', logout: 'خروج',
      collection: 'مجموعتي', missions: 'المهام', activity: 'النشاط', achievements: 'الإنجازات',
      shop: 'متجر النقاط', payments: 'المدفوعات',
    },
    sidebar: {
      level: 'المستوى', points: 'النقاط', coins: 'العملات',
      addCredit: 'إضافة رصيد', xpProgress: 'تقدم المستوى',
    },
    chat: {
      title: 'الدردشة العامة', tab: 'دردشة', historyTab: 'السجل',
      placeholder: 'رسالتك...', send: 'إرسال',
      connected: 'متصل', disconnected: 'منفصل', offline: 'غير متصل',
      report: 'الإبلاغ عن رسالة', reportReason: 'سبب البلاغ',
      reportDetails: 'تفاصيل إضافية (اختياري)',
      reasonSpam: 'رسائل عشوائية', reasonInappropriate: 'محتوى غير لائق',
      reasonHarassment: 'إزعاج', reasonOther: 'أخرى',
      reportSuccess: 'تم الإبلاغ بنجاح', reportError: 'خطأ في الإبلاغ',
      reportDuplicate: 'أبلغت عن هذه الرسالة مسبقاً',
      reportSending: 'جاري الإرسال...', cancel: 'إلغاء', submitReport: 'إرسال البلاغ',
      msgTooShort: 'الرسالة قصيرة جداً (3 أحرف على الأقل)',
      msgTooLong: 'الرسالة طويلة جداً',
      cooldown: 'انتظر', duplicate: 'أرسلت هذه الرسالة مسبقاً',
      retryFailed: 'فشل - إعادة', sending: 'جاري الإرسال...',
      noHistory: 'سيظهر سجل الألعاب هنا',
    },
    home: {
      title: 'مركز أكسي', subtitle: 'اختر لعبتك وابدأ!',
      services: 'خدمات أكسي', quickActions: 'إجراءات سريعة',
      liveTables: 'الطاولات المباشرة', viewMore: 'عرض المزيد',
      players: 'يلعبون', playNow: 'العب الآن', join: 'انضم',
    },
    dashboard: {
      tournaments: 'البطولات النشطة', tournamentsDesc: 'انضم للمسابقات',
      stats: 'الإحصائيات', statsDesc: 'تتبع تقدمك',
      popular: 'الأكثر شعبية', popularDesc: 'الألعاب الأكثر لعباً',
      support: 'الدعم', supportDesc: 'دعم 24/7',
    },
    games: {
      coinRush: 'سباق العملات', coinRushDesc: 'اجمع العملات في 60 ثانية!',
      luckyCard: 'بطاقة الحظ', luckyCardDesc: 'اختر بطاقة واكتشف جائزتك!',
    },
    profile: {
      title: 'ملفي الشخصي', subtitle: 'إحصائياتك وإنجازاتك',
      level: 'المستوى', wins: 'الانتصارات', winRate: 'نسبة الفوز',
      totalScore: 'النقاط الإجمالية', achievements: 'الإنجازات', locked: 'مقفل',
    },
    leaderboard: {
      title: 'قائمة المتصدرين', subtitle: 'أفضل اللاعبين',
      level: 'المستوى', totalScore: 'النقاط', wins: 'الانتصارات', games: 'الألعاب',
    },
    services: {
      title: 'الخدمات', subtitle: 'خدماتنا المتاحة', back: 'رجوع',
      popular: 'الأكثر رواجاً', save: 'وفّر', orderNow: 'اطلب الآن',
      noPackages: 'لا توجد باقات متاحة', orderSuccess: 'تم إنشاء الطلب بنجاح!',
      orderContact: 'سيتم التواصل معك قريباً',
    },
    admin: {
      title: 'لوحة التحكم', subtitle: 'إدارة منصة أكسي',
      backToHome: 'العودة للرئيسية',
      overview: 'نظرة عامة', games: 'الألعاب', services: 'الخدمات',
      orders: 'الطلبات', offers: 'العروض', reports: 'البلاغات', settings: 'الإعدادات',
      totalUsers: 'المستخدمون', totalOrders: 'الطلبات', pendingOrders: 'معلقة',
      totalRevenue: 'إجمالي الإيرادات', todayRevenue: 'إيرادات اليوم', activeGames: 'الألعاب النشطة',
      recentOrders: 'الطلبات الأخيرة', viewAll: 'عرض الكل', noOrders: 'لا توجد طلبات',
      unauthorized: 'غير مصرح', unauthorizedMsg: 'ليس لديك صلاحية',
      luckyCard: 'بطاقة الحظ',
    },
    luckyCard: {
      title: 'أكسي الحظ', settings: 'الإعدادات', rewards: 'المكافآت',
      analytics: 'التحليلات', active: 'نشط', inactive: 'غير نشط',
      titleAr: 'العنوان بالعربية', titleEn: 'العنوان بالإنجليزية',
      minBet: 'الحد الأدنى للرهان', maxBet: 'الحد الأقصى للرهان',
      dailyPlayLimit: 'حد اللعب اليومي', cooldown: 'وقت الانتظار',
      winRate: 'نسبة الفوز', addReward: 'إضافة مكافأة',
      editReward: 'تعديل المكافأة', deleteReward: 'حذف المكافأة',
      rewardName: 'اسم المكافأة', rewardValue: 'قيمة المكافأة',
      rewardType: 'نوع المكافأة', rarity: 'الندرة',
      dropChance: 'فرصة النزول', animationLevel: 'مستوى الرسوم المتحركة',
      pitySettings: 'إعدادات الحظ', epicPityThreshold: 'عتبة الملحمي',
      epicBoost: 'دعم الملحمي', legendaryThreshold: 'عتبة الأسطوري',
      maxDailyCoins: 'الحد الأقصى للعملات اليومية',
      maxDailyGems: 'الحد الأقصى للأحجار اليومية',
      visualEffects: 'مستوى التأثيرات البصرية',
      totalPlays: 'إجمالي اللعب', playsToday: 'اليوم',
      winsToday: 'الانتصارات اليوم', totalRewards: 'إجمالي المكافآت',
      rewardDistributed: 'المكافآت الموزعة',
    },
    login: {
      title: 'منصة أكسي', welcome: 'مرحباً بعودتك!', join: 'انضم للمعركة!',
      username: 'اسم المستخدم', email: 'البريد الإلكتروني', password: 'كلمة المرور',
      usernamePlaceholder: 'اختر اسم المستخدم',
      loginBtn: 'تسجيل الدخول', registerBtn: 'إنشاء حساب',
      loading: 'جاري التحميل...', noAccount: 'ليس لديك حساب؟ سجل الآن',
      hasAccount: 'لديك حساب؟ سجل دخولك',
    },
    common: {
      loading: 'جاري التحميل...', loadingPlatform: 'جاري التحميل...',
      error: 'حدث خطأ',
    },
  },

  en: {
    nav: {
      home: 'Home', profile: 'Profile', games: 'Games',
      leaderboard: 'Leaderboard', statistics: 'Statistics',
      history: 'History', support: 'Support', admin: 'Admin', logout: 'Logout',
      collection: 'Collection', missions: 'Missions', activity: 'Activity', achievements: 'Achievements',
      shop: 'Points Shop', payments: 'Payments',
    },
    sidebar: {
      level: 'Level', points: 'Points', coins: 'Coins',
      addCredit: 'Add Credit', xpProgress: 'XP Progress',
    },
    chat: {
      title: 'General Chat', tab: 'Chat', historyTab: 'History',
      placeholder: 'Your message...', send: 'Send',
      connected: 'Connected', disconnected: 'Disconnected', offline: 'Offline',
      report: 'Report Message', reportReason: 'Reason',
      reportDetails: 'Additional Details (Optional)',
      reasonSpam: 'Spam', reasonInappropriate: 'Inappropriate',
      reasonHarassment: 'Harassment', reasonOther: 'Other',
      reportSuccess: 'Report submitted', reportError: 'Error submitting report',
      reportDuplicate: 'Already reported this message',
      reportSending: 'Sending...', cancel: 'Cancel', submitReport: 'Submit Report',
      msgTooShort: 'Message too short (min 3 characters)',
      msgTooLong: 'Message too long',
      cooldown: 'Wait', duplicate: 'Already sent this message',
      retryFailed: 'Failed – Retry', sending: 'Sending...',
      noHistory: 'Game history will appear here',
    },
    home: {
      title: 'AXIE Hub', subtitle: 'Choose a game and start playing!',
      services: 'AXIE Services', quickActions: 'Quick Actions',
      liveTables: 'Live Tables', viewMore: 'View More',
      players: 'playing', playNow: 'Play Now', join: 'Join',
    },
    dashboard: {
      tournaments: 'Active Tournaments', tournamentsDesc: 'Join competitions',
      stats: 'Statistics', statsDesc: 'Track your progress',
      popular: 'Most Popular', popularDesc: 'Most played games',
      support: 'Support', supportDesc: '24/7 support',
    },
    games: {
      coinRush: 'Coin Rush', coinRushDesc: 'Collect coins in 60 seconds!',
      luckyCard: 'Lucky Card', luckyCardDesc: 'Pick a card and win!',
    },
    profile: {
      title: 'My Profile', subtitle: 'Your stats and achievements',
      level: 'Level', wins: 'Wins', winRate: 'Win Rate',
      totalScore: 'Total Score', achievements: 'Achievements', locked: 'Locked',
    },
    leaderboard: {
      title: 'Leaderboard', subtitle: 'Top players',
      level: 'Level', totalScore: 'Score', wins: 'Wins', games: 'Games',
    },
    services: {
      title: 'Services', subtitle: 'Available services', back: 'Back',
      popular: 'Most Popular', save: 'Save', orderNow: 'Order Now',
      noPackages: 'No packages available', orderSuccess: 'Order created successfully!',
      orderContact: 'We will contact you soon',
    },
    admin: {
      title: 'Admin Dashboard', subtitle: 'Manage AXIE Platform',
      backToHome: 'Back to Home',
      overview: 'Overview', games: 'Games', services: 'Services',
      orders: 'Orders', offers: 'Offers', reports: 'Reports', settings: 'Settings',
      totalUsers: 'Users', totalOrders: 'Orders', pendingOrders: 'Pending',
      totalRevenue: 'Total Revenue', todayRevenue: "Today's Revenue", activeGames: 'Active Games',
      recentOrders: 'Recent Orders', viewAll: 'View All', noOrders: 'No orders yet',
      unauthorized: 'Unauthorized', unauthorizedMsg: 'You do not have access',
      luckyCard: 'Lucky Card',
    },
    luckyCard: {
      title: 'Axie Fortune', settings: 'Settings', rewards: 'Rewards',
      analytics: 'Analytics', active: 'Active', inactive: 'Inactive',
      titleAr: 'Title (Arabic)', titleEn: 'Title (English)',
      minBet: 'Min Bet', maxBet: 'Max Bet',
      dailyPlayLimit: 'Daily Play Limit', cooldown: 'Cooldown',
      winRate: 'Win Rate', addReward: 'Add Reward',
      editReward: 'Edit Reward', deleteReward: 'Delete Reward',
      rewardName: 'Reward Name', rewardValue: 'Reward Value',
      rewardType: 'Reward Type', rarity: 'Rarity',
      dropChance: 'Drop Chance', animationLevel: 'Animation Level',
      pitySettings: 'Pity Settings', epicPityThreshold: 'Epic Pity Threshold',
      epicBoost: 'Epic Boost', legendaryThreshold: 'Legendary Threshold',
      maxDailyCoins: 'Max Daily Coins',
      maxDailyGems: 'Max Daily Gems',
      visualEffects: 'Visual Effects Level',
      totalPlays: 'Total Plays', playsToday: 'Today',
      winsToday: 'Wins Today', totalRewards: 'Total Rewards',
      rewardDistributed: 'Rewards Distributed',
    },
    login: {
      title: 'AXIE Platform', welcome: 'Welcome back!', join: 'Join the battle!',
      username: 'Username', email: 'Email', password: 'Password',
      usernamePlaceholder: 'Choose a username',
      loginBtn: 'Sign In', registerBtn: 'Create Account',
      loading: 'Loading...', noAccount: "Don't have an account? Register",
      hasAccount: 'Already have an account? Sign in',
    },
    common: {
      loading: 'Loading...', loadingPlatform: 'Loading AXIE Platform...',
      error: 'An error occurred',
    },
  },
} as const;

export type Language2 = keyof typeof translations;

export function t(lang: Language, path: string): string {
  const keys = path.split('.');
  let val: any = translations[lang];
  for (const k of keys) {
    if (val && typeof val === 'object') val = (val as any)[k];
    else return path;
  }
  return typeof val === 'string' ? val : path;
}
