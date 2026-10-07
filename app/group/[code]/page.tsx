"use client";

// Group session links.
//
// This route used to open a shared group chat from a session record kept in
// this device's localStorage ("solray_group_sessions"). Nothing in the app
// writes that record any more, so every group link, on every device, landed on
// "Session not found, ask them to resend it", and resending could never help.
// Until group sessions are resolved by the server, the route says plainly
// that the link does not open here and points to Dynamics, where two charts
// are read together.

import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useT } from "@/lib/i18n";

export default function GroupChatPage() {
  const { t } = useT();
  const router = useRouter();
  return (
    <ProtectedRoute>
      <div className="min-h-[100dvh] bg-forest-deep flex flex-col items-center justify-center px-5 text-center">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor" className="text-amber-sun mb-4" aria-hidden="true">
          <path d="M12 2c.42 4.95 2.05 6.58 7 7-4.95.42-6.58 2.05-7 7-.42-4.95-2.05-6.58-7-7 4.95-.42 6.58-2.05 7-7z" />
        </svg>
        <h2 className="font-heading text-3xl text-text-primary mb-2">{t("group.unavailable_title")}</h2>
        <p className="text-text-secondary text-[15px] font-body mb-6 max-w-xs">
          {t("group.unavailable_body")}
        </p>
        <button
          onClick={() => router.replace("/souls")}
          className="px-6 font-body font-semibold rounded-xl text-sm"
          style={{ minHeight: 44, background: "rgb(var(--rgb-text-primary))", color: "rgb(var(--rgb-bg-deep))" }}
        >
          {t("group.back_to_souls")}
        </button>
      </div>
    </ProtectedRoute>
  );
}
