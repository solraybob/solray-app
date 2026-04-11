"use client";

import { useEffect } from "react";

// Bump this version string whenever you want to force a full cache clear on all devices.
const APP_VERSION = "v15";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    const CLEARED_KEY = `solray_cache_cleared_${APP_VERSION}`;

    // One-time nuclear cache clear for this version
    if (!localStorage.getItem(CLEARED_KEY)) {
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
        // 3. Mark done so we don't loop
        localStorage.setItem(CLEARED_KEY, "1");
        // 4. Force a hard reload to get fresh assets
        window.location.reload();
      };
      doReset();
      return;
    }

    // Normal path — register service worker
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
