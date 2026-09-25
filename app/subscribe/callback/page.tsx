"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * SecurePay Callback Page
 *
 * Borgun redirects here after the user enters their card.
 * The token and card info arrive as URL query params.
 * We forward them to /subscribe which handles the attach logic.
 */
const SPIN = { border: "2px solid rgb(var(--rgb-border))", borderTopColor: "rgb(var(--rgb-text-primary))" } as const;

function SecurePayCallbackInner() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    // Forward all Borgun params to the subscribe page
    const query = params.toString();
    router.replace(`/subscribe${query ? `?${query}` : ""}`);
  }, [router, params]);

  return (
    <div className="min-h-[100dvh] bg-forest-deep flex items-center justify-center">
      <div className="w-6 h-6 rounded-full animate-spin" style={SPIN} />
    </div>
  );
}

export default function SecurePayCallback() {
  return (
    <Suspense fallback={
      <div className="min-h-[100dvh] bg-forest-deep flex items-center justify-center">
        <div className="w-6 h-6 rounded-full animate-spin" style={SPIN} />
      </div>
    }>
      <SecurePayCallbackInner />
    </Suspense>
  );
}
