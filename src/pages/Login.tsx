import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { LanguageToggle } from '../components/LanguageToggle';
import { Crown, Mail, Lock, User, Eye, EyeOff, AlertCircle } from 'lucide-react';

export const Login = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const { t, language } = useLanguage();
  const ar = language === 'ar';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isLogin) {
        await signIn(email, password);
      } else {
        if (!username.trim()) {
          setError(ar ? 'اسم المستخدم مطلوب' : 'Username is required');
          setLoading(false);
          return;
        }
        await signUp(email, password, username);
      }
    } catch (err: any) {
      setError(err.message || t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden p-4"
      style={{ background: 'var(--bg)' }}
      dir={ar ? 'rtl' : 'ltr'}
    >
      {/* Subtle ambient glow */}
      <div
        className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(214,180,123,0.05) 0%, transparent 70%)' }}
      />

      {/* Language toggle */}
      <div className="absolute top-6 end-6 z-20">
        <LanguageToggle />
      </div>

      <div className="w-full max-w-sm relative z-10 animate-fade-up">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <div
            className="w-16 h-16 rounded-[20px] flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, #C6A06A 0%, #E7C38F 100%)',
              boxShadow: '0 8px 24px rgba(214,180,123,0.3)',
            }}
          >
            <Crown className="w-8 h-8 text-[#0a0a0a]" strokeWidth={2} />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight gradient-gold">AXIE</h1>
            <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
              {ar ? 'منصة الألعاب الرائدة' : 'Premium Gaming Platform'}
            </p>
          </div>
        </div>

        {/* Card */}
        <div
          className="rounded-[28px] p-7"
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
          }}
        >
          {/* Tab switcher */}
          <div
            className="flex rounded-[14px] p-1 mb-6"
            style={{ background: 'var(--card-2)', border: '1px solid var(--border)' }}
          >
            <button
              onClick={() => setIsLogin(true)}
              className="flex-1 py-2 rounded-[10px] text-sm font-bold transition-all duration-200"
              style={isLogin ? {
                background: 'var(--card)',
                color: 'var(--text-1)',
                boxShadow: 'var(--shadow)',
              } : {
                color: 'var(--text-3)',
              }}
            >
              {ar ? 'تسجيل الدخول' : 'Sign In'}
            </button>
            <button
              onClick={() => setIsLogin(false)}
              className="flex-1 py-2 rounded-[10px] text-sm font-bold transition-all duration-200"
              style={!isLogin ? {
                background: 'var(--card)',
                color: 'var(--text-1)',
                boxShadow: 'var(--shadow)',
              } : {
                color: 'var(--text-3)',
              }}
            >
              {ar ? 'إنشاء حساب' : 'Sign Up'}
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-2)' }}>
                  {t('login.username')}
                </label>
                <div className="relative">
                  <User
                    className="absolute top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                    style={{ color: 'var(--text-3)', insetInlineStart: '14px' }}
                    strokeWidth={1.5}
                  />
                  <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    className="input-glow"
                    style={{ paddingInlineStart: '40px' }}
                    placeholder={t('login.usernamePlaceholder')}
                    required={!isLogin}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-2)' }}>
                {t('login.email')}
              </label>
              <div className="relative">
                <Mail
                  className="absolute top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                  style={{ color: 'var(--text-3)', insetInlineStart: '14px' }}
                  strokeWidth={1.5}
                />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="input-glow"
                  style={{ paddingInlineStart: '40px' }}
                  placeholder="your@email.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-2)' }}>
                {t('login.password')}
              </label>
              <div className="relative">
                <Lock
                  className="absolute top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                  style={{ color: 'var(--text-3)', insetInlineStart: '14px' }}
                  strokeWidth={1.5}
                />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="input-glow"
                  style={{ paddingInlineStart: '40px', paddingInlineEnd: '40px' }}
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: 'var(--text-3)', insetInlineEnd: '14px' }}
                >
                  {showPassword
                    ? <EyeOff className="w-4 h-4" strokeWidth={1.5} />
                    : <Eye className="w-4 h-4" strokeWidth={1.5} />
                  }
                </button>
              </div>
            </div>

            {error && (
              <div
                className="flex items-start gap-2 rounded-[12px] px-3.5 py-3 text-sm"
                style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)' }}
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#f87171' }} strokeWidth={1.5} />
                <span style={{ color: '#fca5a5' }}>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-gold w-full py-3.5 text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading
                ? (ar ? 'جاري التحميل...' : 'Loading...')
                : isLogin
                  ? (ar ? 'تسجيل الدخول' : 'Sign In')
                  : (ar ? 'إنشاء الحساب' : 'Create Account')
              }
            </button>
          </form>

          <p className="mt-5 text-center text-xs" style={{ color: 'var(--text-3)' }}>
            {isLogin
              ? (ar ? 'ليس لديك حساب؟' : "Don't have an account?")
              : (ar ? 'لديك حساب بالفعل؟' : 'Already have an account?')
            }
            {' '}
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="font-bold transition-colors"
              style={{ color: 'var(--gold)' }}
            >
              {isLogin
                ? (ar ? 'أنشئ حسابًا' : 'Sign up')
                : (ar ? 'سجّل الدخول' : 'Sign in')
              }
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};
