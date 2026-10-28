"use client";

import { useChartRevision } from "@/lib/use-chart-revision";
import { memberErrorText } from "@/lib/member-error";
import { beginUnfinishedWork } from "@/lib/draft-guard";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import dynamic from "next/dynamic";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { cardShareAvailable } from "@/lib/share-available";
import { Wordmark } from "@/components/Wordmark";
import { syncBirthRevision } from "@/lib/chart-revision";
import { accountKey, captureAccount, isStaleAccountError } from "@/lib/account-session";
import { type ProfileData, parseProfile } from "./_lib/profile-data";
import { ProfileSkeleton } from "./_components/ProfileSkeleton";
import { CollapsibleSection } from "./_components/CollapsibleSection";
import { SoulMapRadarChart } from "./_components/SoulMapRadarChart";
import { BlueprintSections } from "./_components/BlueprintSections";

// Astrocartography ships a ~60KB world-path module plus mapping libs. It lives
// inside a collapsed section that rarely opens, so code-split it into its own
// chunk that loads on demand instead of bloating the profile route bundle.

// Main Page

export default function ProfilePage() {
  const { t, lang } = useT();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);
  const { token, logout } = useAuth();
  const router = useRouter();

  // Edit state
  const [editingName, setEditingName] = useState(false);
  const [editingHandle, setEditingHandle] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [handleInput, setHandleInput] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [savingHandle, setSavingHandle] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarSaving, setAvatarSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const soulMapRef = useRef<HTMLDivElement | null>(null);
  // One section at a time. Soul Map is the one that opens on arrival.
  const [openSection, setOpenSection] = useState<string | null>("Soul Map");
  const toggleSection = (title: string) =>
    setOpenSection((cur) => (cur === title ? null : title));
  const [soulMapSharing, setSoulMapSharing] = useState(false);
  const [shareOk, setShareOk] = useState(false);
  const [shareError, setShareError] = useState(false);
  useEffect(() => { setShareOk(cardShareAvailable()); }, []);
  // /users/me failed with no cache to fall back on. Must not be read as
  // "no birth data yet": show an error with Retry instead.
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  // The birth chart behind everything this page shows (astrology, Human
  // Design, Gene Keys, the Soul Map). A correction here or in another tab
  // changes it: the chart on screen is cleared and loaded again, and a load
  // started for the old chart never lands (Codex out19-5).
  const chartRev = useChartRevision();
  const shownRevRef = useRef(chartRev);

  const handleSoulMapShare = async () => {
    if (soulMapSharing || !soulMapRef.current) return;
    setSoulMapSharing(true);
    setShareError(false);
    try {
      const { shareOrDownloadCard } = await import("@/lib/share-card");
      await shareOrDownloadCard({
        node: soulMapRef.current,
        filename: "solray-soul-map.png",
        title: t("profile.share_soul_map_title"),
        text: t("profile.share_soul_map_text"),
        naturalSize: true,      // capture the card exactly as it appears, not a screen
        background: "rgb(var(--rgb-card))",  // the card plane behind the translucent layer
      });
    } catch (err) {
      console.warn("[share] soul map failed", err);
      setShareError(true);
    } finally {
      setSoulMapSharing(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    setLoadError(false);
    // A load superseded by a newer one (a chart change, a retry, another
    // account) drops its answer.
    let cancelled = false;
    if (shownRevRef.current !== chartRev) {
      // The chart changed: what is on screen was built from the old one.
      shownRevRef.current = chartRev;
      setProfile(null);
      setLoading(true);
    }

    const BP_CACHE_KEY = accountKey("solray_blueprint");
    // Bump when blueprint schema changes. v4 adds _profile_photo to cache.
    const BP_CACHE_VERSION = 4;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function loadFromBlueprint(bp: any) {
      if (cancelled) return;
      // Load avatar: prefer cache entry, fall back to solray_avatar key
      const photo = bp._profile_photo || (() => {
        try { return localStorage.getItem(accountKey("solray_avatar")); } catch { return null; }
      })();
      if (photo) setAvatarUrl(photo);

      try {
        const p = parseProfile(bp);
        setProfile(p);
        setLoading(false);
        setTimeout(() => setVisible(true), 50);
      } catch {
        setLoading(false);
      }
    }

    // Try cache first, cheap path (no network call)
    try {
      const cached = localStorage.getItem(BP_CACHE_KEY);
      if (cached) {
        const bp = JSON.parse(cached);
        if ((bp._cache_version ?? 0) < BP_CACHE_VERSION) {
          localStorage.removeItem(BP_CACHE_KEY);
          // Fall through to fresh fetch below
        } else if (!bp._name) {
          apiFetch("/users/me", {}, token)
            .then((data) => {
              if (cancelled) return;
              // Birth details changed since this cache was built: rebuild.
              if (syncBirthRevision(data)) { setLoadAttempt((n) => n + 1); return; }
              const bpWithUser = {
                ...bp,
                _name: data.profile?.name || data.name || "",
                _username: data.profile?.username || data.username || "",
                _profile_photo: data.profile?.profile_photo || bp._profile_photo || null,
              };
              try { localStorage.setItem(BP_CACHE_KEY, JSON.stringify(bpWithUser)); } catch (_) {}
              loadFromBlueprint(bpWithUser);
            })
            .catch(() => loadFromBlueprint(bp));
          return () => { cancelled = true; };
        } else {
          loadFromBlueprint(bp);
          // Paint from cache, then check in the background that the cache
          // was built from the current birth details (an edit on another
          // device leaves it stale); if not, rebuild from the server.
          apiFetch("/users/me", {}, token)
            .then((data) => { if (!cancelled && syncBirthRevision(data)) setLoadAttempt((n) => n + 1); })
            .catch(() => { /* offline: the cached chart stays */ });
          return () => { cancelled = true; };
        }
      }
    } catch (_) {}

    // No cache, fetch full blueprint (first load or after cache bust)
    apiFetch("/users/me", {}, token)
      .then((data) => {
        if (cancelled) return;
        syncBirthRevision(data);
        if (data.blueprint) {
          const bpWithUser = {
            ...data.blueprint,
            _name: data.profile?.name || data.name || "",
            _username: data.profile?.username || data.username || "",
            _profile_photo: data.profile?.profile_photo || null,
            _cachedAt: Date.now(),
            _cache_version: BP_CACHE_VERSION,
          };
          try { localStorage.setItem(BP_CACHE_KEY, JSON.stringify(bpWithUser)); } catch (_) {}
          loadFromBlueprint(bpWithUser);
        } else {
          setLoading(false);
          setTimeout(() => setVisible(true), 50);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError(true);
        setLoading(false);
        setTimeout(() => setVisible(true), 50);
      });
    return () => { cancelled = true; };
  }, [token, loadAttempt, chartRev]);

  const handleSignOut = () => {
    logout();
    router.push("/login");
  };

  const initials = profile?.name ? profile.name.charAt(0).toUpperCase() : "S";

  // Save display name
  const handleSaveName = async () => {
    if (!nameInput.trim() || !token) return;
    setSavingName(true);
    setSaveError(null);
    try {
      const data = await apiFetch("/users/profile", { method: "PATCH", body: JSON.stringify({ name: nameInput.trim() }) }, token);
      setProfile((p) => p ? { ...p, name: data.name } : p);
      // Update localStorage cache so name persists
      try {
        const cached = localStorage.getItem(accountKey("solray_blueprint"));
        if (cached) {
          const bp = JSON.parse(cached);
          bp._name = data.name;
          localStorage.setItem(accountKey("solray_blueprint"), JSON.stringify(bp));
        }
      } catch (_) {}
      setEditingName(false);
    } catch (e: unknown) {
      setSaveError(memberErrorText(e, t, "profile.error_save"));
    } finally {
      setSavingName(false);
    }
  };

  // Save username
  const handleSaveHandle = async () => {
    if (!handleInput.trim() || !token) return;
    setSavingHandle(true);
    setSaveError(null);
    try {
      const data = await apiFetch("/users/profile", { method: "PATCH", body: JSON.stringify({ username: handleInput.trim() }) }, token);
      setProfile((p) => p ? { ...p, handle: data.username } : p);
      // Update localStorage cache so username persists
      try {
        const cached = localStorage.getItem(accountKey("solray_blueprint"));
        if (cached) {
          const bp = JSON.parse(cached);
          bp._username = data.username;
          localStorage.setItem(accountKey("solray_blueprint"), JSON.stringify(bp));
        }
      } catch (_) {}
      setEditingHandle(false);
    } catch (e: unknown) {
      setSaveError(memberErrorText(e, t, "profile.error_save", { byStatus: { 400: "profile.username_unavailable", 409: "profile.username_unavailable" } }));
    } finally {
      setSavingHandle(false);
    }
  };

  // Handle avatar selection, resize to max 400px, save to server + localStorage
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // The account this photo belongs to, captured as it is chosen: reading
    // and decoding take time and the account may change meanwhile. Then
    // nothing is shown, cached or sent (Codex out12-5 #3).
    const acct = captureAccount();
    // Reading and resizing the photo is not a request yet: the update
    // reload waits for it until the upload ends (lib/draft-guard).
    const done = beginUnfinishedWork();
    const reader = new FileReader();
    reader.onerror = () => done();
    reader.onabort = () => done();
    reader.onload = (ev) => {
      if (!acct.live) { done(); return; }
      const rawBase64 = ev.target?.result as string;

      // Resize to max 400px on longest side before storing (keeps payload small)
      const img = new Image();
      img.onerror = () => done();
      img.onload = () => {
        if (!acct.live) { done(); return; }
        const MAX = 400;
        const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
        const canvas = document.createElement("canvas");
        canvas.width  = Math.round(img.width  * ratio);
        canvas.height = Math.round(img.height * ratio);
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const resized = canvas.toDataURL("image/jpeg", 0.82);

        // Show immediately
        setAvatarUrl(resized);
        try { localStorage.setItem(accountKey("solray_avatar"), resized); } catch (_) {}

        // Write photo into blueprint cache so other devices get it on next cache-bust
        try {
          const bpRaw = localStorage.getItem(accountKey("solray_blueprint"));
          if (bpRaw) {
            const bp = JSON.parse(bpRaw);
            localStorage.setItem(accountKey("solray_blueprint"), JSON.stringify({ ...bp, _profile_photo: resized }));
          }
        } catch (_) {}

        // Persist to server, read token fresh from localStorage to avoid stale closure
        const liveToken = token || (typeof localStorage !== "undefined" ? localStorage.getItem("solray_token") : null);
        if (liveToken) {
          setAvatarSaving("saving");
          apiFetch("/users/photo", { method: "PATCH", body: JSON.stringify({ photo: resized }) }, liveToken,
            { generation: acct.generation })
            .then(() => {
              done();
              if (!acct.live) return;
              setAvatarSaving("saved");
              setTimeout(() => setAvatarSaving("idle"), 3000);
            })
            .catch((err) => {
              done();
              if (isStaleAccountError(err) || !acct.live) return;
              console.error("[avatar upload] PATCH /users/photo failed:", err);
              setAvatarSaving("error");
              setTimeout(() => setAvatarSaving("idle"), 6000);
            });
        } else {
          done();
          console.warn("[avatar upload] no token available, photo saved locally only");
          setAvatarSaving("error");
          setTimeout(() => setAvatarSaving("idle"), 6000);
        }
      };
      img.src = rawBase64;
    };
    try { reader.readAsDataURL(file); } catch { done(); }
  };

  return (
    <ProtectedRoute>
      <div
        className="min-h-[100dvh] bg-forest-deep"
        style={{ paddingBottom: "calc(96px + var(--sab, 0px))" }}
      >
        {/* mundane's .head, the one the Mirror and Now already use: the mark
            on the left, the actions as 17px line glyphs on the right, one rule
            under it, then the small label line. The accent eyebrow and the
            centred title were a second and a third header on one screen. */}
        <div className="w-full max-w-lg lg:max-w-3xl mx-auto px-5 pt-3">
          <div className="flex items-center justify-between lg:justify-end" style={{ minHeight: 34 }}>
            {/* The fixed DesktopHeader carries the mark from lg up, so this
                one steps aside there rather than printing solray twice. */}
            <Wordmark size={17} className="text-text-primary lg:hidden" style={{ letterSpacing: "-.045em" }} />
            <span className="flex items-center" style={{ marginRight: -8 }}>
              <button
                className="sol-ico"
                title={t("common.settings")}
                aria-label={t("common.settings")}
                onClick={() => router.push("/profile/settings")}
              >
                {/* Sliders, not a cog: a circle ringed with spokes reads as a
                    sun on a page that already has a sun, and the app has a
                    theme toggle that looks exactly like one. */}
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6.5h9M15.5 6.5H17M3 13.5h4.5M11 13.5H17" />
                  <circle cx="13.6" cy="6.5" r="1.9" />
                  <circle cx="9.1" cy="13.5" r="1.9" />
                </svg>
              </button>
            </span>
          </div>
          <div style={{ height: 1, background: "rgb(var(--rgb-border))", marginTop: 12 }} />
          <p
            className="font-body uppercase"
            style={{ fontSize: 11, letterSpacing: "0.3em", color: "rgb(var(--rgb-text-muted))", marginTop: 12 }}
          >
            {t("nav.profile")}
          </p>
        </div>

        {loading ? (
          <ProfileSkeleton />
        ) : (
          <div
            className="transition-all duration-700"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? "translateY(0)" : "translateY(16px)",
            }}
          >
            <div className="max-w-lg lg:max-w-3xl mx-auto px-5">
              {/* mundane's .who: the avatar on the left, the name and handle
                  beside it, the photo link under them. It was centred, with a
                  ring, a camera badge and three status lines stacked below.
                    .who{display:flex;align-items:center;gap:16px}
                    .ava{width:76px;height:76px;border-radius:50%;
                      box-shadow:0 8px 20px rgba(70,45,20,.09),
                        inset 0 0 0 1px rgba(34,32,28,.05);font-size:23px;font-weight:700}
                    .whotxt b{font-size:21px;font-weight:700;letter-spacing:-.02em}
                    .whotxt em{font-size:14.5px;color:var(--ink2);margin-top:3px}
                    .phlink{font-size:13px;color:var(--ink3);text-decoration:underline;
                      text-underline-offset:3px} */}
              <div style={{ paddingTop: 18, paddingBottom: 24 }}>
                <div className="flex items-center" style={{ gap: 16 }}>
                  <button
                    onClick={() => avatarInputRef.current?.click()}
                    title={t("profile.change_picture")}
                    className="font-heading overflow-hidden"
                    style={{
                      width: 76, height: 76, borderRadius: "50%", border: "none", flex: "0 0 auto",
                      background: "rgb(var(--rgb-card))", backgroundSize: "cover", backgroundPosition: "center",
                      boxShadow: "0 8px 20px rgb(var(--rgb-scrim) / .09), inset 0 0 0 1px rgb(var(--rgb-text-primary) / .05)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 23, fontWeight: 700, letterSpacing: ".02em", color: "rgb(var(--rgb-text-muted))",
                    }}
                  >
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      initials
                    )}
                  </button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />

                  <div style={{ minWidth: 0 }}>
                    {editingName ? (
                      <div className="flex items-center gap-2">
                        <input
                          className="bg-forest-card border border-forest-border rounded-lg px-3 py-1.5 font-heading text-text-primary focus:outline-none"
                          style={{ fontSize: 19, fontWeight: 700, minWidth: 0 }}
                          value={nameInput}
                          onChange={(e) => setNameInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleSaveName(); if (e.key === "Escape") setEditingName(false); }}
                          autoFocus
                        />
                        <button onClick={handleSaveName} disabled={savingName} className="font-body text-[14px] text-text-primary font-bold">
                          {savingName ? "…" : t("common.save")}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setEditingName(true)}
                        className="font-heading text-text-primary text-left block"
                        style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-.02em", background: "none" }}
                      >
                        {profile?.name || (
                          <span style={{ color: "rgb(var(--rgb-text-muted))" }}>{t("profile.add_name")}</span>
                        )}
                      </button>
                    )}

                    {profile?.handle && !editingHandle && (
                      <button
                        onClick={() => setEditingHandle(true)}
                        className="font-body text-left block"
                        style={{ fontSize: 14.5, color: "rgb(var(--rgb-text-secondary))", marginTop: 3, background: "none" }}
                      >
                        @{profile.handle}
                      </button>
                    )}
                    {editingHandle && (
                      <div className="flex items-center gap-2" style={{ marginTop: 4 }}>
                        <input
                          className="bg-forest-card border border-forest-border rounded-lg px-2 py-1 font-body text-[15px] text-text-primary focus:outline-none"
                          style={{ minWidth: 0 }}
                          value={handleInput}
                          onChange={(e) => setHandleInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleSaveHandle(); if (e.key === "Escape") setEditingHandle(false); }}
                          autoFocus
                        />
                        <button onClick={handleSaveHandle} disabled={savingHandle} className="font-body text-[14px] text-text-primary font-bold">
                          {savingHandle ? "…" : t("common.save")}
                        </button>
                      </div>
                    )}

                    <button
                      onClick={() => avatarInputRef.current?.click()}
                      className="font-body"
                      style={{
                        background: "none", border: "none", padding: "6px 0 0",
                        fontSize: 13, color: "rgb(var(--rgb-text-muted))",
                        textDecoration: "underline", textUnderlineOffset: 3,
                        textDecorationColor: "rgb(var(--rgb-text-primary) / .2)",
                      }}
                    >
                      {avatarSaving === "saving"
                        ? t("profile.photo_saving")
                        : avatarSaving === "error"
                        ? t("profile.photo_error")
                        : t("profile.change_picture")}
                    </button>
                    {saveError && (
                      <p className="font-body text-ember text-[14px]" style={{ marginTop: 4 }}>{saveError}</p>
                    )}
                  </div>
                </div>


                <p
                  className="font-body"
                  style={{ fontSize: 15.5, lineHeight: 1.6, color: "rgb(var(--rgb-text-muted))", marginTop: 16, maxWidth: "28em" }}
                >
                  {t("profile.intro")}
                </p>
              </div>

              {/* Soul Map, the first of the folds rather than a card with a
                  glow layer, a second card inside it and a caption. The chart
                  labels its own axes with their values, so there is no second
                  legend repeating them underneath. */}
              {profile ? (
                <div style={{ marginTop: 26 }}>
                  <CollapsibleSection title="Soul Map" open={openSection === "Soul Map"} onToggle={toggleSection}>
                    <div ref={soulMapRef}>
                      <SoulMapRadarChart radar={profile.radar} radarDisplay={profile.radarDisplay} />

                      {shareOk && (<button
                        onClick={handleSoulMapShare}
                        disabled={soulMapSharing}
                        className="font-body disabled:opacity-50"
                        style={{
                          background: "none", border: "none", padding: "18px 0 0",
                          fontSize: 13, color: "rgb(var(--rgb-text-muted))",
                          textDecoration: "underline", textUnderlineOffset: 3,
                          textDecorationColor: "rgb(var(--rgb-text-primary) / .2)",
                        }}
                      >
                        {t("profile.share_soul_map")}
                      </button>)}
                      {shareError && (
                        <p role="status" className="font-body" style={{ fontSize: 13, marginTop: 8, color: "rgb(var(--rgb-text-muted))" }}>
                          {t("common.share_failed")}
                        </p>
                      )}
                    </div>
                  </CollapsibleSection>
                </div>
              ) : loadError ? (
                <div style={{ marginTop: 26 }}>
                  <p
                    className="font-body"
                    style={{ fontSize: 17, lineHeight: 1.62, fontWeight: 500, color: "rgb(var(--rgb-text-secondary))", marginBottom: 20 }}
                  >
                    {t("profile.load_error")}
                  </p>
                  <button
                    onClick={() => { setLoading(true); setLoadAttempt((n) => n + 1); }}
                    className="w-full py-4 px-8 rounded-full text-[14px] tracking-[0.3em] uppercase font-bold"
                    style={{ background: "rgb(var(--rgb-text-primary))", color: "rgb(var(--rgb-bg-deep))", border: "1.5px solid rgb(var(--rgb-text-primary))" }}
                  >
                    {t("common.retry")}
                  </button>
                </div>
              ) : (
                <p
                  className="font-body"
                  style={{ fontSize: 15, lineHeight: 1.6, color: "rgb(var(--rgb-text-secondary))", marginTop: 26, maxWidth: "26em" }}
                >
                  {t("profile.complete_birth_data")}
                </p>
              )}

              {/* Full Blueprint, merged from chart page */}
              {profile && <BlueprintSections token={token} aspects={profile.aspects} openSection={openSection} onToggleSection={toggleSection} />}

              {/* Subscription + Sign Out moved into /profile/settings (the gear
                  in the header is the single canonical entry point now). */}
            </div>
          </div>
        )}

      </div>
    </ProtectedRoute>
  );
}
