import { useState, useEffect } from 'react';
import {
  Users, Settings, Package, Gift, ShoppingCart, BarChart3, Bell,
  Gamepad2, DollarSign, TrendingUp, ArrowRight, ArrowLeft, Clock,
  CheckCircle, AlertCircle, XCircle, Flag, Crown, Zap, Menu, X, Megaphone,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAdmin } from '../hooks/useAdmin';
import { useLanguage } from '../contexts/LanguageContext';
import { GameManagement } from '../components/admin/GameManagement';
import { ServiceManagement } from '../components/admin/ServiceManagement';
import { OrderManagement } from '../components/admin/OrderManagement';
import { OfferManagement } from '../components/admin/OfferManagement';
import { ReportedMessagesManagement } from '../components/admin/ReportedMessagesManagement';
import { LuckyCardManagement } from '../components/admin/LuckyCardManagement';
import { CampaignManagement } from '../components/admin/CampaignManagement';
import { EngagementManagement } from '../components/admin/EngagementManagement';
import { PointStoreManagement } from '../components/admin/PointStoreManagement';
import { CommerceAdmin } from '../components/admin/CommerceAdmin';
import { UsersManagement } from '../components/admin/UsersManagement';
import { NotificationAdmin } from '../components/admin/NotificationAdmin';
import { WheelV2Management } from '../components/admin/WheelV2Management';

interface DashboardStats {
  totalUsers: number; totalOrders: number; pendingOrders: number;
  totalRevenue: number; todayRevenue: number; activeGames: number; totalGamePlays: number;
}

