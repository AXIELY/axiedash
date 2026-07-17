import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { HomeCampaignBanner } from './HomeCampaignBanner';
import { useHomeCampaign } from '../hooks/useHomeCampaign';
import { GameLaunchPad } from './GameLaunchPad';
import {
  ArrowRight, ArrowLeft, Users,
  Award, LifeBuoy, ShoppingBag, TrendingUp,
  Coins,
  ListChecks, Clock,
  Gem, Zap,
} from 'lucide-react';

interface DashboardHomeProps {
  setCurrentPage: (page: string) => void;
}

/* ── Right bank: live games ── */
const RIGHT_BANK: import('./GameLaunchPad').GameCardData[] = [
  {
    id: 'lucky-card',
    titleAr: 'بطاقة الحظ',
    titleEn: 'Lucky Card',
    descAr: 'اختر بطاقة واكتشف جائزتك',
    descEn: 'Pick a card and discover your prize',
    page: 'lucky-card',
    accentColor: '#D6B47B',
    players: 189,
    tag: 'HOT',
    theme: 'gold',
  },
  {
    id: 'coin-rush',
    titleAr: 'سباق العملات',
    titleEn: 'Coin Rush',
    descAr: 'اجمع العملات في 60 ثانية',
    descEn: 'Collect coins in 60 seconds',
    page: 'games',
    accentColor: '#22D3EE',
    players: 234,
    tag: 'LIVE',
    theme: 'cyan',
  },
];

/* ── Left bank: coming-soon gateways ── */
const LEFT_BANK: import('./GameLaunchPad').GameCardData[] = [
  {
    id: 'magic-box',
    titleAr: 'الصندوق السحري',
    titleEn: 'Magic Box',
    descAr: 'افتح صندوقًا واكتشف مكافآت نادرة',
    descEn: 'Open a box and find rare rewards',
    page: 'games',
    accentColor: '#F47067',
    players: null,
    tag: 'EVENT',
    theme: 'red',
    isPlaceholder: true,
  },
  {
    id: 'speed-challenge',
    titleAr: 'تحدي السرعة',
    titleEn: 'Speed Challenge',
    descAr: 'اختبر رد فعلك واجمع أعلى سلسلة',
    descEn: 'Test your reflexes and build combos',
    page: 'games',
    accentColor: '#A78BFA',
    players: null,
    tag: 'SOON',
    theme: 'violet',
    isPlaceholder: true,
  },
  {
    id: 'tournament',
    titleAr: 'بطولة أكسي',
    titleEn: 'AXIE Tournament',
    descAr: 'مواجهات موسمية ولوحة ترتيب تنافسية',
    descEn: 'Seasonal battles and ranked leaderboard',
    page: 'leaderboard',
    accentColor: '#D6B47B',
    players: null,
    tag: 'RANKED',
    theme: 'neutral',
    badge: 'TOP',
    isPlaceholder: true,
  },
];

const QUICK_ACTIONS = [
  { titleAr: 'البطولات',      titleEn: 'Tournaments',    icon: Award,     color: '#D6B47B', action: 'games' },
  { titleAr: 'المهام اليومية', titleEn: 'Daily Missions', icon: ListChecks, color: '#3FB950', action: 'missions' },
  { titleAr: 'إحصائياتي',     titleEn: 'My Stats',       icon: TrendingUp, color: '#58A6FF', action: 'profile' },
  { titleAr: 'الدعم',         titleEn: 'Support',        icon: LifeBuoy,  color: '#F47067', action: 'support' },
];

function HomeCampaignBannerSlot({ setCurrentPage }: { setCurrentPage: (p: string) => void }) {
  const { campaign, loading } = useHomeCampaign();
  if (loading || !campaign) return null;
  return <HomeCampaignBanner setCurrentPage={setCurrentPage} />;
}

