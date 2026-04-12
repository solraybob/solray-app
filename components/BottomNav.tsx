"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Active nav colors pull from the aged-pigment palette. Today keeps
// amber-sun (the hero), Chat gets wisteria (Higher Self, dreamy),
// Souls gets indigo (the field, depth), Profile gets moss (rooted self).
const navItems = [
  {
    href: "/today",
    label: "Today",
    color: "#e8821a", // amber-sun — hero

    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="5"/>
        <line x1="12" y1="1" x2="12" y2="3"/>
        <line x1="12" y1="21" x2="12" y2="23"/>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
        <line x1="1" y1="12" x2="3" y2="12"/>
        <line x1="21" y1="12" x2="23" y2="12"/>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
      </svg>
    ),
  },
  {
    href: "/chat",
    label: "Chat",
    color: "#7d6680", // wisteria
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
  },
  {
    href: "/souls",
    label: "Souls",
    color: "#4a6670", // indigo
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
  },
  {
    href: "/profile",
    label: "Profile",
    color: "#6b7d4a", // moss
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
    ),
  },
];

const NAV_ROUTES = ["/today", "/chat", "/souls", "/profile"];

export default function BottomNav() {
  const pathname = usePathname();

  // Only show on the four main nav screens
  if (!NAV_ROUTES.includes(pathname)) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-forest-dark border-t border-forest-border nav-safe">
      <div className="flex items-center justify-around max-w-lg mx-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-1 py-3 px-2 transition-all duration-200"
              style={{ color: isActive ? item.color : "#4a5e4d" }}
            >
              {item.icon}
              <span
                className="text-[9px] font-body tracking-wider uppercase"
                style={{ color: isActive ? item.color : "#4a5e4d" }}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
