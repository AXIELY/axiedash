// ────────────────────────────────────────────────────────────────
// Platform Detection — Single authoritative cross-platform detector
// ────────────────────────────────────────────────────────────────

export type PlatformType =
  | 'WINDOWS'
  | 'MACOS'
  | 'ANDROID'
  | 'IOS'
  | 'IPADOS'
  | 'LINUX'
  | 'UNKNOWN';

export type BrowserType =
  | 'CHROME'
  | 'EDGE'
  | 'SAFARI'
  | 'FIREFOX'
  | 'SAMSUNG_INTERNET'
  | 'OTHER';

export type DisplayMode = 'BROWSER' | 'STANDALONE' | 'FULLSCREEN';

export interface PlatformInfo {
  platform: PlatformType;
  browser: BrowserType;
  displayMode: DisplayMode;
  isStandalone: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isDesktop: boolean;
  isMobile: boolean;
  supports: {
    notificationApi: boolean;
    serviceWorker: boolean;
    pushManager: boolean;
    installPromptSupport: boolean;
  };
  iosVersion: number | null;
}

export function detectPlatform(): PlatformInfo {
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';

  // iPadOS 13+ reports as MacIntel with touch
  const isIPadOS =
    platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  const isIPhone = /iPhone|iPod/.test(ua);
  const isIOS = isIPhone || isIPadOS;
  const isAndroid = /Android/.test(ua);
  const isMacOS = /Macintosh|MacIntel/.test(platform) && !isIPadOS;
  const isWindows = /Win/.test(platform);
  const isLinux = /Linux/.test(platform) && !isAndroid;

  let platformType: PlatformType = 'UNKNOWN';
  if (isIPadOS) platformType = 'IPADOS';
  else if (isIPhone) platformType = 'IOS';
  else if (isAndroid) platformType = 'ANDROID';
  else if (isWindows) platformType = 'WINDOWS';
  else if (isMacOS) platformType = 'MACOS';
  else if (isLinux) platformType = 'LINUX';

  let browser: BrowserType = 'OTHER';
  if (/SamsungBrowser/.test(ua)) browser = 'SAMSUNG_INTERNET';
  else if (/Edg\//.test(ua)) browser = 'EDGE';
  else if (/Chrome/.test(ua) && !/Edg\//.test(ua)) browser = 'CHROME';
  else if (/Safari/.test(ua) && !/Chrome/.test(ua)) browser = 'SAFARI';
  else if (/Firefox/.test(ua)) browser = 'FIREFOX';

  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true ||
    window.matchMedia('(display-mode: fullscreen)').matches;

  const displayMode: DisplayMode = window.matchMedia('(display-mode: fullscreen)').matches
    ? 'FULLSCREEN'
    : isStandalone
      ? 'STANDALONE'
      : 'BROWSER';

  // iOS version extraction
  let iosVersion: number | null = null;
  if (isIOS) {
    const match = ua.match(/OS (\d+)[_\d]*/);
    if (match) iosVersion = parseInt(match[1], 10);
  }

  const supports = {
    notificationApi: 'Notification' in window,
    serviceWorker: 'serviceWorker' in navigator,
    pushManager: 'PushManager' in window,
    // beforeinstallprompt only fires on Chromium browsers
    installPromptSupport: !isIOS,
  };

  return {
    platform: platformType,
    browser,
    displayMode,
    isStandalone,
    isIOS,
    isAndroid,
    isDesktop: !isIOS && !isAndroid,
    isMobile: isIOS || isAndroid,
    supports,
    iosVersion,
  };
}

// ────────────────────────────────────────────────────────────────
// Push State Machine — Authoritative states
// ────────────────────────────────────────────────────────────────

export type PushState =
  | 'INITIALIZING'
  | 'UNAUTHENTICATED'
  | 'UNSUPPORTED'
  | 'INSECURE_ORIGIN'
  | 'IOS_REQUIRES_INSTALL'
  | 'IOS_VERSION_UNSUPPORTED'
  | 'PERMISSION_DEFAULT'
  | 'PERMISSION_DENIED'
  | 'PERMISSION_GRANTED_NO_SERVICE_WORKER'
  | 'PERMISSION_GRANTED_NO_BROWSER_SUBSCRIPTION'
  | 'BROWSER_SUBSCRIPTION_NOT_REGISTERED'
  | 'DATABASE_SUBSCRIPTION_INACTIVE'
  | 'ACTIVE'
  | 'REPAIR_REQUIRED'
  | 'ERROR';

export interface PushDiagnostics {
  state: PushState;
  permissionStatus: NotificationPermission | 'unsupported';
  serviceWorkerReady: boolean;
  serviceWorkerControlled: boolean;
  serviceWorkerScope: string | null;
  browserSubscriptionExists: boolean;
  databaseSubscriptionExists: boolean;
  databaseSubscriptionActive: boolean;
  currentOrigin: string;
  currentAuthUserExists: boolean;
  activeDeviceCount: number;
  vapidConfigured: boolean;
  lastError: string | null;
}

// ────────────────────────────────────────────────────────────────
// Error codes
// ────────────────────────────────────────────────────────────────

export type PushErrorCode =
  | 'UNSUPPORTED_BROWSER'
  | 'INSECURE_ORIGIN'
  | 'IOS_INSTALL_REQUIRED'
  | 'IOS_VERSION_UNSUPPORTED'
  | 'PERMISSION_DENIED'
  | 'PERMISSION_DISMISSED'
  | 'SERVICE_WORKER_NOT_READY'
  | 'SERVICE_WORKER_NOT_CONTROLLING'
  | 'VAPID_PUBLIC_KEY_MISSING'
  | 'INVALID_VAPID_PUBLIC_KEY'
  | 'BROWSER_SUBSCRIBE_FAILED'
  | 'SUBSCRIPTION_KEYS_MISSING'
  | 'AUTH_SESSION_MISSING'
  | 'DATABASE_REGISTRATION_FAILED'
  | 'DATABASE_VERIFICATION_FAILED'
  | 'ORIGIN_MISMATCH'
  | 'NO_ACTIVE_SUBSCRIPTION'
  | 'PUSH_SEND_FAILED'
  | 'SUBSCRIPTION_EXPIRED';

export const ERROR_MESSAGES_AR: Record<PushErrorCode, string> = {
  UNSUPPORTED_BROWSER: 'متصفحك لا يدعم الإشعارات الفورية',
  INSECURE_ORIGIN: 'الإشعارات تتطلب اتصال آمن HTTPS',
  IOS_INSTALL_REQUIRED: 'ثبّت AXIE على الشاشة الرئيسية لتفعيل الإشعارات',
  IOS_VERSION_UNSUPPORTED: 'هذا الإصدار من iOS لا يدعم الإشعارات الفورية',
  PERMISSION_DENIED: 'الإشعارات محظورة من إعدادات المتصفح',
  PERMISSION_DISMISSED: 'تم رفض الإذن، يمكنك تفعيله لاحقًا من الإعدادات',
  SERVICE_WORKER_NOT_READY: 'تعذر تحميل خدمة الإشعارات',
  SERVICE_WORKER_NOT_CONTROLLING: 'خدمة الإشعارات غير نشطة لهذا الرابط',
  VAPID_PUBLIC_KEY_MISSING: 'مفاتيح الإشعارات غير مكتملة',
  INVALID_VAPID_PUBLIC_KEY: 'مفتاح الإشعارات غير صالح',
  BROWSER_SUBSCRIBE_FAILED: 'تعذر إنشاء اشتراك الإشعارات في المتصفح',
  SUBSCRIPTION_KEYS_MISSING: 'مفاتيح الاشتراك مفقودة',
  AUTH_SESSION_MISSING: 'يجب تسجيل الدخول لتفعيل الإشعارات',
  DATABASE_REGISTRATION_FAILED: 'تم منح الإذن، لكن تعذر تسجيل هذا الجهاز',
  DATABASE_VERIFICATION_FAILED: 'تم التسجيل، لكن تعذر التحقق منه',
  ORIGIN_MISMATCH: 'هذا الرابط غير مسجل كجهاز إشعارات',
  NO_ACTIVE_SUBSCRIPTION: 'فعّل إشعارات المتصفح على هذا الجهاز أولاً',
  PUSH_SEND_FAILED: 'تعذر إرسال الإشعار',
  SUBSCRIPTION_EXPIRED: 'انتهت صلاحية هذا الاشتراك',
};

// ────────────────────────────────────────────────────────────────
// VAPID key utilities
// ────────────────────────────────────────────────────────────────

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

export async function fetchVapidPublicKey(): Promise<string | null> {
  try {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-push-config`;
    const resp = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
    });
    if (!resp.ok) {
      console.error('[AXIE Push] get-push-config HTTP error:', resp.status);
      return null;
    }
    const data = await resp.json();
    if (data?.success && data.publicKey) return data.publicKey;
    console.error('[AXIE Push] get-push-config non-success:', data?.code || data);
    return null;
  } catch (err) {
    console.error('[AXIE Push] get-push-config fetch failed:', err);
    return null;
  }
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function getBrowserFamily(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Firefox')) return 'firefox';
  if (ua.includes('Edg/')) return 'edge';
  if (ua.includes('SamsungBrowser')) return 'samsung_internet';
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'safari';
  if (ua.includes('Chrome')) return 'chrome';
  return 'other';
}
