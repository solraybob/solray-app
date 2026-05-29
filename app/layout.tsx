import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import "./globals.css";

// Self-hosted, preloaded, swap-display fonts. Replaces the render-blocking
// Google Fonts @import that used to sit at the top of globals.css (a chained
// third-party round trip on every cold load). next/font inlines these
// same-origin and pins metrics so there is no FOUT flash or layout shift.
// The CSS variables below feed --font-heading / --font-body, which both
// globals.css and inline styles already reference.
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-heading",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});
import { AuthProvider } from "@/lib/auth-context";
import { SubscriptionProvider } from "@/lib/subscription-context";
import { ThemeProvider } from "@/lib/theme-context";
import { LanguageProvider } from "@/lib/i18n";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import VersionCheck from "@/components/VersionCheck";
import PullToRefresh from "@/components/PullToRefresh";
import Footer from "@/components/Footer";
import SwipeNavigator from "@/components/SwipeNavigator";
import BottomNav from "@/components/BottomNav";
import DesktopHeader from "@/components/DesktopHeader";
import NativePushBootstrap from "@/components/NativePushBootstrap";

// Runs synchronously before React hydrates to set the correct theme on
// <html>, eliminating a flash of the wrong palette for users who chose
// light mode on a previous visit. Tiny, safe, self-contained.
const themeFoucKiller = `(function(){try{var t=localStorage.getItem('solray-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

export const metadata: Metadata = {
  title: "Solray",
  description: "Your Higher Self, Unlocked. Live astrology, Human Design, and Gene Keys.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Solray",
  },
  icons: {
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // No maximumScale: pinch-zoom must stay available (accessibility). iOS
  // Safari ignores a lock anyway; locking it only hurts Android + a11y.
  themeColor: "var(--bg-deep)",
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
    <html lang="en" className={`${cormorant.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeFoucKiller }} />
      </head>
      <body className="bg-forest-deep min-h-screen text-text-primary">
        <VersionCheck />
        <PullToRefresh />
        <ThemeProvider>
          <LanguageProvider>
            <AuthProvider>
              <SubscriptionProvider>
                <NativePushBootstrap />
                <DesktopHeader />
                <SwipeNavigator>
                  {children}
                </SwipeNavigator>
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
