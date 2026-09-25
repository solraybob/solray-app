"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";
import { errorText } from "@/lib/errors";
import { useAuth } from "@/lib/auth-context";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useT } from "@/lib/i18n";
import EntrySky from "@/components/EntrySky";
import { isRunningInCapacitor } from "@/lib/native-push";
import BirthWheels from "@/components/BirthWheels";

const TOTAL_STEPS = 5;

// Atmospheric image per step, fades in behind the question
const STEP_WASH = [
  // first light, morning, midday, late sun, after sunset, dawn again: the
  // orb's own colours at a whisper, so each question has its own hour.
  "radial-gradient(ellipse 70% 50% at 50% 22%, rgb(var(--rgb-wisteria) / .08), transparent 70%)",
  "radial-gradient(ellipse 70% 50% at 50% 22%, rgb(var(--rgb-wisteria) / .13), transparent 70%)",
  "radial-gradient(ellipse 70% 50% at 50% 22%, rgb(var(--rgb-ember) / .12), transparent 70%)",
  "radial-gradient(ellipse 70% 50% at 50% 22%, rgb(var(--rgb-amber) / .12), transparent 70%)",
  "radial-gradient(ellipse 70% 50% at 50% 22%, rgb(var(--rgb-indigo) / .12), transparent 70%)",
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
          background: "radial-gradient(circle at 40% 35%, rgb(var(--rgb-amber) / 0.33), rgb(var(--rgb-card) / 0) 70%)",
          border: "1px solid rgb(var(--rgb-amber) / 0.2)",
          animation: "pulse 2s ease-in-out infinite",
          boxShadow: "0 0 40px rgb(var(--rgb-amber) / 0.1)",
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
                className="text-sm"
                style={{ opacity: i < visibleCount ? 1 : 0, color: "rgb(var(--rgb-text-primary))" }}
              >
                {i < visibleCount - 1 ? "•" : "·"}
              </span>
              <p
                className="font-body"
                style={{
                  fontSize: 17, lineHeight: 1.62, fontWeight: 500,
                  color: i === visibleCount - 1 ? "rgb(var(--rgb-text-primary))" : "rgb(var(--rgb-text-muted))",
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
  const { setToken, token, loading: authLoading } = useAuth();
  const router = useRouter();

  // Already signed in on this device: onboarding is not for you. Checked
  // once, when auth first settles, so the setToken() at the end of a real
  // signup does not trigger this and skip the blueprint screen.
  const mountCheckDone = useRef(false);
  useEffect(() => {
    if (authLoading || mountCheckDone.current) return;
    mountCheckDone.current = true;
    if (token) router.replace("/today");
  }, [authLoading, token, router]);

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
      case 3: return birthDate.length === 10 && (timeUnknown || birthTime.length === 5);
      case 4: return birthPlace.trim().length > 0;
      case 5: return /^\S+@\S+\.\S+$/.test(email.trim()) && password.length >= 8;
      default: return false;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && canProceed() && step < TOTAL_STEPS) next();
  };

  const handleSubmit = async () => {
    setError("");
    setLoading(true);
    const cleanEmail = email.trim().toLowerCase();
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
    // Tell the backend which platform is registering. Inside the Capacitor
    // native shell this MUST be sent so the server skips the web-only trial
    // and lets Apple/Play own the free trial. Without it, native sign-ups get
    // a server trial, which hides the in-app purchase sheet and lands them on
    // the "managed on the web" screen with no way to start store billing.
    let nativePlatform = "";
    try {
      const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } })?.Capacitor;
      const p = cap?.getPlatform?.();
      if (p === "ios" || p === "android") nativePlatform = p;
    } catch { /* not native: header omitted, web trial applies */ }
    try {
      const res = await fetch(`${apiUrl}/users/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(nativePlatform ? { "X-Platform": nativePlatform } : {}),
        },
        body: JSON.stringify({
          name,
          sex: sex || null,
          birth_date: birthDate,
          birth_time: timeUnknown ? "12:00" : birthTime,
          birth_city: birthPlace,
          email: cleanEmail,
          password,
          hive_consent: hiveConsent,
          invite_code: inviteCode || undefined,
          language: language || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(errorText(err?.detail, t("onboard.registration_failed")));
      }
      const data = await res.json();
      const newToken = data.token || data.access_token;
      setToken(newToken, data.profile || data.user || { id: data.user_id, email: cleanEmail, name });
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
      {/* One quiet wash per step, drawn from the orb, in place of the six
          stock photographs. Paper is the ground now; a photograph under it
          reads as another product. */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          background: STEP_WASH[Math.min(step, STEP_WASH.length) - 1] || "transparent",
          transition: "background 1s ease",
          zIndex: 0,
          pointerEvents: "none",
        }}
      />

      {/* Magical blueprint calculation screen */}
      {calculatingBlueprint && <BlueprintLoader />}

      {/* Header: the one look. Mark top-left, one hairline, the label line.
          The right slot is the way out: Log in on the first question, Back
          on every question after it. */}
      <div className="w-full max-w-lg mx-auto px-5 pt-3" style={{ position: "relative", zIndex: 1 }}>
        <div className="flex items-center justify-between" style={{ minHeight: 34 }}>
          <Wordmark size={17} className="text-text-primary" style={{ letterSpacing: "-.045em" }} />
          {step > 1 ? (
            <button
              type="button"
              onClick={() => { setError(""); setStep((s) => Math.max(1, s - 1)); }}
              className="font-body uppercase font-bold"
              style={{ fontSize: 12, letterSpacing: "0.2em", color: "rgb(var(--rgb-text-secondary))", padding: "6px 0" }}
            >
              {t("common.back")}
            </button>
          ) : (
            <Link
              href="/login"
              className="font-body uppercase font-bold"
              style={{ fontSize: 12, letterSpacing: "0.2em", color: "rgb(var(--rgb-text-secondary))", padding: "6px 0" }}
            >
              {t("onboard.log_in")}
            </Link>
          )}
        </div>
        <div style={{ height: 1, background: "rgb(var(--rgb-border))", marginTop: 12 }} />
        <div className="flex items-center justify-between" style={{ marginTop: 12 }}>
          <p
            className="font-body uppercase"
            style={{ fontSize: 11, letterSpacing: "0.3em", color: "rgb(var(--rgb-text-muted))" }}
          >
            {t("onboard.step_of").replace("{n}", String(step)).replace("{total}", String(TOTAL_STEPS))}
          </p>
          <div className="flex gap-1.5" aria-hidden="true">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div
                key={i}
                className="rounded-full transition-all duration-300"
                style={{
                  height: 4,
                  width: i + 1 === step ? 14 : 4,
                  background: i + 1 <= step ? "rgb(var(--rgb-text-primary))" : "rgb(var(--rgb-border))",
                  opacity: i + 1 < step ? 0.6 : 1,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      {/* pb-40, not pb-24: the birth step is an instrument now, not a single
          line input, and the fixed Continue button was sitting on the "I do not
          know my birth time" line underneath it. */}
      <div className="flex-1 flex flex-col justify-start pt-8 px-5 pb-48 animate-slide-up" key={step} style={{ position: "relative" }}>
        <div className="w-full max-w-lg mx-auto">
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
                        borderColor: active ? "rgb(var(--rgb-text-primary))" : "rgb(var(--rgb-border))",
                        background: active ? "rgb(var(--rgb-card))" : "transparent",
                        color: active ? "rgb(var(--rgb-text-primary))" : "rgb(var(--rgb-text-muted))",
                      }}
                    >
                      <span className="font-heading" style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-.02em" }}>
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
              {/* A birth is one fact, so it is asked once, on one instrument.
                  It used to be two steps, a native date picker and a native
                  time picker, which made the moment feel like two unrelated
                  questions and opened two modals on a phone. */}
              <BirthWheels
                date={birthDate}
                time={birthTime}
                timeDisabled={timeUnknown}
                onChange={(d, tm) => { setBirthDate(d); setBirthTime(tm); }}
              />
              <button
                onClick={() => {
                  const next = !timeUnknown;
                  setTimeUnknown(next);
                  // Noon is the honest stand-in, and it is what the backend
                  // assumes for an unknown time.
                  if (next) setBirthTime("12:00");
                }}
                className="mt-3 font-body transition-colors"
                style={{ fontSize: 15, color: timeUnknown ? "rgb(var(--rgb-text-primary))" : "rgb(var(--rgb-text-secondary))", textDecoration: timeUnknown ? "underline" : "none", textUnderlineOffset: 3 }}
              >
                {timeUnknown ? t("onboard.time_using_noon") : t("onboard.time_unknown")}
              </button>
            </StepWrapper>
          )}

          {step === 4 && (
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
              <p className="font-body mt-2" style={{ fontSize: 15, color: "rgb(var(--rgb-text-secondary))" }}>{t("onboard.city_example")}</p>
            </StepWrapper>
          )}

          {step === 5 && (
            <StepWrapper label={`${t("onboard.welcome_name")} ${name}.`} subtitle={t("onboard.create_account")}>
              <input
                autoFocus
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("login.email_placeholder")}
                className="onboard-input mb-3"
              />
              <input
                type="password"
                autoComplete="new-password"
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
                  className="mt-1 w-4 h-4 cursor-pointer flex-shrink-0"
                  style={{ accentColor: "rgb(var(--rgb-text-primary))" }}
                />
                <span className="font-body text-[15px] leading-relaxed" style={{ color: "rgb(var(--rgb-text-secondary))" }}>
                  {t("onboard.hive_consent")}
                </span>
              </label>
            </StepWrapper>
          )}

          {error && (
            <p className="font-body mt-4" style={{ fontSize: 15, color: "rgb(var(--rgb-ember))" }}>{error}</p>
          )}
        </div>
      </div>

      {/* CTA */}
      <div className="fixed bottom-0 left-0 right-0 px-5 bg-gradient-to-t from-forest-deep via-forest-deep to-transparent pt-8" style={{ zIndex: 2, paddingBottom: "calc(24px + var(--sab, 0px))" }}>
        <div className="max-w-lg mx-auto">
          {step < TOTAL_STEPS ? (
            <button
              onClick={next}
              disabled={!canProceed()}
              className="w-full font-body font-bold py-4 rounded-full text-[14px] uppercase tracking-[0.3em] transition-all duration-200 hover:opacity-90 active:scale-95 disabled:opacity-30 entry-cta" style={{ background: "rgb(var(--rgb-text-primary))", color: "rgb(var(--rgb-bg-deep))", border: "1.5px solid rgb(var(--rgb-text-primary))" }}
            >
              {t("common.continue")}
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!canProceed() || loading}
              className="w-full font-body font-bold py-4 rounded-full text-[14px] uppercase tracking-[0.3em] transition-all duration-200 hover:opacity-90 active:scale-95 disabled:opacity-30 entry-cta flex items-center justify-center gap-2" style={{ background: "rgb(var(--rgb-text-primary))", color: "rgb(var(--rgb-bg-deep))", border: "1.5px solid rgb(var(--rgb-text-primary))" }}
            >
              {loading ? <LoadingSpinner size="sm" /> : t("onboard.begin_journey")}
            </button>
          )}
          <p className="text-center font-body mt-4" style={{ fontSize: 15, color: "rgb(var(--rgb-text-secondary))" }}>
            {t("onboard.have_account")}{" "}
            <Link href="/login" className="underline underline-offset-4" style={{ color: "rgb(var(--rgb-text-primary))" }}>
              {t("onboard.log_in")}
            </Link>
          </p>
        </div>
      </div>

      <style jsx>{`
        .onboard-input {
          width: 100%;
          background: transparent;
          border: none;
          border-bottom: 1px solid rgb(var(--rgb-border));
          padding: 12px 0;
          color: rgb(var(--rgb-text-primary));
          font-family: var(--font-body), "Zen Kaku Gothic New", system-ui, sans-serif;
          font-size: 17px;
          font-weight: 500;
          transition: border-color 0.2s;
          display: block;
        }
        .onboard-input:focus {
          border-bottom-color: rgb(var(--rgb-text-primary));
        }
        .onboard-input::placeholder {
          color: rgb(var(--rgb-text-muted));
        }
        .sex-card {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 28px 12px;
          border: 1px solid rgb(var(--rgb-border));
          border-radius: 14px;
          background: transparent;
          transition: border-color 0.25s ease, background 0.25s ease, color 0.25s ease, transform 0.15s ease;
          cursor: pointer;
        }
        .sex-card:hover {
          border-color: rgb(var(--rgb-text-secondary));
          color: rgb(var(--rgb-text-primary));
        }
        .sex-card:active {
          transform: scale(0.98);
        }
        .city-dropdown {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          right: 0;
          background: rgb(var(--rgb-card));
          border: 1px solid rgb(var(--rgb-border));
          border-radius: 8px;
          overflow: hidden;
          z-index: 50;
          box-shadow: 0 8px 24px rgb(var(--rgb-scrim) / 0.08);
        }
        .city-dropdown-item {
          display: block;
          width: 100%;
          text-align: left;
          padding: 12px 16px;
          color: rgb(var(--rgb-text-primary));
          font-family: var(--font-body), "Zen Kaku Gothic New", system-ui, sans-serif;
          font-size: 0.95rem;
          background: transparent;
          border: none;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
        }
        .city-dropdown-item:hover,
        .city-dropdown-item:focus {
          background: rgb(var(--rgb-bg-dark));
          color: rgb(var(--rgb-text-primary));
          outline: none;
        }
        .city-dropdown-item + .city-dropdown-item {
          border-top: 1px solid rgb(var(--rgb-border));
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
          className="font-body uppercase mb-3"
          style={{ fontSize: 11, letterSpacing: "0.3em", color: "rgb(var(--rgb-text-muted))" }}
        >{eyebrow}</p>
      )}
      <h2
        className="font-heading mb-2"
        style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-.02em", lineHeight: 1.15, color: "rgb(var(--rgb-text-primary))" }}
      >{label}</h2>
      {subtitle && (
        <p className="font-body mb-8" style={{ fontSize: 17, lineHeight: 1.62, fontWeight: 500, color: "rgb(var(--rgb-text-secondary))" }}>{subtitle}</p>
      )}
      <div className={subtitle ? "" : "mt-8"}>{children}</div>
    </div>
  );
}
