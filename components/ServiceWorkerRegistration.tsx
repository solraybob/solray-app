"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        // Unregister old registrations from different scopes to prevent conflicts
        for (const registration of registrations) {
          if (registration.scope !== "/") {
            registration.unregister().catch(() => {
              // Ignore unregister errors
            });
          }
        }
      });

      // Register the service worker
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((registration) => {
          console.log("Service Worker registered successfully:", registration);
        })
        .catch((error) => {
          console.error("Service Worker registration failed:", error);
        });
    }
  }, []);

  return null;
}
