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

  const setToken = (tok: string, usr: User) => {
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
