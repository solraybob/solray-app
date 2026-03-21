"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import LoadingSpinner from "@/components/LoadingSpinner";


const TOTAL_STEPS = 5;

export default function OnboardPage() {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [timeUnknown, setTimeUnknown] = useState(false);
  const [birthPlace, setBirthPlace] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { setToken } = useAuth();
  const router = useRouter();

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
      setToken(data.token || data.access_token, data.user || { id: data.id, email, name });
      router.push("/today");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-forest-deep flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-12 pb-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full overflow-hidden">
            <Image src="/logo.svg" alt="Solray" width={32} height={32} className="w-full h-full object-cover" />
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
                {timeUnknown ? "✓ I don't know — using noon" : "I don't know my birth time"}
              </button>
            </StepWrapper>
          )}

          {step === 4 && (
            <StepWrapper label="Where were you born?">
              <input
                autoFocus
                type="text"
                value={birthPlace}
                onChange={(e) => setBirthPlace(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="City, Country"
                className="onboard-input"
              />
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
          font-size: 1.1rem;
          transition: border-color 0.2s;
          display: block;
        }
        .onboard-input:focus {
          border-bottom-color: #e8821a;
        }
        .onboard-input::placeholder {
          color: #8a9e8d;
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
