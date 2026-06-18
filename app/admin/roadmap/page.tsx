"use client";

/**
 * Admin handoff to the live Roadmap (served by the backend, same pattern as
 * /admin/hub). The roadmap lives on the backend domain so it can't read the
 * app's localStorage; we forward the session token in the URL FRAGMENT, which
 * never hits a server or a log. The backend page stores it and strips the hash.
 * Non-admins are bounced by the /admin/hub/overview call the page makes.
 */

import { useEffect } from "react";

const API_URL = ((process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").trim()).trim();

export default function AdminRoadmapHandoff() {
  useEffect(() => {
    let tok = "";
    try {
      tok = localStorage.getItem("solray_token") || "";
    } catch {
      /* storage unavailable: fall through to login */
    }
    if (!tok) {
      window.location.replace("/login");
      return;
    }
    window.location.replace(`${API_URL}/admin/roadmap#tok=${encodeURIComponent(tok)}`);
  }, []);

  return <div className="min-h-[100dvh] bg-forest-deep" />;
}
