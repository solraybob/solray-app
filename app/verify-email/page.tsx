"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { PageHead, PageTitle, InkButton } from "@/components/PageHead";

/**
 * /verify-email?token=xxx
 *
 * User lands here from the email link. Calls the backend to verify,
 * then shows success and redirects to the app.
 */
function VerifyEmailInner() {
  const { t } = useT();
  const params = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setStatus("error");
      setMessage(t("verify.missing_token"));
      return;
    }

    apiFetch(`/users/verify-email?token=${encodeURIComponent(token)}`)
      .then((res) => {
        setStatus("success");
        setMessage(res.message || t("verify.success_message"));
        // Redirect to the app after a short pause
        setTimeout(() => router.replace("/today"), 2000);
      })
      .catch((e) => {
        setStatus("error");
        setMessage(e.message || t("verify.failed_message"));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, router]);

  return (
    <div className="min-h-[100dvh] bg-forest-deep" style={{ paddingBottom: "calc(48px + var(--sab, 0px))" }}>
      <PageHead label={t("verify.eyebrow")} />
      <div className="max-w-lg mx-auto px-5">
        {status === "loading" && (
          <div style={{ paddingTop: 18 }}>
            <div
              className="w-6 h-6 rounded-full animate-spin mb-6"
              style={{ border: "2px solid rgb(var(--rgb-border))", borderTopColor: "rgb(var(--rgb-text-primary))" }}
            />
            <p className="font-body" style={{ fontSize: 17, lineHeight: 1.62, fontWeight: 500, color: "rgb(var(--rgb-text-secondary))" }}>
              {t("verify.verifying")}
            </p>
          </div>
        )}

        {status === "success" && (
          <>
            <div style={{ paddingTop: 18 }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgb(var(--rgb-moss))" strokeWidth="2" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <PageTitle title={t("verify.verified")} sub={message} />
            <p className="font-body" style={{ fontSize: 15, color: "rgb(var(--rgb-text-muted))" }}>
              {t("verify.redirecting")}
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <PageTitle title={t("verify.failed_title")} sub={message} />
            <InkButton onClick={() => router.push("/today")}>{t("verify.go_to_app")}</InkButton>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[100dvh] bg-forest-deep flex items-center justify-center">
        <div className="w-6 h-6 rounded-full animate-spin" style={{ border: "2px solid rgb(var(--rgb-border))", borderTopColor: "rgb(var(--rgb-text-primary))" }} />
      </div>
    }>
      <VerifyEmailInner />
    </Suspense>
  );
}
