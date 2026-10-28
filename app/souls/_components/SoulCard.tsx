"use client";

import { useT } from "@/lib/i18n";
import { tx } from "@/lib/astro-i18n";
import { type ConnectedSoul } from "../_lib/souls-data";

// Soul card component
interface SoulCardProps {
  connection: ConnectedSoul;
  onOpen: () => void;
}

export function SoulCard({ connection, onOpen }: SoulCardProps) {
  const { t, lang } = useT();
  const { soul } = connection;
  const avatarInitial = soul.name?.[0]?.toUpperCase() || "·";

  return (
    <button
      onClick={onOpen}
      className="w-full text-left rounded-2xl p-5 transition active:scale-[0.99]"
      style={{
        background: "linear-gradient(135deg, rgb(var(--rgb-indigo) / 0.06) 0%, rgb(var(--rgb-card)) 60%)",
        border: "1px solid rgb(var(--rgb-indigo) / 0.25)",
      }}
    >
      <div className="flex items-center gap-4">
        {/* Avatar with gradient border */}
        <div
          className="w-12 h-12 rounded-full shrink-0 relative"
          style={{
            background: "linear-gradient(135deg, rgb(var(--rgb-mist)), rgb(var(--rgb-mist)))",
            padding: "2px",
          }}
        >
          {soul.profile_photo ? (
            <img src={soul.profile_photo} alt={soul.name} className="w-full h-full rounded-full object-cover" />
          ) : (
            <div className="w-full h-full rounded-full bg-forest-card flex items-center justify-center">
              <span className="font-heading text-xl text-text-primary">{avatarInitial}</span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-heading text-xl text-text-primary truncate">{soul.name}</h3>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {soul.sun_sign && (
              <span className="text-text-secondary text-sm">
                ☉ {tx(soul.sun_sign, lang)}
              </span>
            )}
            {soul.sun_sign && soul.hd_type && (
              <span className="text-forest-border text-xs">·</span>
            )}
            {soul.hd_type && (
              <span className="text-text-secondary text-xs font-body">
                {tx(soul.hd_type, lang)}{soul.hd_profile ? ` ${soul.hd_profile}` : ""}
              </span>
            )}
            {soul.username && (
              <>
                <span className="text-forest-border text-xs">·</span>
                <span className="text-text-secondary text-xs font-body">@{soul.username}</span>
              </>
            )}
          </div>
        </div>
        <span className="text-xs font-body tracking-wider opacity-70 shrink-0 whitespace-nowrap pl-1" style={{ color: "rgb(var(--rgb-mist))" }}>
          {t("souls.open_arrow")}
        </span>
      </div>
    </button>
  );
}
