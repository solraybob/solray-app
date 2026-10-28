"use client";

import { useT } from "@/lib/i18n";

export type SaveStatus = "idle" | "saving" | "saved" | "error";
// ─────────────────────────────────────────────────────────────────────────────
// Local presentational helpers, kept in-file because they have zero re-use
// outside this page and exporting them would just be ceremony.
// ─────────────────────────────────────────────────────────────────────────────

export function Section({
  label,
  status,
  error,
  hint,
  children,
}: {
  label: string;
  status?: SaveStatus;
  error?: string | null;
  hint?: string;
  children: React.ReactNode;
}) {
  const { t } = useT();
  return (
    <section className="pb-6" style={{ borderTop: "1px solid rgb(var(--rgb-border))" }}>
      <div className="flex items-baseline justify-between" style={{ paddingBlock: 16 }}>
        <p className="font-body uppercase" style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.2em", color: "rgb(var(--rgb-text-muted))" }}>{label}</p>
        {status === "saving" && <span className="font-body text-[14px] text-text-muted">{t("settings.saving")}</span>}
        {status === "saved"  && <span className="font-body text-[14px] text-moss">{t("common.saved")}</span>}
      </div>
      {children}
      {error && <p className="mt-3 font-body text-[15px] text-ember">{error}</p>}
      {hint  && !error && <p className="mt-3 font-body text-[15px] leading-relaxed text-text-muted">{hint}</p>}
    </section>
  );
}

export function formatConsentDate(iso: string, lang: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso.slice(0, 10);
    return d.toLocaleDateString(lang === "en" ? "en-GB" : lang, { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

export function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-body text-[14px] tracking-[0.18em] uppercase text-text-muted mb-1.5 font-bold">{label}</p>
      {children}
    </div>
  );
}

export function SaveButton({ onClick, status }: { onClick: () => void; status: SaveStatus }) {
  const { t } = useT();
  const disabled = status === "saving";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="font-body text-[13px] tracking-[0.25em] uppercase px-5 py-2.5 rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-bold"
      style={{ background: "transparent", border: "1px solid rgb(var(--rgb-border))", color: "rgb(var(--rgb-text-primary))" }}
    >
      {status === "saving" ? t("common.saving") : t("common.save")}
    </button>
  );
}

// "Memory, on": a switch's name and its state in words, for screen readers.
export function useSwitchState() {
  const { t } = useT();
  return (label: string, on: boolean) =>
    t("settings.switch_state").replace("{label}", label).replace("{state}", on ? t("common.on") : t("common.off"));
}

export function Toggle({ label, checked, onChange, disabled, srLabel }: { label: string; checked: boolean; onChange: (next: boolean) => void; disabled?: boolean; srLabel?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={srLabel}
      aria-busy={disabled || undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between w-full disabled:opacity-60"
      style={{ minHeight: 44 }}
    >
      <span className="font-body text-[17px] text-text-primary">{label}</span>
      <span
        className="relative rounded-full transition-colors"
        style={{
          width: 44,
          height: 24,
          backgroundColor: checked ? "rgb(var(--rgb-text-primary))" : "rgb(var(--rgb-border))",
        }}
      >
        <span
          className="absolute top-0.5 rounded-full transition-all"
          style={{
            width: 20,
            height: 20,
            left: checked ? 22 : 2,
            backgroundColor: "rgb(var(--rgb-bg-deep))",
          }}
        />
      </span>
    </button>
  );
}

export function ThemeButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 font-body text-[13px] tracking-[0.25em] uppercase py-2.5 rounded-full transition-colors font-bold"
      style={{
        backgroundColor: active ? "rgb(var(--rgb-text-primary))" : "transparent",
        color: active ? "rgb(var(--rgb-bg-deep))" : "rgb(var(--rgb-text-secondary))",
        border: `1px solid ${active ? "rgb(var(--rgb-text-primary))" : "rgb(var(--rgb-border))"}`,
      }}
    >
      {label}
    </button>
  );
}
