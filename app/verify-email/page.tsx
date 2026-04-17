"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

/**
 * /verify-email?token=xxx
 *
 * User lands here from the email link. Calls the backend to verify,
 * then shows success and redirects to the app.
 */
function VerifyEmailInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setStatus("error");
      setMessage("Missing verification token.");
      return;
    }

    apiFetch(`/users/verify-email?token=${token}`)
      .then((res) => {
        setStatus("success");
        setMessage(res.message || "Email verified successfully.");
        // Redirect to the app after a short pause
        setTimeout(() => router.replace("/today"), 2000);
      })
      .catch((e) => {
        setStatus("error");
        setMessage(e.message || "Verification failed. The link may have expired.");
      });
  }, [params, router]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-sm text-center">
        {status === "loading" && (
          <>
            <div className="w-6 h-6 border-2 border-amber/30 border-t-amber rounded-full animate-spin mx-auto mb-6" />
            <p className="text-sm" style={{ color: "var(--text-secondary, #8a9e8d)" }}>
              Verifying your email...
            </p>
          </>
        )}

        {status === "success" && (
          <>
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{ background: "rgba(107,125,74,0.15)" }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6b7d4a" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h1
              className="text-2xl font-light mb-3"
              style={{ fontFamily: "var(--font-heading, 'Cormorant Garamond', Georgia, serif)" }}
            >
              Verified
            </h1>
            <p className="text-sm" style={{ color: "var(--text-secondary, #8a9e8d)" }}>
              {message}
            </p>
            <p className="text-xs mt-4" style={{ color: "var(--text-secondary, #8a9e8d)" }}>
              Redirecting you now...
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{ background: "rgba(196,98,58,0.15)" }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#c4623a" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
            <h1
              className="text-2xl font-light mb-3"
              style={{ fontFamily: "var(--font-heading, 'Cormorant Garamond', Georgia, serif)" }}
            >
              Verification Failed
            </h1>
            <p className="text-sm mb-6" style={{ color: "var(--text-secondary, #8a9e8d)" }}>
              {message}
            </p>
            <button
              onClick={() => router.push("/today")}
              className="px-6 py-2.5 rounded-sm text-sm"
              style={{ background: "var(--amber, #e8821a)", color: "#050f08" }}
            >
              Go to App
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-amber/30 border-t-amber rounded-full animate-spin" />
      </div>
    }>
      <VerifyEmailInner />
    </Suspense>
  );
}
