// Solray service worker — v58 (self-healing).
//
// Background: earlier service workers cached page HTML and API responses.
// After last week's backend outage, some devices got pinned to a stale,
// broken /today served from that cache. This worker fixes those devices
// AUTOMATICALLY, with zero user action: the browser always re-fetches this
// script from the network on its own update check (even on a stuck device),
// and the moment this worker activates it wipes every old cache and reloads
// each open tab once from the network. The stale screen drops by itself.
//
// It never caches HTML or API responses again. It only serves immutable
// /_next/static/ build assets from cache for speed (those are content-hashed,
// so they can never go stale). Push notifications are preserved.

const STATIC_CACHE = 'solray-v58';
const META_CACHE = 'solray-meta';        // survives wipes; tracks the one-time heal
const HEAL_KEY = '/__healed_v58';

self.addEventListener('install', () => {
  // Activate immediately, do not wait for old worker to be released.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // 1. Delete every cache from older workers (this is where stale HTML /
    //    API responses lived). Keep only our meta + current static cache.
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k !== META_CACHE && k !== STATIC_CACHE).map((k) => caches.delete(k))
    );
    // 2. Take control of every open tab right now.
    await self.clients.claim();
    // 3. One-time heal: reload each open tab once so any stale cached shell
    //    rendered by a previous worker is dropped and re-fetched from the
    //    network. Guarded by a persistent flag so routine future updates do
    //    NOT reload users mid-session.
    try {
      const meta = await caches.open(META_CACHE);
      const already = await meta.match(HEAL_KEY);
      if (!already) {
        await meta.put(HEAL_KEY, new Response('1'));
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of clients) {
          try { await client.navigate(client.url); } catch (_) { /* ignore */ }
        }
      }
    } catch (_) { /* healing is best-effort; never block activation */ }
  })());
});

self.addEventListener('fetch', (event) => {
  // Only ever touch same-origin GET requests for immutable build assets.
  // Navigations (HTML), the API, and everything cross-origin go straight to
  // the network, untouched, so a recovered backend can never be masked.
  if (event.request.method !== 'GET') return;
  let url;
  try { url = new URL(event.request.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith('/_next/static/')) return;
  event.respondWith(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((resp) => {
          if (resp && resp.status === 200) cache.put(event.request, resp.clone());
          return resp;
        });
      })
    )
  );
});

// --- Push notifications (preserved) ---
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data = {
    title: 'Transit Alert',
    body: "Check your today's forecast",
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: 'solray-transit',
  };
  try { data = { ...data, ...event.data.json() }; }
  catch (_) { data.body = event.data.text(); }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      tag: data.tag,
      requireInteraction: false,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === '/' || client.url.includes('/today')) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/today');
    })
  );
});
