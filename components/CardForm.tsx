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
    border: "1px solid rgb(var(--rgb-border))",
    background: "rgb(var(--rgb-card) / 0.55)",
    color: "rgb(var(--rgb-text-primary))",
    fontSize: 17,
    letterSpacing: "0.06em",
    outline: "none",
  };

  return (
    <div
      className="mt-2 pt-4"
      style={{ borderTop: "1px solid rgb(var(--rgb-border))" }}
    >
      <div
        className="font-body uppercase mb-4"
        style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.2em", color: "rgb(var(--rgb-text-muted))" }}
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
        <p className="mt-3 text-[15px]" style={{ color: "rgb(var(--rgb-ember))" }}>
          {error}
        </p>
      )}

      <button
        onClick={submit}
        disabled={busy}
        className="w-full mt-5 py-4 rounded-full text-[14px] tracking-[0.3em] uppercase transition-colors disabled:opacity-60 font-bold"
        style={{ background: "rgb(var(--rgb-text-primary))", color: "rgb(var(--rgb-bg-deep))", border: "1.5px solid rgb(var(--rgb-text-primary))", fontWeight: 700 }}
      >
        {busy ? t("subscribe.card_saving") : t("subscribe.card_save")}
      </button>

      <p
        className="mt-4 text-[13px] leading-relaxed"
        style={{ color: "rgb(var(--rgb-text-muted))" }}
      >
        {t("subscribe.card_privacy")}
      </p>
    </div>
  );
}
