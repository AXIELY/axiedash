import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export type PushPermissionState =
  | 'UNSUPPORTED'
  | 'NOT_INSTALLED_IOS'
  | 'DEFAULT'
  | 'GRANTED'
  | 'DENIED'
  | 'SUBSCRIBED'
  | 'SUBSCRIPTION_FAILED'
  | 'DB_REGISTRATION_FAILED';

export interface PlatformInfo {
  isIOS: boolean;
  isAndroid: boolean;
  isDesktop: boolean;
  isStandalone: boolean;
  supportsSW: boolean;
  supportsPush: boolean;
  supportsNotification: boolean;
}

function detectPlatform(): PlatformInfo {
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  const isDesktop = !isIOS && !isAndroid;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || (navigator as any).standalone === true;
  const supportsSW = 'serviceWorker' in navigator;
  const supportsPush = 'PushManager' in window;
  const supportsNotification = 'Notification' in window;

  return { isIOS, isAndroid, isDesktop, isStandalone, supportsSW, supportsPush, supportsNotification };
}

function getBrowserFamily(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Firefox')) return 'firefox';
  if (ua.includes('Edg/')) return 'edge';
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'safari';
  if (ua.includes('Chrome')) return 'chrome';
  return 'other';
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

async function fetchVapidPublicKey(): Promise<string | null> {
  try {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-push-config`;
    const resp = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
    });
    if (!resp.ok) {
      console.error('get-push-config HTTP error:', resp.status);
      return null;
    }
    const data = await resp.json();
    if (data?.success && data.publicKey) return data.publicKey;
    console.error('get-push-config returned non-success:', data?.code || data);
    return null;
  } catch (err) {
    console.error('get-push-config fetch failed:', err);
    return null;
  }
}

export function usePushNotifications() {
  const { user } = useAuth();
  const [platform, setPlatform] = useState<PlatformInfo>(() => detectPlatform());
  const [permissionState, setPermissionState] = useState<PushPermissionState>('DEFAULT');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const subscriptionRef = useRef<PushSubscription | null>(null);
  const vapidKeyRef = useRef<string | null>(null);
  const registrationAttemptedRef = useRef(false);

  // Stable ref for user id so callbacks always see latest value
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = user?.id ?? null;

  // -- Platform detection (runs once) --
  useEffect(() => {
    const info = detectPlatform();
    setPlatform(info);

    if (!info.supportsSW || !info.supportsPush || !info.supportsNotification) {
      setPermissionState('UNSUPPORTED');
      return;
    }
    if (info.isIOS && !info.isStandalone) {
      setPermissionState('NOT_INSTALLED_IOS');
      return;
    }

    const perm = Notification.permission;
    if (perm === 'denied') {
      setPermissionState('DENIED');
    } else if (perm !== 'granted') {
      setPermissionState('DEFAULT');
    }
    // If granted, we wait for the user-dependent effect below
  }, []);

  // -- Re-run subscription check whenever user auth loads/changes --
  useEffect(() => {
    if (!user?.id) return;
    if (permissionState === 'UNSUPPORTED' || permissionState === 'NOT_INSTALLED_IOS' || permissionState === 'DENIED') return;

    const perm = Notification.permission;
    if (perm === 'granted') {
      syncSubscriptionState();
    }
  }, [user?.id]);

  // -- SW message handler --
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_SUBSCRIPTION_CHANGED' && event.data.subscription) {
        registerSubscriptionWithBackend(event.data.subscription);
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

  // Check browser subscription AND verify DB row exists
  const syncSubscriptionState = useCallback(async () => {
    const userId = userIdRef.current;
    if (!userId) {
      setPermissionState('GRANTED');
      return;
    }

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();

      if (!sub) {
        subscriptionRef.current = null;
        setPermissionState('GRANTED');
        return;
      }

      subscriptionRef.current = sub;

      // Verify DB row exists for this endpoint + user
      const endpoint = sub.endpoint;
      const endpointHash = await sha256Hex(endpoint);

      const { data: dbRow } = await supabase
        .from('push_subscriptions')
        .select('id, is_active, user_id')
        .eq('endpoint_hash', endpointHash)
        .maybeSingle();

      if (dbRow && dbRow.is_active && dbRow.user_id === userId) {
        setPermissionState('SUBSCRIBED');
      } else {
        // Browser has subscription but DB is missing/stale -- auto-repair
        const ok = await registerSubscriptionWithBackend(sub.toJSON());
        setPermissionState(ok ? 'SUBSCRIBED' : 'DB_REGISTRATION_FAILED');
      }
    } catch {
      setPermissionState('GRANTED');
    }
  }, []);

  const registerSubscriptionWithBackend = useCallback(async (subJson: any): Promise<boolean> => {
    const userId = userIdRef.current;
    if (!userId) return false;

    const info = detectPlatform();
    const { data, error: rpcErr } = await supabase.rpc('register_push_subscription', {
      p_endpoint: subJson.endpoint,
      p_p256dh: subJson.keys?.p256dh ?? '',
      p_auth_key: subJson.keys?.auth ?? '',
      p_user_agent: navigator.userAgent.slice(0, 200),
      p_platform: info.isIOS ? 'ios' : info.isAndroid ? 'android' : 'desktop',
      p_browser_family: getBrowserFamily(),
      p_device_label: info.isIOS ? 'iPhone/iPad' : info.isAndroid ? 'Android' : 'Desktop',
      p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    });

    if (rpcErr) {
      console.error('Push subscription registration failed:', rpcErr.message);
      return false;
    }

    // RPC returns jsonb -- check its success field
    if (data && typeof data === 'object' && data.success === false) {
      console.error('Push subscription registration rejected:', data.error);
      return false;
    }

    return true;
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!platform.supportsSW || !platform.supportsPush || !platform.supportsNotification) {
      setError('Push notifications are not supported on this browser');
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      const permission = await Notification.requestPermission();

      if (permission === 'denied') {
        setPermissionState('DENIED');
        setLoading(false);
        return false;
      }

      if (permission !== 'granted') {
        setPermissionState('DEFAULT');
        setLoading(false);
        return false;
      }

      const reg = await navigator.serviceWorker.ready;

      // Check for existing browser subscription first
      let sub = await reg.pushManager.getSubscription();

      if (!sub) {
        // Fetch VAPID public key from server
        if (!vapidKeyRef.current) {
          vapidKeyRef.current = await fetchVapidPublicKey();
        }

        const vapidKey = vapidKeyRef.current;
        if (!vapidKey) {
          setError('VAPID_NOT_CONFIGURED');
          setPermissionState('SUBSCRIPTION_FAILED');
          setLoading(false);
          return false;
        }

        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
      }

      subscriptionRef.current = sub;

      // Register with DB -- MUST succeed before we show "enabled"
      const ok = await registerSubscriptionWithBackend(sub.toJSON());
      if (!ok) {
        setError('DB_REGISTRATION_FAILED');
        setPermissionState('DB_REGISTRATION_FAILED');
        setLoading(false);
        return false;
      }

      setPermissionState('SUBSCRIBED');
      setLoading(false);
      return true;
    } catch (err: any) {
      console.error('Push subscription failed:', err);
      setError(err.message || 'Failed to subscribe');
      setPermissionState('SUBSCRIPTION_FAILED');
      setLoading(false);
      return false;
    }
  }, [platform, registerSubscriptionWithBackend]);

  // Repair action: re-register existing browser subscription with DB
  const repairSubscription = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();

      if (!sub) {
        // Need to create browser subscription too
        if (!vapidKeyRef.current) {
          vapidKeyRef.current = await fetchVapidPublicKey();
        }
        const vapidKey = vapidKeyRef.current;
        if (!vapidKey) {
          setError('VAPID_NOT_CONFIGURED');
          setLoading(false);
          return false;
        }

        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
      }

      subscriptionRef.current = sub;
      const ok = await registerSubscriptionWithBackend(sub.toJSON());
      if (!ok) {
        setError('DB_REGISTRATION_FAILED');
        setPermissionState('DB_REGISTRATION_FAILED');
        setLoading(false);
        return false;
      }

      setPermissionState('SUBSCRIBED');
      setLoading(false);
      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to repair subscription');
      setLoading(false);
      return false;
    }
  }, [registerSubscriptionWithBackend]);

  const unsubscribe = useCallback(async () => {
    try {
      if (subscriptionRef.current) {
        const endpoint = subscriptionRef.current.endpoint;
        await subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
        await supabase.rpc('deactivate_push_subscription', { p_endpoint: endpoint });
      }
      setPermissionState('GRANTED');
    } catch (err) {
      console.error('Unsubscribe failed:', err);
    }
  }, []);

  const deactivateForLogout = useCallback(async () => {
    if (subscriptionRef.current) {
      const endpoint = subscriptionRef.current.endpoint;
      await supabase.rpc('deactivate_push_subscription', { p_endpoint: endpoint }).catch(() => {});
    }
  }, []);

  return {
    platform,
    permissionState,
    loading,
    error,
    requestPermission,
    repairSubscription,
    unsubscribe,
    deactivateForLogout,
    isSubscribed: permissionState === 'SUBSCRIBED',
  };
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
