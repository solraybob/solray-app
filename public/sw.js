const CACHE_NAME = 'solray-v5';

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
