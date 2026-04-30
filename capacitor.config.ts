import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor configuration for Solray AI native shell.
 *
 * STRATEGY: Live-URL mode.
 *   The native shell loads `https://app.solray.ai` directly inside the
 *   WebView rather than bundling a static build of the web app. Reasons:
 *
 *   1. Solray's frontend is a Next.js app with server-rendered routes,
 *      a /api/build-id endpoint, and dynamic deployments on Vercel.
 *      Static export would require non-trivial refactoring AND would
 *      break version-check + auto-update.
 *
 *   2. Every web fix automatically lands in the native app on the next
 *      app launch. No store resubmission for content/bug fixes — we
 *      keep our existing rapid iteration loop.
 *
 *   3. The native pieces that genuinely need native code (push tokens,
 *      home-screen widget, Live Activities) live OUTSIDE the WebView
 *      and can talk to the web app via Capacitor's bridge.
 *
 * LIMITATIONS to revisit later:
 *   - First launch requires network. The WebView shows a brief Capacitor
 *     splash, then loads app.solray.ai. We'll polish this with a custom
 *     splash screen + a graceful "no network" fallback view.
 *   - True offline use is not possible in this mode. Service-worker
 *     caching still helps, but a hard offline state shows a loading
 *     spinner. Acceptable for v1; we can move to bundled static export
 *     later if offline becomes a priority.
 *
 * App identifiers chosen to avoid collisions:
 *   - appId: ai.solray.app  (iOS bundle id + Android applicationId)
 *   - appName: "Solray"     (display name on home screen)
 */
const config: CapacitorConfig = {
  appId: 'ai.solray.app',
  appName: 'Solray',
  webDir: 'public',  // referenced by capacitor's CLI but unused in live-URL mode
  server: {
    url: 'https://app.solray.ai',
    cleartext: false,
    // Allow our own origin + the backend so fetch() inside the WebView
    // works without CORS surprises in WKWebView.
    allowNavigation: [
      'app.solray.ai',
      'solray.ai',
      'solray-backend-production.up.railway.app',
      // Teya hosted SecurePay page — required for the in-app subscribe
      // flow to redirect to card entry without bouncing the user out
      // to a system browser.
      'securepay.borgun.is',
      'securepay.teya.com',
    ],
  },
  ios: {
    // Default to "white" status bar style (white text on dark bg) since
    // Solray's default theme is dark forest. The app controls this at
    // runtime via the status-bar plugin when the user toggles light mode.
    contentInset: 'always',
  },
  android: {
    // Allow http for local dev; production traffic is HTTPS-only.
    allowMixedContent: false,
    captureInput: true,
  },
  plugins: {
    PushNotifications: {
      // Default presentation for foreground pushes — show banner + sound,
      // even if the app is open. Without this, foreground pushes are
      // silently dropped on iOS.
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    SplashScreen: {
      // Brief splash while the WebView reaches app.solray.ai. We keep it
      // tight (1.5s max) so the native shell never feels heavy.
      launchAutoHide: false,             // we'll hide it manually after first paint
      launchShowDuration: 1500,
      backgroundColor: '#050f08',         // forest-deep
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      // Initial style; runtime calls override this when the user changes theme.
      style: 'DARK',                      // dark content (light bg) — flipped by app at runtime
      backgroundColor: '#050f08',
    },
    Keyboard: {
      // Resize the WebView when the keyboard appears so input stays visible.
      resize: 'native',
      style: 'DARK',
    },
  },
};

export default config;
