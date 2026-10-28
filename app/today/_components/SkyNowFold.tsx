"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { type Planet } from "../_lib/today-data";
import { PlanetCard } from "./PlanetCard";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function SkyNowFold({ planets }: { planets: Planet[] }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderTop: "1px solid rgb(var(--rgb-border))" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full text-left flex items-center justify-between gap-4 font-body uppercase"
        style={{
          paddingBlock: 15,
          background: "transparent",
          fontSize: 11.5,
          fontWeight: 700,
          letterSpacing: "0.18em",
          color: "rgb(var(--rgb-text-muted))",
        }}
      >
        {t("today.sky_now")}
        <span
          aria-hidden
          style={{ fontSize: 12, lineHeight: 1, transform: open ? "rotate(180deg)" : "none", transition: "transform .3s ease" }}
        >
          ▾
        </span>
      </button>
      {open && (
        <div className="-mx-5 px-5 overflow-x-auto" style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none", paddingBottom: 14 }}>
          <div className="flex gap-2.5" style={{ width: "max-content" }}>
            {planets.map((planet) => (
              <PlanetCard key={planet.name} planet={planet} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
