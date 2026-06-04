"use client";

import { useEffect } from "react";

/**
 * SplashHider — dismisses the native Capacitor splash screen as soon as the
 * web app has painted, inside the iOS/Android shell. No-op in a normal
 * browser. Uses the Capacitor global bridge so the plugin does not need to be
 * bundled into the remotely-loaded web build.
 *
 * This is the second layer of the splash fix: the native config now also
 * auto-hides the splash after a timeout (launchAutoHide: true), so the app can
 * never freeze on the splash again. This call just makes it dismiss the moment
 * content is ready instead of waiting out the timer.
 */
export default function SplashHider() {
  useEffect(() => {
    const hide = () => {
      try {
        const w = window as unknown as {
          Capacitor?: { Plugins?: { SplashScreen?: { hide?: () => void } } };
        };
        w?.Capacitor?.Plugins?.SplashScreen?.hide?.();
      } catch {
        /* not in a native shell, or plugin unavailable */
      }
    };
    // Hide now (we are mounted, so the app has rendered) and once more after a
    // beat in case the bridge attaches slightly late.
    hide();
    const t = setTimeout(hide, 600);
    return () => clearTimeout(t);
  }, []);

  return null;
}
