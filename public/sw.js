const CACHE_NAME = 'solray-v14';

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
  // Never cache HTML pages - always fetch fresh from network
  if (event.request.mode === 'navigate' || event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(fetch(event.request));
    return;
  }
  // For other assets, try cache first
  event.respondWith(
    caches.match(event.request).then((response) => response || fetch(event.request))
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
