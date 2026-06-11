"use client";

/**
 * Inline card form for the /subscribe page.
 *
 * Tokenizes in the browser (lib/teya-card.ts, PAN goes straight to Borgun),
 * then posts the single-use token to /subscribe/attach-card-token, which
 * stores a multi-use token and settles any payment already due. Replaces
 * the SecurePay redirect so every saved card is chargeable monthly.
 */

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { createSingleUseToken, luhnValid, CardTokenError } from "@/lib/teya-card";
import { useT } from "@/lib/i18n";

export type CardSaveResult = {
  saved: boolean;
  card_brand: string;
  card_last_four: string;
  charged: boolean;
  status: string;
  has_access: boolean;
};

export default function CardForm({
  token,
  onSuccess,
}: {
  token: string;
  onSuccess: (r: CardSaveResult) => void;
}) {
  const { t } = useT();
  const [pan, setPan] = useState("");
  const [expiry, setExpiry] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const formatPan = (v: string) =>
    v.replace(/\D/g, "").slice(0, 19).replace(/(.{4})/g, "$1 ").trim();
  const formatExpiry = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 4);
    return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
  };

  const submit = async () => {
    setError("");
    const digits = pan.replace(/\D/g, "");
    const [mm, yy] = expiry.split("/");
    if (!luhnValid(digits)) {
      setError(t("subscribe.card_invalid_number"));
      return;
    }
    const month = parseInt(mm || "", 10);
    const year = parseInt(yy || "", 10);
    if (!month || month < 1 || month > 12 || !year) {
      setError(t("subscribe.card_invalid_expiry"));
      return;
    }
    const now = new Date();
    if (2000 + year < now.getFullYear() || (2000 + year === now.getFullYear() && month < now.getMonth() + 1)) {
      setError(t("subscribe.card_invalid_expiry"));
      return;
    }
    setBusy(true);
    try {
      const single = await createSingleUseToken(digits, String(month), String(year));
      const result = (await apiFetch(
        "/subscribe/attach-card-token",
        { method: "POST", body: JSON.stringify({ token_single: single }) },
        token
      )) as CardSaveResult;
      onSuccess(result);
    } catch (e) {
      // One generic, localized message for any card failure; processor
      // detail never reaches the UI.
      setError(
        e instanceof CardTokenError
          ? t("subscribe.card_error")
          : e instanceof Error && e.message
            ? e.message
            : t("subscribe.card_error")
      );
    } finally {
      setBusy(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "14px 16px",
    borderRadius: 8,
    border: "1px solid rgba(138, 158, 141, 0.3)",
    background: "rgb(var(--rgb-card) / 0.55)",
    color: "var(--text-primary, #f2ecd8)",
    fontSize: 16,
    letterSpacing: "0.06em",
    outline: "none",
  };

  return (
    <div
      className="rounded-sm p-6 mt-2"
      style={{
        background: "rgb(var(--rgb-card) / 0.4)",
        border: "1px solid rgba(243, 146, 48, 0.18)",
      }}
    >
      <div
        className="text-[11px] tracking-[0.28em] uppercase mb-4"
        style={{ color: "var(--text-secondary)" }}
      >
        {t("subscribe.card_details")}
      </div>

      <div className="space-y-3">
        <input
          inputMode="numeric"
          autoComplete="cc-number"
          placeholder={t("subscribe.card_number_ph")}
          value={pan}
          onChange={(e) => setPan(formatPan(e.target.value))}
          style={inputStyle}
          aria-label={t("subscribe.card_number_ph")}
        />
        <input
          inputMode="numeric"
          autoComplete="cc-exp"
          placeholder={t("subscribe.card_expiry_ph")}
          value={expiry}
          onChange={(e) => setExpiry(formatExpiry(e.target.value))}
          style={{ ...inputStyle, maxWidth: 140 }}
          aria-label={t("subscribe.card_expiry_ph")}
        />
      </div>

      {error && (
        <p className="mt-3 text-[13px]" style={{ color: "var(--ember, #d47a52)" }}>
          {error}
        </p>
      )}

      <button
        onClick={submit}
        disabled={busy}
        className="w-full mt-5 py-4 rounded-full text-[12px] tracking-[0.3em] uppercase transition-colors disabled:opacity-60"
        style={{ background: "var(--amber, #f39230)", color: "var(--bg-deep, #050f08)", fontWeight: 600 }}
      >
        {busy ? t("subscribe.card_saving") : t("subscribe.card_save")}
      </button>

      <p
        className="mt-4 text-[11.5px] leading-relaxed"
        style={{ color: "var(--text-muted)" }}
      >
        {t("subscribe.card_privacy")}
      </p>
    </div>
  );
}
