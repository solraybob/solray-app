"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import BottomNav from "@/components/BottomNav";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";

// Sign symbols
// Use clean text abbreviations instead of emoji symbols
const SIGN_SYMBOLS: Record<string, string> = {
  Aries: "Ari", Taurus: "Tau", Gemini: "Gem", Cancer: "Can",
  Leo: "Leo", Virgo: "Vir", Libra: "Lib", Scorpio: "Sco",
  Sagittarius: "Sag", Capricorn: "Cap", Aquarius: "Aqu", Pisces: "Pis",
};

// Types
interface SearchResult {
  id: string;
  username: string;
  name: string;
  sun_sign: string | null;
  hd_type: string | null;
  hd_profile: string | null;
}

interface PendingInvite {
  invite_id: string;
  requester: {
    id: string;
    username: string;
    name: string;
    sun_sign: string | null;
    hd_type: string | null;
    hd_profile: string | null;
  };
  created_at: string;
}

interface ConnectedSoul {
  connection_id: string;
  soul: {
    id: string;
    username: string;
    name: string;
    sun_sign: string | null;
    moon_sign: string | null;
    hd_type: string | null;
    hd_profile: string | null;
  };
  connected_since: string;
}

// Generate a short session code
function generateSessionCode(): string {
  return Math.random().toString(36).slice(2, 9).toUpperCase();
}

// Soul action sheet shown when tapping a connected soul
interface SoulActionsProps {
  soul: ConnectedSoul;
  onClose: () => void;
  onSoloReading: () => void;
  onGroupReading: () => void;
}

