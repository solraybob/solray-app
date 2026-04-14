"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * SecurePay Callback Page
 *
 * Borgun redirects here after the user enters their card.
 * The token and card info arrive as URL query params.
 * We forward them to /subscribe which handles the attach logic.
 */
export default function SecurePayCallback() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    // Forward all Borgun params to the subscribe page
    const query = params.toString();
    router.replace(`/subscribe${query ? `?${query}` : ""}`);
  }, [router, params]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-amber/30 border-t-amber rounded-full animate-spin" />
    </div>
  );
}
