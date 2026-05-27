"use client";

// components/LanguagePicker.tsx
//
// Single source of truth for the language toggle UI. Reused on the login
// screen, in the onboarding flow, and inside Settings. Whatever shape we
// land on for the broader language story (right now: en + es-419, soon:
// en + es + pt + de + fr + ru + zh + hi) lives here.
//
// The picker is deliberately quiet visually: a row of pill buttons, the
// current locale ringed, nothing flashy. Living-by-design: feel, function,
// nothing else.

import { useT, SUPPORTED_LANGUAGES, type LanguageCode, getLanguageDisplayName } from "@/lib/i18n";

interface LanguagePickerProps {
  /** Optional callback fired after the language is changed. Useful for
   *  closing a modal or showing a confirmation toast on the parent. */
  onChange?: (code: LanguageCode) => void;
  /** Visual density. 'inline' shows pills in a row, 'list' stacks rows. */
  layout?: "inline" | "list";
}

// Curated visible set. SUPPORTED_LANGUAGES has 'es-419' but we present a
// single 'es' option to keep the picker simple; 'es-419' maps to the same
// bundle and is reserved for future per-region copy splits.
const VISIBLE_CODES: LanguageCode[] = ["en", "es"];

export default function LanguagePicker({ onChange, layout = "inline" }: LanguagePickerProps) {
  const { lang, setLang, t } = useT();

  const handlePick = async (code: LanguageCode) => {
    if (code === lang) return;
    await setLang(code);
    onChange?.(code);
  };

  if (layout === "list") {
    return (
      <div className="flex flex-col gap-2">
        {VISIBLE_CODES.map((code) => {
          const active = lang === code || (lang === "es-419" && code === "es");
          return (
            <button
              key={code}
              type="button"
              onClick={() => handlePick(code)}
              className={
                "flex items-center justify-between w-full px-4 py-3 rounded-2xl border transition " +
                (active
                  ? "border-amber-300 bg-amber-300/10 text-text-primary"
                  : "border-forest-border/40 text-text-secondary hover:border-forest-border/70")
              }
              aria-pressed={active}
            >
              <span className="font-serif text-lg">{getLanguageDisplayName(code)}</span>
              <span className="text-xs uppercase tracking-widest opacity-70">{code}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-forest-border/40 p-1">
      {VISIBLE_CODES.map((code) => {
        const active = lang === code || (lang === "es-419" && code === "es");
        return (
          <button
            key={code}
            type="button"
            onClick={() => handlePick(code)}
            className={
              "px-3 py-1 text-xs uppercase tracking-widest rounded-full transition " +
              (active
                ? "bg-amber-300/15 text-text-primary"
                : "text-text-secondary hover:text-text-primary")
            }
            aria-pressed={active}
            aria-label={getLanguageDisplayName(code)}
          >
            {code === "en" ? "EN" : "ES"}
          </button>
        );
      })}
    </div>
  );
}
