"use client";

/**
 * /profile/settings, the gear-icon home for everything personal.
 *
 * Sections, top → bottom:
 *   1. Avatar, upload + replace your photo (PATCH /users/photo)
 *   2. Identity, name, @username             (PATCH /users/profile)
 *   3. Visibility, public/private toggle       (PATCH /users/profile is_public)
 *   4. Theme, dark/light mode             (localStorage + ThemeProvider)
 *   5. Birth, date, time, city            (PATCH /users/birth, regenerates blueprint)
 *   6. Subscription, link to /subscribe
 *   7. Sign out
 *
 * The page deliberately uses one column of generous-spaced rows rather
 * than dense grouped cards: settings is a place where users want to
 * read each line once and feel they understood it. Compactness here
 * costs trust.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { apiFetch, ApiError } from "@/lib/api";
import { AI_CONSENT_CHANGED_EVENT, consentFromMe, openAiConsentSheet } from "@/lib/ai-consent";
import { clearChartDerivedCaches, syncBirthRevision } from "@/lib/chart-revision";
import LanguagePicker from "@/components/LanguagePicker";
import { isAnalyticsOptedOut, setAnalyticsOptedOut } from "@/lib/analytics";
import { useT } from "@/lib/i18n";
import BirthWheels from "@/components/BirthWheels";
import { useCityAutocomplete, type CitySuggestion } from "@/lib/city-search";
import { PageHead, PageTitle, InkButton, HairlineButton } from "@/components/PageHead";


type SaveStatus = "idle" | "saving" | "saved" | "error";

export default function SettingsPage() {
  const { t, lang } = useT();
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
        const cached = localStorage.getItem("solray_blueprint");
        if (cached) {
          const bp = JSON.parse(cached);
          bp._name = name.trim();
          bp._username = username.trim().replace(/^@/, "");
          localStorage.setItem("solray_blueprint", JSON.stringify(bp));
        }
      } catch {}
      setTimeout(() => setIdentityStatus("idle"), 1800);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t("settings.could_not_save");
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

  const onPhotoSelected = async (file: File) => {
    if (!token) return;
    setPhotoStatus("saving");
    setPhotoError(null);
    const prevPhoto = photo;
    // Any failure (unreadable file, undecodable image, upload error) clears
    // the saving state and leaves a retryable message.
    const failPhoto = () => {
      setPhoto(prevPhoto);
      setPhotoStatus("error");
      setPhotoError(t("settings.photo_failed"));
      setTimeout(() => setPhotoStatus("idle"), 2200);
    };
    // Resize to 384x384 JPEG ~80q before upload, matches the existing
    // /users/photo size budget (under 2MB) and keeps avatars crisp on retina.
    const reader = new FileReader();
    reader.onerror = failPhoto;
    reader.onabort = failPhoto;
    reader.onload = () => {
      const img = new Image();
      img.onerror = failPhoto;
      img.onload = async () => {
        try {
          const canvas = document.createElement("canvas");
          const SIZE = 384;
          canvas.width = SIZE;
          canvas.height = SIZE;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas context unavailable");
          // Cover-style crop (square center)
          const min = Math.min(img.width, img.height);
          const sx = (img.width - min) / 2;
          const sy = (img.height - min) / 2;
          ctx.drawImage(img, sx, sy, min, min, 0, 0, SIZE, SIZE);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
          setPhoto(dataUrl);
          await apiFetch("/users/photo", {
            method: "PATCH",
            body: JSON.stringify({ photo: dataUrl }),
          }, token);
          // Sync to local cache so profile page picks it up immediately
          try {
            localStorage.setItem("solray_avatar", dataUrl);
            const cached = localStorage.getItem("solray_blueprint");
            if (cached) {
              const bp = JSON.parse(cached);
              bp._profile_photo = dataUrl;
              localStorage.setItem("solray_blueprint", JSON.stringify(bp));
            }
          } catch {}
          setPhotoStatus("saved");
          setTimeout(() => setPhotoStatus("idle"), 1800);
        } catch {
          failPhoto();
        }
      };
      img.src = reader.result as string;
    };
    try {
      reader.readAsDataURL(file);
    } catch {
      failPhoto();
    }
  };

  const saveBirth = async () => {
    if (!token) return;
    if (!birthDate || !birthTime) {
      setBirthError(t("settings.birth_date_time_required"));
      setBirthStatus("error");
      setTimeout(() => setBirthStatus("idle"), 2200);
      return;
    }
    // Birth-data updates recompute the user's full chart. We refuse to
    // submit a city string that hasn't been resolved to coordinates,
    // because backend geocoding can be slow or fail and we'd rather
    // catch the ambiguity here than silently corrupt the chart.
    if (birthCity.trim() && (birthLat == null || birthLon == null)) {
      setBirthError(t("settings.birth_city_select_hint"));
      setBirthStatus("error");
      setTimeout(() => setBirthStatus("idle"), 3200);
      return;
    }
    setBirthStatus("saving");
    setBirthError(null);
    try {
      const body: Record<string, unknown> = {
        birth_date: birthDate,
        birth_time: birthTime,
        birth_city: birthCity || undefined,
      };
      if (birthLat != null) body.birth_lat = birthLat;
      if (birthLon != null) body.birth_lon = birthLon;
      const res = await apiFetch("/users/birth", { method: "PATCH", body: JSON.stringify(body) }, token);
      // Every chart computed from the old birth details is now wrong:
      // astrocartography, cycles, forecasts, the week, compatibility.
      clearChartDerivedCaches();
      // Refresh the local blueprint cache from authoritative server data.
      // We DO NOT inject local React state (name/username/photo) here , 
      // an earlier draft did, and it could overwrite the cached identity
      // fields with unsaved form input.
      //
      // Order of preference for the identity fields:
      //   1. Fresh /users/me response (best, known committed values)
      //   2. Whatever was in the previous cache (preserves last-known-good
      //      when /users/me fails on a network blip)
      //   3. Empty (only when there's no cache and no network response , 
      //      effectively the "first save ever" path)
      //
      // The blueprint payload itself ALWAYS gets written; that's the whole
      // point of the call and is authoritative regardless.
      try {
        if (res?.blueprint) {
          const me = await apiFetch("/users/me", {}, token).catch(() => null);
          if (me) syncBirthRevision(me);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let prev: any = null;
          try {
            const raw = localStorage.getItem("solray_blueprint");
            prev = raw ? JSON.parse(raw) : null;
          } catch {}
          const bp = res.blueprint;
          bp._cache_version = 4;
          bp._name         = me?.profile?.name           ?? prev?._name           ?? "";
          bp._username     = me?.profile?.username       ?? prev?._username       ?? "";
          bp._profile_photo= me?.profile?.profile_photo  ?? prev?._profile_photo  ?? null;
          bp._cachedAt = Date.now();
          localStorage.setItem("solray_blueprint", JSON.stringify(bp));
        }
      } catch {}
      setBirthStatus("saved");
      setTimeout(() => setBirthStatus("idle"), 1800);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t("settings.could_not_save");
      setBirthError(msg);
      setBirthStatus("error");
    }
  };

  const handleSignOut = () => {
    logout();
    router.replace("/login");
  };

  // Account deletion. Inline confirm, never window.confirm (native dialogs
  // block the webview automation and look foreign in the app). The member
  // re-enters their password, which the server checks before deleting, so a
  // phone left unlocked cannot erase the account.
  const handleDeleteAccount = async () => {
    if (!token || !deletePassword || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const res = await apiFetch("/users/me", {
        method: "DELETE",
        body: JSON.stringify({ confirm: "DELETE", password: deletePassword }),
      }, token, { keepSessionOn401: true });
      setDeletePassword("");
      if (res?.store_managed) {
        // Apple / Google keep billing until the member cancels there. Say
        // so before signing out; the member leaves with the Done button.
        setDeleteStoreNote(true);
        setDeleteBusy(false);
        return;
      }
      logout();
      router.replace("/login");
    } catch (e: unknown) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        setDeleteError(t("settings.delete_wrong_password"));
      } else {
        setDeleteError(e instanceof Error ? e.message : t("settings.delete_failed"));
      }
      setDeleteBusy(false);
    }
  };

  const initials = (name || "S").charAt(0).toUpperCase();

  return (
    <ProtectedRoute>
      <div
        className="min-h-[100dvh] bg-forest-deep"
        style={{ paddingBottom: "calc(96px + var(--sab, 0px))" }}
      >
        {/* Header: the one look. Back to the profile in the right slot. */}
        <PageHead
          label={t("profile.section_label")}
          right={
            <button
              onClick={() => router.push("/profile")}
              aria-label={t("settings.back_to_profile")}
              className="font-body uppercase font-bold flex items-center gap-1"
              style={{ fontSize: 12, letterSpacing: "0.2em", color: "rgb(var(--rgb-text-secondary))", minHeight: 44 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
              {t("common.back")}
            </button>
          }
        />

        {loading ? (
          <div className="max-w-lg mx-auto px-5 pt-12">
            <div className="h-1 w-32 skeleton-shimmer rounded-full" />
          </div>
        ) : loadError ? (
          <div className="max-w-lg mx-auto px-5">
            <PageTitle title={t("settings.load_error_title")} sub={t("settings.load_error_body")} />
            <InkButton onClick={() => setLoadAttempt((n) => n + 1)}>{t("common.retry")}</InkButton>
          </div>
        ) : (
          <div className="max-w-lg mx-auto px-5 page-enter">
            <PageTitle title={t("common.settings")} />

            {/* ── 1. Avatar ──────────────────────────────────────────────── */}
            <Section
              label={t("settings.profile_photo")}
              status={photoStatus}
              hint={t("settings.profile_photo_hint")}
            >
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="relative shrink-0"
                  style={{ width: 72, height: 72 }}
                  aria-label={t("settings.change_photo")}
                >
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photo}
                      alt={t("settings.photo_alt")}
                      className="w-full h-full rounded-full object-cover border border-forest-border"
                    />
                  ) : (
                    <div className="w-full h-full rounded-full border border-forest-border flex items-center justify-center font-heading text-text-primary" style={{ fontSize: 26, fontWeight: 900 }}>
                      {initials}
                    </div>
                  )}
                  <span
                    className="absolute -bottom-1 -right-1 rounded-full flex items-center justify-center"
                    style={{ width: 22, height: 22, background: "rgb(var(--rgb-text-primary))", color: "rgb(var(--rgb-bg-deep))" }}
                    aria-hidden
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                      <circle cx="12" cy="13" r="4"/>
                    </svg>
                  </span>
                </button>
                <div className="flex-1">
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="font-body text-[15px] text-text-secondary hover:text-text-primary transition-colors underline underline-offset-4"
                  >
                    {photo ? t("settings.replace_photo") : t("settings.upload_photo")}
                  </button>
                </div>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    // Reset so picking the same file again retries.
                    e.target.value = "";
                    if (f) onPhotoSelected(f);
                  }}
                />
              </div>
              {photoError && (
                <p role="alert" className="font-body text-[14px] mt-3" style={{ color: "rgb(var(--rgb-ember))" }}>
                  {photoError}
                </p>
              )}
            </Section>

            {/* ── 2. Identity ───────────────────────────────────────────── */}
            <Section
              label={t("settings.identity")}
              status={identityStatus}
              error={identityError}
            >
              <div className="space-y-4">
                <FieldRow label={t("common.name")}>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full font-body text-[17px] text-text-primary bg-transparent border-b border-forest-border/60 focus:border-text-primary pb-1.5 transition-colors"
                    placeholder={t("settings.name_placeholder")}
                  />
                </FieldRow>
                <FieldRow label={t("common.username")}>
                  <div className="flex items-baseline gap-1">
                    <span className="font-body text-[17px] text-text-secondary">@</span>
                    <input
                      value={username}
                      onChange={(e) => setUsername(e.target.value.replace(/^@/, ""))}
                      className="flex-1 font-body text-[17px] text-text-primary bg-transparent border-b border-forest-border/60 focus:border-text-primary pb-1.5 transition-colors"
                      placeholder={t("settings.username_placeholder")}
                      autoCapitalize="none"
                      autoCorrect="off"
                    />
                  </div>
                </FieldRow>
                <div className="flex justify-end pt-2">
                  <SaveButton onClick={saveIdentity} status={identityStatus} />
                </div>
              </div>
            </Section>

            {/* ── 3. Visibility ─────────────────────────────────────────── */}
            <Section
              label={t("settings.profile_visibility")}
              status={visibilityStatus}
              error={visibilityError}
              hint={isPublic
                ? t("settings.visibility_public_hint")
                : t("settings.visibility_private_hint")}
            >
              <Toggle
                label={isPublic ? t("common.public") : t("common.private")}
                checked={isPublic}
                onChange={toggleVisibility}
                disabled={visibilityStatus === "saving"}
              />
            </Section>

            {/* ── 4. Theme ──────────────────────────────────────────────── */}
            <Section
              label={t("settings.theme")}
              hint={theme === "light"
                ? t("settings.theme_light_hint")
                : t("settings.theme_dark_hint")}
            >
              <div className="flex gap-2">
                <ThemeButton active={theme === "dark"}  onClick={() => setTheme("dark")}  label={t("settings.theme_dark")}  />
                <ThemeButton active={theme === "light"} onClick={() => setTheme("light")} label={t("settings.theme_light")} />
              </div>
            </Section>

            {/* ── 4a. Language ─────────────────────────────────────────── */}
            <Section
              label={t("settings.language_section")}
              hint={t("settings.language_hint")}
            >
              <LanguagePicker layout="list" />
            </Section>

            {/* ── 4b. Analytics privacy ────────────────────────────────── */}
            <Section
              label={t("settings.analytics")}
              hint={analyticsOff
                ? t("settings.analytics_off_hint")
                : t("settings.analytics_on_hint")}
            >
              <Toggle
                label={analyticsOff ? t("common.off") : t("common.on")}
                checked={!analyticsOff}
                onChange={async (next) => {
                  // next=true means analytics is ON, opt-out is FALSE
                  const optOut = !next;
                  setAnalyticsOff(optOut);
                  setAnalyticsOptedOut(optOut);
                  // Mirror to the server so the flag persists across devices
                  if (token) {
                    try {
                      await apiFetch("/users/analytics-opt-out", {
                        method: "PATCH",
                        body: JSON.stringify({ opt_out: optOut }),
                      }, token);
                    } catch {
                      // Local flag is the immediate authority; server sync
                      // is best-effort. If it fails, the user's choice on
                      // this device still holds.
                    }
                  }
                }}
              />
            </Section>

            {/* ── 4c. The Collective ───────────────────────────────────── */}
            <Section
              label={t("settings.collective")}
              status={hiveStatus}
              error={hiveError}
              hint={hiveConsent
                ? t("settings.collective_on_hint")
                : t("settings.collective_off_hint")}
            >
              <Toggle
                label={hiveConsent ? t("common.on") : t("common.off")}
                checked={hiveConsent}
                onChange={toggleHiveConsent}
                disabled={hiveStatus === "saving"}
              />
            </Section>

            {/* ── 4d. Third-party AI ───────────────────────────────────── */}
            <Section
              label={t("settings.ai_consent_section")}
              status={aiStatus}
              error={aiError}
              hint={aiConsent.version && !aiConsent.required
                ? t("settings.ai_consent_on_hint")
                : t("settings.ai_consent_off_hint")}
            >
              <div className="space-y-3">
                <p className="font-body text-[17px] text-text-primary">
                  {aiConsent.version && !aiConsent.required
                    ? (aiConsent.at
                        ? t("settings.ai_consent_given_on").replace("{date}", formatConsentDate(aiConsent.at, lang))
                        : t("settings.ai_consent_given"))
                    : t("settings.ai_consent_not_given")}
                </p>
                {aiConsent.version && !aiConsent.required ? (
                  !aiWithdrawOpen ? (
                    <HairlineButton onClick={() => { setAiWithdrawOpen(true); setAiError(null); }}>
                      {t("settings.ai_consent_withdraw")}
                    </HairlineButton>
                  ) : (
                    <div className="space-y-3">
                      <p className="font-body" style={{ fontSize: 15, lineHeight: 1.6, color: "rgb(var(--rgb-text-secondary))" }}>
                        {t("settings.ai_consent_withdraw_body")}
                      </p>
                      <HairlineButton
                        onClick={withdrawAiConsent}
                        loading={aiStatus === "saving"}
                        style={{ color: "rgb(var(--rgb-ember))", borderColor: "rgb(var(--rgb-ember) / .5)" }}
                      >
                        {t("settings.ai_consent_withdraw_confirm")}
                      </HairlineButton>
                      <HairlineButton onClick={() => setAiWithdrawOpen(false)} disabled={aiStatus === "saving"}>
                        {t("common.cancel")}
                      </HairlineButton>
                    </div>
                  )
                ) : (
                  <HairlineButton onClick={() => openAiConsentSheet()}>
                    {t("settings.ai_consent_give")}
                  </HairlineButton>
                )}
              </div>
            </Section>

            {/* ── 5. Birth details ─────────────────────────────────────── */}
            <Section
              label={t("settings.birth_details")}
              status={birthStatus}
              error={birthError}
              hint={t("settings.birth_details_hint")}
            >
              <div className="space-y-4">
                {/* The birth moment as one instrument, mundane's wheel.
                    Two native pickers made a birth into two unrelated form
                    fields, and on a phone each one opened a modal of its own. */}
                <BirthWheels
                  date={birthDate}
                  time={birthTime}
                  onChange={(d, tm) => { setBirthDate(d); setBirthTime(tm); }}
                />
                <FieldRow label={t("common.city")}>
                  <div className="relative">
                    <input
                      ref={cityInputRef}
                      value={birthCity}
                      onChange={(e) => {
                        setBirthCity(e.target.value);
                        setBirthLat(null);
                        setBirthLon(null);
                      }}
                      onKeyDown={(e) => { city.onKeyDown(e, pickCity); }}
                      onFocus={() => birthCity.length >= 2 && city.setOpen(city.suggestions.length > 0)}
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded={city.open && city.suggestions.length > 0}
                      aria-controls="settings-city-list"
                      aria-activedescendant={city.active >= 0 ? `settings-city-${city.active}` : undefined}
                      className="w-full font-body text-[17px] text-text-primary bg-transparent border-b border-forest-border/60 focus:border-text-primary pb-1.5 transition-colors"
                      placeholder={t("settings.city_placeholder")}
                      autoCapitalize="words"
                    />
                    {city.loading && (
                      <span className="absolute right-1 top-1 text-[14px] text-text-muted">{t("settings.searching")}</span>
                    )}
                    {city.open && city.suggestions.length > 0 && (
                      <div
                        ref={cityListRef}
                        role="listbox"
                        id="settings-city-list"
                        className="absolute left-0 right-0 mt-1 bg-forest-card border border-forest-border rounded-xl overflow-hidden z-10 shadow-xl"
                      >
                        {city.suggestions.map((s, i) => (
                          <button
                            key={s.display}
                            id={`settings-city-${i}`}
                            type="button"
                            role="option"
                            aria-selected={i === city.active}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pickCity(s)}
                            className={`block w-full text-left px-3 py-2 font-body text-[17px] text-text-primary hover:bg-forest-border/40 transition-colors${i === city.active ? " bg-forest-border/40" : ""}`}
                            style={{ minHeight: 44 }}
                          >
                            {s.display}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </FieldRow>
                <div className="flex justify-end pt-2">
                  <SaveButton onClick={saveBirth} status={birthStatus} />
                </div>
              </div>
            </Section>

            {/* ── 6. Subscription ──────────────────────────────────────── */}
            <Section label={t("settings.subscription")} hint={t("settings.subscription_hint")}>
              <button
                onClick={() => router.push("/subscribe")}
                className="font-body text-[17px] font-medium hover:opacity-80 transition-opacity flex items-center gap-2"
                style={{ color: "rgb(var(--rgb-text-primary))" }}
              >
                {t("common.manage_subscription")}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            </Section>

            {/* ── 6a. Legal and support ───────────────────────────────────
                App Review looks for the privacy policy and a support route
                inside the app. These open in the system browser on native
                (solray.ai is deliberately outside the WebView allow-list). */}
            <Section label={t("settings.legal_section")}>
              <div className="space-y-3">
                <a
                  href="https://solray.ai/legal"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-body text-[17px] font-medium hover:opacity-80 transition-opacity flex items-center gap-2"
                  style={{ color: "rgb(var(--rgb-text-primary))" }}
                >
                  {t("settings.terms_privacy")}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </a>
                <a
                  href="https://solray.ai/support"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-body text-[17px] font-medium hover:opacity-80 transition-opacity flex items-center gap-2"
                  style={{ color: "rgb(var(--rgb-text-primary))" }}
                >
                  {t("settings.support")}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </a>
                <a
                  href="https://solray.ai/account-deletion"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-body text-[17px] font-medium hover:opacity-80 transition-opacity flex items-center gap-2"
                  style={{ color: "rgb(var(--rgb-text-primary))" }}
                >
                  {t("settings.deletion_info")}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </a>
              </div>
            </Section>

            {/* ── 7. Sign out ──────────────────────────────────────────── */}
            <div className="py-6">
              <HairlineButton onClick={handleSignOut}>{t("common.sign_out")}</HairlineButton>
            </div>

            {/* ── 8. Delete account ────────────────────────────────────── */}
            <Section label={t("settings.delete_section")} hint={deleteOpen ? undefined : t("settings.delete_hint")}>
              {deleteStoreNote ? (
                <div className="space-y-4">
                  <p className="font-body" style={{ fontSize: 17, lineHeight: 1.62, fontWeight: 500, color: "rgb(var(--rgb-text-primary))" }}>
                    {t("settings.delete_done_store")}
                  </p>
                  <HairlineButton onClick={() => { logout(); router.replace("/login"); }}>
                    {t("common.done")}
                  </HairlineButton>
                </div>
              ) : !deleteOpen ? (
                <HairlineButton
                  onClick={() => { setDeleteOpen(true); setDeletePassword(""); setDeleteError(null); }}
                  style={{ color: "rgb(var(--rgb-ember))", borderColor: "rgb(var(--rgb-ember) / .5)" }}
                >
                  {t("settings.delete_button")}
                </HairlineButton>
              ) : (
                <div className="space-y-4">
                  <p className="font-body" style={{ fontSize: 17, lineHeight: 1.62, fontWeight: 500, color: "rgb(var(--rgb-text-primary))" }}>
                    {t("settings.delete_confirm_body")}
                  </p>
                  <p className="font-body" style={{ fontSize: 15, lineHeight: 1.6, color: "rgb(var(--rgb-text-secondary))" }}>
                    {t("settings.delete_password_prompt")}
                  </p>
                  <input
                    type="password"
                    value={deletePassword}
                    onChange={(e) => { setDeletePassword(e.target.value); setDeleteError(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") handleDeleteAccount(); }}
                    placeholder={t("settings.delete_password_placeholder")}
                    autoComplete="current-password"
                    aria-label={t("settings.delete_password_prompt")}
                    className="w-full font-body text-[17px] text-text-primary bg-transparent border-b border-forest-border/60 focus:border-text-primary pb-1.5 transition-colors"
                  />
                  {deleteError && (
                    <p role="alert" className="font-body" style={{ fontSize: 15, color: "rgb(var(--rgb-ember))" }}>{deleteError}</p>
                  )}
                  <HairlineButton
                    onClick={handleDeleteAccount}
                    loading={deleteBusy}
                    disabled={!deletePassword}
                    style={{ color: "rgb(var(--rgb-ember))", borderColor: "rgb(var(--rgb-ember) / .5)" }}
                  >
                    {t("settings.delete_confirm_button")}
                  </HairlineButton>
                  <HairlineButton onClick={() => { setDeleteOpen(false); setDeletePassword(""); setDeleteError(null); }} disabled={deleteBusy}>
                    {t("common.cancel")}
                  </HairlineButton>
                </div>
              )}
            </Section>

          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Local presentational helpers, kept in-file because they have zero re-use
// outside this page and exporting them would just be ceremony.
// ─────────────────────────────────────────────────────────────────────────────

function Section({
  label,
  status,
  error,
  hint,
  children,
}: {
  label: string;
  status?: SaveStatus;
  error?: string | null;
  hint?: string;
  children: React.ReactNode;
}) {
  const { t } = useT();
  return (
    <section className="pb-6" style={{ borderTop: "1px solid rgb(var(--rgb-border))" }}>
      <div className="flex items-baseline justify-between" style={{ paddingBlock: 16 }}>
        <p className="font-body uppercase" style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.2em", color: "rgb(var(--rgb-text-muted))" }}>{label}</p>
        {status === "saving" && <span className="font-body text-[14px] text-text-muted">{t("settings.saving")}</span>}
        {status === "saved"  && <span className="font-body text-[14px] text-moss">{t("common.saved")}</span>}
      </div>
      {children}
      {error && <p className="mt-3 font-body text-[15px] text-ember">{error}</p>}
      {hint  && !error && <p className="mt-3 font-body text-[15px] leading-relaxed text-text-muted">{hint}</p>}
    </section>
  );
}

function formatConsentDate(iso: string, lang: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso.slice(0, 10);
    return d.toLocaleDateString(lang === "en" ? "en-GB" : lang, { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-body text-[14px] tracking-[0.18em] uppercase text-text-muted mb-1.5 font-bold">{label}</p>
      {children}
    </div>
  );
}

function SaveButton({ onClick, status }: { onClick: () => void; status: SaveStatus }) {
  const { t } = useT();
  const disabled = status === "saving";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="font-body text-[13px] tracking-[0.25em] uppercase px-5 py-2.5 rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-bold"
      style={{ background: "transparent", border: "1px solid rgb(var(--rgb-border))", color: "rgb(var(--rgb-text-primary))" }}
    >
      {status === "saving" ? t("common.saving") : t("common.save")}
    </button>
  );
}

function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (next: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-busy={disabled || undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between w-full disabled:opacity-60"
      style={{ minHeight: 44 }}
    >
      <span className="font-body text-[17px] text-text-primary">{label}</span>
      <span
        className="relative rounded-full transition-colors"
        style={{
          width: 44,
          height: 24,
          backgroundColor: checked ? "rgb(var(--rgb-text-primary))" : "rgb(var(--rgb-border))",
        }}
      >
        <span
          className="absolute top-0.5 rounded-full transition-all"
          style={{
            width: 20,
            height: 20,
            left: checked ? 22 : 2,
            backgroundColor: "rgb(var(--rgb-bg-deep))",
          }}
        />
      </span>
    </button>
  );
}

function ThemeButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 font-body text-[13px] tracking-[0.25em] uppercase py-2.5 rounded-full transition-colors font-bold"
      style={{
        backgroundColor: active ? "rgb(var(--rgb-text-primary))" : "transparent",
        color: active ? "rgb(var(--rgb-bg-deep))" : "rgb(var(--rgb-text-secondary))",
        border: `1px solid ${active ? "rgb(var(--rgb-text-primary))" : "rgb(var(--rgb-border))"}`,
      }}
    >
      {label}
    </button>
  );
}
