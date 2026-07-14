import { useState, useEffect } from 'react';
import { AuthProvider, useAuth, AccountStatus } from './contexts/AuthContext';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import { useAdmin } from './hooks/useAdmin';
import { PushPermissionCoordinator } from './components/PushPermissionCoordinator';
import { Ban, Clock, LogOut, Crown } from 'lucide-react';

function BlockedScreen({ status, reason, signOut }: { status: AccountStatus; reason?: string | null; signOut: () => void }) {
  const isBanned = status === 'BANNED';
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm text-center space-y-5">
        <div
          className="w-16 h-16 rounded-[20px] flex items-center justify-center mx-auto"
          style={{
            background: isBanned ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
            border: `1px solid ${isBanned ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}`,
          }}
        >
          {isBanned ? <Ban className="w-8 h-8" style={{ color: '#ef4444' }} /> : <Clock className="w-8 h-8" style={{ color: '#f59e0b' }} />}
        </div>
        <div>
          <h2 className="text-xl font-bold mb-2" style={{ color: isBanned ? '#f87171' : '#fbbf24' }}>
            {isBanned ? 'تم حظر حسابك' : 'حسابك موقوف مؤقتاً'}
          </h2>
          <p className="text-sm" style={{ color: 'var(--text-3)' }}>
            {reason ?? (isBanned
              ? 'تم حظر هذا الحساب بسبب انتهاك شروط الخدمة.'
              : 'تم إيقاف هذا الحساب بشكل مؤقت. تواصل مع الدعم.')}
          </p>
        </div>
        <div className="rounded-2xl p-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Crown className="w-4 h-4" style={{ color: 'var(--gold)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-2)' }}>للتواصل مع الدعم</span>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>
            إذا كنت تعتقد أن هذا خطأ، يرجى التواصل مع فريق الدعم.
          </p>
        </div>
        <button
          onClick={signOut}
          className="flex items-center gap-2 mx-auto text-sm font-medium transition-colors"
          style={{ color: 'var(--text-3)' }}
        >
          <LogOut className="w-4 h-4" />
          تسجيل الخروج
        </button>
      </div>
    </div>
  );
}

function AppContent() {
  const { session, loading, accountStatus, user, signOut } = useAuth();
  const { isAdmin } = useAdmin();
  const { t } = useLanguage();
  const [currentRoute, setCurrentRoute] = useState<'dashboard' | 'admin'>('dashboard');

  useEffect(() => {
    const handleRouteChange = () => {
      const hash = window.location.hash.slice(1);
      const path = window.location.pathname;
      if ((hash === 'admin' || path === '/admin') && isAdmin) {
        setCurrentRoute('admin');
        if (path === '/admin' && hash !== 'admin') {
          window.history.replaceState(null, '', '/#admin');
        }
      } else {
        setCurrentRoute('dashboard');
      }
    };
    window.addEventListener('hashchange', handleRouteChange);
    window.addEventListener('popstate', handleRouteChange);
    handleRouteChange();
    return () => {
      window.removeEventListener('hashchange', handleRouteChange);
      window.removeEventListener('popstate', handleRouteChange);
    };
  }, [isAdmin]);

  if (loading) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-5"
        style={{ background: 'var(--bg)' }}
      >
        {/* Logo mark */}
        <div
          className="w-14 h-14 rounded-[18px] flex items-center justify-center mb-1"
          style={{
            background: 'linear-gradient(135deg, #C6A06A 0%, #E7C38F 100%)',
            boxShadow: '0 8px 24px rgba(214,180,123,0.25)',
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M3 7l9-4 9 4v10l-9 4-9-4V7z" stroke="#0a0a0a" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="M12 3v18M3 7l9 4 9-4" stroke="#0a0a0a" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
        </div>
        {/* Spinner */}
        <div
          className="w-6 h-6 rounded-full border-2 border-transparent animate-spin"
          style={{ borderTopColor: '#D6B47B', borderRightColor: 'rgba(214,180,123,0.3)' }}
        />
        <p className="text-xs font-semibold" style={{ color: 'var(--text-3)' }}>
          {t('common.loadingPlatform')}
        </p>
      </div>
    );
  }

  if (!session) return <Login />;

  if (accountStatus === 'SUSPENDED' || accountStatus === 'BANNED') {
    const reason = accountStatus === 'SUSPENDED'
      ? (user as any)?.suspension_reason ?? null
      : (user as any)?.ban_reason ?? null;
    return <BlockedScreen status={accountStatus} reason={reason} signOut={signOut} />;
  }

  if (currentRoute === 'admin' && isAdmin) return (
    <>
      <AdminDashboard />
      <PushPermissionCoordinator />
    </>
  );
  return (
    <>
      <Dashboard />
      <PushPermissionCoordinator />
    </>
  );
}

function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </LanguageProvider>
  );
}

export default App;
