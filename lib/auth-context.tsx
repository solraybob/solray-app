"use client";

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { clearUserScopedCaches } from "./local-cache";
import { errorText } from "./errors";
import { bindAccount, bumpAuthGeneration, identityStorageChange } from "./account-session";
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
        const parsed = JSON.parse(storedUser);
        // This tab belongs to this member: its per-account caches are theirs.
        bindAccount(parsed?.id ?? null);
        setTokenState(storedToken);
        setUser(parsed);
      } else {
        bindAccount(null);
      }
    } catch {
      bindAccount(null);
      try {
        localStorage.removeItem("solray_token");
        localStorage.removeItem("solray_user");
      } catch {/* ignore, storage may be unavailable entirely */}
      setTokenState(null);
      setUser(null);
    }
    setLoading(false);
  }, []);

  // Another tab changed the session (signed out, or signed in as someone
  // else): this tab must stop acting for the member it was showing at once.
  // identityStorageChange bumps the generation and unbinds the tab before
  // anything else here runs, so in-flight work is dropped and no cache write
  // can land in the next member's namespace. Then the in-memory session is
  // cleared and the tab starts over: a sign-out goes to /login, a different
  // member reloads into that member's own session. A fresh token for the
  // same member is simply taken over.
  const tokenRef = useRef<string | null>(null);
  useEffect(() => { tokenRef.current = token; }, [token]);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      try { if (e.storageArea && e.storageArea !== window.localStorage) return; } catch { return; }
      const change = identityStorageChange(e.key, tokenRef.current);
      if (change === "none") return;
      if (change === "token") {
        try {
          const fresh = localStorage.getItem("solray_token");
          if (fresh) { tokenRef.current = fresh; setTokenState(fresh); }
        } catch { /* keep the current token */ }
        return;
      }
      tokenRef.current = null;
      setTokenState(null);
      setUser(null);
      if (change === "signed-out") window.location.replace("/login");
      else window.location.reload();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
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
    // A new session starts a new account generation: anything still in
    // flight from the previous session is dropped when it lands.
    bumpAuthGeneration();
    // Persistence is best-effort: if storage throws (private mode), the
    // session still works from React state for this tab. Blocking a
    // SUCCESSFUL login on a storage write was audit finding number two.
    // The member record goes first: another tab reading the token change
    // then never pairs the new token with the previous member.
    try {
      localStorage.setItem("solray_user", JSON.stringify(usr));
      localStorage.setItem("solray_token", tok);
    } catch { /* memory-only session */ }
    // Bound after the record is stored, so a same-member return moves its
    // old unscoped caches into its namespace.
    bindAccount(usr.id);
    tokenRef.current = tok;
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
    // Everything still in flight belongs to the account that is leaving.
    bumpAuthGeneration();
    // Storage cleanup is best-effort and isolated: a storage exception must
    // never leave the member signed in on screen (finally clears React state).
    try {
      // Release this phone's push binding for the member who is leaving,
      // while their auth token is still valid, and cancel any registration
      // in flight. Otherwise the next account on this phone could get this
      // member's teaser on the lock screen. Falls back to the stored token
      // in case state has not settled yet. No-op on the web.
      let leavingToken: string | null = token;
      try { leavingToken = leavingToken || localStorage.getItem("solray_token"); } catch { /* ignore */ }
      try { releaseNativePush(leavingToken); } catch { /* ignore */ }
      try {
        localStorage.removeItem("solray_token");
        localStorage.removeItem("solray_user");
      } catch { /* storage unavailable: memory-only session */ }
      // Clear per-user cached reading data so the next account on this device
      // can never read the previous user's cached forecast or chart.
      clearReadingCaches();
    } finally {
      bindAccount(null);
      tokenRef.current = null;
      setTokenState(null);
      setUser(null);
    }
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
