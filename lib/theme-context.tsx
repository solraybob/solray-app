"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

/**
 * ThemeProvider
 *
 * Two themes — "dark" (default forest) and "light" (pearl ground). The
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

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("solray-theme", next);
    } catch {
      // localStorage can fail (private mode, quota) — non-fatal
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
