"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

/**
 * ThemeProvider
 *
 * Two themes, "dark" (default forest) and "light" (pearl ground). The
 * active theme is written to <html data-theme="..."> so app/globals.css
 * can flip every CSS variable in one place.
 *
 * Persistence: localStorage("solray-theme"). The first paint is handled
 * by an inline <script> in layout.tsx (set BEFORE React mounts) so a
 * light-mode user never gets a flash of dark forest, and vice versa.
 */
export type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");

  // Sync from <html data-theme> on mount (set by the inline FOUC-killer in layout)
  useEffect(() => {
    const initial = (document.documentElement.getAttribute("data-theme") as Theme | null) || "dark";
    setThemeState(initial === "light" ? "light" : "dark");
  }, []);

  // Native status bar follows the ground actually on screen: dark text on
  // paper, light text after dark. The paper is the default (no data-theme
  // or "light"); only data-theme="dark" is the dark ground. Applied on
  // mount, whenever data-theme changes (by this provider or the first-paint
  // script), and on resume, since some Android builds reset the style when
  // the app comes back to the foreground.
  useEffect(() => {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    if (!cap?.isNativePlatform?.()) return;
    let disposed = false;
    let removeResume: (() => void) | null = null;
    const apply = async () => {
      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        const dark = document.documentElement.getAttribute("data-theme") === "dark";
        // Capacitor naming: Style.Dark = light text for dark backgrounds,
        // Style.Light = dark text for light backgrounds.
        await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
      } catch { /* plugin missing on this build: the configured default stays */ }
    };
    void apply();
    const obs = new MutationObserver(() => { void apply(); });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    void (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const h = await App.addListener("resume", () => { void apply(); });
        if (disposed) { void h.remove(); return; }
        removeResume = () => { void h.remove(); };
      } catch { /* no app plugin: theme changes still apply */ }
    })();
    return () => {
      disposed = true;
      obs.disconnect();
      removeResume?.();
    };
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("solray-theme", next);
    } catch {
      // localStorage can fail (private mode, quota), non-fatal
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside <ThemeProvider>");
  }
  return ctx;
}
