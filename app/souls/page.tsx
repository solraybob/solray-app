"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import BottomNav from "@/components/BottomNav";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";

// ─── Types ───────────────────────────────────────────────────────────────────

interface StoredSoul {
  id: string;
  name: string;
  birth_date: string;       // YYYY-MM-DD
  birth_time?: string;      // HH:MM (optional)
  birth_city: string;
  // Cached from blueprint calculation
  sun_sign?: string;
  moon_sign?: string;
  rising_sign?: string;
  hd_type?: string;
  blueprint?: Record<string, unknown>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SIGN_SYMBOLS: Record<string, string> = {
  Aries: "♈", Taurus: "♉", Gemini: "♊", Cancer: "♋",
  Leo: "♌", Virgo: "♍", Libra: "♎", Scorpio: "♏",
  Sagittarius: "♐", Capricorn: "♑", Aquarius: "♒", Pisces: "♓",
};

function loadSouls(): StoredSoul[] {
  try {
    return JSON.parse(localStorage.getItem("solray_souls") || "[]");
  } catch {
    return [];
  }
}

function persistSouls(souls: StoredSoul[]) {
  localStorage.setItem("solray_souls", JSON.stringify(souls));
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

// ─── Add Soul Form ────────────────────────────────────────────────────────────

interface AddSoulFormProps {
  onClose: () => void;
  onSave: (soul: StoredSoul) => void;
  token: string | null;
}

function AddSoulForm({ onClose, onSave, token }: AddSoulFormProps) {
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [birthCity, setBirthCity] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!name.trim() || !birthDate || !birthCity.trim()) {
      setError("Name, birth date, and city are required.");
      return;
    }
    setSaving(true);
    setError("");

    let blueprint: Record<string, unknown> | undefined;
    let sun_sign: string | undefined;
    let moon_sign: string | undefined;
    let rising_sign: string | undefined;
    let hd_type: string | undefined;

    // Try to calculate blueprint via API
    try {
      const data = await apiFetch(
        "/souls/calculate-blueprint",
        {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            birth_date: birthDate,
            birth_time: birthTime || "12:00",
            birth_city: birthCity.trim(),
          }),
        },
        token
      );
      blueprint = data?.blueprint || data;
      const profile = data?.profile || data;
      sun_sign = profile?.sun_sign || data?.sun_sign;
      moon_sign = profile?.moon_sign || data?.moon_sign;
      rising_sign = profile?.rising_sign || data?.rising_sign;
      hd_type = profile?.hd_type || data?.hd_type || data?.human_design?.type;
    } catch {
      // Blueprint calc failed – we still save birth data
    }

    const soul: StoredSoul = {
      id: generateId(),
      name: name.trim(),
      birth_date: birthDate,
      birth_time: birthTime || undefined,
      birth_city: birthCity.trim(),
      sun_sign,
      moon_sign,
      rising_sign,
      hd_type,
      blueprint,
    };

    onSave(soul);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="absolute inset-0 bg-forest-deep/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg bg-forest-dark border-t border-forest-border rounded-t-3xl px-6 pt-6 pb-12 animate-slide-up">
        <div className="w-10 h-1 bg-forest-border rounded-full mx-auto mb-6" />
        <h2 className="font-heading text-3xl text-text-primary mb-1">Add a Soul</h2>
        <p className="text-text-secondary text-sm font-body mb-6">
          Enter their birth data to read your compatibility.
        </p>

        <div className="space-y-3">
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="w-full bg-forest-card border border-forest-border rounded-xl px-4 py-3.5 text-text-primary placeholder-text-secondary font-body text-sm focus:border-amber-sun transition-colors"
          />
          <input
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            className="w-full bg-forest-card border border-forest-border rounded-xl px-4 py-3.5 text-text-primary font-body text-sm focus:border-amber-sun transition-colors"
          />
          <div className="flex gap-3">
            <input
              type="time"
              value={birthTime}
              onChange={(e) => setBirthTime(e.target.value)}
              placeholder="Birth time (optional)"
              className="flex-1 bg-forest-card border border-forest-border rounded-xl px-4 py-3.5 text-text-primary font-body text-sm focus:border-amber-sun transition-colors"
            />
          </div>
          <input
            type="text"
            value={birthCity}
            onChange={(e) => setBirthCity(e.target.value)}
            placeholder="Birth city"
            className="w-full bg-forest-card border border-forest-border rounded-xl px-4 py-3.5 text-text-primary placeholder-text-secondary font-body text-sm focus:border-amber-sun transition-colors"
          />

          {error && (
            <p className="text-red-400 text-xs font-body">{error}</p>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-amber-sun text-forest-deep font-body font-semibold py-4 rounded-xl text-sm tracking-wider transition-all hover:opacity-90 active:scale-95 disabled:opacity-30 flex items-center justify-center gap-2"
          >
            {saving ? <LoadingSpinner size="sm" /> : "Add to Constellation"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Soul Card ────────────────────────────────────────────────────────────────

interface SoulCardProps {
  soul: StoredSoul;
  onOpenChat: (soul: StoredSoul) => void;
  onDelete: (id: string) => void;
}

function SoulCard({ soul, onOpenChat, onDelete }: SoulCardProps) {
  const [showActions, setShowActions] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTouchStart = () => {
    longPressTimer.current = setTimeout(() => setShowActions(true), 600);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  const sunSymbol = soul.sun_sign ? (SIGN_SYMBOLS[soul.sun_sign] || "☉") : "✦";

  return (
    <div className="relative">
      <button
        onClick={() => !showActions && onOpenChat(soul)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchEnd}
        onMouseLeave={() => { if (longPressTimer.current) clearTimeout(longPressTimer.current); }}
        className="w-full text-left bg-forest-card border border-forest-border rounded-2xl p-5 transition-all hover:border-amber-sun/30 active:scale-[0.99]"
      >
        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div className="w-12 h-12 rounded-full bg-forest-border flex items-center justify-center shrink-0">
            <span className="font-heading text-xl text-text-primary">{soul.name[0]}</span>
          </div>
          <div className="flex-1">
            <h3 className="font-heading text-xl text-text-primary">{soul.name}</h3>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {soul.sun_sign && (
                <span className="text-text-secondary text-sm">
                  {sunSymbol} {soul.sun_sign}
                </span>
              )}
              {soul.sun_sign && soul.hd_type && (
                <span className="text-forest-border text-xs">·</span>
              )}
              {soul.hd_type && (
                <span className="text-text-secondary text-xs font-body">{soul.hd_type}</span>
              )}
              {!soul.sun_sign && !soul.hd_type && (
                <span className="text-text-secondary text-xs font-body">
                  {soul.birth_city} · {soul.birth_date}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-amber-sun text-xs font-body tracking-wider opacity-70">Read →</span>
          </div>
        </div>
      </button>

      {/* Long-press actions overlay */}
      {showActions && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center gap-4 bg-forest-deep/90 rounded-2xl"
          onClick={() => setShowActions(false)}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setShowActions(false); onOpenChat(soul); }}
            className="px-4 py-2 bg-amber-sun text-forest-deep rounded-xl font-body text-sm font-semibold"
          >
            Compatibility Reading
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setShowActions(false); onDelete(soul.id); }}
            className="px-4 py-2 bg-forest-card border border-red-400/40 text-red-400 rounded-xl font-body text-sm"
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SoulsPage() {
  const [souls, setSouls] = useState<StoredSoul[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(false);
  const { token } = useAuth();
  const router = useRouter();

  useEffect(() => {
    setSouls(loadSouls());
  }, []);

  const handleSaveSoul = (soul: StoredSoul) => {
    const updated = [soul, ...souls];
    setSouls(updated);
    persistSouls(updated);
    setShowAdd(false);
  };

  const handleDeleteSoul = (id: string) => {
    const updated = souls.filter((s) => s.id !== id);
    setSouls(updated);
    persistSouls(updated);
  };

  // Open a compatibility chat: store context in sessionStorage then navigate to chat
  const openCompatibilityChat = async (soul: StoredSoul) => {
    setLoading(true);

    let soulBlueprint = soul.blueprint;

    // Try to refresh/calculate blueprint if we don't have it
    if (!soulBlueprint && token) {
      try {
        const data = await apiFetch(
          "/souls/calculate-blueprint",
          {
            method: "POST",
            body: JSON.stringify({
              name: soul.name,
              birth_date: soul.birth_date,
              birth_time: soul.birth_time || "12:00",
              birth_city: soul.birth_city,
            }),
          },
          token
        );
        soulBlueprint = data?.blueprint || data;
        const profile = data?.profile || data;

        // Cache the result
        const updated = souls.map((s) =>
          s.id === soul.id
            ? {
                ...s,
                blueprint: soulBlueprint,
                sun_sign: s.sun_sign || profile?.sun_sign || data?.sun_sign,
                moon_sign: s.moon_sign || profile?.moon_sign || data?.moon_sign,
                rising_sign: s.rising_sign || profile?.rising_sign || data?.rising_sign,
                hd_type: s.hd_type || profile?.hd_type || data?.hd_type || data?.human_design?.type,
              }
            : s
        );
        setSouls(updated);
        persistSouls(updated);
      } catch {
        // Proceed without blueprint – chat message will still carry birth info
      }
    }

    // Build the opening message for the compatibility chat
    const chartSummary = [
      soul.sun_sign && `Sun in ${soul.sun_sign}`,
      soul.moon_sign && `Moon in ${soul.moon_sign}`,
      soul.rising_sign && `${soul.rising_sign} Rising`,
      soul.hd_type && `Human Design: ${soul.hd_type}`,
    ]
      .filter(Boolean)
      .join(", ");

    const introMessage = chartSummary
      ? `I want to understand the dynamic between me and ${soul.name}. Here is their chart: ${chartSummary}. How do our energies interact?`
      : `I want to understand the dynamic between me and ${soul.name}. Their birth details: ${soul.birth_date}, ${soul.birth_city}${soul.birth_time ? `, ${soul.birth_time}` : ""}. How do our energies interact?`;

    // Store the compatibility context so the chat page can pick it up
    sessionStorage.setItem(
      "solray_compat_context",
      JSON.stringify({
        soulName: soul.name,
        introMessage,
        soulBlueprint: soulBlueprint || null,
      })
    );

    setLoading(false);
    router.push("/chat?compat=1");
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-forest-deep pb-24">
        {/* Header */}
        <div className="px-5 pt-12 pb-6 max-w-lg mx-auto">
          <p className="text-text-secondary text-[10px] font-body tracking-[0.2em] uppercase mb-1">Your Field</p>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-heading text-4xl text-text-primary">Your Constellation</h1>
              <p className="text-text-secondary text-sm font-body mt-1">The people in your field</p>
            </div>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-4 py-2 bg-amber-sun/10 border border-amber-sun/30 rounded-xl text-amber-sun text-xs font-body tracking-wider transition-all hover:bg-amber-sun/20 shrink-0"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add Soul
            </button>
          </div>
        </div>

        <div className="max-w-lg mx-auto px-5 animate-fade-in">
          {souls.length === 0 ? (
            <div className="text-center pt-16">
              <div className="text-4xl mb-4">✦</div>
              <p className="font-heading text-2xl text-text-primary mb-2">Your constellation is empty</p>
              <p className="text-text-secondary text-sm font-body mb-6 max-w-xs mx-auto">
                Add someone's birth data to explore your compatibility and the dynamics between you.
              </p>
              <button
                onClick={() => setShowAdd(true)}
                className="px-6 py-3 bg-amber-sun/10 border border-amber-sun/30 rounded-xl text-amber-sun text-sm font-body tracking-wider transition-all hover:bg-amber-sun/20"
              >
                + Add your first soul
              </button>
            </div>
          ) : (
            <>
              <p className="text-text-secondary text-xs font-body mb-4 tracking-wide">
                Tap a soul to open a compatibility reading. Long press to remove.
              </p>
              <div className="space-y-3">
                {souls.map((soul) => (
                  <SoulCard
                    key={soul.id}
                    soul={soul}
                    onOpenChat={openCompatibilityChat}
                    onDelete={handleDeleteSoul}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Loading overlay */}
        {loading && (
          <div className="fixed inset-0 z-50 bg-forest-deep/80 backdrop-blur-sm flex items-center justify-center">
            <div className="text-center">
              <LoadingSpinner size="lg" />
              <p className="text-text-secondary text-sm font-body mt-4">Reading the stars…</p>
            </div>
          </div>
        )}

        {showAdd && (
          <AddSoulForm
            onClose={() => setShowAdd(false)}
            onSave={handleSaveSoul}
            token={token}
          />
        )}

        <BottomNav />
      </div>
    </ProtectedRoute>
  );
}
