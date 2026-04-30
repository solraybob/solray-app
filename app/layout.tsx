import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import VersionCheck from "@/components/VersionCheck";
import PullToRefresh from "@/components/PullToRefresh";
import Footer from "@/components/Footer";
import SwipeNavigator from "@/components/SwipeNavigator";
import BottomNav from "@/components/BottomNav";
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
  maximumScale: 1,
  themeColor: "#050f08",
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeFoucKiller }} />
      </head>
      <body className="bg-forest-deep min-h-screen text-text-primary">
        <VersionCheck />
        <PullToRefresh />
        <ThemeProvider>
          <AuthProvider>
            <NativePushBootstrap />
            <SwipeNavigator>
              {children}
            </SwipeNavigator>
            <BottomNav />
            <Footer />
          </AuthProvider>
        </ThemeProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );

}
