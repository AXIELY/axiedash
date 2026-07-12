import { useState, useEffect } from 'react';
import { Menu, MessageCircle, X, Bell, Search, Sparkles } from 'lucide-react';
import { Sidebar } from '../components/Sidebar';
import { ChatPanel } from '../components/ChatPanel';
import { DashboardHome } from '../components/DashboardHome';
import { GamesHub } from '../components/GamesHub';
import LuckyCardGame from '../components/LuckyCardGame';
import { EnhancedLeaderboard } from '../components/EnhancedLeaderboard';
import { Profile } from '../components/Profile';
import { Collection } from '../components/Collection';
import { DailyMissions } from '../components/DailyMissions';
import { ActivityFeed } from '../components/ActivityFeed';
import { Achievements } from '../components/Achievements';
import { PaymentShop } from '../components/Shop/PaymentShop';
import { ServicesDashboard } from '../components/ServicesDashboard';
import { DailyLoginModal } from '../components/DailyLoginModal';
import { MyPrizesCenter } from '../components/MyPrizesCenter';
import { MyOrders } from '../components/MyOrders';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useDailyLogin } from '../hooks/useDailyLogin';
import { Loader2 } from 'lucide-react';

const PAGE_LABELS: Record<string, { ar: string; en: string }> = {
  dashboard:    { ar: 'الرئيسية', en: 'Home' },
  profile:      { ar: 'الملف الشخصي', en: 'Profile' },
  collection:   { ar: 'المجموعة', en: 'Collection' },
  shop:         { ar: 'المتجر', en: 'Shop' },
  games:        { ar: 'سباق العملات', en: 'Coin Rush' },
  wheel:        { ar: 'عجلة أكسي', en: 'AXIE Wheel' },
  missions:     { ar: 'المهام', en: 'Missions' },
  achievements: { ar: 'الإنجازات', en: 'Achievements' },
  leaderboard:  { ar: 'المتصدرون', en: 'Leaderboard' },
  activity:     { ar: 'النشاط', en: 'Activity' },
  'lucky-card': { ar: 'بطاقة الحظ', en: 'Lucky Card' },
  services:     { ar: 'الخدمات', en: 'Services' },
  support:      { ar: 'الدعم', en: 'Support' },
  prizes:       { ar: 'جوائزي', en: 'My Prizes' },
  'my-orders':  { ar: 'طلباتي', en: 'My Orders' },
};

