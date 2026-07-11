import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import { useAdmin } from './hooks/useAdmin';

function AppContent() {
  const { session, loading } = useAuth();
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
  if (currentRoute === 'admin' && isAdmin) return <AdminDashboard />;
  return <Dashboard />;
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
