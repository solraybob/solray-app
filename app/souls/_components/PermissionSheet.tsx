"use client";

import { useState } from "react";
import { useT, fill } from "@/lib/i18n";
import { type SavedPerson } from "../_lib/souls-data";

// ---------------------------------------------------------------------------
// Permission sheet: asked once per saved person before their first reading
// when the member has not confirmed it yet (people saved before the
// question existed, or saved on another device).
// ---------------------------------------------------------------------------

export function PermissionSheet({ people, onCancel, onConfirm }: { people: SavedPerson[]; onCancel: () => void; onConfirm: () => void }) {
  const { t } = useT();
  const [checked, setChecked] = useState(false);
  const names = people.map((p) => p.name);
  const nameList = names.length <= 1
    ? (names[0] || t("souls.permission_this_person"))
    : names.length === 2
    ? names.join(t("souls.bond_and"))
    : `${names.slice(0, -1).join(", ")}${t("souls.bond_and_last")}${names[names.length - 1]}`;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby="souls-permission-title">
      <div className="absolute inset-0 bg-forest-deep/80 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-lg bg-forest-dark border-t border-forest-border rounded-t-3xl px-6 pt-5 pb-16">
        <div className="w-10 h-1 bg-forest-border rounded-full mx-auto mb-5" />
        <h3 id="souls-permission-title" className="font-heading text-text-primary mb-2" style={{ fontSize: "1.2rem", fontWeight: 700 }}>
          {t("souls.permission_needed_title")}
        </h3>
        <p className="font-body text-text-secondary text-[15px] leading-relaxed mb-5">
          {fill(t("souls.permission_needed_body"), { names: nameList })}
        </p>
        <label className="flex items-start gap-3 cursor-pointer select-none mb-6" style={{ minHeight: 44 }}>
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-1 w-4 h-4 cursor-pointer flex-shrink-0"
            style={{ accentColor: "rgb(var(--rgb-text-primary))" }}
          />
          <span className="font-body text-[15px] leading-relaxed text-text-secondary">
            {t("souls.permission_confirm").replace("{name}", nameList)}
          </span>
        </label>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!checked}
          className="w-full py-3.5 rounded-xl font-body font-semibold text-[17px] tracking-[0.2em] uppercase transition-all disabled:opacity-30"
          style={{ background: "linear-gradient(135deg, rgb(var(--rgb-mist)), rgb(var(--rgb-mist)))", color: "var(--text-primary)" }}
        >
          {t("souls.permission_continue")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="w-full mt-3 py-3 font-body text-[15px] text-text-secondary"
          style={{ minHeight: 44 }}
        >
          {t("souls.permission_not_now")}
        </button>
      </div>
    </div>
  );
}
