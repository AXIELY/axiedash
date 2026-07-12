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
  | 'SUBSCRIPTION_FAILED';

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

export function usePushNotifications() {
  const { user } = useAuth();
  const [platform, setPlatform] = useState<PlatformInfo>(() => detectPlatform());
  const [permissionState, setPermissionState] = useState<PushPermissionState>('DEFAULT');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const subscriptionRef = useRef<PushSubscription | null>(null);

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
    } else if (perm === 'granted') {
      checkExistingSubscription();
    } else {
      setPermissionState('DEFAULT');
    }
  }, []);

  // Listen for SW messages about subscription changes
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

  const checkExistingSubscription = useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        subscriptionRef.current = sub;
        setPermissionState('SUBSCRIBED');
        if (user?.id) {
          await registerSubscriptionWithBackend(sub.toJSON());
        }
      } else {
        setPermissionState('GRANTED');
      }
    } catch {
      setPermissionState('GRANTED');
    }
  }, [user?.id]);

  const registerSubscriptionWithBackend = useCallback(async (subJson: any) => {
    if (!user?.id) return;
    const info = detectPlatform();
    const { error: rpcErr } = await supabase.rpc('register_push_subscription', {
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
      console.error('Push subscription registration failed:', rpcErr);
    }
  }, [user?.id]);

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

      // Get VAPID public key from env
      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        // Without VAPID key, subscribe without applicationServerKey (limited)
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
        });
        subscriptionRef.current = sub;
        await registerSubscriptionWithBackend(sub.toJSON());
        setPermissionState('SUBSCRIBED');
        setLoading(false);
        return true;
      }

      // Convert VAPID key
      const urlBase64ToUint8Array = (base64String: string) => {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
      };

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      subscriptionRef.current = sub;
      await registerSubscriptionWithBackend(sub.toJSON());
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

  const unsubscribe = useCallback(async () => {
    try {
      if (subscriptionRef.current) {
        const endpoint = subscriptionRef.current.endpoint;
        await subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
        // Deactivate on backend
        await supabase.rpc('deactivate_push_subscription', { p_endpoint: endpoint });
      }
      setPermissionState('GRANTED');
    } catch (err) {
      console.error('Unsubscribe failed:', err);
    }
  }, []);

  // Call on logout to prevent cross-account notifications
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
    unsubscribe,
    deactivateForLogout,
    isSubscribed: permissionState === 'SUBSCRIBED',
  };
}
