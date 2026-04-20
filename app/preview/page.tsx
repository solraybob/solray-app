"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import LoadingSpinner from "@/components/LoadingSpinner";

export default function PreviewPage() {
  const router = useRouter();
  const [step, setStep] = useState(1); // 1: input, 2: loading, 3: result
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [birthCity, setBirthCity] = useState("");
  const [citySuggestions, setCitySuggestions] = useState<{ display: string }[]>([]);
  const [cityLoading, setCityLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const cityInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    sun_sign: string;
    moon_sign: string;
    rising_sign: string;
    hd_type: string;
  } | null>(null);

  // City autocomplete debounce
  useEffect(() => {
    if (birthCity.trim().length < 2) {
      setCitySuggestions([]);
      setShowSuggestions(false);
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
        const suggestions = data
          .map((item: { address: { city?: string; town?: string; village?: string; municipality?: string; country?: string } }) => {
            const city = item.address.city || item.address.town || item.address.village || item.address.municipality;
            const country = item.address.country;
            if (!city) return null;
            return { display: country ? `${city}, ${country}` : city };
          })
          .filter(Boolean) as { display: string }[];
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
  }, [birthCity]);

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

  const canProceed = () => {
    return (
      birthDate.length === 10 &&
      birthTime.length === 5 &&
      birthCity.trim().length > 0
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && canProceed()) {
      handleCalculate();
    }
  };

  const handleCalculate = async () => {
    setError("");
    setLoading(true);
    setStep(2);

    const apiUrl =
      process.env.NEXT_PUBLIC_API_URL ||
      "https://solray-backend-production.up.railway.app";

    try {
      const res = await fetch(`${apiUrl}/souls/calculate-blueprint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          birth_date: birthDate,
          birth_time: birthTime,
          birth_city: birthCity,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Blueprint still forming. Try once more.");
      }

      const data = await res.json();
      setResult({
        sun_sign: data.blueprint?.summary?.sun_sign || data.profile?.sun_sign || data.sun_sign || "Unknown",
        moon_sign: data.blueprint?.summary?.moon_sign || data.profile?.moon_sign || data.moon_sign || "Unknown",
        rising_sign: data.blueprint?.summary?.ascendant || data.profile?.rising_sign || data.rising_sign || "Unknown",
        hd_type: data.blueprint?.human_design?.type || data.profile?.hd_type || data.hd_type || "Unknown",
      });

      // Show loading for a brief moment for effect
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setStep(3);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Something felt off in the cosmos. Try once more.";
      setError(msg);
      setStep(1);
    } finally {
      setLoading(false);
    }
  };

  const handleBeginJourney = () => {
    router.push("/onboard");
  };

  return (
    <>
      <style jsx>{`
        .preview-input {
          width: 100%;
          background: transparent;
          border: none;
          border-bottom: 1px solid #1a3020;
          padding: 12px 0;
          color: #f2ecd8;
          font-family: "Inter", sans-serif;
          font-size: 1rem;
          transition: border-color 0.2s;
          display: block;
        }
        .preview-input:focus {
          outline: none;
          border-bottom-color: #f39230;
        }
        .preview-input::placeholder {
          color: #8a9e8d;
        }
        .preview-dropdown {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          right: 0;
          background: #0a1f12;
          border: 1px solid #1a3020;
          border-radius: 8px;
          overflow: hidden;
          z-index: 50;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        }
        .preview-dropdown-item {
          display: block;
          width: 100%;
          text-align: left;
          padding: 12px 16px;
          color: #f2ecd8;
          font-family: "Inter", sans-serif;
          font-size: 0.95rem;
          background: transparent;
          border: none;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
        }
        .preview-dropdown-item:hover,
        .preview-dropdown-item:focus {
          background: rgba(243, 146, 48, 0.15);
          color: #f39230;
          outline: none;
        }
        .preview-dropdown-item + .preview-dropdown-item {
          border-top: 1px solid #1a3020;
        }
        .pulse-orb {
          animation: pulse 2s ease-in-out infinite;
        }
        @keyframes pulse {
          0%,
          100% {
            transform: scale(1);
            opacity: 0.8;
          }
          50% {
            transform: scale(1.08);
            opacity: 1;
          }
        }
      `}</style>

      <div className="min-h-screen bg-forest-deep flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 px-6 pt-12 pb-8">
          <div className="w-8 h-8 rounded-full overflow-hidden">
            <Image
              src="/logo.jpg"
              alt="Solray"
              width={32}
              height={32}
              className="w-full h-full object-cover"
            />
          </div>
          <span className="font-heading text-2xl tracking-[0.15em] text-text-primary" style={{ fontStyle: "italic", fontWeight: 300 }}>
            SOLRAY
          </span>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 pb-24">
          {/* Step 1: Input */}
          {step === 1 && (
            <div className="w-full max-w-sm animate-slide-up">
              <div className="mb-12">
                <h1 className="font-heading text-5xl text-text-primary mb-3 leading-tight">
                  Preview Your Chart
                </h1>
                <p className="text-text-secondary text-sm font-body">
                  See your Sun, Moon, and Rising signs instantly.
                </p>
              </div>

              <div className="space-y-8">
                {/* Birth Date */}
                <div>
                  <label className="block text-xs uppercase tracking-widest text-text-secondary mb-2 font-body">
                    Birth Date
                  </label>
                  <input
                    autoFocus
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="preview-input"
                    style={{ colorScheme: "dark" }}
                  />
                </div>

                {/* Birth Time */}
                <div>
                  <label className="block text-xs uppercase tracking-widest text-text-secondary mb-2 font-body">
                    Birth Time
                  </label>
                  <input
                    type="time"
                    value={birthTime}
                    onChange={(e) => setBirthTime(e.target.value)}
                    className="preview-input"
                    style={{ colorScheme: "dark" }}
                  />
                  <p className="text-text-secondary text-xs mt-2 font-body">
                    As precise as possible (check your birth certificate)
                  </p>
                </div>

                {/* Birth City */}
                <div>
                  <label className="block text-xs uppercase tracking-widest text-text-secondary mb-2 font-body">
                    Birth City
                  </label>
                  <div className="relative">
                    <input
                      ref={cityInputRef}
                      type="text"
                      value={birthCity}
                      onChange={(e) => {
                        setBirthCity(e.target.value);
                        setShowSuggestions(true);
                      }}
                      onKeyDown={handleKeyDown}
                      placeholder="City, Country"
                      className="preview-input"
                      style={{
                        paddingRight: cityLoading ? "2rem" : undefined,
                      }}
                      autoComplete="off"
                    />
                    {cityLoading && (
                      <span className="absolute right-0 top-1/2 -translate-y-1/2 text-text-secondary">
                        <svg
                          className="animate-spin h-4 w-4"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8v8z"
                          />
                        </svg>
                      </span>
                    )}
                    {showSuggestions && citySuggestions.length > 0 && (
                      <div ref={suggestionsRef} className="preview-dropdown">
                        {citySuggestions.map((s, i) => (
                          <button
                            key={i}
                            type="button"
                            className="preview-dropdown-item"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setBirthCity(s.display);
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
                </div>

                {error && (
                  <p className="text-ember text-xs font-body text-center">
                    {error}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Loading */}
          {step === 2 && (
            <div className="flex flex-col items-center justify-center gap-8 animate-slide-up">
              <div
                className="pulse-orb w-24 h-24 rounded-full"
                style={{
                  background:
                    "radial-gradient(circle at 40% 35%, #f3923055, #0a1f1200 70%)",
                  border: "1px solid rgba(243,146,48,0.2)",
                  boxShadow: "0 0 40px rgba(243,146,48,0.1)",
                }}
              />
              <p className="font-body text-sm text-text-secondary">
                Calculating your blueprint…
              </p>
            </div>
          )}

          {/* Step 3: Result */}
          {step === 3 && result && (
            <div className="w-full max-w-sm animate-slide-up">
              {/* Result Card */}
              <div className="bg-forest-card border border-forest-border rounded-2xl p-8 mb-8">
                <div className="text-center mb-8">
                  <p className="text-text-secondary text-xs uppercase tracking-widest font-body mb-4">
                    Your Cosmic Blueprint
                  </p>
                  <div className="grid grid-cols-3 gap-4">
                    {/* Sun */}
                    <div>
                      <div className="text-2xl mb-2">☉</div>
                      <p className="font-heading text-3xl text-amber-sun mb-1">
                        {result.sun_sign.charAt(0).toUpperCase() +
                          result.sun_sign.slice(1)}
                      </p>
                      <p className="text-xs text-text-secondary font-body">
                        Sun
                      </p>
                    </div>

                    {/* Moon */}
                    <div>
                      <div className="text-2xl mb-2">☽</div>
                      <p className="font-heading text-3xl text-text-primary mb-1">
                        {result.moon_sign.charAt(0).toUpperCase() +
                          result.moon_sign.slice(1)}
                      </p>
                      <p className="text-xs text-text-secondary font-body">
                        Moon
                      </p>
                    </div>

                    {/* Rising */}
                    <div>
                      <div className="text-2xl mb-2">⚛</div>
                      <p className="font-heading text-3xl text-text-primary mb-1">
                        {result.rising_sign.charAt(0).toUpperCase() +
                          result.rising_sign.slice(1)}
                      </p>
                      <p className="text-xs text-text-secondary font-body">
                        Rising
                      </p>
                    </div>
                  </div>
                </div>

                {/* HD Type */}
                <div
                  className="border-t pt-6 text-center"
                  style={{ borderColor: "#1a3020" }}
                >
                  <p className="text-xs uppercase tracking-widest text-text-secondary font-body mb-2">
                    Human Design Type
                  </p>
                  <p className="font-heading text-2xl text-text-primary">
                    {result.hd_type}
                  </p>
                </div>
              </div>

              {/* Description */}
              <div className="text-center mb-8">
                <p className="text-sm text-text-secondary font-body leading-relaxed">
                  This is just the beginning. Your full blueprint includes{" "}
                  <span className="text-text-primary">Human Design</span>,{" "}
                  <span className="text-text-primary">Gene Keys</span>,{" "}
                  <span className="text-text-primary">Astrocartography</span> and
                  a <span className="text-text-primary">Higher Self</span> who
                  knows you.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* CTA */}
        <div
          className="fixed bottom-0 left-0 right-0 px-6 pb-10 pt-8"
          style={{
            background:
              "linear-gradient(to top, #050f08, #050f08 50%, transparent)",
          }}
        >
          <div className="max-w-sm mx-auto">
            {step === 1 && (
              <button
                onClick={handleCalculate}
                disabled={!canProceed() || loading}
                className="w-full bg-amber-sun text-forest-deep font-body font-semibold py-4 rounded-xl text-sm tracking-wider transition-all duration-200 hover:opacity-90 active:scale-95 disabled:opacity-30 flex items-center justify-center gap-2"
              >
                {loading ? <LoadingSpinner size="sm" /> : "Preview Your Chart"}
              </button>
            )}

            {step === 3 && (
              <button
                onClick={handleBeginJourney}
                className="w-full bg-amber-sun text-forest-deep font-body font-semibold py-4 rounded-xl text-sm tracking-wider transition-all duration-200 hover:opacity-90 active:scale-95"
              >
                Create your free profile →
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
