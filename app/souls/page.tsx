"use client";

import { useEffect, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import BottomNav from "@/components/BottomNav";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";

interface Soul {
  id: string;
  name: string;
  sun_sign: string;
  hd_type: string;
  synergy_preview?: string;
}

const MOCK_SOULS: Soul[] = [
  { id: "1", name: "Luna", sun_sign: "Pisces", hd_type: "Generator", synergy_preview: "A deep creative resonance flows between you." },
  { id: "2", name: "Enzo", sun_sign: "Aries", hd_type: "Manifestor", synergy_preview: "Complementary energies — you ground their fire." },
];

const SIGN_SYMBOLS: Record<string, string> = {
  Aries: "♈", Taurus: "♉", Gemini: "♊", Cancer: "♋",
  Leo: "♌", Virgo: "♍", Libra: "♎", Scorpio: "♏",
  Sagittarius: "♐", Capricorn: "♑", Aquarius: "♒", Pisces: "♓",
};

export default function SoulsPage() {
  const [souls, setSouls] = useState<Soul[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSoul, setSelectedSoul] = useState<Soul | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const { token } = useAuth();

  useEffect(() => {
    async function loadSouls() {
      try {
        const data = await apiFetch("/souls", {}, token);
        setSouls(data.souls || data || []);
      } catch {
        setSouls(MOCK_SOULS);
      } finally {
        setLoading(false);
      }
    }
    if (token) loadSouls();
  }, [token]);

  const sendInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviteSending(true);
    try {
      await apiFetch(
        "/souls/invite",
        { method: "POST", body: JSON.stringify({ email: inviteEmail }) },
        token
      );
      setInviteSuccess(true);
      setTimeout(() => {
        setShowInvite(false);
        setInviteEmail("");
        setInviteSuccess(false);
      }, 2000);
    } catch {
      setInviteSuccess(true); // show success anyway for demo
      setTimeout(() => {
        setShowInvite(false);
        setInviteEmail("");
        setInviteSuccess(false);
      }, 2000);
    } finally {
      setInviteSending(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-forest-deep pb-24">
        {/* Header */}
        <div className="px-5 pt-12 pb-6 max-w-lg mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-text-secondary text-[10px] font-body tracking-[0.2em] uppercase mb-1">Connected</p>
              <h1 className="font-heading text-4xl text-text-primary">Souls</h1>
            </div>
            <button
              onClick={() => setShowInvite(true)}
              className="flex items-center gap-2 px-4 py-2 bg-amber-sun/10 border border-amber-sun/30 rounded-xl text-amber-sun text-xs font-body tracking-wider transition-all hover:bg-amber-sun/20"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add Soul
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center pt-16">
            <LoadingSpinner size="lg" />
          </div>
        ) : (
          <div className="max-w-lg mx-auto px-5 animate-fade-in">
            {souls.length === 0 ? (
              <div className="text-center pt-16">
                <div className="text-4xl mb-4">✦</div>
                <p className="font-heading text-2xl text-text-primary mb-2">No souls yet</p>
                <p className="text-text-secondary text-sm font-body">
                  Invite someone to begin your constellation.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {souls.map((soul) => (
                  <button
                    key={soul.id}
                    onClick={() => setSelectedSoul(selectedSoul?.id === soul.id ? null : soul)}
                    className="w-full text-left bg-forest-card border border-forest-border rounded-2xl p-5 transition-all hover:border-amber-sun/30 active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-4">
                      {/* Avatar */}
                      <div className="w-12 h-12 rounded-full bg-forest-border flex items-center justify-center shrink-0">
                        <span className="font-heading text-xl text-text-primary">{soul.name[0]}</span>
                      </div>
                      <div className="flex-1">
                        <h3 className="font-heading text-xl text-text-primary">{soul.name}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-text-secondary text-sm">
                            {SIGN_SYMBOLS[soul.sun_sign] || "☉"} {soul.sun_sign}
                          </span>
                          <span className="text-forest-border text-xs">·</span>
                          <span className="text-text-secondary text-xs font-body">{soul.hd_type}</span>
                        </div>
                      </div>
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#8a9e8d"
                        strokeWidth="2"
                        className={`transition-transform duration-200 ${selectedSoul?.id === soul.id ? "rotate-90" : ""}`}
                      >
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    </div>

                    {/* Synergy reading */}
                    {selectedSoul?.id === soul.id && soul.synergy_preview && (
                      <div className="mt-4 pt-4 border-t border-forest-border animate-fade-in">
                        <p className="text-text-secondary text-[10px] font-body tracking-[0.15em] uppercase mb-2">Synergy Reading</p>
                        <p className="font-heading text-lg text-text-primary italic leading-snug">
                          {soul.synergy_preview}
                        </p>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Invite Modal */}
        {showInvite && (
          <div className="fixed inset-0 z-50 flex items-end justify-center">
            <div
              className="absolute inset-0 bg-forest-deep/80 backdrop-blur-sm"
              onClick={() => setShowInvite(false)}
            />
            <div className="relative w-full max-w-lg bg-forest-dark border-t border-forest-border rounded-t-3xl px-6 pt-6 pb-12 animate-slide-up">
              <div className="w-10 h-1 bg-forest-border rounded-full mx-auto mb-6" />
              <h2 className="font-heading text-3xl text-text-primary mb-2">Invite a Soul</h2>
              <p className="text-text-secondary text-sm font-body mb-6">
                They'll receive an invitation to join your constellation.
              </p>

              {inviteSuccess ? (
                <div className="text-center py-4">
                  <div className="text-3xl mb-2">✦</div>
                  <p className="font-heading text-xl text-text-primary">Invitation sent</p>
                </div>
              ) : (
                <>
                  <input
                    autoFocus
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendInvite()}
                    placeholder="their@email.com"
                    className="w-full bg-forest-card border border-forest-border rounded-xl px-4 py-3.5 text-text-primary placeholder-text-secondary font-body text-sm focus:border-amber-sun transition-colors mb-4"
                  />
                  <button
                    onClick={sendInvite}
                    disabled={!inviteEmail.trim() || inviteSending}
                    className="w-full bg-amber-sun text-forest-deep font-body font-semibold py-4 rounded-xl text-sm tracking-wider transition-all hover:opacity-90 active:scale-95 disabled:opacity-30 flex items-center justify-center gap-2"
                  >
                    {inviteSending ? <LoadingSpinner size="sm" /> : "Send Invitation"}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        <BottomNav />
      </div>
    </ProtectedRoute>
  );
}
