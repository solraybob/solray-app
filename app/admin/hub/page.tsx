"use client";

/**
 * Admin handoff to the Business Hub.
 *
 * The hub lives on the backend domain, so it cannot read the app's
 * localStorage. Instead of asking the operator to copy a JWT by hand
 * (nobody should ever have to do that), this page reads the session
 * token the app already holds and forwards it in the URL FRAGMENT,
 * which never leaves the browser: fragments are not sent to servers
 * or written to access logs. The hub stores it and strips the hash.
 *
 * Non-admins who wander here get bounced by the hub's own endpoints
 * (every /admin/hub/* JSON call requires admin auth server-side).
 */

import { useEffect } from "react";

const API_URL = ((process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").trim()).trim();

export default function AdminHubHandoff() {
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
    window.location.replace(`${API_URL}/admin/hub#tok=${encodeURIComponent(tok)}`);
  }, []);

  return <div className="min-h-[100dvh] bg-forest-deep" />;
}
