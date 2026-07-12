import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { LanguageToggle } from '../components/LanguageToggle';
import { Crown, Mail, Lock, User, Eye, EyeOff, AlertCircle, Phone } from 'lucide-react';

// ─── Libyan phone helpers ──────────────────────────────────────────────────────

const ALLOWED_PREFIXES = ['91', '92'];

function normalizeLibyanPhone(raw: string): string {
  let clean = raw.replace(/[^0-9]/g, '');
  if (clean.startsWith('218')) clean = clean.slice(3);
  if (clean.startsWith('0'))   clean = clean.slice(1);
  return clean.slice(0, 9);
}

function validateLibyanPhone(national: string): string | null {
  const clean = normalizeLibyanPhone(national);
  if (clean.length !== 9) return 'INVALID_LENGTH';
  const prefix = clean.slice(0, 2);
  if (!ALLOWED_PREFIXES.includes(prefix)) return 'INVALID_PREFIX';
  return null;
}

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_LENGTH:  'أدخل رقمًا ليبيًا مكونًا من 9 أرقام',
  INVALID_PREFIX:  'أدخل رقمًا ليبيًا صحيحًا يبدأ بـ91 أو 92',
  INVALID_LIBYAN_PHONE: 'أدخل رقمًا ليبيًا صحيحًا يبدأ بـ91 أو 92',
  PHONE_ALREADY_USED: 'رقم الهاتف مستخدم في حساب آخر',
  USERNAME_ALREADY_USED: 'اسم المستخدم غير متاح',
  EMAIL_ALREADY_REGISTERED: 'البريد الإلكتروني مستخدم في حساب آخر',
  REGISTRATION_FAILED: 'تعذر إنشاء الحساب، حاول مرة أخرى',
};

function mapError(raw: string): string {
  for (const [key, msg] of Object.entries(ERROR_MESSAGES)) {
    if (raw.toUpperCase().includes(key)) return msg;
  }
  if (raw.toLowerCase().includes('email') && raw.toLowerCase().includes('already')) {
    return ERROR_MESSAGES.EMAIL_ALREADY_REGISTERED;
  }
  if (raw.toLowerCase().includes('duplicate') || raw.toLowerCase().includes('unique')) {
    if (raw.toLowerCase().includes('phone')) return ERROR_MESSAGES.PHONE_ALREADY_USED;
    if (raw.toLowerCase().includes('username')) return ERROR_MESSAGES.USERNAME_ALREADY_USED;
    return ERROR_MESSAGES.EMAIL_ALREADY_REGISTERED;
  }
  return raw;
}

// ─── Phone input component ────────────────────────────────────────────────────

function LibyanPhoneInput({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
}) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(normalizeLibyanPhone(e.target.value));
  };

  return (
    <div>
      <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-2)' }}>
        رقم الهاتف الليبي
      </label>
      <div
        className="flex items-center rounded-[14px] overflow-hidden"
        style={{
          background: 'var(--card-2)',
          border: `1px solid ${error ? 'rgba(239,68,68,0.45)' : 'var(--border)'}`,
          direction: 'ltr',
        }}
      >
        {/* Fixed +218 prefix */}
        <div
          className="flex items-center gap-1.5 px-3 py-3 shrink-0 select-none border-l"
          style={{
            color: 'var(--gold)',
            background: 'rgba(214,180,123,0.07)',
            borderColor: 'var(--border)',
            minWidth: '68px',
          }}
        >
          <Phone className="w-3.5 h-3.5 opacity-70" strokeWidth={1.5} />
          <span className="text-sm font-bold tracking-tight">+218</span>
        </div>

        {/* National number input — always LTR */}
        <input
          type="tel"
          value={value}
          onChange={handleChange}
          placeholder="92 621 9540"
          maxLength={9}
          inputMode="numeric"
          dir="ltr"
          className="flex-1 bg-transparent px-3 py-3 text-sm outline-none placeholder-slate-600"
          style={{ color: 'var(--text-1)', minWidth: 0, fontFamily: 'monospace' }}
        />
      </div>
      {error && (
        <p className="text-xs mt-1" style={{ color: '#f87171' }}>{error}</p>
      )}
      {!error && value.length > 0 && value.length === 9 && (
        <p className="text-xs mt-1" style={{ color: 'rgba(74,222,128,0.7)' }}>
          ✓ +218{value}
        </p>
      )}
    </div>
  );
}

// ─── Main Login/Register page ─────────────────────────────────────────────────

export const Login = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const { t, language } = useLanguage();
  const ar = language === 'ar';

  const switchTab = (login: boolean) => {
    setIsLogin(login);
    setError('');
    setPhoneError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    setPhoneError(null);

    if (!isLogin) {
      if (!username.trim()) {
        setError('اسم المستخدم مطلوب');
        return;
      }

      // Phone validation
      const phoneValidationError = validateLibyanPhone(phone);
      if (phoneValidationError) {
        setPhoneError(ERROR_MESSAGES[phoneValidationError] || 'رقم هاتف غير صالح');
        return;
      }
    }

    setLoading(true);
    try {
      if (isLogin) {
        await signIn(email, password);
      } else {
        const normalizedPhone = normalizeLibyanPhone(phone);
        await signUp(email, password, username, normalizedPhone);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(mapError(msg));
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
      {/* Ambient glow */}
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
              type="button"
              onClick={() => switchTab(true)}
              className="flex-1 py-2 rounded-[10px] text-sm font-bold transition-all duration-200"
              style={isLogin
                ? { background: 'var(--card)', color: 'var(--text-1)', boxShadow: 'var(--shadow)' }
                : { color: 'var(--text-3)' }}
            >
              {ar ? 'تسجيل الدخول' : 'Sign In'}
            </button>
            <button
              type="button"
              onClick={() => switchTab(false)}
              className="flex-1 py-2 rounded-[10px] text-sm font-bold transition-all duration-200"
              style={!isLogin
                ? { background: 'var(--card)', color: 'var(--text-1)', boxShadow: 'var(--shadow)' }
                : { color: 'var(--text-3)' }}
            >
              {ar ? 'إنشاء حساب' : 'Sign Up'}
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username — signup only */}
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
                    autoComplete="username"
                  />
                </div>
              </div>
            )}

            {/* Email */}
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
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Libyan phone — signup only */}
            {!isLogin && (
              <LibyanPhoneInput
                value={phone}
                onChange={v => { setPhone(v); setPhoneError(null); }}
                error={phoneError}
              />
            )}

            {/* Password */}
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
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: 'var(--text-3)', insetInlineEnd: '14px' }}
                  tabIndex={-1}
                >
                  {showPassword
                    ? <EyeOff className="w-4 h-4" strokeWidth={1.5} />
                    : <Eye className="w-4 h-4" strokeWidth={1.5} />}
                </button>
              </div>
            </div>

            {/* Error */}
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
                  : (ar ? 'إنشاء الحساب' : 'Create Account')}
            </button>
          </form>

          <p className="mt-5 text-center text-xs" style={{ color: 'var(--text-3)' }}>
            {isLogin
              ? (ar ? 'ليس لديك حساب؟' : "Don't have an account?")
              : (ar ? 'لديك حساب بالفعل؟' : 'Already have an account?')}
            {' '}
            <button
              type="button"
              onClick={() => switchTab(!isLogin)}
              className="font-bold transition-colors"
              style={{ color: 'var(--gold)' }}
            >
              {isLogin
                ? (ar ? 'أنشئ حسابًا' : 'Sign up')
                : (ar ? 'سجّل الدخول' : 'Sign in')}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};
