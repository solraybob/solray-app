"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useT } from "@/lib/i18n";
import EntrySky from "@/components/EntrySky";
import { isRunningInCapacitor } from "@/lib/native-push";

const TOTAL_STEPS = 6;

// Atmospheric image per step, fades in behind the question
const STEP_IMAGES = [
  "https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=800&q=60", // 1 name: warm candlelight
  "https://images.unsplash.com/photo-1519677100203-a0e668c92439?w=800&q=60", // 2 sex: soft silhouette
  "https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=800&q=60", // 3 birth date: stars
  "https://images.unsplash.com/photo-1532693322450-2cb5c511067d?w=800&q=60", // 4 birth time: moon
  "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&q=60", // 5 birth place: earth
  "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=800&q=60", // 6 account: forest dawn
];

// Magical blueprint calculation loading screen
const BLUEPRINT_STEP_KEYS = [
  "onboard.blueprint_astrology",
  "onboard.blueprint_human_design",
  "onboard.blueprint_gene_keys",
  "onboard.blueprint_weaving",
];

function BlueprintLoader() {
  const { t } = useT();
  const BLUEPRINT_STEPS = BLUEPRINT_STEP_KEYS.map((k) => t(k));
  const [visibleCount, setVisibleCount] = useState(1);

  useEffect(() => {
    const intervals: ReturnType<typeof setTimeout>[] = [];
    BLUEPRINT_STEPS.forEach((_, i) => {
      if (i === 0) return; // first is visible immediately
      intervals.push(
        setTimeout(() => setVisibleCount(i + 1), i * 800)
      );
    });
    return () => intervals.forEach(clearTimeout);
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-forest-deep flex flex-col items-center justify-center px-8">
      {/* Subtle pulsing orb */}
      <div
        className="w-20 h-20 rounded-full mb-10"
        style={{
          background: "radial-gradient(circle at 40% 35%, #f3923055, #0a1f1200 70%)",
          border: "1px solid rgba(243,146,48,0.2)",
          animation: "pulse 2s ease-in-out infinite",
          boxShadow: "0 0 40px rgba(243,146,48,0.1)",
        }}
      />
      <div className="space-y-4 w-full max-w-xs">
        {BLUEPRINT_STEPS.map((text, i) => (
          <div
            key={i}
            className="transition-all duration-700"
            style={{
              opacity: i < visibleCount ? 1 : 0,
              transform: i < visibleCount ? "translateY(0)" : "translateY(8px)",
            }}
          >
            <div className="flex items-center gap-3">
              <span
                className="text-amber-sun text-sm"
                style={{ opacity: i < visibleCount ? 1 : 0 }}
              >
                {i < visibleCount - 1 ? "•" : "·"}
              </span>
              <p
                className="font-body text-sm"
                style={{
                  color: i === visibleCount - 1 ? "#f2ecd8" : "#8a9e8d",
                }}
              >
                {text}
              </p>
            </div>
          </div>
        ))}
      </div>
      <style jsx>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.08); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export default function OnboardPage() {
  const { t } = useT();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [sex, setSex] = useState<"male" | "female" | "">("");
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [timeUnknown, setTimeUnknown] = useState(false);
  const [birthPlace, setBirthPlace] = useState("");
  const [citySuggestions, setCitySuggestions] = useState<{ display: string }[]>([]);
  const [cityLoading, setCityLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const cityInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Hive consent: pre-checked, the user can uncheck before completing signup.
  // Visible at step 6 with explainer copy. Sent in the register payload.
  // Default true matches the existing-user behavior; opt-out is explicit.
  const [hiveConsent, setHiveConsent] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [calculatingBlueprint, setCalculatingBlueprint] = useState(false);
  const { setToken } = useAuth();
  const router = useRouter();

  // City autocomplete debounce
  useEffect(() => {
    if (birthPlace.trim().length < 2) {
      setCitySuggestions([]);
      setShowSuggestions(false);
      return;
    }
    setCityLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(birthPlace)}&type=city&limit=6&format=json&addressdetails=1`,
          { headers: { "Accept-Language": "en" } }
        );
        const data = await res.json();
        const suggestions = data
          .map((item: { address: { city?: string; town?: string; village?: string; municipality?: string; country?: string } }) => {
            const city = item.address.city || item.address.town || item.address.village || item.address.municipality;
            const country = item.address.country;
            if (!city) return null;
            return { display: country ? `${city}, ${country}` : city };
          })
          .filter(Boolean) as { display: string }[];
        // deduplicate
        const seen = new Set<string>();
        const unique = suggestions.filter((s) => {
          if (seen.has(s.display)) return false;
          seen.add(s.display);
          return true;
        });
        setCitySuggestions(unique);
        setShowSuggestions(unique.length > 0);
      } catch {
        // silently fail
      } finally {
        setCityLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [birthPlace]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        cityInputRef.current &&
        !cityInputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const next = () => {
    setError("");
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  };

  const canProceed = () => {
    switch (step) {
      case 1: return name.trim().length > 0;
      case 2: return sex === "male" || sex === "female";
      case 3: return birthDate.length === 10;
      case 4: return timeUnknown || birthTime.length === 5;
      case 5: return birthPlace.trim().length > 0;
      case 6: return email.trim().length > 0 && password.length >= 6;
      default: return false;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && canProceed() && step < TOTAL_STEPS) next();
  };

  const handleSubmit = async () => {
    setError("");
    setLoading(true);
    const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").trim();
    // Capture invite code from the URL (?invite=CODE) and the saved
    // language preference, both optional. Backend defaults handle their
    // absence cleanly: no inviter attribution, English locale.
    let inviteCode: string | null = null;
    let language: string | null = null;
    try {
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        inviteCode = params.get("invite") || params.get("ref") || null;
        language = localStorage.getItem("solray_language");
      }
    } catch { /* ignore */ }
    try {
      const res = await fetch(`${apiUrl}/users/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          sex: sex || null,
          birth_date: birthDate,
          birth_time: timeUnknown ? "12:00" : birthTime,
          birth_city: birthPlace,
          email,
          password,
          hive_consent: hiveConsent,
          invite_code: inviteCode || undefined,
          language: language || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || t("onboard.registration_failed"));
      }
      const data = await res.json();
      const newToken = data.token || data.access_token;
      setToken(newToken, data.profile || data.user || { id: data.user_id, email, name });
      // Funnel event: marks the moment a real signup completed. Powers
      // the registration-drop-off canary alert.
      try {
        const { track } = await import("@/lib/analytics");
        await track("register_success", undefined, newToken);
      } catch { /* ignore, analytics is best-effort */ }
      // Show magical blueprint loading screen for at least 3.5 seconds
      setCalculatingBlueprint(true);
      await new Promise((resolve) => setTimeout(resolve, 3500));
      // Native (iOS/Android) sign-ups get no server trial; their only trial
      // is the App Store / Play free week, so send them straight to the
      // Subscribe screen to start it (subscribe-first model). Web sign-ups go
      // to the First Mirror: three lines that prove Solray understood them,
      // then on to Today on their 5-day web trial.
      if (isRunningInCapacitor()) {
        router.push("/subscribe");
      } else {
        router.push("/first-mirror");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : t("common.error_generic");
      setError(msg);
      setCalculatingBlueprint(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-forest-deep flex flex-col" style={{ position: "relative" }}>
      {/* The living sky behind the whole journey, beneath the step images */}
      <EntrySky />
      {/* Atmospheric step images, transition on step change */}
      {STEP_IMAGES.map((src, i) => (
        <img
          key={src}
          src={src}
          alt=""
          aria-hidden="true"
          style={{
            position: "fixed",
            top: 0, left: 0, right: 0, bottom: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: i + 1 === step ? 0.08 : 0,
            transition: "opacity 1s ease",
            zIndex: 0,
            pointerEvents: "none",
          }}
        />
      ))}
      {/* Dark vignette over image */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          background: "radial-gradient(ellipse at center, transparent 0%, #060f08 75%)",
          zIndex: 0,
          pointerEvents: "none",
        }}
      />

      {/* Magical blueprint calculation screen */}
      {calculatingBlueprint && <BlueprintLoader />}

      {/* Header */}
      <div className="flex flex-col items-center px-6 pt-10 pb-6" style={{ position: "relative", zIndex: 1 }}>
        {/* Centered lockup, same composition as the landing hero and login:
            sun above, wordmark beneath. */}
        <div className="flex flex-col items-center entry-rise">
          <div
            className="w-24 h-24 mb-4 entry-sun"
            style={{
              filter:
                "drop-shadow(0 0 32px rgba(243, 146, 48, 0.42)) drop-shadow(0 0 80px rgba(243, 146, 48, 0.18))",
            }}
          >
            <Image
              src="/solray-sun.png"
              unoptimized
              priority
              alt="Solray"
              width={96}
              height={96}
              className="w-full h-full object-contain"
            />
          </div>
          <span className="font-heading text-xl tracking-[0.15em] text-text-primary" style={{ fontWeight: 300 }}>SOLRAY</span>
          <span className="font-heading text-[12px] text-text-secondary tracking-[0.06em] leading-tight" style={{ fontStyle: "italic", fontWeight: 300 }}>living by design</span>
        </div>
        {/* Progress dots */}
        <div className="flex gap-2 mt-5">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all duration-300 ${
                i + 1 === step
                  ? "w-4 h-2 bg-amber-sun"
                  : i + 1 < step
                  ? "w-2 h-2 bg-amber-sun opacity-60"
                  : "w-2 h-2 bg-forest-border"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-start pt-14 px-6 pb-24 animate-slide-up" key={step} style={{ position: "relative" }}>
        <div className="w-full max-w-sm">
          {step === 1 && (
            <StepWrapper label={t("onboard.q_name")}>
              <input
                autoFocus
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t("onboard.name_placeholder")}
                className="onboard-input"
              />
            </StepWrapper>
          )}

          {step === 2 && (
            <StepWrapper label={t("onboard.q_gender")} subtitle={t("onboard.gender_subtitle")}>
              <div className="grid grid-cols-2 gap-3">
                {(["female", "male"] as const).map((opt) => {
                  const active = sex === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setSex(opt)}
                      className="sex-card"
                      style={{
                        borderColor: active ? "var(--amber)" : "var(--border)",
                        background: active ? "rgba(243,146,48,0.08)" : "transparent",
                        color: active ? "var(--text-primary)" : "var(--text-muted)",
                      }}
                    >
                      <span className="font-heading text-2xl" style={{ fontWeight: 300, fontStyle: "italic" }}>
                        {opt === "female" ? t("onboard.female") : t("onboard.male")}
                      </span>
                    </button>
                  );
                })}
              </div>
            </StepWrapper>
          )}

          {step === 3 && (
            <StepWrapper
              label={t("onboard.q_birth_date")}
              eyebrow={t("onboard.calibration")}
              subtitle={t("onboard.calibration_why")}
            >
              <input
                autoFocus
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="onboard-input"
                style={{ colorScheme: "dark" }}
              />
            </StepWrapper>
          )}

          {step === 4 && (
            <StepWrapper label={t("onboard.q_birth_time")}>
              {!timeUnknown && (
                <input
                  autoFocus
                  type="time"
                  value={birthTime}
                  onChange={(e) => setBirthTime(e.target.value)}
                  className="onboard-input"
                  style={{ colorScheme: "dark" }}
                />
              )}
              <button
                onClick={() => setTimeUnknown(!timeUnknown)}
                className={`mt-3 text-xs font-body tracking-wider transition-colors ${
                  timeUnknown ? "text-amber-sun" : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {timeUnknown ? t("onboard.time_using_noon") : t("onboard.time_unknown")}
              </button>
            </StepWrapper>
          )}

          {step === 5 && (
            <StepWrapper label={t("onboard.q_birth_place")}>
              <div className="relative">
                <input
                  ref={cityInputRef}
                  autoFocus
                  type="text"
                  value={birthPlace}
                  onChange={(e) => {
                    setBirthPlace(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={t("onboard.city_placeholder")}
                  className="onboard-input"
                  style={{ paddingRight: cityLoading ? "2rem" : undefined }}
                  autoComplete="off"
                />
                {cityLoading && (
                  <span className="absolute right-0 top-1/2 -translate-y-1/2 text-text-secondary">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                  </span>
                )}
                {showSuggestions && citySuggestions.length > 0 && (
                  <div
                    ref={suggestionsRef}
                    className="city-dropdown"
                  >
                    {citySuggestions.map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        className="city-dropdown-item"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setBirthPlace(s.display);
                          setCitySuggestions([]);
                          setShowSuggestions(false);
                        }}
                      >
                        {s.display}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-text-secondary text-xs mt-2 font-body">{t("onboard.city_example")}</p>
            </StepWrapper>
          )}

          {step === 6 && (
            <StepWrapper label={`${t("onboard.welcome_name")} ${name}.`} subtitle={t("onboard.create_account")}>
              <input
                autoFocus
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("login.email_placeholder")}
                className="onboard-input mb-3"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("onboard.password_placeholder")}
                className="onboard-input"
              />

              {/* Hive consent. Pre-checked. Visible. Uncheckable. */}
              <label className="flex items-start gap-3 mt-6 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hiveConsent}
                  onChange={(e) => setHiveConsent(e.target.checked)}
                  className="mt-1 w-4 h-4 accent-amber-sun cursor-pointer flex-shrink-0"
                />
                <span className="font-body text-[13px] leading-relaxed text-pearl/80">
                  {t("onboard.hive_consent")}
                </span>
              </label>
            </StepWrapper>
          )}

          {error && (
            <p className="text-ember text-xs text-center font-body mt-4">{error}</p>
          )}
        </div>
      </div>

      {/* CTA */}
      <div className="fixed bottom-0 left-0 right-0 px-6 pb-10 bg-gradient-to-t from-forest-deep via-forest-deep to-transparent pt-8" style={{ zIndex: 2 }}>
        <div className="max-w-sm mx-auto">
          {step < TOTAL_STEPS ? (
            <button
              onClick={next}
              disabled={!canProceed()}
              className="w-full bg-amber-sun text-forest-deep font-body font-semibold py-4 rounded-xl text-sm tracking-wider transition-all duration-200 hover:opacity-90 active:scale-95 disabled:opacity-30 entry-cta"
            >
              {t("common.continue")}
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!canProceed() || loading}
              className="w-full bg-amber-sun text-forest-deep font-body font-semibold py-4 rounded-xl text-sm tracking-wider transition-all duration-200 hover:opacity-90 active:scale-95 disabled:opacity-30 entry-cta flex items-center justify-center gap-2"
            >
              {loading ? <LoadingSpinner size="sm" /> : t("onboard.begin_journey")}
            </button>
          )}
        </div>
      </div>

      <style jsx>{`
        .onboard-input {
          width: 100%;
          background: transparent;
          border: none;
          border-bottom: 1px solid #1a3020;
          padding: 12px 0;
          color: #f2ecd8;
          font-family: 'Inter', sans-serif;
          font-size: 1rem;
          transition: border-color 0.2s;
          display: block;
        }
        .onboard-input:focus {
          border-bottom-color: #f39230;
        }
        .onboard-input::placeholder {
          color: #8a9e8d;
        }
        .sex-card {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 28px 12px;
          border: 1px solid #1a3020;
          border-radius: 14px;
          background: transparent;
          transition: border-color 0.25s ease, background 0.25s ease, color 0.25s ease, transform 0.15s ease;
          cursor: pointer;
        }
        .sex-card:hover {
          border-color: rgba(243,146,48,0.55);
          color: #f2ecd8;
        }
        .sex-card:active {
          transform: scale(0.98);
        }
        .city-dropdown {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          right: 0;
          background: #0a1f12;
          border: 1px solid #1a3020;
          border-radius: 8px;
          overflow: hidden;
          z-index: 50;
          box-shadow: 0 8px 24px rgba(0,0,0,0.4);
        }
        .city-dropdown-item {
          display: block;
          width: 100%;
          text-align: left;
          padding: 12px 16px;
          color: #f2ecd8;
          font-family: 'Inter', sans-serif;
          font-size: 0.95rem;
          background: transparent;
          border: none;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
        }
        .city-dropdown-item:hover,
        .city-dropdown-item:focus {
          background: rgba(243,146,48,0.15);
          color: #f39230;
          outline: none;
        }
        .city-dropdown-item + .city-dropdown-item {
          border-top: 1px solid #1a3020;
        }
      `}</style>
    </div>
  );
}

function StepWrapper({
  label,
  subtitle,
  eyebrow,
  children,
}: {
  label: string;
  subtitle?: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      {eyebrow && (
        <p
          className="font-body text-[11px] tracking-[0.3em] uppercase mb-3"
          style={{ color: "var(--amber)", opacity: 0.75 }}
        >{eyebrow}</p>
      )}
      <h2
        className="font-heading text-4xl text-text-primary mb-2 leading-tight"
        style={{ fontWeight: 300, fontStyle: "italic", letterSpacing: "-0.01em" }}
      >{label}</h2>
      {subtitle && <p className="text-text-secondary text-sm font-body mb-8">{subtitle}</p>}
      <div className={subtitle ? "" : "mt-8"}>{children}</div>
    </div>
  );
}
