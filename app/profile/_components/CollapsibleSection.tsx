"use client";

import { useT } from "@/lib/i18n";

// Section accent colors, mapped to the Solray extended palette

export function CollapsibleSection({
  title,
  children,
  open,
  onToggle,
}: {
  title: string;
  children: React.ReactNode;
  open: boolean;
  onToggle: (title: string) => void;
}) {
  const { t } = useT();
  const sectionTitleKey: Record<string, string> = {
    "Soul Map": "profile.soul_map",
    "Natal Chart": "profile.natal_chart",
    "Human Design": "profile.human_design",
    "Gene Keys": "profile.gene_keys",
  };
  const displayTitle = sectionTitleKey[title] ? t(sectionTitleKey[title]) : title;

  // The same fold the rest of the app uses: a quiet label over a hairline, the
  // content underneath only when it is asked for. These were four bordered
  // cards, each with an accent colour of its own and a "tap to open" line
  // under the title, which made four objects out of one list.
  //
  // Open state is owned by the page, not by each fold, so exactly one of the
  // four can be open. With four independent folds the page could become a
  // single scroll of everything, which is the opposite of what a fold is for.
  return (
    <div style={{ borderTop: "1px solid rgb(var(--rgb-border))" }}>
      <button
        type="button"
        onClick={() => onToggle(title)}
        aria-expanded={open}
        className="w-full text-left flex items-center justify-between gap-4 font-body uppercase"
        style={{
          paddingBlock: 16,
          background: "transparent",
          fontSize: 11.5,
          fontWeight: 700,
          letterSpacing: "0.2em",
          color: "rgb(var(--rgb-text-muted))",
        }}
      >
        {displayTitle}
        <span
          aria-hidden
          style={{ fontSize: 12, lineHeight: 1, transform: open ? "rotate(180deg)" : "none", transition: "transform .3s ease" }}
        >
          ▾
        </span>
      </button>
      {open && <div style={{ paddingBottom: 24 }}>{children}</div>}
    </div>
  );
}

// Tags with colors

export function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-body px-3 py-1 rounded-full border border-forest-border/70 text-text-secondary text-[14px] tracking-widest uppercase font-bold">
      {children}
    </span>
  );
}
