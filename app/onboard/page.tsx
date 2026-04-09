"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import LoadingSpinner from "@/components/LoadingSpinner";

const TOTAL_STEPS = 5;

// Magical blueprint calculation loading screen
const BLUEPRINT_STEPS = [
  "Mapping your astrology…",
  "Deriving your Human Design…",
  "Unlocking your Gene Keys…",
  "Weaving your blueprint together…",
];

function BlueprintLoader() {
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
          background: "radial-gradient(circle at 40% 35%, #e8821a55, #0a1f1200 70%)",
          border: "1px solid rgba(232,130,26,0.2)",
          animation: "pulse 2s ease-in-out infinite",
          boxShadow: "0 0 40px rgba(232,130,26,0.1)",
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
                {i < visibleCount - 1 ? "✓" : "·"}
              </span>
              <p
                className="font-body text-sm"
                style={{
                  color: i === visibleCount - 1 ? "#f5f0e8" : "#8a9e8d",
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
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
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
      case 2: return birthDate.length === 10;
      case 3: return timeUnknown || birthTime.length === 5;
      case 4: return birthPlace.trim().length > 0;
      case 5: return email.trim().length > 0 && password.length >= 6;
      default: return false;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && canProceed() && step < TOTAL_STEPS) next();
  };

  const handleSubmit = async () => {
    setError("");
    setLoading(true);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    try {
      const res = await fetch(`${apiUrl}/users/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          birth_date: birthDate,
          birth_time: timeUnknown ? "12:00" : birthTime,
          birth_city: birthPlace,
          email,
          password,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Registration failed");
      }
      const data = await res.json();
      setToken(data.token || data.access_token, data.profile || data.user || { id: data.user_id, email, name });
      // Show magical blueprint loading screen for at least 3.5 seconds
      setCalculatingBlueprint(true);
      await new Promise((resolve) => setTimeout(resolve, 3500));
      router.push("/today");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : "Something went wrong. Please try again.";
      setError(msg);
      setCalculatingBlueprint(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-forest-deep flex flex-col">
      {/* Magical blueprint calculation screen */}
      {calculatingBlueprint && <BlueprintLoader />}

      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-12 pb-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full overflow-hidden">
            <Image src="/logo.jpg" alt="Solray" width={32} height={32} className="w-full h-full object-cover" />
          </div>
          <span className="font-heading text-sm tracking-widest uppercase text-text-secondary">Solray AI</span>
        </div>
        {/* Progress dots */}
        <div className="flex gap-2">
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
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-24 animate-slide-up" key={step}>
        <div className="w-full max-w-sm">
          {step === 1 && (
            <StepWrapper label="What is your name?">
              <input
                autoFocus
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Your name"
                className="onboard-input"
              />
            </StepWrapper>
          )}

          {step === 2 && (
            <StepWrapper label="When were you born?">
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

          {step === 3 && (
            <StepWrapper label="What time were you born?">
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
                {timeUnknown ? "✓ Using noon" : "I don't know my birth time"}
              </button>
            </StepWrapper>
          )}

          {step === 4 && (
            <StepWrapper label="Where were you born?">
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
                  placeholder="City, Country"
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
              <p className="text-text-secondary text-xs mt-2 font-body">e.g. Barcelona, Spain</p>
            </StepWrapper>
          )}

          {step === 5 && (
            <StepWrapper label={`Welcome, ${name}.`} subtitle="Create your account to begin.">
              <input
                autoFocus
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="onboard-input mb-3"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (min 6 characters)"
                className="onboard-input"
              />
            </StepWrapper>
          )}

          {error && (
            <p className="text-red-400 text-xs text-center font-body mt-4">{error}</p>
          )}
        </div>
      </div>

      {/* CTA */}
      <div className="fixed bottom-0 left-0 right-0 px-6 pb-10 bg-gradient-to-t from-forest-deep via-forest-deep to-transparent pt-8">
        <div className="max-w-sm mx-auto">
          {step < TOTAL_STEPS ? (
            <button
              onClick={next}
              disabled={!canProceed()}
              className="w-full bg-amber-sun text-forest-deep font-body font-semibold py-4 rounded-xl text-sm tracking-wider transition-all duration-200 hover:opacity-90 active:scale-95 disabled:opacity-30"
            >
              Continue
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!canProceed() || loading}
              className="w-full bg-amber-sun text-forest-deep font-body font-semibold py-4 rounded-xl text-sm tracking-wider transition-all duration-200 hover:opacity-90 active:scale-95 disabled:opacity-30 flex items-center justify-center gap-2"
            >
              {loading ? <LoadingSpinner size="sm" /> : "Begin my journey"}
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
          color: #f5f0e8;
          font-family: 'Inter', sans-serif;
          font-size: 1rem;
          transition: border-color 0.2s;
          display: block;
        }
        .onboard-input:focus {
          border-bottom-color: #e8821a;
        }
        .onboard-input::placeholder {
          color: #8a9e8d;
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
          color: #f5f0e8;
          font-family: 'Inter', sans-serif;
          font-size: 0.95rem;
          background: transparent;
          border: none;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
        }
        .city-dropdown-item:hover,
        .city-dropdown-item:focus {
          background: rgba(232,130,26,0.15);
          color: #e8821a;
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
  children,
}: {
  label: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="font-heading text-4xl text-text-primary mb-2 leading-tight">{label}</h2>
      {subtitle && <p className="text-text-secondary text-sm font-body mb-8">{subtitle}</p>}
      <div className={subtitle ? "" : "mt-8"}>{children}</div>
    </div>
  );
}
