import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  detectPlatform,
  urlBase64ToUint8Array,
  fetchVapidPublicKey,
  sha256Hex,
  getBrowserFamily,
  type PlatformInfo,
  type PushState,
  type PushDiagnostics,
  type PushErrorCode,
  ERROR_MESSAGES_AR,
} from '../lib/push-platform';

export type { PlatformInfo, PushState, PushDiagnostics, PushErrorCode };

const DISMISSAL_KEY = 'axie_push_dismissal';
const DISMISSAL_DELAYS = [7 * 24 * 3600_000, 30 * 24 * 3600_000]; // 7 days, 30 days

export function usePushNotifications() {
  const { user, loading: authLoading } = useAuth();
  const [platform] = useState<PlatformInfo>(() => detectPlatform());
  const [state, setState] = useState<PushState>('INITIALIZING');
  const [loading, setLoading] = useState(false);
  const [errorCode, setErrorCode] = useState<PushErrorCode | null>(null);
  const [diagnostics, setDiagnostics] = useState<PushDiagnostics | null>(null);
  const subscriptionRef = useRef<PushSubscription | null>(null);
  const vapidKeyRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = user?.id ?? null;

  // ── SW message handler ──────────────────────────────────────────
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_SUBSCRIPTION_CHANGED' && event.data.subscription) {
        registerSubscriptionWithBackend(event.data.subscription).then(() => refreshStatus());
      }
      if (event.data?.type === 'NOTIFICATION_CLICK' && event.data.url) {
        window.location.hash = event.data.url;
        if (event.data.notification_id) {
          supabase.rpc('ack_notification_opened', { p_notification_id: event.data.notification_id }).then(() => {});
        }
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  // ── Diagnose: run full state machine ─────────────────────────────
  const diagnose = useCallback(async (): Promise<PushDiagnostics> => {
    const userId = userIdRef.current;
    const origin = window.location.origin;
    const isSecure = origin.startsWith('https://') || origin.startsWith('http://localhost');

    const diag: PushDiagnostics = {
      state: 'INITIALIZING',
      permissionStatus: 'Notification' in window ? Notification.permission : 'unsupported',
      serviceWorkerReady: false,
      serviceWorkerControlled: false,
      serviceWorkerScope: null,
      browserSubscriptionExists: false,
      databaseSubscriptionExists: false,
      databaseSubscriptionActive: false,
      currentOrigin: origin,
      currentAuthUserExists: !!userId,
      activeDeviceCount: 0,
      vapidConfigured: !!vapidKeyRef.current,
      lastError: errorCode,
    };

    // Platform checks
    if (!platform.supports.notificationApi || !platform.supports.serviceWorker || !platform.supports.pushManager) {
      diag.state = 'UNSUPPORTED';
      setDiagnostics(diag);
      return diag;
    }

    if (!isSecure) {
      diag.state = 'INSECURE_ORIGIN';
      setDiagnostics(diag);
      return diag;
    }

    if (platform.isIOS && !platform.isStandalone) {
      diag.state = 'IOS_REQUIRES_INSTALL';
      setDiagnostics(diag);
      return diag;
    }

    if (platform.isIOS && platform.iosVersion !== null && platform.iosVersion < 16) {
      diag.state = 'IOS_VERSION_UNSUPPORTED';
      setDiagnostics(diag);
      return diag;
    }

    if (!userId) {
      diag.state = 'UNAUTHENTICATED';
      setDiagnostics(diag);
      return diag;
    }

    // Permission check
    if (Notification.permission === 'denied') {
      diag.state = 'PERMISSION_DENIED';
      setDiagnostics(diag);
      return diag;
    }

    if (Notification.permission === 'default') {
      diag.state = 'PERMISSION_DEFAULT';
      setDiagnostics(diag);
      return diag;
    }

    // Permission granted — check SW
    let reg: ServiceWorkerRegistration | null = null;
    try {
      reg = await navigator.serviceWorker.ready;
      diag.serviceWorkerReady = true;
      diag.serviceWorkerScope = reg.scope;
    } catch {
      diag.state = 'PERMISSION_GRANTED_NO_SERVICE_WORKER';
      setDiagnostics(diag);
      return diag;
    }

    diag.serviceWorkerControlled = !!navigator.serviceWorker.controller;

    // Check browser subscription
    let sub: PushSubscription | null = null;
    try {
      sub = await reg.pushManager.getSubscription();
    } catch {
      sub = null;
    }

    diag.browserSubscriptionExists = !!sub;
    subscriptionRef.current = sub;

    if (!sub) {
      diag.state = 'PERMISSION_GRANTED_NO_BROWSER_SUBSCRIPTION';
      setDiagnostics(diag);
      return diag;
    }

    // Check DB row
    const endpointHash = await sha256Hex(sub.endpoint);
    const { data: dbRow } = await supabase
      .from('push_subscriptions')
      .select('id, is_active, user_id, origin')
      .eq('endpoint_hash', endpointHash)
      .maybeSingle();

    diag.databaseSubscriptionExists = !!dbRow;
    diag.databaseSubscriptionActive = dbRow?.is_active ?? false;

    // Active device count
    const { data: diagData } = await supabase.rpc('get_my_push_diagnostics');
    diag.activeDeviceCount = diagData?.active_devices ?? 0;

    // Determine final state
    if (!dbRow) {
      diag.state = 'BROWSER_SUBSCRIPTION_NOT_REGISTERED';
    } else if (!dbRow.is_active) {
      diag.state = 'DATABASE_SUBSCRIPTION_INACTIVE';
    } else if (dbRow.user_id !== userId) {
      diag.state = 'REPAIR_REQUIRED';
    } else {
      diag.state = 'ACTIVE';
    }

    setDiagnostics(diag);
    return diag;
  }, [platform, errorCode]);

  // ── Run diagnosis on mount and when auth changes ────────────────
  useEffect(() => {
    if (authLoading) return;
    diagnose().then((diag) => setState(diag.state));
  }, [authLoading, user?.id, diagnose]);

  // ── Register subscription with backend ──────────────────────────
  const registerSubscriptionWithBackend = useCallback(async (subJson: any): Promise<boolean> => {
    const userId = userIdRef.current;
    if (!userId) {
      setErrorCode('AUTH_SESSION_MISSING');
      return false;
    }

    const endpoint = subJson.endpoint;
    const p256dh = subJson.keys?.p256dh ?? '';
    const auth = subJson.keys?.auth ?? '';

    if (!endpoint || !p256dh || !auth) {
      setErrorCode('SUBSCRIPTION_KEYS_MISSING');
      return false;
    }

    const origin = window.location.origin;
    const { data, error: rpcErr } = await supabase.rpc('register_push_subscription', {
      p_endpoint: endpoint,
      p_p256dh: p256dh,
      p_auth: auth,
      p_origin: origin,
      p_platform: platform.isIOS ? 'ios' : platform.isAndroid ? 'android' : 'desktop',
      p_browser: getBrowserFamily(),
      p_device_label: platform.isIOS ? 'iPhone/iPad' : platform.isAndroid ? 'Android' : 'Desktop',
      p_user_agent: navigator.userAgent.slice(0, 200),
    });

    if (rpcErr) {
      console.error('[AXIE Push] register_push_subscription RPC error:', rpcErr.message);
      setErrorCode('DATABASE_REGISTRATION_FAILED');
      return false;
    }

    if (data && typeof data === 'object' && data.success === false) {
      console.error('[AXIE Push] register_push_subscription rejected:', data.error);
      const errCode = data.error as PushErrorCode;
      setErrorCode(errCode || 'DATABASE_REGISTRATION_FAILED');
      return false;
    }

    return true;
  }, [platform]);

  // ── requestAndRegister: full subscription flow ───────────────────
  const requestAndRegister = useCallback(async (): Promise<boolean> => {
    if (inFlightRef.current) return false;
    inFlightRef.current = true;
    setLoading(true);
    setErrorCode(null);

    try {
      const userId = userIdRef.current;
      if (!userId) {
        setErrorCode('AUTH_SESSION_MISSING');
        setState('UNAUTHENTICATED');
        return false;
      }

      const origin = window.location.origin;
      if (!origin.startsWith('https://') && !origin.startsWith('http://localhost')) {
        setErrorCode('INSECURE_ORIGIN');
        setState('INSECURE_ORIGIN');
        return false;
      }

      if (platform.isIOS && !platform.isStandalone) {
        setErrorCode('IOS_INSTALL_REQUIRED');
        setState('IOS_REQUIRES_INSTALL');
        return false;
      }

      if (!platform.supports.notificationApi || !platform.supports.serviceWorker || !platform.supports.pushManager) {
        setErrorCode('UNSUPPORTED_BROWSER');
        setState('UNSUPPORTED');
        return false;
      }

      // Request permission (must be from user gesture)
      const permission = await Notification.requestPermission();
      if (permission === 'denied') {
        setErrorCode('PERMISSION_DENIED');
        setState('PERMISSION_DENIED');
        return false;
      }
      if (permission !== 'granted') {
        setErrorCode('PERMISSION_DISMISSED');
        setState('PERMISSION_DEFAULT');
        return false;
      }

      // SW ready
      let reg: ServiceWorkerRegistration;
      try {
        reg = await navigator.serviceWorker.ready;
      } catch {
        setErrorCode('SERVICE_WORKER_NOT_READY');
        setState('PERMISSION_GRANTED_NO_SERVICE_WORKER');
        return false;
      }

      // Fetch VAPID key
      if (!vapidKeyRef.current) {
        vapidKeyRef.current = await fetchVapidPublicKey();
      }
      const vapidKey = vapidKeyRef.current;
      if (!vapidKey) {
        setErrorCode('VAPID_PUBLIC_KEY_MISSING');
        setState('ERROR');
        return false;
      }

      // Get or create subscription
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        try {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey),
          });
        } catch (err: any) {
          console.error('[AXIE Push] pushManager.subscribe failed:', err);
          setErrorCode('BROWSER_SUBSCRIBE_FAILED');
          setState('ERROR');
          return false;
        }
      }

      subscriptionRef.current = sub;

      // Register with DB
      const ok = await registerSubscriptionWithBackend(sub.toJSON());
      if (!ok) {
        setState('REPAIR_REQUIRED');
        return false;
      }

      // Verify DB row
      const endpointHash = await sha256Hex(sub.endpoint);
      const { data: verifyRow } = await supabase
        .from('push_subscriptions')
        .select('id, is_active, user_id')
        .eq('endpoint_hash', endpointHash)
        .maybeSingle();

      if (!verifyRow || !verifyRow.is_active || verifyRow.user_id !== userId) {
        setErrorCode('DATABASE_VERIFICATION_FAILED');
        setState('REPAIR_REQUIRED');
        return false;
      }

      setState('ACTIVE');
      await diagnose();
      return true;
    } catch (err: any) {
      console.error('[AXIE Push] requestAndRegister unexpected error:', err);
      setErrorCode('BROWSER_SUBSCRIBE_FAILED');
      setState('ERROR');
      return false;
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [platform, registerSubscriptionWithBackend, diagnose]);

  // ── repairCurrentDevice: re-link browser subscription to DB ──────
  const repairCurrentDevice = useCallback(async (): Promise<boolean> => {
    if (inFlightRef.current) return false;
    inFlightRef.current = true;
    setLoading(true);
    setErrorCode(null);

    try {
      const userId = userIdRef.current;
      if (!userId) {
        setErrorCode('AUTH_SESSION_MISSING');
        return false;
      }

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();

      if (!sub) {
        // Need to create subscription
        if (!vapidKeyRef.current) {
          vapidKeyRef.current = await fetchVapidPublicKey();
        }
        const vapidKey = vapidKeyRef.current;
        if (!vapidKey) {
          setErrorCode('VAPID_PUBLIC_KEY_MISSING');
          return false;
        }

        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
      }

      subscriptionRef.current = sub;

      // Unsubscribe old + create new if needed (key mismatch repair)
      // For now just re-register existing
      const ok = await registerSubscriptionWithBackend(sub.toJSON());
      if (!ok) {
        setState('REPAIR_REQUIRED');
        return false;
      }

      // Verify
      const endpointHash = await sha256Hex(sub.endpoint);
      const { data: verifyRow } = await supabase
        .from('push_subscriptions')
        .select('id, is_active, user_id')
        .eq('endpoint_hash', endpointHash)
        .maybeSingle();

      if (!verifyRow || !verifyRow.is_active || verifyRow.user_id !== userId) {
        setErrorCode('DATABASE_VERIFICATION_FAILED');
        setState('REPAIR_REQUIRED');
        return false;
      }

      setState('ACTIVE');
      await diagnose();
      return true;
    } catch (err: any) {
      console.error('[AXIE Push] repairCurrentDevice error:', err);
      setErrorCode('DATABASE_REGISTRATION_FAILED');
      setState('ERROR');
      return false;
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [registerSubscriptionWithBackend, diagnose]);

  // ── deactivateCurrentDevice ──────────────────────────────────────
  const deactivateCurrentDevice = useCallback(async (): Promise<boolean> => {
    try {
      if (subscriptionRef.current) {
        const endpoint = subscriptionRef.current.endpoint;
        await subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
        await supabase.rpc('deactivate_push_subscription', { p_endpoint: endpoint });
      } else {
        // Try to get from browser
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          const endpoint = sub.endpoint;
          await sub.unsubscribe();
          await supabase.rpc('deactivate_push_subscription', { p_endpoint: endpoint });
        }
      }
      setState('PERMISSION_GRANTED_NO_BROWSER_SUBSCRIPTION');
      await diagnose();
      return true;
    } catch (err) {
      console.error('[AXIE Push] deactivateCurrentDevice error:', err);
      return false;
    }
  }, [diagnose]);

  // ── deactivateForLogout ──────────────────────────────────────────
  const deactivateForLogout = useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await supabase.rpc('deactivate_push_subscription', { p_endpoint: sub.endpoint }).catch(() => {});
      }
    } catch {
      // Non-fatal
    }
  }, []);

  // ── refreshStatus: re-run diagnosis ───────────────────────────────
  const refreshStatus = useCallback(async () => {
    const diag = await diagnose();
    setState(diag.state);
  }, [diagnose]);

  // ── getCurrentBrowserSubscription ────────────────────────────────
  const getCurrentBrowserSubscription = useCallback(async (): Promise<PushSubscription | null> => {
    try {
      const reg = await navigator.serviceWorker.ready;
      return await reg.pushManager.getSubscription();
    } catch {
      return null;
    }
  }, []);

  // ── Dismissal tracking ───────────────────────────────────────────
  const getDismissalInfo = useCallback((): { count: number; nextPromptAt: number | null } => {
    try {
      const raw = localStorage.getItem(DISMISSAL_KEY);
      if (!raw) return { count: 0, nextPromptAt: null };
      const info = JSON.parse(raw);
      return { count: info.count ?? 0, nextPromptAt: info.nextPromptAt ?? null };
    } catch {
      return { count: 0, nextPromptAt: null };
    }
  }, []);

  const recordDismissal = useCallback(() => {
    try {
      const info = getDismissalInfo();
      const newCount = info.count + 1;
      const delay = DISMISSAL_DELAYS[Math.min(newCount - 1, DISMISSAL_DELAYS.length - 1)] ?? DISMISSAL_DELAYS[DISMISSAL_DELAYS.length - 1];
      const nextPromptAt = Date.now() + delay;
      localStorage.setItem(DISMISSAL_KEY, JSON.stringify({ count: newCount, nextPromptAt }));
    } catch {
      // Non-fatal
    }
  }, [getDismissalInfo]);

  const shouldShowPrompt = useCallback((): boolean => {
    const info = getDismissalInfo();
    if (info.count === 0) return true;
    if (info.nextPromptAt === null) return true;
    return Date.now() >= info.nextPromptAt;
  }, [getDismissalInfo]);

  const clearDismissal = useCallback(() => {
    try {
      localStorage.removeItem(DISMISSAL_KEY);
    } catch {
      // Non-fatal
    }
  }, []);

  return {
    platform,
    state,
    loading,
    errorCode,
    errorMessage: errorCode ? ERROR_MESSAGES_AR[errorCode] : null,
    diagnostics,
    requestAndRegister,
    repairCurrentDevice,
    deactivateCurrentDevice,
    deactivateForLogout,
    refreshStatus,
    diagnose,
    getCurrentBrowserSubscription,
    shouldShowPrompt,
    recordDismissal,
    clearDismissal,
    isSubscribed: state === 'ACTIVE',
    isSupported: state !== 'UNSUPPORTED' && state !== 'INSECURE_ORIGIN' && state !== 'IOS_VERSION_UNSUPPORTED',
    needsRepair: state === 'REPAIR_REQUIRED' || state === 'BROWSER_SUBSCRIPTION_NOT_REGISTERED' || state === 'DATABASE_SUBSCRIPTION_INACTIVE',
  };
}
