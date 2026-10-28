"use client";

import { useT } from "@/lib/i18n";
import { tx } from "@/lib/astro-i18n";
import { type SavedPerson, type ConnectedSoul, type BondPartner, savedBirthCheck } from "../_lib/souls-data";

// ---------------------------------------------------------------------------
// Partner picker, choose from saved people, connections, or add new
// ---------------------------------------------------------------------------

interface PartnerPickerProps {
  savedPeople: SavedPerson[];
  connections: ConnectedSoul[];
  onPick: (partner: BondPartner) => void;
  onAddNew: () => void;
  onRemoveSaved: (id: string) => void;
  /** A saved person whose birth time the server flagged (clock change). */
  onConfirmSaved: (person: SavedPerson) => void;
  onClose: () => void;
}

export function PartnerPicker({ savedPeople, connections, onPick, onAddNew, onRemoveSaved, onConfirmSaved, onClose }: PartnerPickerProps) {
  const { t, lang } = useT();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-forest-deep/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-forest-dark border-t border-forest-border rounded-t-3xl px-5 pt-5 pb-24 max-h-[92dvh] overflow-y-auto">
        <div className="w-10 h-1 bg-forest-border rounded-full mx-auto mb-5" />
        <h3 className="font-heading text-text-primary mb-4 px-1" style={{ fontSize: "1.1rem", fontWeight: 700 }}>{t("souls.choose_someone")}</h3>

        <button
          type="button"
          onClick={onAddNew}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl mb-4 transition-all"
          style={{
            background: "rgba(74,46,158,0.08)",
            border: "1px solid rgba(74,46,158,0.35)",
          }}
        >
          <div className="w-9 h-9 rounded-full flex items-center justify-center font-heading text-lg text-text-primary shrink-0"
               style={{ background: "linear-gradient(135deg, rgb(var(--rgb-mist)), rgb(var(--rgb-mist)))" }}>+</div>
          <div className="flex-1 text-left">
            <p className="font-body text-text-primary text-sm font-semibold">{t("souls.add_someone_new")}</p>
            <p className="font-body text-text-secondary text-[15px]">{t("souls.birth_data_local")}</p>
          </div>
        </button>

        {savedPeople.length > 0 && (
          <div className="mb-4">
            <p className="text-text-secondary text-[14px] font-body tracking-[0.22em] uppercase mb-2 px-1 font-bold">{t("souls.your_people")}</p>
            <div className="space-y-2">
              {savedPeople.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3 bg-forest-card border border-forest-border rounded-xl">
                  <button
                    type="button"
                    onClick={() => onPick({ kind: "saved", person: p })}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                  >
                    <div className="w-9 h-9 rounded-full bg-forest-border flex items-center justify-center shrink-0">
                      <span className="font-heading text-base text-text-primary">{p.name?.[0]?.toUpperCase() || "·"}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-body text-text-primary text-sm font-semibold truncate">{p.name}</p>
                      <p className="text-text-secondary text-[15px] font-body truncate">
                        {p.profile.sun_sign && <>☉ {tx(p.profile.sun_sign, lang)}</>}
                        {p.profile.sun_sign && p.profile.hd_type && " · "}
                        {tx(p.profile.hd_type, lang)}
                      </p>
                    </div>
                  </button>
                  {savedBirthCheck(p).needsConfirmation && (
                    <button
                      type="button"
                      onClick={() => onConfirmSaved(p)}
                      className="shrink-0 px-3 py-1 rounded-full border border-forest-border font-body text-[13px] text-text-primary"
                    >
                      {t("souls.birth_check_button")}
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={t("souls.remove_name").replace("{name}", p.name)}
                    onClick={() => onRemoveSaved(p.id)}
                    className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-text-secondary hover:text-ember transition-colors"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {connections.length > 0 && (
          <div>
            <p className="text-text-secondary text-[14px] font-body tracking-[0.22em] uppercase mb-2 px-1 font-bold">{t("souls.connections")}</p>
            <div className="space-y-2">
              {connections.map((c) => (
                <button
                  key={c.connection_id}
                  type="button"
                  onClick={() => onPick({ kind: "connection", connection: c })}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-forest-card border border-forest-border rounded-xl text-left"
                >
                  {c.soul.profile_photo ? (
                    <img src={c.soul.profile_photo} alt={c.soul.name} className="w-9 h-9 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-forest-border flex items-center justify-center shrink-0">
                      <span className="font-heading text-base text-text-primary">{c.soul.name?.[0]?.toUpperCase() || "·"}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-body text-text-primary text-sm font-semibold truncate">{c.soul.name}</p>
                    <p className="text-text-secondary text-[15px] font-body truncate">
                      {c.soul.sun_sign && <>☉ {tx(c.soul.sun_sign, lang)}</>}
                      {c.soul.sun_sign && c.soul.hd_type && " · "}
                      {tx(c.soul.hd_type, lang)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {savedPeople.length === 0 && connections.length === 0 && (
          <p className="text-text-secondary text-xs font-body text-center py-6">
            {t("souls.no_one_yet")}
          </p>
        )}
      </div>
    </div>
  );
}