export const Dashboard = () => {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const { user, session } = useAuth();
  const { language } = useLanguage();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [showDailyLogin, setShowDailyLogin] = useState(false);
  const [openCaseId, setOpenCaseId] = useState<string | null>(null);

  const handleOpenMyPrizes = (caseId?: string) => {
    setCurrentPage('prizes');
    if (caseId) setOpenCaseId(caseId);
  };

  // Daily login hook — loads status once user is available
  const { status: dailyStatus, loading: dailyLoading } = useDailyLogin();

  // Auto-show daily login modal once per session when status resolves
  useEffect(() => {
    if (!dailyLoading && dailyStatus && !dailyStatus.alreadyClaimed && user) {
      const shownKey = `daily_login_shown_${new Date().toISOString().split('T')[0]}_${user.id}`;
      if (!sessionStorage.getItem(shownKey)) {
        sessionStorage.setItem(shownKey, '1');
        const timer = setTimeout(() => setShowDailyLogin(true), 1200);
        return () => clearTimeout(timer);
      }
    }
  }, [dailyLoading, dailyStatus, user]);

  useEffect(() => {
    if (mobileSidebarOpen || mobileChatOpen || showDailyLogin) {
      document.body.classList.add('no-scroll');
    } else {
      document.body.classList.remove('no-scroll');
    }
    return () => document.body.classList.remove('no-scroll');
  }, [mobileSidebarOpen, mobileChatOpen, showDailyLogin]);

  const pageLabel = PAGE_LABELS[currentPage];
  const pageName = pageLabel ? (language === 'ar' ? pageLabel.ar : pageLabel.en) : '';

  const renderContent = () => {
    switch (currentPage) {
      case 'dashboard':    return <DashboardHome setCurrentPage={setCurrentPage} />;
      case 'games':        return <GamesHub initialTab="coin-rush" standalone onOpenMyPrizes={handleOpenMyPrizes} />;
      case 'wheel':        return <GamesHub initialTab="wheel" standalone onOpenMyPrizes={handleOpenMyPrizes} />;
      case 'lucky-card':   return <LuckyCardGame />;
      case 'services':     return <ServicesDashboard onBack={() => setCurrentPage('dashboard')} />;
      case 'leaderboard':  return <EnhancedLeaderboard />;
      case 'profile':      return <Profile />;
      case 'collection':   return <Collection />;
      case 'missions':     return <DailyMissions />;
      case 'activity':     return <ActivityFeed />;
      case 'achievements': return <Achievements />;
      case 'shop':         return <PaymentShop />;
      case 'prizes':       return <MyPrizesCenter language={language} initialCaseId={openCaseId} />;
      case 'my-orders':    return <MyOrders />;
      default:             return <DashboardHome setCurrentPage={setCurrentPage} />;
    }
  };

  if (session && !user) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="card p-8 flex flex-col items-center gap-4 animate-fade-up">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--gold)' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--text-2)' }}>Loading your profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex relative"
      style={{ height: '100dvh', overflow: 'hidden', maxWidth: '100vw', background: 'var(--bg)' }}
    >
      {/* Sidebar */}
      <Sidebar
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />

      {/* Main column */}
      <main className="flex-1 flex flex-col min-w-0 relative z-10" style={{ overflow: 'hidden' }}>

        {/* Topbar — desktop (md and up) */}
        <div
          className="hidden md:flex flex-shrink-0 items-center gap-4 px-6"
          style={{
            height: '64px',
            background: 'var(--bg)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          {/* Page title */}
          <div className="flex-shrink-0">
            <h2 className="text-base font-bold" style={{ color: 'var(--text-1)' }}>{pageName}</h2>
          </div>

          {/* Search */}
          <div
            className="flex-1 max-w-xs relative"
          >
            <Search
              className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
              style={{ color: 'var(--text-3)', insetInlineStart: '14px' }}
              strokeWidth={1.5}
            />
            <input
              type="text"
              placeholder={language === 'ar' ? 'بحث...' : 'Search...'}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              className="w-full text-sm outline-none transition-all duration-200"
              style={{
                paddingInlineStart: '36px',
                paddingInlineEnd: '12px',
                height: '38px',
                borderRadius: '12px',
                background: searchFocused ? '#1a1a1a' : 'var(--card-2)',
                border: `1.5px solid ${searchFocused ? 'rgba(214,180,123,0.35)' : 'var(--border)'}`,
                color: 'var(--text-1)',
              }}
            />
          </div>

          <div className="flex-1" />

          {/* Actions */}
          <div className="flex items-center gap-2">
            {/* Services shortcut */}
            <button
              onClick={() => setCurrentPage('services')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200"
              style={{
                background: 'rgba(214,180,123,0.08)',
                border: '1px solid rgba(214,180,123,0.18)',
                color: 'var(--gold)',
              }}
            >
              <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />
              {language === 'ar' ? 'الخدمات' : 'Services'}
            </button>

            {/* Notifications */}
            <button
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 relative"
              style={{
                background: 'var(--card-2)',
                border: '1px solid var(--border)',
                color: 'var(--text-2)',
              }}
            >
              <Bell className="w-4 h-4" strokeWidth={1.5} />
              <span
                className="absolute top-1.5 end-1.5 w-1.5 h-1.5 rounded-full"
                style={{ background: 'var(--gold)' }}
              />
            </button>

            {/* Avatar */}
            {user?.avatar_url ? (
              <button
                onClick={() => setCurrentPage('profile')}
                className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 transition-all duration-200"
                style={{ border: '2px solid rgba(214,180,123,0.25)' }}
              >
                <img src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" />
              </button>
            ) : (
              <button
                onClick={() => setCurrentPage('profile')}
                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                style={{
                  background: 'rgba(214,180,123,0.12)',
                  border: '2px solid rgba(214,180,123,0.25)',
                  color: 'var(--gold)',
                }}
              >
                {user?.username?.[0]?.toUpperCase() || 'U'}
              </button>
            )}
          </div>
        </div>

        {/* Mobile topbar — only on small screens (below md) */}
        <div
          className="md:hidden flex-shrink-0 flex items-center px-3"
          style={{
            height: '52px',
            background: 'var(--bg)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="w-10 h-10 flex items-center justify-center rounded-xl transition-all flex-shrink-0"
            style={{ color: 'var(--text-2)' }}
            aria-label="Open navigation"
          >
            <Menu className="w-5 h-5" strokeWidth={1.5} />
          </button>

          <span
            className="flex-1 text-center font-bold text-base gradient-gold"
          >
            AXIE
          </span>

          <button
            onClick={() => setMobileChatOpen(true)}
            className="w-10 h-10 flex items-center justify-center rounded-xl transition-all flex-shrink-0"
            style={{ color: 'var(--text-2)' }}
            aria-label="Open chat"
          >
            <MessageCircle className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {renderContent()}
        </div>
      </main>

      {/* Desktop chat — visible at md (768px) and up */}
      <div className="hidden md:flex flex-shrink-0">
        <ChatPanel />
      </div>

      {/* Mobile chat bottom sheet — only on truly small screens */}
      {mobileChatOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
            onClick={() => setMobileChatOpen(false)}
          />
          <div
            className="relative w-full rounded-t-[28px] flex flex-col animate-slide-up"
            style={{
              height: '85dvh',
              background: '#0B0B0B',
              border: '1px solid var(--border)',
              borderBottom: 'none',
              boxShadow: '0 -8px 48px rgba(0,0,0,0.6)',
            }}
          >
            <div className="flex-shrink-0 flex items-center justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border-2)' }} />
            </div>
            <div
              className="flex-shrink-0 flex items-center justify-between px-4 pb-3"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <span className="font-bold text-base gradient-gold">
                {language === 'ar' ? 'المحادثة' : 'Chat'}
              </span>
              <button
                onClick={() => setMobileChatOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-xl transition-all"
                style={{ color: 'var(--text-3)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <ChatPanel fillContainer />
            </div>
          </div>
        </div>
      )}

      {/* Daily login modal */}
      {showDailyLogin && (
        <DailyLoginModal onClose={() => setShowDailyLogin(false)} />
      )}
    </div>
  );
};
