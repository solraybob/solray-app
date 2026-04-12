import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import Footer from "@/components/Footer";
import SwipeNavigator from "@/components/SwipeNavigator";

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
    <html lang="en">
      <body className="bg-forest-deep min-h-screen text-text-primary">
        <AuthProvider>
          <SwipeNavigator>
            {children}
          </SwipeNavigator>
          <Footer />
        </AuthProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
