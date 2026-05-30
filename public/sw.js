const CACHE_NAME = 'solray-v54';

// Only cache static assets, NOT HTML pages
const urlsToCache = [
  '/icons/icon-192.png',
  '/logo.jpg',
];

self.addEventListener('install', (event) => {
  // Take control immediately without waiting
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', (event) => {
  // Clear ALL old caches immediately
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // ONLY intercept same-origin GET requests for our pre-cached static
  // assets. Anything else (cross-origin to the API, page HTML, JS chunks
  // not in our short urlsToCache list) is left alone for the browser to
  // handle natively. Codex audit caught the prior version intercepting
  // every GET, which made cross-origin admin fetches throw 'Failed to
  // fetch' even when the actual network request would have succeeded.
  if (event.request.method !== 'GET') return;
  let url;
  try {
    url = new URL(event.request.url);
  } catch (_) {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Build assets under /_next/static/ are content-hashed and immutable: the
  // filename changes whenever the bytes change, so a cached entry can NEVER
  // be stale. Cache-first here makes PWA relaunch fast (JS, CSS, and the
  // self-hosted next/font files load from cache) with zero stale-JS risk.
  // Old builds' chunks are evicted when CACHE_NAME bumps on the next deploy.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request).then((resp) => {
            if (resp && resp.status === 200) cache.put(event.request, resp.clone());
            return resp;
          });
        })
      )
    );
    return;
  }

  // Pre-cached static assets (icons/logo). Everything else (HTML, the API,
  // cross-origin) is left to the browser, preserving the earlier fix that
  // stopped the SW from breaking cross-origin fetches.
  if (!urlsToCache.includes(url.pathname)) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

// Handle push notifications
self.addEventListener('push', (event) => {
  if (!event.data) {
    console.log('Push event received but no data');
    return;
  }

  let notificationData = {
    title: 'Transit Alert',
    body: 'Check your today\'s forecast',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: 'solray-transit',
  };

  try {
    notificationData = { ...notificationData, ...event.data.json() };
  } catch (_) {
    // If data is not JSON, use the text as body
    notificationData.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(notificationData.title, {
      body: notificationData.body,
      icon: notificationData.icon,
      badge: notificationData.badge,
      tag: notificationData.tag,
      requireInteraction: false,
    })
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  // Focus or open the app to the Today page
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === '/' || client.url.includes('/today')) {
          return client.focus();
        }
      }
      // If app is not open, open it to the Today page
      if (clients.openWindow) {
        return clients.openWindow('/today');
      }
    })
  );
});