export const AdminDashboard = () => {
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { t, isRTL, language } = useLanguage();
  const ArrowIcon = isRTL ? ArrowLeft : ArrowRight;
  const [currentView, setCurrentView] = useState('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [stats, setStats] = useState<DashboardStats>({ totalUsers:0,totalOrders:0,pendingOrders:0,totalRevenue:0,todayRevenue:0,activeGames:0,totalGamePlays:0 });
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (!adminLoading && isAdmin) fetchDashboardData(); }, [isAdmin, adminLoading]);

  // Lock body scroll when mobile nav is open
  useEffect(() => {
    if (mobileNavOpen) {
      document.body.classList.add('no-scroll');
    } else {
      document.body.classList.remove('no-scroll');
    }
    return () => document.body.classList.remove('no-scroll');
  }, [mobileNavOpen]);

  const fetchDashboardData = async () => {
    try {
      const [usersRes, ordersRes, gamesRes, gameLogsRes] = await Promise.all([
        supabase.from('users').select('id', { count: 'exact', head: true }),
        supabase.from('orders').select('*'),
        supabase.from('game_settings').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('game_logs').select('id', { count: 'exact', head: true }),
      ]);
      const orders = ordersRes.data || [];
      const totalRevenue = orders.reduce((s, o) => s + parseFloat(o.final_amount || 0), 0);
      const today = new Date(); today.setHours(0,0,0,0);
      const todayRevenue = orders.filter(o => new Date(o.created_at) >= today).reduce((s, o) => s + parseFloat(o.final_amount || 0), 0);
      setStats({ totalUsers: usersRes.count||0, totalOrders: orders.length, pendingOrders: orders.filter(o=>o.status==='pending').length, totalRevenue, todayRevenue, activeGames: gamesRes.count||0, totalGamePlays: gameLogsRes.count||0 });
      setRecentOrders(orders.sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime()).slice(0,5));
    } catch { /* silent */ } finally { setLoading(false); }
  };

  if (adminLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-12 h-12 rounded-full border-2 border-transparent animate-spin"
          style={{ borderTopColor: '#8b5cf6', borderRightColor: '#d946ef' }} />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="glass-card p-8 text-center max-w-sm w-full">
          <AlertCircle className="w-14 h-14 mx-auto mb-4 text-red-400" style={{ filter: 'drop-shadow(0 0 12px rgba(248,113,113,0.4))' }} />
          <h2 className="text-2xl font-changa font-bold mb-2">{t('admin.unauthorized')}</h2>
          <p className="text-white/40 text-sm">{t('admin.unauthorizedMsg')}</p>
        </div>
      </div>
    );
  }

  const statCards = [
    { title: t('admin.totalUsers'),    value: stats.totalUsers.toLocaleString(),       icon: Users,        color: '#00e5ff', gradient: 'rgba(0,229,255,',   change: '+12%' },
    { title: t('admin.totalOrders'),   value: stats.totalOrders.toLocaleString(),       icon: ShoppingCart, color: '#d946ef', gradient: 'rgba(217,70,239,',  change: '+8%' },
    { title: t('admin.pendingOrders'), value: stats.pendingOrders.toLocaleString(),     icon: Clock,        color: '#f59e0b', gradient: 'rgba(245,158,11,',  highlight: stats.pendingOrders > 0 },
    { title: t('admin.totalRevenue'),  value: `${stats.totalRevenue.toFixed(2)} د.ل`,  icon: DollarSign,   color: '#10b981', gradient: 'rgba(16,185,129,',  change: '+24%' },
    { title: t('admin.todayRevenue'),  value: `${stats.todayRevenue.toFixed(2)} د.ل`,  icon: TrendingUp,   color: '#f59e0b', gradient: 'rgba(245,158,11,',  change: '+15%' },
    { title: t('admin.activeGames'),   value: stats.activeGames.toLocaleString(),       icon: Gamepad2,     color: '#a78bfa', gradient: 'rgba(167,139,250,' },
  ];

  const menuItems = [
    { id: 'overview',  label: t('admin.overview'),  icon: BarChart3 },
    { id: 'games',     label: t('admin.games'),     icon: Gamepad2 },
    { id: 'luckyCard', label: t('admin.luckyCard'), icon: Zap },
    { id: 'wheelV2',  label: language === 'ar' ? 'عجلة V2' : 'Wheel V2', icon: Zap },
    { id: 'banners',   label: language === 'ar' ? 'بانرات الرئيسية' : 'Banners', icon: Megaphone },
    { id: 'commerce',  label: language === 'ar' ? 'التجارة والمدفوعات' : 'Commerce & Payments', icon: DollarSign },
    { id: 'pointStore', label: language === 'ar' ? 'متجر النقاط' : 'Point Store', icon: ShoppingCart },
    { id: 'services',  label: t('admin.services'),  icon: Package },
    { id: 'orders',    label: t('admin.orders'),    icon: ShoppingCart },
    { id: 'offers',    label: t('admin.offers'),    icon: Gift },
    { id: 'reports',   label: t('admin.reports'),   icon: Flag },
    { id: 'engagement', label: language === 'ar' ? 'التفاعل' : 'Engagement', icon: Zap },
    { id: 'users',         label: language === 'ar' ? 'المستخدمون' : 'Users', icon: Users },
    { id: 'notifications', label: language === 'ar' ? 'الإشعارات' : 'Notifications', icon: Bell },
    { id: 'settings',      label: t('admin.settings'),  icon: Settings },
  ];

  const statusColor = (s: string) => ({ completed:'text-green-400', pending:'text-amber-400', processing:'text-blue-400', cancelled:'text-red-400' }[s] || 'text-white/40');
  const statusIcon  = (s: string) => {
    const map: Record<string, any> = { completed: <CheckCircle className="w-4 h-4" />, pending: <Clock className="w-4 h-4" />, processing: <TrendingUp className="w-4 h-4" />, cancelled: <XCircle className="w-4 h-4" /> };
    return map[s] || <AlertCircle className="w-4 h-4" />;
  };

  const handleNavSelect = (id: string) => {
    setCurrentView(id);
    setMobileNavOpen(false);
  };

  const NavContent = () => (
    <>
      <div className="p-5">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,#7c3aed,#d946ef)' }}>
            <Crown className="w-4 h-4 text-white" />
          </div>
          <h1 className="font-changa font-bold text-lg"
            style={{ background: 'linear-gradient(135deg,#c4b5fd,#e879f9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {t('admin.title')}
          </h1>
        </div>
        <p className="text-xs text-white/30 ms-10">{t('admin.subtitle')}</p>
        <button
          onClick={() => window.location.hash = ''}
          className="mt-4 w-full py-2 px-3 rounded-xl text-xs text-white/40 hover:text-white transition-all text-start flex items-center gap-2 min-h-[44px]"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <ArrowIcon className="w-3.5 h-3.5" />
          {t('admin.backToHome')}
        </button>
      </div>

      <nav className="px-3 space-y-0.5 flex-1 overflow-y-auto">
        {menuItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => handleNavSelect(id)}
            className={`nav-item ${currentView === id ? 'active' : ''}`}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1 text-start">{label}</span>
          </button>
        ))}
      </nav>
    </>
  );

  const renderContent = () => {
    switch (currentView) {
      case 'games':     return <GameManagement />;
      case 'luckyCard': return <LuckyCardManagement />;
      case 'wheelV2':  return <WheelV2Management />;
      case 'banners':   return <CampaignManagement />;
      case 'pointStore': return <PointStoreManagement />;
      case 'services':  return <ServiceManagement />;
      case 'orders':    return <OrderManagement />;
      case 'offers':    return <OfferManagement />;
      case 'reports':    return <ReportedMessagesManagement />;
      case 'engagement': return <EngagementManagement />;
      case 'commerce':   return <CommerceAdmin />;
      case 'users':         return <UsersManagement />;
      case 'notifications': return <NotificationAdmin />;
      default:
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {statCards.map(stat => {
                const Icon = stat.icon;
                return (
                  <div key={stat.title} className="glass-card p-5 relative overflow-hidden"
                    style={stat.highlight ? { border: '1px solid rgba(245,158,11,0.35)' } : {}}>
                    <div className="absolute inset-0 opacity-[0.06]"
                      style={{ background: `radial-gradient(ellipse at top right, ${stat.gradient}0.8), transparent 70%)` }} />
                    <div className="glow-strip" />
                    <div className="relative">
                      <div className="flex items-center justify-between mb-4">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                          style={{ background: `${stat.gradient}0.15)`, border: `1px solid ${stat.gradient}0.25)` }}>
                          <Icon className="w-5 h-5" style={{ color: stat.color }} />
                        </div>
                        {stat.change && <span className="text-xs text-green-400 font-semibold">{stat.change}</span>}
                      </div>
                      <p className="text-2xl font-bold text-white font-changa">{stat.value}</p>
                      <p className="text-xs text-white/40 mt-1">{stat.title}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="glass-card p-4 sm:p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="section-title">{t('admin.recentOrders')}</h2>
                <button onClick={() => setCurrentView('orders')}
                  className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors">
                  {t('admin.viewAll')}
                  <ArrowIcon className="w-4 h-4" />
                </button>
              </div>

              {recentOrders.length === 0 ? (
                <p className="text-center py-8 text-white/30 text-sm">{t('admin.noOrders')}</p>
              ) : (
                <div className="space-y-2.5">
                  {recentOrders.map(order => (
                    <div key={order.id} className="flex items-center justify-between p-3 sm:p-4 rounded-xl hover:bg-white/5 transition-all"
                      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`flex-shrink-0 ${statusColor(order.status)}`}>{statusIcon(order.status)}</div>
                        <div className="min-w-0">
                          <p className="font-bold text-sm text-white truncate">{order.order_number}</p>
                          <p className="text-xs text-white/30">{new Date(order.created_at).toLocaleDateString('ar-SA')}</p>
                        </div>
                      </div>
                      <div className="text-end flex-shrink-0 ms-2">
                        <p className="font-bold text-sm text-amber-400">{order.final_amount} د.ل</p>
                        <p className="text-xs text-white/30 capitalize">{order.status}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen flex" style={{ maxWidth: '100vw', overflow: 'hidden' }}>

      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex w-60 min-h-screen flex-col flex-shrink-0"
        style={{ background: 'rgba(10,8,24,0.9)', backdropFilter: 'blur(24px)', borderInlineEnd: '1px solid rgba(139,92,246,0.12)' }}
      >
        <NavContent />
      </aside>

      {/* Mobile nav drawer overlay */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside
            className="relative flex flex-col w-72 max-w-[80vw] h-full z-10"
            style={{ background: 'rgba(10,8,24,0.98)', borderInlineEnd: '1px solid rgba(139,92,246,0.2)' }}
          >
            <button
              onClick={() => setMobileNavOpen(false)}
              className="absolute top-4 end-4 w-9 h-9 flex items-center justify-center rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition-all z-10"
            >
              <X className="w-4 h-4" />
            </button>
            <NavContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <div
          className="md:hidden flex-shrink-0 flex items-center gap-3 px-4 border-b border-white/5"
          style={{ height: '52px', background: 'rgba(10,8,24,0.95)', backdropFilter: 'blur(16px)' }}
        >
          <button
            onClick={() => setMobileNavOpen(true)}
            className="w-11 h-11 flex items-center justify-center rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-all flex-shrink-0"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span
            className="flex-1 font-changa font-bold text-base"
            style={{ background: 'linear-gradient(135deg,#c4b5fd,#e879f9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
          >
            {t('admin.title')} — {menuItems.find(m => m.id === currentView)?.label}
          </span>
        </div>

        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8">
          {renderContent()}
        </main>
      </div>
    </div>
  );
};
