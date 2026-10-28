"use client";

import { useState } from "react";
import { resendVerification } from "@/lib/subscription";
import { useT } from "@/lib/i18n";
import { HairlineButton } from "@/components/PageHead";

/** A web member whose free trial waits on email verification. */
export function ResendVerification({ token }: { token: string | null }) {
  const { t } = useT();
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const send = async () => {
    if (!token || state === "sending") return;
    setState("sending");
    try {
      await resendVerification(token);
      setState("sent");
    } catch {
      setState("failed");
    }
  };
  return (
    <div className="mb-6 space-y-3">
      {state !== "sent" && (
        <HairlineButton onClick={send} loading={state === "sending"}>
          {t("subscribe.resend_verification")}
        </HairlineButton>
      )}
      {(state === "sent" || state === "failed") && (
        <p
          className="font-body"
          role="status"
          style={{ fontSize: 15, color: state === "failed" ? "rgb(var(--rgb-ember))" : "rgb(var(--rgb-text-secondary))" }}
        >
          {state === "sent" ? t("subscribe.verification_sent") : t("subscribe.verification_send_failed")}
        </p>
      )}
    </div>
  );
}