export const DashboardHome = ({ setCurrentPage }: DashboardHomeProps) => {
  const { language, isRTL } = useLanguage();
  const { user } = useAuth();
  const ArrowIcon = isRTL ? ArrowLeft : ArrowRight;
  const isAr = language === 'ar';

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return isAr ? 'صباح الخير' : 'Good morning';
    if (h < 17) return isAr ? 'مساء الخير' : 'Good afternoon';
    return isAr ? 'مساء النور' : 'Good evening';
  };

  const STATS = [
    { labelAr: 'النقاط',  labelEn: 'Points', value: (user?.points ?? 0).toLocaleString(), color: '#D6B47B', icon: Coins },
    { labelAr: 'المستوى', labelEn: 'Level',  value: user?.level ?? 1,                      color: '#3FB950', icon: Zap },
    { labelAr: 'العملات', labelEn: 'Coins',  value: (user?.coins ?? 0).toLocaleString(),   color: '#58A6FF', icon: Gem },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 animate-fade-in" dir={isRTL ? 'rtl' : 'ltr'}>

      {/* Hero row */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-3)' }}>{greeting()}</p>
          <h1
            className="text-2xl sm:text-3xl font-bold tracking-tight"
            style={{ color: 'var(--text-1)', letterSpacing: '-0.02em' }}
          >
            {user?.username || (isAr ? 'لاعب' : 'Player')}
          </h1>
          <p className="text-sm mt-1.5" style={{ color: 'var(--text-2)' }}>
            {isAr ? 'أهلاً بك في منصة أكسي — استمتع بألعابك!' : 'Welcome to AXIE — enjoy your games!'}
          </p>
        </div>
        <button
          onClick={() => setCurrentPage('services')}
          className="flex items-center gap-2 px-5 py-2.5 rounded-[16px] font-bold text-sm transition-all duration-200"
          style={{
            background: 'rgba(214,180,123,0.08)',
            border: '1px solid rgba(214,180,123,0.18)',
            color: 'var(--gold)',
          }}
        >
          <ShoppingBag className="w-4 h-4" strokeWidth={1.5} />
          {isAr ? 'الخدمات' : 'Services'}
        </button>
      </div>

      {/* Hero Campaign Banner — dynamic from admin; falls back to MagicChest if no active campaign */}
      <HomeCampaignBannerSlot setCurrentPage={setCurrentPage} />

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3">
        {STATS.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.labelEn}
              className="rounded-[20px] p-4 flex flex-col items-center text-center gap-2"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            >
              <div
                className="w-9 h-9 rounded-[12px] flex items-center justify-center flex-shrink-0"
                style={{
                  background: `${stat.color}0D`,
                  border: `1px solid ${stat.color}1F`,
                }}
              >
                <Icon className="w-4.5 h-4.5" style={{ color: stat.color }} strokeWidth={1.5} />
              </div>
              <div>
                <p className="text-base font-bold leading-tight" style={{ color: stat.color }}>{stat.value}</p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-3)' }}>
                  {isAr ? stat.labelAr : stat.labelEn}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Game Deck — dual mirrored banks */}
      <div>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold" style={{ color: 'var(--text-1)' }}>
            {isAr ? 'الألعاب' : 'Games'}
          </h2>
          <button
            onClick={() => setCurrentPage('games')}
            className="text-xs font-semibold flex items-center gap-1 transition-colors"
            style={{ color: 'var(--text-3)' }}
          >
            {isAr ? 'عرض الكل' : 'View all'}
            <ArrowIcon className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </div>

        {/* Stage: outer scene container with center divider */}
        <div className="trap-stage">
          {/* Right bank — rotateY(-14deg), transform-origin: right center */}
          <div className="trap-stack trap-stack-right">
            {RIGHT_BANK.map((game) => (
              <GameLaunchPad
                key={game.id}
                game={game}
                side="right"
                isAr={isAr}
                isRTL={isRTL}
                onNavigate={setCurrentPage}
              />
            ))}
          </div>

          {/* Left bank — rotateY(14deg), transform-origin: left center */}
          <div className="trap-stack trap-stack-left">
            {LEFT_BANK.map((game) => (
              <GameLaunchPad
                key={game.id}
                game={game}
                side="left"
                isAr={isAr}
                isRTL={isRTL}
                onNavigate={setCurrentPage}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-base font-bold mb-4" style={{ color: 'var(--text-1)' }}>
          {isAr ? 'وصول سريع' : 'Quick Access'}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.titleEn}
                onClick={() => setCurrentPage(action.action)}
                className="group rounded-[20px] p-4 text-start transition-all duration-200"
                style={{
                  background: 'var(--card-2)',
                  border: '1px solid var(--border)',
                }}
                onMouseEnter={e => {
                  (e.currentTarget.style.borderColor = `${action.color}25`);
                  (e.currentTarget.style.background = '#1a1a1a');
                }}
                onMouseLeave={e => {
                  (e.currentTarget.style.borderColor = 'var(--border)');
                  (e.currentTarget.style.background = 'var(--card-2)');
                }}
              >
                <div
                  className="w-10 h-10 rounded-[12px] flex items-center justify-center mb-3 transition-transform duration-200 group-hover:scale-105"
                  style={{
                    background: `${action.color}0D`,
                    border: `1px solid ${action.color}20`,
                  }}
                >
                  <Icon className="w-5 h-5" style={{ color: action.color }} strokeWidth={1.5} />
                </div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                  {isAr ? action.titleAr : action.titleEn}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Live tables */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold" style={{ color: 'var(--text-1)' }}>
            {isAr ? 'الطاولات النشطة' : 'Live Tables'}
          </h2>
          <span className="pill-gold">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
            {isAr ? 'مباشر' : 'Live'}
          </span>
        </div>

        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-[20px] p-4 flex items-center gap-4 transition-all duration-200"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            >
              <div
                className="w-11 h-11 rounded-[14px] flex items-center justify-center flex-shrink-0"
                style={{
                  background: 'rgba(214,180,123,0.07)',
                  border: '1px solid rgba(214,180,123,0.14)',
                }}
              >
                <Coins className="w-5 h-5" style={{ color: 'var(--gold)' }} strokeWidth={1.5} />
              </div>

              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>
                  {isAr ? `سباق العملات #${i}` : `Coin Rush #${i}`}
                </h4>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text-3)' }}>
                    <Users className="w-3 h-3" strokeWidth={1.5} />
                    4/5
                  </span>
                  <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text-3)' }}>
                    <Clock className="w-3 h-3" strokeWidth={1.5} />
                    {isAr ? 'جارية' : 'Active'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                <button
                  className="px-4 py-1.5 rounded-[10px] text-xs font-bold transition-all duration-200"
                  style={{
                    background: 'rgba(214,180,123,0.08)',
                    border: '1px solid rgba(214,180,123,0.18)',
                    color: 'var(--gold)',
                  }}
                >
                  {isAr ? 'انضم' : 'Join'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