function SoulActions({ soul, onClose, onSoloReading, onGroupReading }: SoulActionsProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-forest-deep/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-forest-dark border-t border-forest-border rounded-t-3xl px-6 pt-6 pb-12">
        <div className="w-10 h-1 bg-forest-border rounded-full mx-auto mb-6" />
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-full bg-forest-border flex items-center justify-center shrink-0">
            <span className="font-heading text-xl text-text-primary">{soul.soul.name[0]}</span>
          </div>
          <div>
            <h3 className="font-heading text-text-primary" style={{ fontSize: "1.05rem", fontWeight: 400 }}>{soul.soul.name}</h3>
            <p className="font-body text-text-secondary text-[13px]">
              {soul.soul.sun_sign && (
                <>☉ {soul.soul.sun_sign}</>
              )}
              {soul.soul.sun_sign && soul.soul.hd_type && " · "}
              {soul.soul.hd_type}
            </p>
          </div>
        </div>
        <div className="space-y-3">
          <button
            onClick={onSoloReading}
            className="w-full text-left px-5 py-4 bg-forest-card border border-forest-border rounded-2xl transition-all hover:border-amber-sun/30"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-body text-text-primary font-semibold text-[13px]">Your Reading</p>
                <p className="font-body text-text-secondary text-[10px] mt-0.5">Just you asking about your dynamic with {soul.soul.name}</p>
              </div>
              <span className="font-body text-amber-sun text-[10px]">Open</span>
            </div>
          </button>
          <button
            onClick={onGroupReading}
            className="w-full text-left px-5 py-4 bg-amber-sun/5 border border-amber-sun/30 rounded-2xl transition-all hover:bg-amber-sun/10"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-body text-text-primary font-semibold text-[13px]">Group Reading</p>
                <p className="font-body text-text-secondary text-[10px] mt-0.5">Invite {soul.soul.name} into a shared session together</p>
              </div>
              <span className="font-body text-amber-sun text-[10px]">Share</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

// Group session share sheet
interface GroupShareProps {
  soul: ConnectedSoul;
  sessionCode: string;
  onEnterSession: () => void;
  onClose: () => void;
}

function GroupShareSheet({ soul, sessionCode, onEnterSession, onClose }: GroupShareProps) {
  const [copied, setCopied] = useState(false);
  const shareUrl = `${typeof window !== "undefined" ? window.location.origin : "https://solray-app.vercel.app"}/group/${sessionCode}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select the text
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-forest-deep/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-forest-dark border-t border-forest-border rounded-t-3xl px-6 pt-6 pb-12">
        <div className="w-10 h-1 bg-forest-border rounded-full mx-auto mb-6" />
        <h2 className="font-heading text-text-primary mb-1" style={{ fontSize: "1.05rem", fontWeight: 400 }}>Group Reading</h2>
        <p className="font-body text-text-secondary text-[13px] mb-6 leading-relaxed">
          Share this link with {soul.soul.name} to join your shared session. Both of you can ask questions and the guide speaks to you together.
        </p>

        <div className="bg-forest-card border border-forest-border rounded-xl px-4 py-3 mb-3 font-mono text-xs text-text-secondary break-all">
          {shareUrl}
        </div>

        <div className="space-y-3">
          <button
            onClick={handleCopy}
            className="w-full py-3.5 bg-amber-sun/10 border border-amber-sun/30 rounded-xl font-body text-amber-sun text-[13px] tracking-widest transition-all hover:bg-amber-sun/20"
          >
            {copied ? "Copied!" : `Copy link for ${soul.soul.name}`}
          </button>
          <button
            onClick={onEnterSession}
            className="w-full py-3.5 bg-amber-sun text-forest-deep font-body font-semibold rounded-xl text-[13px] tracking-widest transition-all hover:opacity-90"
          >
            Enter Session
          </button>
        </div>
      </div>
    </div>
  );
}

// Main page
export default function SoulsPage() {
  const { token } = useAuth();
  const router = useRouter();

  const [myUsername, setMyUsername] = useState<string | null>(null);
  const [myName, setMyName] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [connectedSouls, setConnectedSouls] = useState<ConnectedSoul[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingInvite, setSendingInvite] = useState<string | null>(null);
  const [inviteSent, setInviteSent] = useState<Set<string>>(new Set());
  const [respondingInvite, setRespondingInvite] = useState<string | null>(null);
  const [activeSoul, setActiveSoul] = useState<ConnectedSoul | null>(null);
  const [groupSession, setGroupSession] = useState<{ soul: ConnectedSoul; code: string } | null>(null);

  // Load profile + connections on mount
  useEffect(() => {
    if (!token) return;
    const load = async () => {
      try {
        const [me, pending, souls] = await Promise.all([
          apiFetch("/users/me", {}, token),
          apiFetch("/souls/pending", {}, token),
          apiFetch("/souls", {}, token),
        ]);
        setMyUsername(me?.profile?.username || null);
        setMyName(me?.profile?.name || null);
        setPendingInvites(pending?.pending || []);
        // Deduplicate by soul user ID (both sides of a connection may appear)
        const rawSouls: ConnectedSoul[] = souls?.souls || [];
        const seen = new Set<string>();
        const deduped = rawSouls.filter(s => {
          if (seen.has(s.soul.id)) return false;
          seen.add(s.soul.id);
          return true;
        });
        setConnectedSouls(deduped);
      } catch (e) {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  // Search users
  const handleSearch = useCallback(async (q: string) => {
    setSearchQuery(q);
    if (!q || q.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const data = await apiFetch(`/users/search?q=${encodeURIComponent(q)}`, {}, token);
      setSearchResults(data?.results || []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [token]);

  // Send connection invite
  const handleSendInvite = async (identifier: string) => {
    setSendingInvite(identifier);
    try {
      await apiFetch("/souls/invite", {
        method: "POST",
        body: JSON.stringify({ identifier }),
      }, token);
      setInviteSent(prev => new Set(prev).add(identifier));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "The signal didn't reach. Try once more.";
      alert(msg);
    } finally {
      setSendingInvite(null);
    }
  };

  // Accept or decline invite
  const handleInviteResponse = async (inviteId: string, accept: boolean) => {
    setRespondingInvite(inviteId);
    try {
      const endpoint = accept ? `/souls/accept/${inviteId}` : `/souls/decline/${inviteId}`;
      await apiFetch(endpoint, { method: "POST" }, token);
      setPendingInvites(prev => prev.filter(i => i.invite_id !== inviteId));
      if (accept) {
        // Reload connected souls
        const souls = await apiFetch("/souls", {}, token);
        const raw: ConnectedSoul[] = souls?.souls || [];
        const seen2 = new Set<string>();
        setConnectedSouls(raw.filter(s => { if (seen2.has(s.soul.id)) return false; seen2.add(s.soul.id); return true; }));
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed";
      alert(msg);
    } finally {
      setRespondingInvite(null);
    }
  };

  // Open solo compatibility chat
  const openSoloReading = async (soul: ConnectedSoul) => {
    setActiveSoul(null);
    // Fetch their full blueprint for the chat
    let soulBlueprint = null;
    try {
      const data = await apiFetch(`/souls/${soul.connection_id}/blueprint`, {}, token);
      soulBlueprint = data?.blueprint || null;
    } catch {
      // proceed without blueprint
    }

    const chartSummary = [
      soul.soul.sun_sign && `Sun in ${soul.soul.sun_sign}`,
      soul.soul.moon_sign && `Moon in ${soul.soul.moon_sign}`,
      soul.soul.hd_type && `Human Design: ${soul.soul.hd_type}`,
    ].filter(Boolean).join(", ");

    const introMessage = chartSummary
      ? `I want to understand the dynamic between me and ${soul.soul.name}. Their chart: ${chartSummary}. How do our energies interact?`
      : `I want to understand the dynamic between me and ${soul.soul.name}. How do our energies interact?`;

    sessionStorage.setItem("solray_compat_context", JSON.stringify({
      soulName: soul.soul.name,
      introMessage,
      soulBlueprint,
    }));

    router.push("/chat?compat=1");
  };

  // Start a group session
  const startGroupSession = (soul: ConnectedSoul) => {
    setActiveSoul(null);
    const code = generateSessionCode();
    // Store the session mapping
    const sessions = JSON.parse(localStorage.getItem("solray_group_sessions") || "{}");
    sessions[code] = {
      connection_id: soul.connection_id,
      soul_name: soul.soul.name,
      soul_id: soul.soul.id,
      created_at: Date.now(),
    };
    localStorage.setItem("solray_group_sessions", JSON.stringify(sessions));
    setGroupSession({ soul, code });
  };

  const enterGroupSession = (code: string) => {
    setGroupSession(null);
    router.push(`/group/${code}`);
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-forest-deep pb-24">
        {/* Header with blue gradient */}
        <div
          className="px-5 pt-12 pb-8 max-w-lg mx-auto relative overflow-hidden"
          style={{ minHeight: "140px" }}
        >
          {/* Faded deep-space image — contextual image pattern matching CurrentCycles */}
          <div className="absolute inset-0 pointer-events-none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&q=60"
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover"
              style={{ opacity: 0.10 }}
            />
            <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(5,15,8,0.3) 0%, rgba(5,15,8,0.90) 100%)" }} />
          </div>
          <div className="relative z-10">
          <p className="font-body text-[10px] tracking-[0.22em] uppercase mb-1 text-text-secondary" style={{ color: "#4a6670" }}>Your Field</p>
          <h1 className="font-heading text-3xl text-text-primary leading-tight" style={{ fontWeight: 300, fontStyle: "italic", letterSpacing: "-0.01em" }}>Souls</h1>
          {myUsername && (
            <p className="text-text-secondary text-sm font-body mt-3">
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-xs"
                style={{
                  background: "rgba(74, 102, 112,0.12)",
                  color: "#4a6670",
                }}
              >
                @{myUsername}
              </span>
            </p>
          )}
          </div>{/* end z-10 */}
        </div>{/* end header */}

        <div className="max-w-lg mx-auto px-5 space-y-6 animate-fade-in">
          {/* Search */}
          <div>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={e => handleSearch(e.target.value)}
                placeholder="Search by @username or email"
                className="w-full bg-forest-card border border-forest-border rounded-xl px-4 py-3.5 text-text-primary placeholder-text-secondary font-body text-base transition-all pr-10"
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#4a6670";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(74, 102, 112,0.15)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "";
                  e.currentTarget.style.boxShadow = "";
                }}
              />
              {searching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <LoadingSpinner size="sm" />
                </div>
              )}
            </div>

            {/* Search results */}
            {searchResults.length > 0 && (
              <div className="mt-2 space-y-2">
                {searchResults.map(user => (
                  <div key={user.id} className="flex items-center gap-3 px-4 py-3 bg-forest-card border border-forest-border rounded-xl">
                    <div className="w-9 h-9 rounded-full bg-forest-border flex items-center justify-center shrink-0">
                      <span className="font-heading text-base text-text-primary">{user.name[0]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-body text-text-primary text-sm font-semibold truncate">{user.name}</p>
                      <p className="text-text-secondary text-xs font-body">
                        @{user.username}
                        {user.sun_sign && ` · ☉ ${user.sun_sign}`}
                        {user.hd_type && ` · ${user.hd_type}`}
                      </p>
                    </div>
                    <button
                      onClick={() => handleSendInvite(user.username)}
                      disabled={sendingInvite === user.username || inviteSent.has(user.username)}
                      className="shrink-0 px-3 py-1.5 bg-amber-sun/10 border border-amber-sun/30 text-amber-sun rounded-lg text-xs font-body transition-all hover:bg-amber-sun/20 disabled:opacity-40"
                    >
                      {sendingInvite === user.username ? (
                        <LoadingSpinner size="sm" />
                      ) : inviteSent.has(user.username) ? (
                        "Sent"
                      ) : (
                        "Connect"
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
              <p className="text-text-secondary text-xs font-body mt-2 px-1">No users found. They may not have an account yet.</p>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center pt-8">
              <LoadingSpinner size="md" />
            </div>
          ) : (
            <>
              {/* Pending requests */}
              {pendingInvites.length > 0 && (
                <div>
                  <p className="text-text-secondary text-[10px] font-body tracking-[0.22em] uppercase mb-3">Pending Requests</p>
                  <div className="space-y-2">
                    {pendingInvites.map(invite => (
                      <div
                        key={invite.invite_id}
                        className="flex items-center gap-3 px-4 py-3 border rounded-2xl"
                        style={{
                          background: "linear-gradient(135deg, rgba(232,130,26,0.08) 0%, #0a1f12 60%)",
                          borderColor: "rgba(232,130,26,0.25)",
                        }}
                      >
                        <div className="w-10 h-10 rounded-full bg-forest-border flex items-center justify-center shrink-0">
                          <span className="font-heading text-lg text-text-primary">{invite.requester.name[0]}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-body text-text-primary text-sm font-semibold truncate">{invite.requester.name}</p>
                          <p className="text-text-secondary text-xs font-body">
                            @{invite.requester.username}
                            {invite.requester.sun_sign && ` · ☉ ${invite.requester.sun_sign}`}
                          </p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() => handleInviteResponse(invite.invite_id, false)}
                            disabled={respondingInvite === invite.invite_id}
                            className="px-3 py-1.5 border border-forest-border text-text-secondary rounded-lg text-xs font-body transition-all hover:border-ember/40 hover:text-ember"
                          >
                            Decline
                          </button>
                          <button
                            onClick={() => handleInviteResponse(invite.invite_id, true)}
                            disabled={respondingInvite === invite.invite_id}
                            className="px-3 py-1.5 text-forest-deep rounded-lg text-xs font-body font-semibold transition-all hover:opacity-90"
                            style={{
                              background: "linear-gradient(135deg, #e8821a, #c86010)",
                            }}
                          >
                            {respondingInvite === invite.invite_id ? <LoadingSpinner size="sm" /> : "Accept"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Connected souls */}
              <div>
                {connectedSouls.length > 0 ? (
                  <>
                    <p className="text-text-secondary text-[10px] font-body tracking-[0.22em] uppercase mb-3">Your Constellation</p>
                    <div className="space-y-3">
                      {connectedSouls.map(connection => (
                        <SoulCard
                          key={connection.connection_id}
                          connection={connection}
                          onOpen={() => setActiveSoul(connection)}
                        />
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-center pt-8">
                    <div className="relative inline-block mb-6">
                      <div
                        className="absolute inset-0 rounded-full blur-2xl"
                        style={{
                          background: "rgba(74, 102, 112,0.15)",
                          width: "120px",
                          height: "120px",
                          left: "50%",
                          top: "50%",
                          transform: "translate(-50%, -50%)",
                        }}
                      />
                      <div className="relative text-7xl" style={{ color: "#4a6670" }}>
                        ✦
                      </div>
                    </div>
                    <p className="font-heading text-2xl text-text-primary mb-2">Your constellation is empty</p>
                    <p className="text-text-secondary text-sm font-body max-w-xs mx-auto">
                      Search for someone by their @username or email to send a connection request.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Soul action sheet */}
        {activeSoul && (
          <SoulActions
            soul={activeSoul}
            onClose={() => setActiveSoul(null)}
            onSoloReading={() => openSoloReading(activeSoul)}
            onGroupReading={() => startGroupSession(activeSoul)}
          />
        )}

        {/* Group session share sheet */}
        {groupSession && (
          <GroupShareSheet
            soul={groupSession.soul}
            sessionCode={groupSession.code}
            onEnterSession={() => enterGroupSession(groupSession.code)}
            onClose={() => setGroupSession(null)}
          />
        )}

        <BottomNav />
      </div>
    </ProtectedRoute>
  );
}

// Soul card component
interface SoulCardProps {
  connection: ConnectedSoul;
  onOpen: () => void;
}

function SoulCard({ connection, onOpen }: SoulCardProps) {
  const { soul } = connection;
  const sunSymbol = soul.sun_sign ? (SIGN_SYMBOLS[soul.sun_sign] || "") : "";

  return (
    <button
      onClick={onOpen}
      className="w-full text-left rounded-2xl p-5 transition-all active:scale-[0.99]"
      style={{
        background: "linear-gradient(135deg, rgba(74, 102, 112,0.06) 0%, #0a1f12 60%)",
        border: "1px solid rgba(74, 102, 112,0.25)",
      }}
    >
      <div className="flex items-center gap-4">
        {/* Avatar with gradient border */}
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 relative"
          style={{
            background: "linear-gradient(135deg, #e8821a, #4a6670)",
            padding: "2px",
          }}
        >
          <div className="w-full h-full rounded-full bg-forest-card flex items-center justify-center">
            <span className="font-heading text-xl text-text-primary">{soul.name[0]}</span>
          </div>
        </div>
        <div className="flex-1">
          <h3 className="font-heading text-xl text-text-primary">{soul.name}</h3>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {soul.sun_sign && (
              <span className="text-text-secondary text-sm">
                ☉ {soul.sun_sign}
              </span>
            )}
            {soul.sun_sign && soul.hd_type && (
              <span className="text-forest-border text-xs">·</span>
            )}
            {soul.hd_type && (
              <span className="text-text-secondary text-xs font-body">
                {soul.hd_type}{soul.hd_profile ? ` ${soul.hd_profile}` : ""}
              </span>
            )}
            {soul.username && (
              <>
                <span className="text-forest-border text-xs">·</span>
                <span className="text-text-secondary text-xs font-mono">@{soul.username}</span>
              </>
            )}
          </div>
        </div>
        <span className="text-xs font-body tracking-wider opacity-70 shrink-0" style={{ color: "#4a6670" }}>
          Open →
        </span>
      </div>
    </button>
  );
}
