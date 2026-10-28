"use client";

import { useState } from "react";
import { useT, fill } from "@/lib/i18n";
import { tx } from "@/lib/astro-i18n";
import { type ConnectedSoul } from "../_lib/souls-data";

// Soul action sheet shown when tapping a connected soul
interface SoulActionsProps {
  soul: ConnectedSoul;
  onClose: () => void;
  onSoloReading: () => void;
  onViewProfile: () => void;
  // Ends the connection for both people (DELETE /souls/{connection_id}).
  // Resolves on success; rejects so the sheet can say it failed.
  onRemove: () => Promise<void>;
}

export function SoulActions({ soul, onClose, onSoloReading, onViewProfile, onRemove }: SoulActionsProps) {
  const { t, lang } = useT();
  // Removing is permanent for both people, so it asks once more first.
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeFailed, setRemoveFailed] = useState(false);
  const doRemove = async () => {
    if (removing) return;
    setRemoving(true);
    setRemoveFailed(false);
    try {
      await onRemove();
    } catch {
      setRemoveFailed(true);
      setRemoving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-forest-deep/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-forest-dark border-t border-forest-border rounded-t-3xl px-6 pt-6 pb-12">
        <div className="w-10 h-1 bg-forest-border rounded-full mx-auto mb-6" />
        <div className="flex items-center gap-4 mb-6">
          {soul.soul.profile_photo ? (
            <img src={soul.soul.profile_photo} alt={soul.soul.name} className="w-12 h-12 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-forest-border flex items-center justify-center shrink-0">
              <span className="font-heading text-xl text-text-primary">{soul.soul.name?.[0]?.toUpperCase() || "·"}</span>
            </div>
          )}
          <div>
            <h3 className="font-heading text-text-primary" style={{ fontSize: "1.05rem", fontWeight: 700 }}>{soul.soul.name}</h3>
            <p className="font-body text-text-secondary text-[17px]">
              {soul.soul.sun_sign && (
                <>☉ {tx(soul.soul.sun_sign, lang)}</>
              )}
              {soul.soul.sun_sign && soul.soul.hd_type && " · "}
              {tx(soul.soul.hd_type, lang)}
            </p>
          </div>
        </div>
        <div className="space-y-3">
          <button
            onClick={onViewProfile}
            className="w-full text-left px-5 py-4 bg-forest-card border border-forest-border rounded-2xl transition hover:border-mist/30"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-body text-text-primary font-semibold text-[17px]">{t("souls.view_profile")}</p>
                <p className="font-body text-text-secondary text-[14px] mt-0.5">{t(soul.soul.is_public ? "souls.view_profile_sub" : "souls.view_profile_sub_private").replace("{name}", soul.soul.name)}</p>
              </div>
              <span className="font-body text-indigo text-[14px]">{t("souls.open")}</span>
            </div>
          </button>
          <button
            onClick={onSoloReading}
            className="w-full text-left px-5 py-4 bg-forest-card border border-forest-border rounded-2xl transition hover:border-mist/30"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-body text-text-primary font-semibold text-[17px]">{t("souls.your_reading")}</p>
                <p className="font-body text-text-secondary text-[14px] mt-0.5">{t("souls.your_reading_sub").replace("{name}", soul.soul.name)}</p>
              </div>
              <span className="font-body text-indigo text-[14px]">{t("souls.open")}</span>
            </div>
          </button>
          {!confirmRemove ? (
            <button
              onClick={() => { setConfirmRemove(true); setRemoveFailed(false); }}
              className="w-full text-left px-5 py-4 bg-forest-card border border-forest-border rounded-2xl transition hover:border-mist/30"
              style={{ minHeight: 44 }}
            >
              <p className="font-body text-text-primary font-semibold text-[17px]">{t("souls.remove_connection")}</p>
              <p className="font-body text-text-secondary text-[14px] mt-0.5">{fill(t("souls.remove_connection_sub"), { name: soul.soul.name })}</p>
            </button>
          ) : (
            <div className="px-5 py-4 bg-forest-card border border-forest-border rounded-2xl" role="alertdialog" aria-live="polite">
              <p className="font-body text-text-primary font-semibold text-[17px]">{fill(t("souls.remove_confirm_title"), { name: soul.soul.name })}</p>
              <p className="font-body text-text-secondary text-[14px] mt-1" style={{ lineHeight: 1.5 }}>{t("souls.remove_confirm_body")}</p>
              {removeFailed && (
                <p className="font-body text-[14px] mt-2" style={{ color: "rgb(var(--rgb-text-primary))" }}>{t("souls.remove_connection_failed")}</p>
              )}
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => { setConfirmRemove(false); setRemoveFailed(false); }}
                  disabled={removing}
                  className="flex-1 py-3 rounded-full border border-forest-border font-body text-[14px] text-text-secondary"
                  style={{ minHeight: 44 }}
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={doRemove}
                  disabled={removing}
                  className="flex-1 py-3 rounded-full font-body text-[14px] font-bold"
                  style={{ minHeight: 44, background: "rgb(var(--rgb-text-primary))", color: "rgb(var(--rgb-bg-deep))", opacity: removing ? 0.6 : 1 }}
                >
                  {t("souls.remove_confirm_yes")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
