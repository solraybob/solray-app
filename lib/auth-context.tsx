"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

interface User {
  id: string;
  email: string;
  name: string;
  language?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setToken: (token: string, user: User) => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Defensive parse: if the stored user blob is corrupted (partial
    // write during a PWA update, manual edit in DevTools, browser
    // quirk) JSON.parse throws. An unhandled throw here breaks
    // hydration of the entire AuthProvider, which means the whole
    // React tree fails to render and the user sees a blank screen
    // until they manually clear storage. Catch it, log them out
    // cleanly, and keep loading so they land on /login.
    try {
      const storedToken = localStorage.getItem("solray_token");
      const storedUser = localStorage.getItem("solray_user");
      if (storedToken && storedUser) {
        setTokenState(storedToken);
        setUser(JSON.parse(storedUser));
      }
    } catch {
      try {
        localStorage.removeItem("solray_token");
        localStorage.removeItem("solray_user");
      } catch {/* ignore, storage may be unavailable entirely */}
      setTokenState(null);
      setUser(null);
    }
    setLoading(false);
  }, []);

  // Clear per-user cached reading data (forecast, blueprint), which use
  // shared, non-user-scoped localStorage keys across the app. Called whenever
  // the authenticated identity changes so one account on a device can never
  // read another account's cached forecast or chart.
  const clearReadingCaches = () => {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && (k.startsWith("solray_forecast") || k.startsWith("solray_blueprint"))) {
          localStorage.removeItem(k);
        }
      }
    } catch { /* ignore storage errors */ }
  };

  const setToken = (tok: string, usr: User) => {
    // Clear cached reading data UNLESS we can positively prove this is the
    // same returning user. A missing or corrupt prior record means we cannot
    // prove it, so we clear, ensuring stale cache never survives into a
    // different or unknown session. A genuine same-user return keeps its
    // cache, so the fast path is preserved.
    let sameUser = false;
    try {
      const prev = localStorage.getItem("solray_user");
      const prevId = prev ? JSON.parse(prev)?.id : null;
      sameUser = !!prevId && prevId === usr.id;
    } catch { /* ignore */ }
    if (!sameUser) clearReadingCaches();
    localStorage.setItem("solray_token", tok);
    localStorage.setItem("solray_user", JSON.stringify(usr));
    setTokenState(tok);
    setUser(usr);
  };

  const login = async (email: string, password: string) => {
    const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").trim();
    const res = await fetch(`${apiUrl}/users/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Login failed");
    }
    const data = await res.json();
    const userObj = data.user || data.profile || { id: data.user_id || data.id, email, name: data.name || email };
    const lang = userObj.language || data.language;
    // Mirror the server's saved language preference onto the localStorage
    // slot LanguageProvider reads. If absent, the provider falls back to
    // browser locale / 'en' on its own.
    if (lang) {
      try {
        localStorage.setItem("solray_language", lang);
        // Notify the LanguageProvider in the same tab so the UI flips
        // immediately without waiting for a navigation/mount cycle.
        window.dispatchEvent(new CustomEvent("solray:language-sync", { detail: lang }));
      } catch { /* ignore */ }
    }
    setToken(
      data.token || data.access_token,
      {
        id:       userObj.id || data.user_id,
        email:    userObj.email || email,
        name:     userObj.name || email,
        language: lang,
      },
    );
  };

  const logout = () => {
    localStorage.removeItem("solray_token");
    localStorage.removeItem("solray_user");
    // Clear per-user cached reading data so the next account on this device
    // can never read the previous user's cached forecast or chart.
    clearReadingCaches();
    // Clear the native-push "registered" flags so the next user signing
    // in on the same device actually re-registers their device against
    // APNs and the backend records THEIR token. Codex audit P1.4.
    try {
      // Lazy import to keep this file SSR-safe; the helper itself is
      // a no-op on web.
      import("./native-push").then(({ clearNativePushRegistration }) => {
        clearNativePushRegistration();
      });
    } catch { /* ignore */ }
    setTokenState(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, setToken, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
