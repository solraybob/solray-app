"use client";

import { useEffect } from "react";

// Bump this version string whenever you want to force a full cache clear on all devices.
// v16: ships the new auto-update machinery (NEXT_PUBLIC_BUILD_ID + /api/build-id
// polling in VersionCheck). Existing users get one last forced wipe so they
// start from a clean state under the new system.
// v17: kills the prior service worker that was wrapping every fetch with
// event.respondWith, including cross-origin /admin/hive/graph fetches that
// then threw 'Failed to fetch'. New SW only intercepts same-origin assets
// in the urlsToCache list. Forces existing clients off the bad worker.
// v18: incident heal. Some devices were stuck on the old cache-everything
// worker showing a stale/broken Today from last week's backend outage. The
// nuclear reset now ALSO purges the per-day forecast/blueprint localStorage
// caches, so a pinned `_pending`/broken reading can't survive the wipe.
const APP_VERSION = "v18";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    const CLEARED_KEY = `solray_cache_cleared_${APP_VERSION}`;

    // Storage can throw (private mode, disabled cookies, partitioned
    // webviews). If it does, skip the one-time reset entirely: with no
    // storage there is nothing stale to clear, and crashing the app shell
    // before first paint is the worst possible trade.
    let cleared: string | null = "1";
    try { cleared = localStorage.getItem(CLEARED_KEY); } catch { /* no storage */ }

    // One-time nuclear cache clear for this version
    if (!cleared) {
      const doReset = async () => {
        // 1. Clear all Cache Storage
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
        // 2. Unregister all service workers
        if ("serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        }
        // 2b. Purge the per-day forecast + blueprint localStorage caches.
        // A pinned `_pending`/broken Today reading lives here, not in Cache
        // Storage, so clearing caches alone left the stale screen behind.
        try {
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const k = localStorage.key(i);
            if (k && (k.startsWith("solray_forecast") || k.startsWith("solray_blueprint"))) {
              localStorage.removeItem(k);
            }
          }
        } catch { /* ignore storage errors */ }
        // 3. Mark done so we don't loop. If this write fails we must NOT
        // reload (an unmarkable reset would loop forever).
        try { localStorage.setItem(CLEARED_KEY, "1"); } catch { return; }
        // 4. Force a hard reload to get fresh assets
        window.location.reload();
      };
      doReset();
      return;
    }

    // Normal path, register service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          if (registration.scope !== window.location.origin + "/") {
            registration.unregister().catch(() => {});
          }
        }
      });

      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((registration) => {
          console.log("Service Worker registered:", registration);
        })
        .catch((error) => {
          console.error("Service Worker registration failed:", error);
        });
    }
  }, []);

  return null;
}
