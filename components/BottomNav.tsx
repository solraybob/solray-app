"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n";

// mundane's nav, to the value. From mundane-site/app.html:
//
//   .nav{position:fixed;left:0;right:0;bottom:0;max-width:480px;margin:0 auto;
//     padding:15px var(--m) calc(17px + var(--sab, 0px));
//     display:flex;justify-content:space-between;background:var(--paper);
//     border-top:1px solid var(--line);z-index:20}
//   .nav button{font-size:13px;letter-spacing:.13em;text-transform:uppercase;
//     color:var(--ink3);padding:3px 0;position:relative}
//   .nav button.on{color:var(--ink)}
//   .nav button.on::after{content:'';left:50%;translateX(-50%);bottom:-5px;
//     width:4px;height:4px;border-radius:50%;background:var(--sun)}
//
// Every measurement is mundane's, --m is its 30px gutter, and the active
// state is its one repeated disc. Two things are ours: the names, and the
// quiet tier. mundane's --ink3 is #A79E90, which measures 2.33:1 on the
// paper; ours is #6E6659 at 4.99:1, and it is the same role in the system.
const navItems = [
  { href: "/today",   labelKey: "nav.today" },
  { href: "/chat",    labelKey: "nav.chat" },
  { href: "/souls",   labelKey: "nav.souls" },
  { href: "/profile", labelKey: "nav.profile" },
];

const NAV_ROUTES = ["/today", "/chat", "/souls", "/profile"];

export default function BottomNav() {
  const pathname = usePathname();
  const { t } = useT();

  // Only show on the four main nav screens
  if (!NAV_ROUTES.includes(pathname)) return null;

  return (
    <nav
      // display lives in the class, not the style object: an inline
      // display:flex beats the display:none that lg:hidden sets, which is why
      // desktop was showing the top bar and this one at the same time.
      className="fixed left-0 right-0 bottom-0 flex lg:hidden"
      style={{
        maxWidth: 480,
        margin: "0 auto",
        padding: "15px 30px calc(17px + var(--sab, 0px))",
        justifyContent: "space-between",
        background: "rgb(var(--rgb-bg-deep))",
        borderTop: "1px solid rgb(var(--rgb-border))",
        zIndex: 20,
      }}
    >
      <>
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const onTap = () => {
            // Make a tab tap animate in the same direction as a swipe to that
            // tab. SwipeNavigator plays its directional entrance whenever
            // sessionStorage.swipe_dir is set on a route change; without this
            // a tab tap swapped pages instantly while swipes glided, the one
            // spot the navigation felt like a web app instead of native.
            try {
              const from = NAV_ROUTES.indexOf(pathname);
              const to = NAV_ROUTES.indexOf(item.href);
              if (from !== -1 && to !== -1 && from !== to) {
                sessionStorage.setItem("swipe_dir", to > from ? "forward" : "back");
              }
            } catch { /* ignore */ }
          };
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onTap}
              className="font-body uppercase transition-colors duration-200 active:opacity-60"
              style={{
                position: "relative",
                padding: "3px 0",
                fontSize: 13,
                letterSpacing: "0.13em",
                color: isActive ? "rgb(var(--rgb-text-primary))" : "rgb(var(--rgb-text-muted))",
              }}
            >
              {t(item.labelKey)}
              {isActive && (
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: "50%",
                    transform: "translateX(-50%)",
                    bottom: -5,
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    background: "rgb(var(--rgb-amber))",
                  }}
                />
              )}
            </Link>
          );
        })}
      </>
    </nav>
  );
}
