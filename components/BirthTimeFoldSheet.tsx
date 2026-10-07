"use client";

// Asks which of the two occurrences of a birth time it was, when the clocks
// went back that night and the time happened twice (lib/birth-time-fold).

import { useT } from "@/lib/i18n";
import type { BirthFold, FoldChoice } from "@/lib/birth-time-fold";

export default function BirthTimeFoldSheet({
  options,
  onChoose,
  onCancel,
}: {
  options: FoldChoice[];
  onChoose: (fold: BirthFold) => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby="birth-fold-title">
      <div className="absolute inset-0 bg-forest-deep/80 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-lg bg-forest-dark border-t border-forest-border rounded-t-3xl px-6 pt-5" style={{ paddingBottom: "calc(40px + var(--sab, 0px))" }}>
        <div className="w-10 h-1 bg-forest-border rounded-full mx-auto mb-5" />
        <h3 id="birth-fold-title" className="font-heading text-text-primary mb-2" style={{ fontSize: "1.2rem", fontWeight: 700 }}>
          {t("birth_fold.title")}
        </h3>
        <p className="font-body text-text-secondary text-[15px] leading-relaxed mb-5">{t("birth_fold.body")}</p>
        <div className="space-y-3">
          {options.map((o) => (
            <button
              key={o.fold}
              type="button"
              onClick={() => onChoose(o.fold)}
              className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl border border-forest-border text-left"
              style={{ minHeight: 52 }}
            >
              <span className="font-body text-text-primary text-[16px] font-semibold">
                {t(o.fold === "first" ? "birth_fold.earlier" : "birth_fold.later")}
              </span>
              {o.offset && <span className="font-body text-text-secondary text-[15px]">{o.offset}</span>}
            </button>
          ))}
        </div>
        <p className="font-body text-text-secondary text-[14px] leading-relaxed mt-4">{t("birth_fold.hint")}</p>
        <button type="button" onClick={onCancel} className="w-full mt-3 py-3 font-body text-[15px] text-text-secondary" style={{ minHeight: 44 }}>
          {t("birth_fold.back")}
        </button>
      </div>
    </div>
  );
}
