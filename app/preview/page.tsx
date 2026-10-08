"use client";

import { ApiError, detailCode } from "@/lib/api";
import { memberErrorText } from "@/lib/member-error";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import BirthWheels from "@/components/BirthWheels";
import { useCityAutocomplete, type CitySuggestion } from "@/lib/city-search";
import { useT } from "@/lib/i18n";
import { tx } from "@/lib/astro-i18n";
import { errorText } from "@/lib/errors";
import { PageHead, PageTitle, InkButton } from "@/components/PageHead";

export default function PreviewPage() {
  const router = useRouter();
  const { t, lang } = useT();
  const [step, setStep] = useState(1); // 1: input, 2: loading, 3: result
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [birthCity, setBirthCity] = useState("");
  const city = useCityAutocomplete(birthCity);
  const pickCity = (c: CitySuggestion) => {
    setBirthCity(c.display);
    city.settle(c.display);
  };
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

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        cityInputRef.current &&
        !cityInputRef.current.contains(e.target as Node)
      ) {
        city.close();
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

    const apiUrl = (
      process.env.NEXT_PUBLIC_API_URL ||
      "https://solray-backend-production.up.railway.app"
    ).trim();

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
        throw new ApiError(errorText(err?.detail, ""), res.status, detailCode(err?.detail), err?.detail);
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
      const msg = memberErrorText(err, t, "preview.error_forming", { byStatus: { 400: "settings.birth_invalid", 422: "settings.birth_invalid" } });
      setError(msg);
      setStep(1);
    } finally {
      setLoading(false);
    }
  };

  const handleBeginJourney = () => {
    router.push("/onboard");
  };

  const sign = (v: string) => {
    const c = v ? v.charAt(0).toUpperCase() + v.slice(1) : v;
    return tx(c, lang);
  };

  return (
    <>
      <style jsx>{`
        .preview-input {
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
        .preview-input:focus {
          outline: none;
          border-bottom-color: rgb(var(--rgb-text-primary));
        }
        .preview-input::placeholder {
          color: rgb(var(--rgb-text-muted));
        }
        .preview-dropdown {
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
        .preview-dropdown-item {
          display: block;
          width: 100%;
          text-align: left;
          padding: 12px 16px;
          color: rgb(var(--rgb-text-primary));
          font-family: var(--font-body), "Zen Kaku Gothic New", system-ui, sans-serif;
          font-size: 17px;
          background: transparent;
          border: none;
          cursor: pointer;
          transition: background 0.15s;
        }
        .preview-dropdown-item:hover,
        .preview-dropdown-item:focus {
          background: rgb(var(--rgb-bg-dark));
          outline: none;
        }
        .preview-dropdown-item + .preview-dropdown-item {
          border-top: 1px solid rgb(var(--rgb-border));
        }
      `}</style>

      <div className="min-h-[100dvh] bg-forest-deep" style={{ paddingBottom: "calc(140px + var(--sab, 0px))" }}>
        <PageHead label={t("preview.eyebrow")} />

        <div className="max-w-lg mx-auto px-5">
          {/* Step 1: Input */}
          {step === 1 && (
            <div className="animate-slide-up">
              <PageTitle title={t("preview.title")} sub={t("preview.subtitle")} />

              <div className="space-y-8">
                {/* The same instrument as onboarding and settings. */}
                <div>
                  <label className="block font-body uppercase mb-2" style={LABEL}>
                    {t("common.birth_date")}
                  </label>
                  <BirthWheels
                    date={birthDate}
                    time={birthTime}
                    onChange={(d, tm) => { setBirthDate(d); setBirthTime(tm); }}
                  />
                </div>

                <div>
                  <label className="block font-body uppercase mb-2" style={LABEL}>
                    {t("common.birth_city")}
                  </label>
                  <div className="relative">
                    <input
                      ref={cityInputRef}
                      type="text"
                      value={birthCity}
                      onChange={(e) => setBirthCity(e.target.value)}
                      onKeyDown={(e) => {
                        if (city.onKeyDown(e, pickCity)) return;
                        handleKeyDown(e);
                      }}
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded={city.open && city.suggestions.length > 0}
                      aria-controls="preview-city-list"
                      aria-activedescendant={city.active >= 0 ? `preview-city-${city.active}` : undefined}
                      placeholder={t("preview.city_placeholder")}
                      className="preview-input"
                      style={{ paddingRight: city.loading ? "2rem" : undefined }}
                      autoComplete="off"
                    />
                    {city.loading && (
                      <span className="absolute right-0 top-1/2 -translate-y-1/2" style={{ color: "rgb(var(--rgb-text-secondary))" }}>
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                        </svg>
                      </span>
                    )}
                    {city.open && city.suggestions.length > 0 && (
                      <div ref={suggestionsRef} role="listbox" id="preview-city-list" className="preview-dropdown">
                        {city.suggestions.map((s, i) => (
                          <button
                            key={s.display}
                            id={`preview-city-${i}`}
                            type="button"
                            role="option"
                            aria-selected={i === city.active}
                            className={`preview-dropdown-item${i === city.active ? " is-active" : ""}`}
                            style={{ minHeight: 44, ...(i === city.active ? { background: "rgb(var(--rgb-text-primary) / 0.06)" } : {}) }}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pickCity(s)}
                          >
                            {s.display}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {error && (
                  <p className="font-body" style={{ fontSize: 15, color: "rgb(var(--rgb-ember))" }}>
                    {error}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Loading */}
          {step === 2 && (
            <div className="animate-slide-up" style={{ paddingTop: 18 }}>
              <div
                className="w-6 h-6 rounded-full animate-spin mb-6"
                style={{ border: "2px solid rgb(var(--rgb-border))", borderTopColor: "rgb(var(--rgb-text-primary))" }}
              />
              <p className="font-body" style={{ fontSize: 17, lineHeight: 1.62, fontWeight: 500, color: "rgb(var(--rgb-text-secondary))" }}>
                {t("preview.calculating")}
              </p>
            </div>
          )}

          {/* Step 3: Result */}
          {step === 3 && result && (
            <div className="animate-slide-up">
              <PageTitle title={t("preview.result_title")} />
              <div style={{ borderTop: "1px solid rgb(var(--rgb-border))", marginBottom: 28 }}>
                <ResultRow label={t("planets.sun")} value={sign(result.sun_sign)} />
                <ResultRow label={t("planets.moon")} value={sign(result.moon_sign)} />
                <ResultRow label={t("planets.ascendant")} value={sign(result.rising_sign)} />
                <ResultRow label={t("preview.hd_type")} value={tx(result.hd_type, lang)} />
              </div>
              <p className="font-body" style={{ fontSize: 17, lineHeight: 1.62, fontWeight: 500, color: "rgb(var(--rgb-text-secondary))" }}>
                {t("preview.description")}
              </p>
            </div>
          )}
        </div>

        {/* CTA */}
        <div
          className="fixed bottom-0 left-0 right-0 px-5 pt-8"
          style={{
            paddingBottom: "calc(24px + var(--sab, 0px))",
            background: "linear-gradient(to top, rgb(var(--rgb-bg-deep)), rgb(var(--rgb-bg-deep)) 50%, transparent)",
          }}
        >
          <div className="max-w-lg mx-auto">
            {step === 1 && (
              <InkButton onClick={handleCalculate} loading={loading} disabled={!canProceed()}>
                {t("preview.cta_preview")}
              </InkButton>
            )}
            {step === 3 && (
              <InkButton onClick={handleBeginJourney}>{t("preview.cta_create")}</InkButton>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

const LABEL: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, letterSpacing: "0.2em", color: "rgb(var(--rgb-text-muted))" };

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline font-body" style={{ paddingBlock: 12, borderBottom: "1px solid rgb(var(--rgb-border) / .6)" }}>
      <span style={{ fontSize: 15, color: "rgb(var(--rgb-text-secondary))" }}>{label}</span>
      <span style={{ fontSize: 17, fontWeight: 700, color: "rgb(var(--rgb-text-primary))" }}>{value}</span>
    </div>
  );
}
