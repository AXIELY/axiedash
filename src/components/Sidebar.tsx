import { useAuth } from '../contexts/AuthContext';
import { useAdmin } from '../hooks/useAdmin';
import { useLanguage } from '../contexts/LanguageContext';
import { LanguageToggle } from './LanguageToggle';
import { Crown, LayoutDashboard, CircleUser as UserCircle, Gem, ShoppingBag, Dices, ListChecks, Award, Medal, ActivitySquare, LifeBuoy, LogOut, Plus, Shield, X, ChevronRight, Gift, ClipboardList } from 'lucide-react';

const RANK_COLORS: Record<string, string> = {
  Bronze:  '#CD7F32',
  Silver:  '#C0C0C0',
  Gold:    '#D6B47B',
  Diamond: '#58A6FF',
  Legend:  '#D6B47B',
};

interface SidebarProps {
  currentPage: string;
  setCurrentPage: (page: string) => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export const Sidebar = ({ currentPage, setCurrentPage, mobileOpen, onMobileClose }: SidebarProps) => {
  const { user, signOut } = useAuth();
  const { isAdmin } = useAdmin();
  const { t, isRTL } = useLanguage();

  const menuItems = [
    { id: 'dashboard',    label: t('nav.home'),         icon: LayoutDashboard },
    { id: 'profile',      label: t('nav.profile'),      icon: UserCircle },
    { id: 'collection',   label: t('nav.collection'),   icon: Gem },
    { id: 'shop',         label: t('nav.shop'),         icon: ShoppingBag },
    { id: 'games',        label: isRTL ? 'سباق العملات' : 'Coin Rush',  icon: Dices },
    { id: 'wheel-v2',     label: isRTL ? 'عجلة أكسي' : 'AXIE Wheel',  icon: Dices },
    { id: 'missions',     label: t('nav.missions'),     icon: ListChecks },
    { id: 'achievements', label: t('nav.achievements'), icon: Award },
    { id: 'leaderboard',  label: t('nav.leaderboard'),  icon: Medal },
    { id: 'activity',     label: t('nav.activity'),     icon: ActivitySquare },
    { id: 'prizes',        label: isRTL ? 'جوائزي' : 'My Prizes',   icon: Gift },
    { id: 'my-orders',    label: isRTL ? 'طلباتي' : 'My Orders',   icon: ClipboardList },
    { id: 'support',      label: t('nav.support'),      icon: LifeBuoy },
  ];

  const xpForNextLevel = (user?.level || 1) * 500;
  const currentLevelXp = user?.xp ? user.xp % xpForNextLevel : 0;
  const xpProgress = user ? Math.min((currentLevelXp / xpForNextLevel) * 100, 100) : 0;
  const rank = user?.rank || 'Bronze';
  const rankColor = RANK_COLORS[rank] || RANK_COLORS.Bronze;

  const handleNav = (page: string) => {
    setCurrentPage(page);
    onMobileClose?.();
  };

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={onMobileClose}
        />
      )}

      <aside
        className={`sidebar-glass w-[260px] max-w-[82vw] h-screen flex flex-col z-50 fixed lg:relative lg:max-w-none transition-transform duration-300 ${
          mobileOpen ? 'translate-x-0' : isRTL ? 'max-lg:translate-x-full' : 'max-lg:-translate-x-full'
        }`}
        style={{ flexShrink: 0 }}
      >
        {/* Mobile close */}
        <button
          onClick={onMobileClose}
          className="absolute top-4 end-3 p-1.5 rounded-xl transition-all lg:hidden"
          style={{ color: 'var(--text-3)' }}
        >
          <X className="w-4 h-4" strokeWidth={1.5} />
        </button>

        {/* Logo */}
        <div className="px-5 pt-6 pb-5 flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-[12px] flex items-center justify-center flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, #C6A06A 0%, #E7C38F 100%)',
              boxShadow: '0 4px 12px rgba(214,180,123,0.25)',
            }}
          >
            <Crown className="w-4.5 h-4.5 text-[#0a0a0a]" strokeWidth={2} />
          </div>
          <span className="font-cairo font-bold text-xl tracking-tight gradient-gold">
            AXIE
          </span>
        </div>

        <div className="mx-3 mb-1" style={{ height: '1px', background: 'var(--border)' }} />

        {/* User card */}
        <div
          className="mx-3 my-3 rounded-[20px] p-4 relative overflow-hidden"
          style={{ background: 'var(--card-2)', border: '1px solid var(--border)' }}
        >
          <div className="absolute top-0 left-0 right-0 h-px"
            style={{ background: `linear-gradient(90deg, transparent, ${rankColor}2E, transparent)` }} />

          <div className="flex items-center gap-3 mb-3">
            <div className="relative flex-shrink-0">
              <div
                className="w-12 h-12 rounded-full overflow-hidden"
                style={{ border: `2px solid ${rankColor}40`, boxShadow: `0 0 10px ${rankColor}18` }}
              >
                {user?.avatar_url ? (
                  <img src={user.avatar_url} alt={user?.username} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-lg font-bold"
                    style={{ background: `${rankColor}14`, color: rankColor }}>
                    {user?.username?.[0]?.toUpperCase() || 'U'}
                  </div>
                )}
              </div>
              <div
                className="absolute -bottom-1 -end-1 text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center"
                style={{ background: rankColor, color: '#0a0a0a' }}
              >
                {user?.level || 1}
              </div>
            </div>

            <div className="min-w-0">
              <p className="font-bold text-sm truncate" style={{ color: 'var(--text-1)' }}>
                {user?.username || 'Player'}
              </p>
              <p className="text-xs mt-0.5" style={{ color: rankColor }}>{rank}</p>
            </div>
          </div>

          {/* XP bar */}
          <div className="mb-3">
            <div className="flex justify-between text-[11px] mb-1.5" style={{ color: 'var(--text-3)' }}>
              <span>XP</span>
              <span className="font-mono">{currentLevelXp} / {xpForNextLevel}</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border-2)' }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${xpProgress}%`, background: `linear-gradient(90deg, ${rankColor}70, ${rankColor})` }}
              />
            </div>
          </div>

          {/* Balances */}
          <div className="flex gap-2 mb-3">
            <div
              className="flex-1 rounded-xl px-2.5 py-2 text-center"
              style={{ background: 'rgba(214,180,123,0.06)', border: '1px solid rgba(214,180,123,0.10)' }}
            >
              <p className="font-bold text-sm" style={{ color: 'var(--gold)' }}>
                {(user?.points ?? 0).toLocaleString()}
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-3)' }}>{t('sidebar.points')}</p>
            </div>
            <div
              className="flex-1 rounded-xl px-2.5 py-2 text-center"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}
            >
              <p className="font-bold text-sm" style={{ color: 'var(--text-2)' }}>
                {(user?.coins ?? 0).toLocaleString()}
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-3)' }}>{t('sidebar.coins')}</p>
            </div>
          </div>

          <button
            onClick={() => handleNav('shop')}
            className="btn-gold w-full text-xs py-2 flex items-center justify-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2} />
            {t('sidebar.addCredit')}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 overflow-y-auto space-y-0.5 pb-2">
          {menuItems.map(({ id, label, icon: Icon }) => {
            const isActive = currentPage === id;
            return (
              <button
                key={id}
                onClick={() => handleNav(id)}
                className="nav-item"
                style={isActive ? {
                  background: 'rgba(214,180,123,0.08)',
                  border: '1px solid rgba(214,180,123,0.16)',
                  color: 'var(--gold)',
                } : {}}
              >
                <Icon className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={isActive ? 2 : 1.5} />
                <span className="flex-1 text-start">{label}</span>
                {isActive && (
                  <ChevronRight
                    className="w-3.5 h-3.5 opacity-40 flex-shrink-0"
                    strokeWidth={2}
                    style={{ transform: isRTL ? 'rotate(180deg)' : undefined }}
                  />
                )}
              </button>
            );
          })}

          {isAdmin && (
            <button
              onClick={() => { window.location.hash = 'admin'; onMobileClose?.(); }}
              className="nav-item mt-3"
              style={{
                background: 'rgba(214,180,123,0.06)',
                border: '1px solid rgba(214,180,123,0.14)',
                color: 'var(--gold)',
              }}
            >
              <Shield className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={1.5} />
              <span className="flex-1 text-start">{t('nav.admin')}</span>
            </button>
          )}
        </nav>

        {/* Footer */}
        <div className="px-3 pb-5 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="mb-1.5">
            <LanguageToggle compact />
          </div>
          <button
            onClick={() => signOut()}
            className="nav-item"
            style={{ color: 'rgba(244,112,103,0.7)' }}
          >
            <LogOut className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={1.5} />
            <span className="flex-1 text-start">{t('nav.logout')}</span>
          </button>
        </div>
      </aside>
    </>
  );
};
