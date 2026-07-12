// AXIE Platform Service Worker — Push Notifications
// Do NOT add aggressive caching — Vite handles assets via hashed filenames

const ALLOWED_DEEP_LINK_PATTERNS = [
  /^\/$/,
  /^\/orders\//,
  /^\/payments\//,
  /^\/fulfillment\//,
  /^\/my-prizes/,
  /^\/games\//,
  /^\/notifications/,
  /^\/profile/,
  /^\/settings/,
];

function isSafeDeepLink(url) {
  if (!url || typeof url !== 'string') return false;
  if (url.startsWith('javascript:') || url.startsWith('data:')) return false;
  try {
    const parsed = new URL(url, self.location.origin);
    if (parsed.origin !== self.location.origin) return false;
    return ALLOWED_DEEP_LINK_PATTERNS.some(p => p.test(parsed.pathname));
  } catch {
    return ALLOWED_DEEP_LINK_PATTERNS.some(p => p.test(url));
  }
}

// ── Push event ──────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    try {
      payload = { body: event.data?.text() || '' };
    } catch {
      payload = {};
    }
  }

  const title = payload.title || 'AXIE';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    image: payload.image || undefined,
    tag: payload.tag || `axie-${Date.now()}`,
    timestamp: payload.timestamp || Date.now(),
    data: {
      url: payload.url || payload.deep_link || '/',
      notification_id: payload.notification_id || null,
      entity_type: payload.entity_type || null,
      entity_id: payload.entity_id || null,
    },
    actions: payload.actions || [],
    requireInteraction: payload.priority === 'CRITICAL' || payload.priority === 'HIGH',
    silent: payload.priority === 'LOW',
  };

  event.waitUntil(
    self.registration.showNotification(title, options).then(() => {
      // Send displayed acknowledgement
      if (payload.notification_id && payload.ack_url) {
        return fetch(payload.ack_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            notification_id: payload.notification_id,
            event: 'displayed',
          }),
        }).catch(() => {});
      }
    })
  );
});

// ── Notification click ──────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  let targetUrl = data.url || '/';

  if (!isSafeDeepLink(targetUrl)) {
    targetUrl = '/';
  }

  const fullUrl = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing AXIE window
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          client.postMessage({
            type: 'NOTIFICATION_CLICK',
            notification_id: data.notification_id,
            url: targetUrl,
          });
          return client.focus();
        }
      }
      // Open new window
      return self.clients.openWindow(fullUrl);
    })
  );
});

// ── Subscription change ─────────────────────────────────────────
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager.subscribe(event.oldSubscription?.options || {
      userVisibleOnly: true,
    }).then((newSub) => {
      // Notify any open client to re-register with backend
      return self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: 'PUSH_SUBSCRIPTION_CHANGED',
            subscription: newSub.toJSON(),
          });
        });
      });
    }).catch(() => {})
  );
});

// ── Install & activate — claim immediately, no cache management ─
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
