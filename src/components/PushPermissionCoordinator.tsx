import { useState, useEffect, useRef } from 'react';
import { Bell, X, Share, Home, ChevronRight, Sparkles } from 'lucide-react';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useLanguage } from '../contexts/LanguageContext';

/**
 * PushPermissionCoordinator
 *
 * Mounted once at the authenticated application root.
 * Shows a branded in-app permission sheet (NOT the native prompt) when:
 * - auth is resolved and user is logged in
 * - push state is PERMISSION_DEFAULT or PERMISSION_GRANTED_NO_BROWSER_SUBSCRIPTION
 * - no blocking modal is open
 * - dismissal cooldown has elapsed
 *
 * Does NOT call Notification.requestPermission() automatically.
 * The native prompt only fires when the user clicks "تفعيل الإشعارات".
 */
export function PushPermissionCoordinator() {
  const { language } = useLanguage();
  const {
    state,
    loading,
    platform,
    requestAndRegister,
    shouldShowPrompt,
    recordDismissal,
  } = usePushNotifications();

  const [visible, setVisible] = useState(false);
  const [installGuideVisible, setInstallGuideVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check for blocking modals
  const hasBlockingModal = (): boolean => {
    // DailyLoginModal uses z-50 fixed overlay
    return document.querySelector('[data-blocking-modal="true"]') !== null;
  };

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    // Wait for auth to resolve and state machine to settle
    if (state === 'INITIALIZING' || state === 'UNAUTHENTICATED') {
      setVisible(false);
      setInstallGuideVisible(false);
      return;
    }

    // iOS requires install — show install guide
    if (state === 'IOS_REQUIRES_INSTALL') {
      timerRef.current = setTimeout(() => {
        if (!hasBlockingModal()) setInstallGuideVisible(true);
      }, 1500);
      return;
    }

    // Don't show for these states
    if (
      state === 'ACTIVE' ||
      state === 'UNSUPPORTED' ||
      state === 'INSECURE_ORIGIN' ||
      state === 'PERMISSION_DENIED' ||
      state === 'IOS_VERSION_UNSUPPORTED' ||
      state === 'PERMISSION_GRANTED_NO_SERVICE_WORKER'
    ) {
      setVisible(false);
      setInstallGuideVisible(false);
      return;
    }

    // Show soft prompt for PERMISSION_DEFAULT or PERMISSION_GRANTED_NO_BROWSER_SUBSCRIPTION
    if (state === 'PERMISSION_DEFAULT' || state === 'PERMISSION_GRANTED_NO_BROWSER_SUBSCRIPTION') {
      if (!shouldShowPrompt()) return;

      timerRef.current = setTimeout(() => {
        if (!hasBlockingModal()) setVisible(true);
      }, 1500);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state, shouldShowPrompt]);

  const handleEnable = async () => {
    setBusy(true);
    const ok = await requestAndRegister();
    setBusy(false);
    setVisible(false);
    if (ok) {
      // Success — sheet closes, state becomes ACTIVE
    }
  };

  const handleDismiss = () => {
    setVisible(false);
    recordDismissal();
  };

  const handleInstallUnderstood = () => {
    setInstallGuideVisible(false);
  };

  if (!visible && !installGuideVisible) return null;

  // ── iOS Install Guide ─────────────────────────────────────────────
  if (installGuideVisible) {
    return (
      <div
        className="fixed inset-0 z-40 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}
      >
        <div
          className="relative w-full max-w-sm rounded-3xl p-6"
          style={{
            background: 'linear-gradient(145deg, #15122b, #0a0818)',
            border: '1px solid rgba(214,180,123,0.2)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }}
        >
          <button
            onClick={() => setInstallGuideVisible(false)}
            className="absolute top-4 left-4 w-8 h-8 rounded-full flex items-center justify-center transition-colors"
            style={{ background: 'rgba(255,255,255,0.05)' }}
          >
            <X className="w-4 h-4 text-white/60" />
          </button>

          <div className="text-center mb-5">
            <div
              className="w-16 h-16 rounded-2xl mx-auto mb-3 flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, rgba(214,180,123,0.2), rgba(214,180,123,0.05))' }}
            >
              <Home className="w-8 h-8" style={{ color: '#d6b47b' }} />
            </div>
            <h2 className="text-lg font-bold text-white mb-1">
              {language === 'ar' ? 'ثبّت AXIE لتفعيل الإشعارات' : 'Install AXIE for Notifications'}
            </h2>
            <p className="text-xs text-white/50">
              {language === 'ar' ? 'الإشعارات الفورية تعمل فقط بعد تثبيت AXIE على جهازك' : 'Push notifications require installing AXIE first'}
            </p>
          </div>

          <div className="space-y-3">
            {[
              { icon: Share, text: language === 'ar' ? 'اضغط زر المشاركة' : 'Tap the Share button' },
              { icon: Home, text: language === 'ar' ? 'اختر "إضافة إلى الشاشة الرئيسية"' : 'Select "Add to Home Screen"' },
              { icon: ChevronRight, text: language === 'ar' ? 'افتح AXIE من الأيقونة الجديدة' : 'Open AXIE from the new icon' },
              { icon: Bell, text: language === 'ar' ? 'اضغط "تفعيل الإشعارات"' : 'Tap "Enable Notifications"' },
            ].map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold" style={{ background: 'rgba(214,180,123,0.15)', color: '#d6b47b' }}>
                    {i + 1}
                  </div>
                  <Icon className="w-4 h-4 text-white/40 shrink-0" />
                  <span className="text-sm text-white/80">{step.text}</span>
                </div>
              );
            })}
          </div>

          <button
            onClick={handleInstallUnderstood}
            className="w-full mt-5 py-3 rounded-xl font-bold text-sm transition-all"
            style={{ background: 'linear-gradient(135deg, #d6b47b, #c9a050)', color: '#0a0818' }}
          >
            {language === 'ar' ? 'فهمت' : 'Got it'}
          </button>

          <button
            onClick={() => window.location.reload()}
            className="w-full mt-2 py-2.5 rounded-xl text-xs font-medium text-white/50 transition-colors hover:text-white/70"
          >
            {language === 'ar' ? 'تحقق مجددًا' : 'Check again'}
          </button>
        </div>
      </div>
    );
  }

  // ── Soft Permission Sheet ─────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={handleDismiss}
    >
      <div
        className="relative w-full max-w-sm rounded-t-3xl sm:rounded-3xl p-6 animate-in"
        style={{
          background: 'linear-gradient(145deg, #15122b, #0a0818)',
          border: '1px solid rgba(214,180,123,0.2)',
          boxShadow: '0 -10px 40px rgba(0,0,0,0.4)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center mb-5">
          <div
            className="w-16 h-16 rounded-2xl mx-auto mb-3 flex items-center justify-center relative"
            style={{ background: 'linear-gradient(135deg, rgba(214,180,123,0.2), rgba(214,180,123,0.05))' }}
          >
            <Bell className="w-8 h-8" style={{ color: '#d6b47b' }} />
            <Sparkles className="w-4 h-4 absolute -top-1 -right-1" style={{ color: '#d6b47b' }} />
          </div>
          <h2 className="text-lg font-bold text-white mb-1">
            {language === 'ar' ? 'فعّل إشعارات AXIE' : 'Enable AXIE Notifications'}
          </h2>
          <p className="text-xs text-white/50">
            {language === 'ar' ? 'كن أول من يعرف' : 'Be the first to know'}
          </p>
        </div>

        <div className="space-y-2.5 mb-5">
          {[
            language === 'ar' ? 'نتائج المسابقات' : 'Competition results',
            language === 'ar' ? 'الجوائز' : 'Prizes & rewards',
            language === 'ar' ? 'تحديثات الطلبات' : 'Order updates',
            language === 'ar' ? 'رسائل التسليم' : 'Delivery messages',
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2.5 p-2.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(214,180,123,0.15)' }}>
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#d6b47b' }} />
              </div>
              <span className="text-sm text-white/80">{item}</span>
            </div>
          ))}
        </div>

        <button
          onClick={handleEnable}
          disabled={busy || loading}
          className="w-full py-3.5 rounded-xl font-bold text-sm transition-all"
          style={{
            background: busy || loading ? 'rgba(214,180,123,0.3)' : 'linear-gradient(135deg, #d6b47b, #c9a050)',
            color: '#0a0818',
            opacity: busy || loading ? 0.6 : 1,
          }}
        >
          {busy || loading
            ? (language === 'ar' ? 'جارٍ التفعيل...' : 'Activating...')
            : (language === 'ar' ? 'تفعيل الإشعارات' : 'Enable Notifications')}
        </button>

        <button
          onClick={handleDismiss}
          disabled={busy || loading}
          className="w-full mt-2 py-2.5 rounded-xl text-xs font-medium text-white/40 transition-colors hover:text-white/60"
        >
          {language === 'ar' ? 'ليس الآن' : 'Not now'}
        </button>
      </div>
    </div>
  );
}
