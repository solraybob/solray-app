"use client";

// lib/i18n.tsx, Minimal language provider for Solray.
//
// Why custom and not next-intl: we have two locales today (en, es) and the
// app does not use locale-prefixed routes. A 60-line context with a t()
// hook does the entire job without forcing every page to migrate. To add
// a language later: drop messages/{code}.json, add the code to SUPPORTED
// below, and translate the strings. No routing changes, no DB migration,
// no build config.
//
// What lives here:
//   - LanguageProvider reads the saved locale from localStorage (instant
//     boot, no server round-trip), syncs to the authenticated user once
//     we know their preference, and PATCHes the backend when the user
//     changes it.
//   - useT() returns a translator. Missing keys fall through to the key
//     itself so an untranslated screen does not blow up, it just shows
//     the key path (visible to us, not catastrophic to the user).

import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import en from "../messages/en.json";
import es from "../messages/es.json";

export const SUPPORTED_LANGUAGES = ["en", "es", "es-419"] as const;
export type LanguageCode = typeof SUPPORTED_LANGUAGES[number];

// es-419 is a regional dialect that we currently route to the same
// messages bundle as 'es'. Keeping them as separate codes means we can
// later split the bundle without breaking saved preferences.
const MESSAGES: Record<string, Record<string, any>> = {
  en,
  es,
  "es-419": es,
};

const STORAGE_KEY = "solray_language";
const DEFAULT_LANGUAGE: LanguageCode = "en";

interface LanguageContextValue {
  lang: LanguageCode;
  setLang: (code: LanguageCode) => Promise<void>;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function lookup(bundle: Record<string, any>, key: string): string | undefined {
  const parts = key.split(".");
  let cur: any = bundle;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in cur) {
      cur = cur[p];
    } else {
      return undefined;
    }
  }
  return typeof cur === "string" ? cur : undefined;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Boot from localStorage on the client; SSR renders English by default
  // and the client hydrates to the saved language. Brief flash of English
  // on first paint is acceptable, locked-out experience is not.
  const [lang, setLangState] = useState<LanguageCode>(DEFAULT_LANGUAGE);

  useEffect(() => {
    const readFromStorage = () => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved && (SUPPORTED_LANGUAGES as readonly string[]).includes(saved)) {
          setLangState(saved as LanguageCode);
          return;
        }
        // First visit on this device: sniff browser locale, fall back to en.
        const browser = (typeof navigator !== "undefined" ? navigator.language : "") || "";
        if (browser.toLowerCase().startsWith("es")) {
          setLangState("es");
        }
      } catch {
        // localStorage may be unavailable in private mode; fall through to en.
      }
    };

    readFromStorage();

    // Sync when AuthContext fires the post-login event (same tab).
    const onSync = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (typeof detail === "string" && (SUPPORTED_LANGUAGES as readonly string[]).includes(detail)) {
        setLangState(detail as LanguageCode);
      } else {
        readFromStorage();
      }
    };
    // Sync when another tab changes the saved language.
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) readFromStorage();
    };
    window.addEventListener("solray:language-sync", onSync as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("solray:language-sync", onSync as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setLang = useCallback(async (code: LanguageCode) => {
    if (!(SUPPORTED_LANGUAGES as readonly string[]).includes(code)) return;
    setLangState(code);
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch { /* ignore */ }

    // Persist to the backend if the user is logged in. Best-effort; the
    // localStorage write is what makes the change feel instant. The
    // backend PATCH propagates the preference to the Oracle prompt for
    // the next chat turn and across devices on next login.
    try {
      const token = localStorage.getItem("solray_token");
      if (token) {
        const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").trim();
        await fetch(`${apiUrl}/users/language`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ language: code }),
        });
        // Mirror onto the cached user blob so a refresh keeps the choice
        // without an extra round-trip.
        try {
          const userBlob = localStorage.getItem("solray_user");
          if (userBlob) {
            const u = JSON.parse(userBlob);
            u.language = code;
            localStorage.setItem("solray_user", JSON.stringify(u));
          }
        } catch { /* ignore */ }
      }
    } catch {
      // Network failures should not block the UI change. Next login will reconcile.
    }
  }, []);

  const t = useCallback((key: string): string => {
    const bundle = MESSAGES[lang] || MESSAGES.en;
    const hit = lookup(bundle, key);
    if (hit !== undefined) return hit;
    // Fall back to English if the requested locale is missing the key.
    const enHit = lookup(MESSAGES.en, key);
    return enHit !== undefined ? enHit : key;
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useT() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useT must be used within LanguageProvider");
  return ctx;
}

// Convenience for non-component consumers (e.g. server actions).
export function getLanguageDisplayName(code: LanguageCode): string {
  switch (code) {
    case "es":
    case "es-419":
      return "Español";
    case "en":
    default:
      return "English";
  }
}
