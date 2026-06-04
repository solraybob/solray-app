"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n";

/**
 * Top header that appears on desktop (lg breakpoint and above) only.
 * Mirrors the four primary destinations from BottomNav so a desktop user
 * has navigation at the top of the screen instead of buried at the bottom.
 *
 * Mobile keeps BottomNav. Desktop hides BottomNav and shows this. The two
 * are mutually exclusive via Tailwind responsive classes (hidden lg:block
 * on this one, lg:hidden on BottomNav).
 *
 * Sun mark on the left, four nav items inline on the right, all sized for
 * a desktop window. Same active-color grammar as BottomNav (each route
 * carries its theme color).
 */

const navItems = [
  { href: "/today",   labelKey: "nav.today",   color: "var(--amber)" },
  { href: "/chat",    labelKey: "nav.chat",    color: "var(--wisteria)" },
  { href: "/souls",   labelKey: "nav.souls",   color: "#6a8692" },
  { href: "/profile", labelKey: "nav.profile", color: "var(--moss)" },
];

const NAV_ROUTES = ["/today", "/chat", "/souls", "/profile", "/chart"];

export default function DesktopHeader() {
  const pathname = usePathname() || "";
  const { t } = useT();

  // Don't render on auth/onboarding/marketing/admin/etc.
  if (!NAV_ROUTES.some((r) => pathname.startsWith(r))) return null;

  return (
    <header
      className="hidden lg:block fixed top-0 left-0 right-0 z-40 backdrop-blur"
      style={{
        background: "rgb(var(--rgb-bg-deep) / 0.8)",
        borderBottom: "1px solid rgb(var(--rgb-border) / 0.6)",
      }}
    >
      <div className="max-w-5xl mx-auto px-8 h-16 flex items-center justify-between">
        {/* Brand: small sun + wordmark, lands on /today when clicked */}
        <Link href="/today" className="flex items-center gap-3 group">
          <div
            className="w-8 h-8 transition-transform group-hover:scale-110"
            style={{ filter: "drop-shadow(0 0 12px rgba(243,146,48,0.4))" }}
          >
            <Image src="/solray-sun.png" alt="" width={32} height={32} className="w-full h-full object-contain" />
          </div>
          <span
            className="font-heading text-text-primary tracking-[0.18em]"
            style={{ fontWeight: 300, fontSize: 16 }}
          >
            SOLRAY
          </span>
        </Link>

        {/* Right: four nav items */}
        <nav className="flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="px-4 py-2 rounded-lg transition-colors"
                style={{
                  color: isActive ? item.color : "var(--text-secondary)",
                  background: isActive ? "rgba(255,255,255,0.04)" : "transparent",
                }}
              >
                <span className="font-body text-[13px] tracking-[0.15em] uppercase">
                  {t(item.labelKey)}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
