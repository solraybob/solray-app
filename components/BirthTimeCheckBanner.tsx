"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";
import { safeGet, safeSet } from "@/lib/safe-storage";
import { accountKey } from "@/lib/account-session";
import type { StoredBirthTimeCheck } from "@/lib/birth-time-fold";

// A gentle, one-time note for an existing member whose saved birth time fell
// on a clock-change night (/users/me birth_time_check.needs_confirmation).
// Their chart is never moved by the server; this only invites them to say
// which occurrence it was (or to correct a time that never happened) in
// Settings, where the same chooser as signup opens. Shown once per account
// on this device: the flag is per-user storage, swept on an account change.
const SHOWN_KEY = "solray_birth_check_prompted";

export default function BirthTimeCheckBanner({ check }: { check: StoredBirthTimeCheck | null }) {
  const { t } = useT();
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!check?.needsConfirmation || check.status === "ok") return;
    if (safeGet(accountKey(SHOWN_KEY)) === "1") return;
    safeSet(accountKey(SHOWN_KEY), "1");
    setVisible(true);
  }, [check]);

  if (!visible || !check) return null;

  return (
    <div
      className="max-w-lg mx-auto px-5 py-3"
      style={{ borderBottom: "1px solid rgb(var(--rgb-border))" }}
      role="status"
    >
      <p className="font-body font-semibold" style={{ fontSize: 15, color: "rgb(var(--rgb-text-primary))" }}>
        {t("birth_check.prompt_title")}
      </p>
      <p className="font-body" style={{ marginTop: 4, fontSize: 14, lineHeight: 1.5, color: "rgb(var(--rgb-text-secondary))" }}>
        {t(check.status === "ambiguous" ? "birth_check.prompt_ambiguous" : "birth_check.prompt_nonexistent")}
      </p>
      <div className="flex items-center gap-3" style={{ marginTop: 10 }}>
        <button
          type="button"
          onClick={() => { setVisible(false); router.push("/profile/settings?birth=confirm#birth-confirm"); }}
          className="font-body uppercase font-bold rounded-full"
          style={{
            fontSize: 11, letterSpacing: "0.2em", padding: "8px 14px", minHeight: 36,
            background: "rgb(var(--rgb-text-primary))", color: "rgb(var(--rgb-bg-deep))",
          }}
        >
          {t("birth_check.check_now")}
        </button>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="font-body"
          style={{ fontSize: 14, minHeight: 36, color: "rgb(var(--rgb-text-muted))", background: "transparent" }}
        >
          {t("birth_check.later")}
        </button>
      </div>
    </div>
  );
}
