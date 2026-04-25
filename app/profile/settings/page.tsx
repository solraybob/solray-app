"use client";

/**
 * /profile/settings — the gear-icon home for everything personal.
 *
 * Sections, top → bottom:
 *   1. Avatar       — upload + replace your photo (PATCH /users/photo)
 *   2. Identity     — name, @username             (PATCH /users/profile)
 *   3. Visibility   — public/private toggle       (PATCH /users/profile is_public)
 *   4. Theme        — dark/light mode             (localStorage + ThemeProvider)
 *   5. Birth        — date, time, city            (PATCH /users/birth, regenerates blueprint)
 *   6. Subscription — link to /subscribe
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
import { apiFetch } from "@/lib/api";

interface CitySuggestion { display: string; lat: number; lon: number; }

type SaveStatus = "idle" | "saving" | "saved" | "error";

export default function SettingsPage() {
  const router = useRouter();
  const { token, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  // ── Profile state ───────────────────────────────────────────────────────────
  const [name, setName]         = useState("");
  const [username, setUsername] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [photo, setPhoto]       = useState<string | null>(null);
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [birthCity, setBirthCity] = useState("");
  const [birthLat, setBirthLat]   = useState<number | null>(null);
  const [birthLon, setBirthLon]   = useState<number | null>(null);
  const [loading, setLoading]     = useState(true);

  // ── Save status per section ─────────────────────────────────────────────────
  const [identityStatus, setIdentityStatus] = useState<SaveStatus>("idle");
  const [identityError,  setIdentityError]  = useState<string | null>(null);
  const [visibilityStatus, setVisibilityStatus] = useState<SaveStatus>("idle");
  const [photoStatus,    setPhotoStatus]    = useState<SaveStatus>("idle");
  const [birthStatus,    setBirthStatus]    = useState<SaveStatus>("idle");
  const [birthError,     setBirthError]     = useState<string | null>(null);

  // ── City autocomplete ───────────────────────────────────────────────────────
  const [citySuggestions, setCitySuggestions] = useState<CitySuggestion[]>([]);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const [cityLoading, setCityLoading] = useState(false);
  const cityInputRef = useRef<HTMLInputElement>(null);
  const cityListRef  = useRef<HTMLDivElement>(null);
  const cityDirtyRef = useRef(false); // user has typed since the last commit

  const photoInputRef = useRef<HTMLInputElement>(null);

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    apiFetch("/users/me", {}, token)
      .then((data) => {
        const p = data.profile || {};
        setName(p.name || "");
        setUsername(p.username || "");
        setIsPublic(Boolean(p.is_public));
        setPhoto(p.profile_photo || null);
        setBirthDate(p.birth_date || "");
        setBirthTime(p.birth_time || "");
        setBirthCity(p.birth_city || "");
        setBirthLat(p.birth_lat ?? null);
        setBirthLon(p.birth_lon ?? null);
      })
      .catch(() => {/* silently — error UI is per-section */})
      .finally(() => setLoading(false));
  }, [token]);

  // ── City suggestions (debounced) ────────────────────────────────────────────
  useEffect(() => {
    if (!cityDirtyRef.current) return; // only fetch when user actively typed
    if (birthCity.trim().length < 2) {
      setCitySuggestions([]);
      setShowCitySuggestions(false);
      return;
    }
    setCityLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(birthCity)}&type=city&limit=6&format=json&addressdetails=1`,
          { headers: { "Accept-Language": "en" } }
        );
        const data = await res.json();
        type NomItem = {
          lat: string; lon: string;
          address: { city?: string; town?: string; village?: string; municipality?: string; country?: string }
        };
        const seen = new Set<string>();
        const suggestions: CitySuggestion[] = [];
        for (const item of (data as NomItem[])) {
          const c = item.address.city || item.address.town || item.address.village || item.address.municipality;
          if (!c) continue;
          const display = item.address.country ? `${c}, ${item.address.country}` : c;
          if (seen.has(display)) continue;
          seen.add(display);
          suggestions.push({ display, lat: parseFloat(item.lat), lon: parseFloat(item.lon) });
        }
        setCitySuggestions(suggestions);
        setShowCitySuggestions(suggestions.length > 0);
      } catch {
        // silently — let the user submit anyway, backend will geocode
      } finally {
        setCityLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [birthCity]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (
        cityListRef.current && !cityListRef.current.contains(e.target as Node) &&
        cityInputRef.current && !cityInputRef.current.contains(e.target as Node)
      ) {
        setShowCitySuggestions(false);
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
      const msg = e instanceof Error ? e.message : "Could not save";
      setIdentityError(msg);
      setIdentityStatus("error");
    }
  };

  const toggleVisibility = async (next: boolean) => {
    if (!token) return;
    setIsPublic(next); // optimistic
    setVisibilityStatus("saving");
    try {
      await apiFetch("/users/profile", {
        method: "PATCH",
        body: JSON.stringify({ is_public: next }),
      }, token);
      setVisibilityStatus("saved");
      setTimeout(() => setVisibilityStatus("idle"), 1500);
    } catch {
      setIsPublic(!next); // revert
      setVisibilityStatus("error");
      setTimeout(() => setVisibilityStatus("idle"), 2200);
    }
  };

  const onPhotoSelected = async (file: File) => {
    if (!token) return;
    setPhotoStatus("saving");
    // Resize to 384x384 JPEG ~80q before upload — matches the existing
    // /users/photo size budget (under 2MB) and keeps avatars crisp on retina.
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
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
          setPhotoStatus("error");
          setTimeout(() => setPhotoStatus("idle"), 2200);
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const saveBirth = async () => {
    if (!token) return;
    if (!birthDate || !birthTime) {
      setBirthError("Date and time are both required.");
      setBirthStatus("error");
      setTimeout(() => setBirthStatus("idle"), 2200);
      return;
    }
    // Birth-data updates recompute the user's full chart. We refuse to
    // submit a city string that hasn't been resolved to coordinates,
    // because backend geocoding can be slow or fail and we'd rather
    // catch the ambiguity here than silently corrupt the chart.
    if (birthCity.trim() && (birthLat == null || birthLon == null)) {
      setBirthError("Pick a city from the suggestions so we can geolocate it precisely.");
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
      // Refresh the local blueprint cache from authoritative server data.
      // We DO NOT inject local React state (name/username/photo) here —
      // an earlier draft did, and it could overwrite the cached identity
      // fields with unsaved form input.
      //
      // Order of preference for the identity fields:
      //   1. Fresh /users/me response (best — known committed values)
      //   2. Whatever was in the previous cache (preserves last-known-good
      //      when /users/me fails on a network blip)
      //   3. Empty (only when there's no cache and no network response —
      //      effectively the "first save ever" path)
      //
      // The blueprint payload itself ALWAYS gets written; that's the whole
      // point of the call and is authoritative regardless.
      try {
        if (res?.blueprint) {
          const me = await apiFetch("/users/me", {}, token).catch(() => null);
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
      cityDirtyRef.current = false;
      setTimeout(() => setBirthStatus("idle"), 1800);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not save";
      setBirthError(msg);
      setBirthStatus("error");
    }
  };

  const handleSignOut = () => {
    logout();
    router.push("/login");
  };

  const initials = (name || "S").charAt(0).toUpperCase();

  return (
    <ProtectedRoute>
      <div
        className="min-h-[100dvh] bg-forest-deep"
        style={{ paddingBottom: "calc(160px + env(safe-area-inset-bottom, 16px))" }}
      >
        {/* Header — back arrow on left, SETTINGS centered */}
        <div className="border-b border-forest-border/50">
          <div className="max-w-lg mx-auto px-5 pt-2 pb-3">
            <p className="font-body text-[10px] tracking-[0.18em] uppercase mb-1" style={{ color: "rgb(var(--rgb-moss))" }}>
              Profile
            </p>
            <div className="relative flex items-center" style={{ height: "26px" }}>
              <button
                onClick={() => router.push("/profile")}
                aria-label="Back to profile"
                className="text-text-secondary hover:text-amber-sun transition-colors flex items-center justify-center"
                style={{ minWidth: "32px", minHeight: "32px", marginLeft: "-8px" }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
              </button>
              <h1
                className="font-heading tracking-[0.15em] text-text-primary absolute left-1/2 -translate-x-1/2"
                style={{ fontWeight: 300, fontSize: "21px" }}
              >
                SETTINGS
              </h1>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="max-w-lg mx-auto px-5 pt-12 text-center">
            <div className="h-1 w-32 mx-auto skeleton-shimmer rounded-full" />
          </div>
        ) : (
          <div className="max-w-lg mx-auto px-5 pt-6 page-enter">

            {/* ── 1. Avatar ──────────────────────────────────────────────── */}
            <Section
              label="Profile photo"
              status={photoStatus}
              hint="Visible to anyone you connect with on Souls."
            >
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="relative shrink-0"
                  style={{ width: 72, height: 72 }}
                  aria-label="Change photo"
                >
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photo}
                      alt="Profile"
                      className="w-full h-full rounded-full object-cover border border-forest-border"
                    />
                  ) : (
                    <div className="w-full h-full rounded-full border border-forest-border bg-forest-card/60 flex items-center justify-center font-heading text-text-primary" style={{ fontSize: 26, fontWeight: 300 }}>
                      {initials}
                    </div>
                  )}
                  <span
                    className="absolute -bottom-1 -right-1 rounded-full bg-amber-sun text-forest-deep flex items-center justify-center"
                    style={{ width: 22, height: 22 }}
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
                    className="font-body text-[12px] text-text-secondary hover:text-amber-sun transition-colors underline underline-offset-4"
                  >
                    {photo ? "Replace photo" : "Upload photo"}
                  </button>
                </div>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onPhotoSelected(f);
                  }}
                />
              </div>
            </Section>

            {/* ── 2. Identity ───────────────────────────────────────────── */}
            <Section
              label="Identity"
              status={identityStatus}
              error={identityError}
            >
              <div className="space-y-4">
                <FieldRow label="Name">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full font-body text-[14px] text-text-primary bg-transparent border-b border-forest-border/60 focus:border-amber-sun pb-1.5 transition-colors"
                    placeholder="Your name"
                  />
                </FieldRow>
                <FieldRow label="Username">
                  <div className="flex items-baseline gap-1">
                    <span className="font-body text-[14px] text-text-secondary">@</span>
                    <input
                      value={username}
                      onChange={(e) => setUsername(e.target.value.replace(/^@/, ""))}
                      className="flex-1 font-body text-[14px] text-text-primary bg-transparent border-b border-forest-border/60 focus:border-amber-sun pb-1.5 transition-colors"
                      placeholder="yourusername"
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
              label="Profile visibility"
              status={visibilityStatus}
              hint={isPublic
                ? "Your soul connections can view your full chart and blueprint."
                : "Your chart is private. Soul connections can see your name and photo only."}
            >
              <Toggle
                label={isPublic ? "Public" : "Private"}
                checked={isPublic}
                onChange={toggleVisibility}
              />
            </Section>

            {/* ── 4. Theme ──────────────────────────────────────────────── */}
            <Section
              label="Theme"
              hint={theme === "light"
                ? "Pearl background, deep-forest ink. Best in daylight."
                : "Forest deep with amber accents. Solray's resting state."}
            >
              <div className="flex gap-2">
                <ThemeButton active={theme === "dark"}  onClick={() => setTheme("dark")}  label="Dark"  />
                <ThemeButton active={theme === "light"} onClick={() => setTheme("light")} label="Light" />
              </div>
            </Section>

            {/* ── 5. Birth details ─────────────────────────────────────── */}
            <Section
              label="Birth details"
              status={birthStatus}
              error={birthError}
              hint="Changing these recalculates your full chart. Useful if your time of birth was wrong, or you've learned new information from family."
            >
              <div className="space-y-4">
                <FieldRow label="Date">
                  <input
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="w-full font-body text-[14px] text-text-primary bg-transparent border-b border-forest-border/60 focus:border-amber-sun pb-1.5 transition-colors"
                  />
                </FieldRow>
                <FieldRow label="Time">
                  <input
                    type="time"
                    value={birthTime}
                    onChange={(e) => setBirthTime(e.target.value)}
                    className="w-full font-body text-[14px] text-text-primary bg-transparent border-b border-forest-border/60 focus:border-amber-sun pb-1.5 transition-colors"
                  />
                </FieldRow>
                <FieldRow label="City">
                  <div className="relative">
                    <input
                      ref={cityInputRef}
                      value={birthCity}
                      onChange={(e) => {
                        cityDirtyRef.current = true;
                        setBirthCity(e.target.value);
                        setBirthLat(null);
                        setBirthLon(null);
                      }}
                      onFocus={() => birthCity.length >= 2 && setShowCitySuggestions(citySuggestions.length > 0)}
                      className="w-full font-body text-[14px] text-text-primary bg-transparent border-b border-forest-border/60 focus:border-amber-sun pb-1.5 transition-colors"
                      placeholder="City, country"
                      autoCapitalize="words"
                    />
                    {cityLoading && (
                      <span className="absolute right-1 top-1 text-[10px] text-text-muted">Searching…</span>
                    )}
                    {showCitySuggestions && citySuggestions.length > 0 && (
                      <div
                        ref={cityListRef}
                        className="absolute left-0 right-0 mt-1 bg-forest-card border border-forest-border rounded-xl overflow-hidden z-10 shadow-xl"
                      >
                        {citySuggestions.map((s) => (
                          <button
                            key={s.display}
                            type="button"
                            onClick={() => {
                              setBirthCity(s.display);
                              setBirthLat(s.lat);
                              setBirthLon(s.lon);
                              setShowCitySuggestions(false);
                              cityDirtyRef.current = false;
                            }}
                            className="block w-full text-left px-3 py-2 font-body text-[13px] text-text-primary hover:bg-forest-border/40 transition-colors"
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
            <Section label="Subscription" hint="Manage billing, see renewal date, cancel.">
              <button
                onClick={() => router.push("/subscribe")}
                className="font-body text-[12px] text-amber-sun hover:opacity-80 transition-opacity flex items-center gap-2"
              >
                Manage subscription
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            </Section>

            {/* ── 7. Sign out ──────────────────────────────────────────── */}
            <div className="mt-12 mb-2 flex justify-center">
              <button
                onClick={handleSignOut}
                className="font-body text-text-secondary/70 text-[10px] tracking-[0.22em] uppercase hover:text-ember transition-colors"
              >
                Sign out
              </button>
            </div>

          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Local presentational helpers — kept in-file because they have zero re-use
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
  return (
    <section className="py-6 border-b border-forest-border/40">
      <div className="flex items-baseline justify-between mb-3">
        <p className="font-body text-text-secondary text-[10px] tracking-[0.22em] uppercase">{label}</p>
        {status === "saving" && <span className="font-body text-[10px] text-text-muted">Saving…</span>}
        {status === "saved"  && <span className="font-body text-[10px] text-moss">Saved</span>}
      </div>
      {children}
      {error && <p className="mt-3 font-body text-[10px] text-ember">{error}</p>}
      {hint  && !error && <p className="mt-3 font-body text-[11px] leading-relaxed text-text-muted">{hint}</p>}
    </section>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-body text-[10px] tracking-[0.18em] uppercase text-text-muted mb-1.5">{label}</p>
      {children}
    </div>
  );
}

function SaveButton({ onClick, status }: { onClick: () => void; status: SaveStatus }) {
  const disabled = status === "saving";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="font-body text-[10px] tracking-[0.22em] uppercase px-4 py-2 rounded-full border border-amber-sun/70 text-amber-sun hover:bg-amber-sun/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {status === "saving" ? "Saving" : "Save"}
    </button>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between w-full"
    >
      <span className="font-body text-[14px] text-text-primary">{label}</span>
      <span
        className="relative rounded-full transition-colors"
        style={{
          width: 44,
          height: 24,
          backgroundColor: checked ? "rgb(var(--rgb-amber))" : "rgb(var(--rgb-border))",
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
      className="flex-1 font-body text-[12px] tracking-[0.18em] uppercase py-2.5 rounded-full transition-colors"
      style={{
        backgroundColor: active ? "rgb(var(--rgb-amber) / 0.16)" : "transparent",
        color: active ? "rgb(var(--rgb-amber))" : "rgb(var(--rgb-text-secondary))",
        border: `1px solid ${active ? "rgb(var(--rgb-amber) / 0.6)" : "rgb(var(--rgb-border))"}`,
      }}
    >
      {label}
    </button>
  );
}
