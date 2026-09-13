import type { Metadata, Viewport } from "next";
import { Zen_Kaku_Gothic_New } from "next/font/google";
import "./globals.css";

// Self-hosted, preloaded, swap-display fonts. Replaces the render-blocking
// Google Fonts @import that used to sit at the top of globals.css (a chained
// third-party round trip on every cold load). next/font inlines these
// same-origin and pins metrics so there is no FOUT flash or layout shift.
// The CSS variables below feed --font-heading / --font-body, which both
// globals.css and inline styles already reference.
// One typeface across the whole product: the connector's Zen Kaku Gothic New
// at 400/500/700/900. It feeds --font-heading and --font-body, the two
// variables globals.css and every inline style already reference.
const zen = Zen_Kaku_Gothic_New({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  variable: "--font-heading",
  display: "swap",
});
import { AuthProvider } from "@/lib/auth-context";
import { SubscriptionProvider } from "@/lib/subscription-context";
import { ThemeProvider } from "@/lib/theme-context";
import { LanguageProvider } from "@/lib/i18n";
import AnalyticsTracker from "@/components/AnalyticsTracker";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import VersionCheck from "@/components/VersionCheck";
import PullToRefresh from "@/components/PullToRefresh";
import SplashHider from "@/components/SplashHider";
import Footer from "@/components/Footer";
import SwipeNavigator from "@/components/SwipeNavigator";
import BottomNav from "@/components/BottomNav";
import DesktopHeader from "@/components/DesktopHeader";
import NativePushBootstrap from "@/components/NativePushBootstrap";

// Runs synchronously before React hydrates to set the correct theme on
// <html>, eliminating a flash of the wrong palette for users who chose
// light mode on a previous visit. Tiny, safe, self-contained.
const themeFoucKiller = `(function(){try{var t=localStorage.getItem('solray-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

// Freeze the safe-area insets at first paint.
//
// A mobile browser changes env(safe-area-inset-*) as its own chrome collapses:
// Safari reports 0 at the top while the address bar is expanded and the notch
// height once it shrinks on scroll, and the same at the bottom for its toolbar.
// Because body carries padding-top: env(safe-area-inset-top), that turned every
// scroll into the header growing and the bottom bar moving, on every page.
//
// The inset is a property of the device, not of the scroll position, so it is
// measured once here and pinned to --sat / --sab. In a browser that reads 0,
// which is right, because the browser's own chrome already holds that space.
// In the installed app and the Capacitor shell it reads the real notch, which
// is also right, and it no longer moves. Orientation genuinely changes it, so
// that one event re-measures.
const safeAreaFreeze = `(function(){try{function m(){var d=document.createElement('div');d.style.cssText='position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)';document.documentElement.appendChild(d);var c=getComputedStyle(d);var t=parseFloat(c.paddingTop)||0;var b=parseFloat(c.paddingBottom)||0;d.parentNode.removeChild(d);var r=document.documentElement.style;r.setProperty('--sat',t+'px');r.setProperty('--sab',b+'px');}m();window.addEventListener('orientationchange',function(){setTimeout(m,250);});}catch(e){}})();`;

// Capture the PWA install prompt the instant the browser offers it. Chromium
// fires `beforeinstallprompt` once, early, and only the page that calls
// preventDefault + stashes the event can later trigger the native "Add to home
// screen" dialog from a button tap. Running this before React mounts means the
// event is never missed; InstallApp then reads window.__solrayInstall.
const installPromptCapture = `(function(){try{window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__solrayInstall=e;window.dispatchEvent(new Event('solray:installable'));});window.addEventListener('appinstalled',function(){window.__solrayInstall=null;window.dispatchEvent(new Event('solray:installed'));});}catch(e){}})();`;

export const metadata: Metadata = {
  title: "Solray",
  description: "Your Higher Self, Unlocked. Live astrology, Human Design, and Gene Keys.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Solray",
  },
  icons: {
    // The app/favicon.ico convention makes Next declare sizes="16x16" on its
    // own, which points browsers at the 16 frame even on a retina tab. Naming
    // the 32 here gives them the crisp one to prefer.
    icon: [
      { url: "/icons/icon-32.png", type: "image/png", sizes: "32x32" },
    ],
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // No maximumScale: pinch-zoom must stay available (accessibility). iOS
  // Safari ignores a lock anyway; locking it only hurts Android + a11y.
  // The browser/OS chrome cannot read a CSS variable, so the two grounds are
  // written out. Light is the connector's paper, dark is the warm black.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F0E6" },
    { media: "(prefers-color-scheme: dark)", color: "#161411" },
  ],
  // viewport-fit=cover is required for env(safe-area-inset-*) to report real
  // values. Without it the insets read 0, so on Android 15 (edge-to-edge by
  // default, targetSdk 35) the WebView draws under the status bar and the
  // header rode up behind the clock. With cover, the top padding
  // (max(env(safe-area-inset-top), 20px)) gets the true status-bar height.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning is needed because the FOUC-killer below
    // mutates <html data-theme="..."> before React hydrates. Without it,
    // React would log a hydration mismatch on every cold load for users
    // who chose the non-default theme on a previous visit.
    <html lang="en" className={`${zen.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeFoucKiller }} />
        <script dangerouslySetInnerHTML={{ __html: safeAreaFreeze }} />
        <script dangerouslySetInnerHTML={{ __html: installPromptCapture }} />
      </head>
      <body className="bg-forest-deep min-h-screen text-text-primary">
        <SplashHider />
        <VersionCheck />
        <ThemeProvider>
          <LanguageProvider>
            <AuthProvider>
              <SubscriptionProvider>
                <NativePushBootstrap />
                <AnalyticsTracker />
                <DesktopHeader />
                <PullToRefresh>
                  <SwipeNavigator>
                    {children}
                  </SwipeNavigator>
                </PullToRefresh>
                <BottomNav />
                <Footer />
              </SubscriptionProvider>
            </AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );

}
