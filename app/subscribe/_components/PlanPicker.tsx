"use client";

export function PlanPicker({
  current,
  disabled,
  onChoose,
  t,
}: {
  current: "monthly" | "yearly";
  disabled: boolean;
  onChoose: (plan: "monthly" | "yearly") => void;
  t: (k: string) => string;
}) {
  const options: { key: "monthly" | "yearly"; price: string; per: string; note?: string }[] = [
    { key: "monthly", price: "$23", per: t("subscribe.per_month") },
    { key: "yearly", price: "$199", per: t("subscribe.per_year"), note: t("subscribe.plan_yearly_save") },
  ];
  return (
    <div className="mb-4">
      <p className="mb-2 text-[14px] tracking-wide" style={{ color: "rgb(var(--rgb-text-muted))" }}>
        {t("subscribe.plan_choose")}
      </p>
      <div className="grid grid-cols-2 gap-3">
        {options.map((o) => {
          const active = current === o.key;
          return (
            <button
              key={o.key}
              type="button"
              disabled={disabled}
              onClick={() => !active && onChoose(o.key)}
              className="rounded-sm border px-4 py-3 text-left transition-colors"
              style={{
                borderColor: active ? "rgb(var(--rgb-text-primary))" : "rgb(var(--rgb-border))",
                background: active ? "rgb(var(--rgb-card))" : "transparent",
                opacity: disabled ? 0.6 : 1,
                cursor: disabled ? "default" : "pointer",
              }}
            >
              <div className="text-[15px]" style={{ color: "rgb(var(--rgb-text-muted))" }}>
                {o.key === "yearly" ? t("subscribe.plan_yearly") : t("subscribe.plan_monthly")}
              </div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-[20px]" style={{ fontWeight: 700, color: "rgb(var(--rgb-text-primary))" }}>{o.price}</span>
                <span className="text-[14px]" style={{ color: "rgb(var(--rgb-text-muted))" }}>{o.per}</span>
              </div>
              {o.note && (
                <div className="mt-1 text-[13px]" style={{ color: "rgb(var(--rgb-moss))" }}>{o.note}</div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
