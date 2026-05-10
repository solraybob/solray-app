import { redirect } from "next/navigation";

/**
 * /admin/hive: legacy URL, kept as a permanent redirect after the
 * May 2026 rename of "Hive Mind" to "Akashic Record". Any bookmark or
 * external reference that still points here lands cleanly on the new
 * URL without breaking. The actual dashboard component lives at
 * /admin/akashic-record/page.tsx.
 *
 * Server-component redirect (no "use client") so the redirect happens
 * at request time, before any markup ships, no flash of stale content.
 */
export default function HiveLegacyRedirect() {
  redirect("/admin/akashic-record");
}
