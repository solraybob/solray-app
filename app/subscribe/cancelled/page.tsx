"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * /subscribe/cancelled
 *
 * Borgun redirects here if the user cancels on the SecurePay hosted page.
 * Just bounce back to /subscribe so they can try again.
 */
export default function SubscribeCancelledPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/subscribe");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-forest-deep">
      <div className="w-6 h-6 border-2 border-amber-sun/30 border-t-amber-sun rounded-full animate-spin" />
    </div>
  );
}
