"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { clearUserScopedCaches } from "./local-cache";
import { errorText } from "./errors";
import { releaseNativePush } from "./native-push";

interface User {
  id: string;
  email: string;
  name: string;
  language?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  /** failMessage: localized fallback when the backend sends no readable detail. */
  login: (email: string, password: string, failMessage?: string) => Promise<void>;
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

  // Clear EVERY per-user cached value when the authenticated identity changes,
  // so one account on a device can never read another account's cached data.
  // Centralized in lib/local-cache so the login path and the 401 path in
  // lib/api can never drift. (An earlier version wiped only solray_forecast*
  // and solray_blueprint*, which let solray_cycles_* survive an account switch:
  // that is how a test account's active "Saturn Return" leaked onto another
  // account's profile.)
  const clearReadingCaches = clearUserScopedCaches;

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
    // Persistence is best-effort: if storage throws (private mode), the
    // session still works from React state for this tab. Blocking a
    // SUCCESSFUL login on a storage write was audit finding number two.
    try {
      localStorage.setItem("solray_token", tok);
      localStorage.setItem("solray_user", JSON.stringify(usr));
    } catch { /* memory-only session */ }
    setTokenState(tok);
    setUser(usr);
  };

  const login = async (email: string, password: string, failMessage = "Login failed") => {
    const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").trim();
    const res = await fetch(`${apiUrl}/users/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(errorText(err?.detail, failMessage));
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
    // Release this phone's push binding for the member who is leaving,
    // while their auth token is still valid, and cancel any registration
    // in flight. Otherwise the next account on this phone could get this
    // member's teaser on the lock screen. Falls back to the stored token
    // in case state has not settled yet. No-op on the web.
    let leavingToken: string | null = token;
    try { leavingToken = leavingToken || localStorage.getItem("solray_token"); } catch { /* ignore */ }
    releaseNativePush(leavingToken);
    localStorage.removeItem("solray_token");
    localStorage.removeItem("solray_user");
    // Clear per-user cached reading data so the next account on this device
    // can never read the previous user's cached forecast or chart.
    clearReadingCaches();
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
