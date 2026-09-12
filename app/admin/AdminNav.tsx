"use client";

/**
 * The one piece of chrome every operator surface shares: the Solray wordmark
 * with the orb in place of the o, and the section pills. Mirrors the connector
 * site's nav so the operator side and the customer side are one product.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

const API_URL = ((process.env.NEXT_PUBLIC_API_URL || "https://solray-backend-production.up.railway.app").trim()).trim();

const SECTIONS: { href: string; label: string; external?: boolean }[] = [
  { href: "/admin/hub", label: "Analytics" },
  { href: "/admin/finance", label: "Finance" },
  { href: "/admin/marketing", label: "Marketing" },
  { href: "/admin/akashic-record", label: "Akashic" },
  { href: "/admin/consciousness", label: "Consciousness" },
  { href: "/admin/training", label: "Training" },
  { href: "/admin/roadmap", label: "Roadmap" },
  { href: API_URL + "/connector", label: "Connector", external: true },
];

export default function AdminNav() {
  const path = usePathname() || "";

  // The member app paints <body> in forest and, on desktop, pads it 4rem for a
  // fixed header that does not render on /admin. That left a dark band above
  // and around the operator pages. Marking the body while an admin page is
  // mounted lets admin.css take the whole surface, and removes the mark on the
  // way out so the member app is untouched.
  useEffect(() => {
    document.body.classList.add("sa-body");
    return () => document.body.classList.remove("sa-body");
  }, []);
  return (
    <div className="sa-bar">
      <a className="sa-word" href="https://solray.ai" aria-label="Solray">
        <span>s</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="sa-orb" src="/solray-orb.png" width={22} height={22} alt="" />
        <span>lray</span>
      </a>
      <nav className="sa-nav">
        {SECTIONS.map((s) =>
          s.external ? (
            <a key={s.label} className="sa-link" href={s.href} target="_blank" rel="noreferrer">
              {s.label}
            </a>
          ) : (
            <Link
              key={s.label}
              className="sa-link"
              href={s.href}
              aria-current={path.startsWith(s.href) ? "page" : undefined}
            >
              {s.label}
            </Link>
          )
        )}
      </nav>
    </div>
  );
}
