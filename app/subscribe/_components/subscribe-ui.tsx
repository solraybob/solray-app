"use client";

import { useT } from "@/lib/i18n";

export function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline font-body" style={{ paddingBlock: 10, borderTop: "1px solid rgb(var(--rgb-border) / .6)" }}>
      <span style={{ fontSize: 15, color: "rgb(var(--rgb-text-secondary))" }}>{label}</span>
      <span style={{ fontSize: 17, fontWeight: 500, color: "rgb(var(--rgb-text-primary))" }}>{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

export function StatusBadge({ status }: { status: string }) {
  const { t } = useT();
  // One dot of meaning, no pill: the rest of the app marks state with a word
  // in the label voice, not a coloured capsule.
  const dot: Record<string, string> = {
    trial: "rgb(var(--rgb-amber))",
    active: "rgb(var(--rgb-moss))",
    past_due: "rgb(var(--rgb-ember))",
  };
  const label: Record<string, string> = {
    trial: t("subscribe.badge_trial"),
    active: t("subscribe.badge_active"),
    past_due: t("subscribe.badge_retrying"),
    // A web signup's trial starts when the email is confirmed; until then
    // the badge must not say Trial over a line saying it has not started.
    awaiting_email: t("subscribe.badge_awaiting_email"),
    cancelled: t("subscribe.badge_cancelled"),
    expired: t("subscribe.badge_expired"),
  };
  return (
    <span className="inline-flex items-center gap-2" style={{ color: "rgb(var(--rgb-text-primary))" }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: dot[status] || "rgb(var(--rgb-text-muted))" }} />
      {label[status] || status.replace("_", " ")}
    </span>
  );
}

export function Notice({ text, tone }: { text: string; tone: "ember" | "muted" }) {
  return (
    <p
      className="font-body"
      role="status"
      style={{
        fontSize: 15,
        lineHeight: 1.55,
        paddingBlock: 14,
        marginBottom: 20,
        borderTop: "1px solid rgb(var(--rgb-border))",
        borderBottom: "1px solid rgb(var(--rgb-border))",
        color: tone === "ember" ? "rgb(var(--rgb-ember))" : "rgb(var(--rgb-text-secondary))",
      }}
    >
      {text}
    </p>
  );
}

export function ActionButton({
  onClick,
  loading,
  children,
}: {
  onClick: () => void;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full py-4 px-8 rounded-full text-[14px] tracking-[0.3em] uppercase transition-opacity duration-300 disabled:opacity-50 font-bold"
      style={{
        background: "rgb(var(--rgb-text-primary))",
        color: "rgb(var(--rgb-bg-deep))",
        border: "1.5px solid rgb(var(--rgb-text-primary))",
      }}
    >
      {loading ? (
        <span className="inline-block w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin align-middle" />
      ) : (
        children
      )}
    </button>
  );
}
