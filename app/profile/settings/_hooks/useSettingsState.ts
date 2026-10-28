"use client";

import { memberErrorText } from "@/lib/member-error";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { apiFetch } from "@/lib/api";
import { AI_CONSENT_CHANGED_EVENT, ageRestrictedFromMe, consentFromMe } from "@/lib/ai-consent";
import { syncBirthRevision } from "@/lib/chart-revision";
import { isAnalyticsOptedOut } from "@/lib/analytics";
import { clearMemory, loadMemorySetting, saveMemorySetting } from "@/lib/memory-settings";
import { useT } from "@/lib/i18n";
import { useCityAutocomplete, type CitySuggestion } from "@/lib/city-search";
import { storedBirthTimeCheck, type StoredBirthTimeCheck } from "@/lib/birth-time-fold";
import { accountKey } from "@/lib/account-session";
import { useSwitchState, type SaveStatus } from "../_components/settings-ui";

export function useSettingsState() {
  const { t, lang } = useT();
  const switchState = useSwitchState();
  const router = useRouter();
  const { token, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  // Analytics opt-out, mirrored on the server too. We initialise from
  // the local flag so the toggle paints correctly on first render even
  // if the server fetch hasn't returned yet.
  const [analyticsOff, setAnalyticsOff] = useState<boolean>(false);
  useEffect(() => { setAnalyticsOff(isAnalyticsOptedOut()); }, []);

  // ── Profile state ───────────────────────────────────────────────────────────
  const [name, setName]         = useState("");
  const [username, setUsername] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  // Off until the server says otherwise: a switch must never show a
  // permission the member has not given.
  const [hiveConsent, setHiveConsent] = useState(false);
  // Third-party AI consent as the server holds it.
  const [aiConsent, setAiConsent] = useState<{ required: boolean; version: string | null; at: string | null }>({ required: false, version: null, at: null });
  const [aiWithdrawOpen, setAiWithdrawOpen] = useState(false);
  // Under 16 (the server says age_restricted): the Oracle stays closed and
  // there is no consent to give, so the section shows a note instead.
  const [ageRestricted, setAgeRestricted] = useState(false);
  // The saved birth time checked against clock changes (/users/me). When
  // needs_confirmation is true the member is asked once which occurrence it
  // was (or to correct a time that never happened).
  const [birthCheck, setBirthCheck] = useState<StoredBirthTimeCheck>({ status: "ok", fold: null, options: [], needsConfirmation: false });
  const [birthConfirmed, setBirthConfirmed] = useState(false);
  // The birth details as the server holds them: confirming an occurrence
  // re-sends exactly these, never unsaved edits in the form.
  const savedBirthRef = useRef<{ date: string; time: string; city: string; lat: number | null; lon: number | null } | null>(null);
  const [aiStatus, setAiStatus] = useState<SaveStatus>("idle");
  const [aiError, setAiError] = useState<string | null>(null);
  const [photo, setPhoto]       = useState<string | null>(null);
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [birthCity, setBirthCity] = useState("");
  const [birthLat, setBirthLat]   = useState<number | null>(null);
  const [birthLon, setBirthLon]   = useState<number | null>(null);
  const [loading, setLoading]     = useState(true);
  // A failed /users/me must not render an empty, saveable form: saving it
  // would blank the member's name and birth data. Show an error + Retry.
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  // ── Delete account ─────────────────────────────────────────────────────────
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteStoreNote, setDeleteStoreNote] = useState(false);

  // ── Save status per section ─────────────────────────────────────────────────
  const [identityStatus, setIdentityStatus] = useState<SaveStatus>("idle");
  const [identityError,  setIdentityError]  = useState<string | null>(null);
  const [visibilityStatus, setVisibilityStatus] = useState<SaveStatus>("idle");
  const [visibilityError, setVisibilityError] = useState<string | null>(null);
  const [hiveStatus, setHiveStatus] = useState<SaveStatus>("idle");
  const [hiveError, setHiveError] = useState<string | null>(null);
  // The Oracle's memory switch as the server holds it (null until read: the
  // switch is never shown as a choice the server has not confirmed).
  const [memoryOn, setMemoryOn] = useState<boolean | null>(null);
  const [memoryLoadFailed, setMemoryLoadFailed] = useState(false);
  const [memoryStatus, setMemoryStatus] = useState<SaveStatus>("idle");
  const [memoryError, setMemoryError] = useState<string | null>(null);
  const [memoryClearOpen, setMemoryClearOpen] = useState(false);
  const [memoryClearStatus, setMemoryClearStatus] = useState<SaveStatus>("idle");
  const [photoStatus,    setPhotoStatus]    = useState<SaveStatus>("idle");
  const [photoError,     setPhotoError]     = useState<string | null>(null);
  const [birthStatus,    setBirthStatus]    = useState<SaveStatus>("idle");
  const [birthError,     setBirthError]     = useState<string | null>(null);

  // ── City autocomplete ───────────────────────────────────────────────────────
  const city = useCityAutocomplete(birthCity);
  const cityInputRef = useRef<HTMLInputElement>(null);
  const cityListRef  = useRef<HTMLDivElement>(null);
  const pickCity = (c: CitySuggestion) => {
    setBirthCity(c.display);
    setBirthLat(c.lat);
    setBirthLon(c.lon);
    city.settle(c.display);
  };

  const photoInputRef = useRef<HTMLInputElement>(null);

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setLoadError(false);
    apiFetch("/users/me", {}, token)
      .then((data) => {
        const p = data.profile || {};
        setName(p.name || "");
        setUsername(p.username || "");
        setIsPublic(Boolean(p.is_public));
        // The switch shows exactly what the server stored; a missing field
        // reads as not participating.
        setHiveConsent(p.hive_consent === true);
        setAiConsent(consentFromMe(data));
        setAgeRestricted(ageRestrictedFromMe(data));
        setBirthCheck(storedBirthTimeCheck(data));
        savedBirthRef.current = {
          date: p.birth_date || "", time: p.birth_time || "", city: p.birth_city || "",
          lat: p.birth_lat ?? null, lon: p.birth_lon ?? null,
        };
        // Birth details changed elsewhere: drop charts built from the old ones.
        syncBirthRevision(data);
        setPhoto(p.profile_photo || null);
        setBirthDate(p.birth_date || "");
        setBirthTime(p.birth_time || "");
        setBirthCity(p.birth_city || "");
        // The stored city is already resolved: no search until the member types.
        city.settle(p.birth_city || "");
        setBirthLat(p.birth_lat ?? null);
        setBirthLon(p.birth_lon ?? null);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [token, loadAttempt]);

  // The memory switch lives with the consent scopes.
  useEffect(() => {
    if (!token) return;
    let live = true;
    setMemoryOn(null);
    setMemoryLoadFailed(false);
    loadMemorySetting(token)
      .then((on) => { if (live) { setMemoryOn(on); setMemoryLoadFailed(on === null); } })
      .catch(() => { if (live) setMemoryLoadFailed(true); });
    return () => { live = false; };
  }, [token, loadAttempt]);

  // The consent sheet (or a withdrawal here) changed the server state:
  // read it back so this screen shows what is actually stored.
  useEffect(() => {
    if (!token) return;
    const onChanged = () => {
      apiFetch("/users/me", {}, token)
        .then((data) => setAiConsent(consentFromMe(data)))
        .catch(() => { /* keep the last known state */ });
    };
    window.addEventListener(AI_CONSENT_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(AI_CONSENT_CHANGED_EVENT, onChanged);
  }, [token]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (
        cityListRef.current && !cityListRef.current.contains(e.target as Node) &&
        cityInputRef.current && !cityInputRef.current.contains(e.target as Node)
      ) {
        city.close();
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // ── Action handlers ─────────────────────────────────────────────────────────
  const saveIdentity = async () => {
    if (!token) return;
    setIdentityStatus("saving");
    setIdentityError(null);
    try {
      await apiFetch("/users/profile", {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim() || undefined,
          username: username.trim() ? username.trim().replace(/^@/, "") : undefined,
        }),
      }, token);
      setIdentityStatus("saved");
      // Bust the profile-page blueprint cache so the new name/handle shows up there too
      try {
        const cached = localStorage.getItem(accountKey("solray_blueprint"));
        if (cached) {
          const bp = JSON.parse(cached);
          bp._name = name.trim();
          bp._username = username.trim().replace(/^@/, "");
          localStorage.setItem(accountKey("solray_blueprint"), JSON.stringify(bp));
        }
      } catch {}
      setTimeout(() => setIdentityStatus("idle"), 1800);
    } catch (e: unknown) {
      const msg = memberErrorText(e, t, "settings.could_not_save", { byStatus: { 400: "profile.username_unavailable", 409: "profile.username_unavailable" } });
      setIdentityError(msg);
      setIdentityStatus("error");
    }
  };

  // Privacy switches. One save at a time per switch (the switch is disabled
  // while saving), so two quick taps can never finish out of order and leave
  // the screen showing the opposite of what the server stored. On failure the
  // switch returns to the last value the server confirmed and says so.
  const toggleHiveConsent = async (next: boolean) => {
    if (!token || hiveStatus === "saving") return;
    const confirmed = hiveConsent;
    setHiveConsent(next);
    setHiveStatus("saving");
    setHiveError(null);
    try {
      await apiFetch("/users/profile", {
        method: "PATCH",
        body: JSON.stringify({ hive_consent: next }),
      }, token);
      setHiveStatus("saved");
      setTimeout(() => setHiveStatus((s) => (s === "saved" ? "idle" : s)), 1500);
    } catch {
      setHiveConsent(confirmed);
      setHiveStatus("error");
      setHiveError(t("settings.switch_failed"));
    }
  };

  const toggleVisibility = async (next: boolean) => {
    if (!token || visibilityStatus === "saving") return;
    const confirmed = isPublic;
    setIsPublic(next);
    setVisibilityStatus("saving");
    setVisibilityError(null);
    try {
      await apiFetch("/users/profile", {
        method: "PATCH",
        body: JSON.stringify({ is_public: next }),
      }, token);
      setVisibilityStatus("saved");
      setTimeout(() => setVisibilityStatus((s) => (s === "saved" ? "idle" : s)), 1500);
    } catch {
      setIsPublic(confirmed);
      setVisibilityStatus("error");
      setVisibilityError(t("settings.switch_failed"));
    }
  };

  // The memory switch, same pattern as the privacy switches above: one save
  // at a time, and on failure it returns to the value the server confirmed.
  const toggleMemory = async (next: boolean) => {
    if (!token || memoryOn === null || memoryStatus === "saving") return;
    const confirmed = memoryOn;
    setMemoryOn(next);
    setMemoryStatus("saving");
    setMemoryError(null);
    try {
      const stored = await saveMemorySetting(next, token);
      setMemoryOn(stored);
      setMemoryStatus("saved");
      setTimeout(() => setMemoryStatus((s) => (s === "saved" ? "idle" : s)), 1500);
    } catch {
      setMemoryOn(confirmed);
      setMemoryStatus("error");
      setMemoryError(t("settings.switch_failed"));
    }
  };

  // "Clear memory", only from its confirm step.
  const confirmClearMemory = async () => {
    if (!token || memoryClearStatus === "saving") return;
    setMemoryClearStatus("saving");
    setMemoryError(null);
    try {
      await clearMemory(token);
      setMemoryClearOpen(false);
      setMemoryClearStatus("saved");
    } catch {
      setMemoryClearStatus("error");
      setMemoryError(t("settings.memory_clear_failed"));
    }
  };

  // Withdrawing third-party AI consent. The Oracle and written readings stop
  // until the member agrees again; the chart and settings keep working.
  const withdrawAiConsent = async () => {
    if (!token || aiStatus === "saving") return;
    setAiStatus("saving");
    setAiError(null);
    try {
      await apiFetch("/users/me/ai-consent", { method: "DELETE" }, token);
      setAiConsent({ required: true, version: null, at: null });
      setAiWithdrawOpen(false);
      setAiStatus("saved");
      setTimeout(() => setAiStatus((s) => (s === "saved" ? "idle" : s)), 1500);
      try { window.dispatchEvent(new CustomEvent(AI_CONSENT_CHANGED_EVENT, { detail: { granted: false } })); } catch { /* ignore */ }
    } catch {
      setAiStatus("error");
      setAiError(t("settings.ai_consent_withdraw_failed"));
    }
  };

  return {
    ageRestricted, aiConsent, aiError, aiStatus, aiWithdrawOpen, analyticsOff, birthCheck, birthCity,
    birthConfirmed, birthDate, birthError, birthLat, birthLon, birthStatus, birthTime, city,
    cityInputRef, cityListRef, confirmClearMemory, deleteBusy, deleteError, deleteOpen,
    deletePassword, deleteStoreNote, hiveConsent, hiveError, hiveStatus, identityError,
    identityStatus, isPublic, lang, loadError, loading, logout, memoryClearOpen, memoryClearStatus,
    memoryError, memoryLoadFailed, memoryOn, memoryStatus, name, photo, photoError, photoInputRef,
    photoStatus, pickCity, router, saveIdentity, savedBirthRef, setAiError, setAiWithdrawOpen,
    setAnalyticsOff, setBirthCheck, setBirthCity, setBirthConfirmed, setBirthDate, setBirthError,
    setBirthLat, setBirthLon, setBirthStatus, setBirthTime, setDeleteBusy, setDeleteError,
    setDeleteOpen, setDeletePassword, setDeleteStoreNote, setLoadAttempt, setMemoryClearOpen,
    setMemoryClearStatus, setMemoryError, setName, setPhoto, setPhotoError, setPhotoStatus, setTheme,
    setUsername, switchState, t, theme, toggleHiveConsent, toggleMemory, toggleVisibility, token,
    username, visibilityError, visibilityStatus, withdrawAiConsent
  };
}
