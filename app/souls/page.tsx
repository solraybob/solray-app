"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import BottomNav from "@/components/BottomNav";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";

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

// Person saved locally without an account — birth data + cached profile
interface SavedPerson {
  id: string;                // local uuid
  name: string;
  sex: "female" | "male" | null;
  birth_date: string;        // YYYY-MM-DD
  birth_time: string;        // HH:MM
  birth_city: string;
  profile: {
    sun_sign: string | null;
    hd_type: string | null;
    hd_profile: string | null;
  };
  created_at: number;
}

type BondLens = "romantic" | "friendship" | "working";
type BondPartner =
  | { kind: "saved"; person: SavedPerson }
  | { kind: "connection"; connection: ConnectedSoul };

const SAVED_PEOPLE_KEY = "solray_saved_people";

function loadSavedPeople(): SavedPerson[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SAVED_PEOPLE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSavedPeople(people: SavedPerson[]) {
  try {
    localStorage.setItem(SAVED_PEOPLE_KEY, JSON.stringify(people));
  } catch {
    // quota etc — fail quiet
  }
}

function partnerName(p: BondPartner): string {
  return p.kind === "saved" ? p.person.name : p.connection.soul.name;
}

function partnerInitial(p: BondPartner): string {
  const n = partnerName(p);
  return n?.[0]?.toUpperCase() || "·";
}

function partnerChart(p: BondPartner): { sun_sign: string | null; hd_type: string | null; hd_profile: string | null } {
  if (p.kind === "saved") return p.person.profile;
  const s = p.connection.soul;
  return { sun_sign: s.sun_sign, hd_type: s.hd_type, hd_profile: s.hd_profile };
}

// Generate a short session code
function generateSessionCode(): string {
  return Math.random().toString(36).slice(2, 9).toUpperCase();
}

// Deduplicate connected souls by the underlying user id
// (both sides of a connection may appear in the list)
function dedupeSouls(souls: ConnectedSoul[]): ConnectedSoul[] {
  const seen = new Set<string>();
  return souls.filter((s) => {
    if (seen.has(s.soul.id)) return false;
    seen.add(s.soul.id);
    return true;
  });
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
            <span className="font-heading text-xl text-text-primary">{soul.soul.name?.[0]?.toUpperCase() || "·"}</span>
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
            className="w-full text-left px-5 py-4 bg-forest-card border border-forest-border rounded-2xl transition-all hover:border-[#5a7680]/30"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-body text-text-primary font-semibold text-[13px]">Your Reading</p>
                <p className="font-body text-text-secondary text-[10px] mt-0.5">Just you asking about your dynamic with {soul.soul.name}</p>
              </div>
              <span className="font-body text-[#4a6670] text-[10px]">Open</span>
            </div>
          </button>
          <button
            onClick={onGroupReading}
            className="w-full text-left px-5 py-4 bg-[#4a6670]/5 border border-[#4a6670]/30 rounded-2xl transition-all hover:bg-[#3a5560]/10"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-body text-text-primary font-semibold text-[13px]">Group Reading</p>
                <p className="font-body text-text-secondary text-[10px] mt-0.5">Invite {soul.soul.name} into a shared session together</p>
              </div>
              <span className="font-body text-[#4a6670] text-[10px]">Share</span>
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
  const shareUrl = `${typeof window !== "undefined" ? window.location.origin : "https://app.solray.ai"}/group/${sessionCode}`;

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
            className="w-full py-3.5 bg-[#4a6670]/10 border border-[#4a6670]/30 rounded-xl font-body text-[#4a6670] text-[13px] tracking-widest transition-all hover:bg-[#3a5560]/20"
          >
            {copied ? "Copied!" : `Copy link for ${soul.soul.name}`}
          </button>
          <button
            onClick={onEnterSession}
            className="w-full py-3.5 bg-[#4a6670] text-forest-deep font-body font-semibold rounded-xl text-[13px] tracking-widest transition-all hover:opacity-90"
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
  // Inline error surface — softer than alert(), matches Japanese-way quiet
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Quick Bond state — hybrid local-chart flow
  const [savedPeople, setSavedPeople] = useState<SavedPerson[]>([]);
  const [bondPartner, setBondPartner] = useState<BondPartner | null>(null);
  const [bondLens, setBondLens] = useState<BondLens>("romantic");
  const [partnerPickerOpen, setPartnerPickerOpen] = useState(false);
  const [addPersonOpen, setAddPersonOpen] = useState(false);
  const [readingBond, setReadingBond] = useState(false);

  // Hydrate saved people from localStorage once on mount
  useEffect(() => {
    setSavedPeople(loadSavedPeople());
  }, []);

  // Clear the inline error after a few seconds
  useEffect(() => {
    if (!errorMessage) return;
    const t = setTimeout(() => setErrorMessage(null), 4000);
    return () => clearTimeout(t);
  }, [errorMessage]);

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
        setPendingInvites(pending?.pending || []);
        setConnectedSouls(dedupeSouls(souls?.souls || []));
      } catch {
        setErrorMessage("Couldn't reach the field. Try again in a moment.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  // Debounced search — avoid firing /users/search on every keystroke
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!q || q.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const data = await apiFetch(`/users/search?q=${encodeURIComponent(q)}`, {}, token);
        setSearchResults(data?.results || []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 280);
  }, [token]);

  // Cleanup pending debounce on unmount
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  // Send connection invite
  const handleSendInvite = async (identifier: string) => {
    setSendingInvite(identifier);
    setErrorMessage(null);
    try {
      await apiFetch("/souls/invite", {
        method: "POST",
        body: JSON.stringify({ identifier }),
      }, token);
      setInviteSent(prev => new Set(prev).add(identifier));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "The signal didn't reach. Try once more.";
      setErrorMessage(msg);
    } finally {
      setSendingInvite(null);
    }
  };

  // Accept or decline invite
  const handleInviteResponse = async (inviteId: string, accept: boolean) => {
    setRespondingInvite(inviteId);
    setErrorMessage(null);
    try {
      const endpoint = accept ? `/souls/accept/${inviteId}` : `/souls/decline/${inviteId}`;
      await apiFetch(endpoint, { method: "POST" }, token);
      setPendingInvites(prev => prev.filter(i => i.invite_id !== inviteId));
      if (accept) {
        const souls = await apiFetch("/souls", {}, token);
        setConnectedSouls(dedupeSouls(souls?.souls || []));
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Something drifted off course. Try again.";
      setErrorMessage(msg);
    } finally {
      setRespondingInvite(null);
    }
  };

  // Open solo compatibility chat
  const openSoloReading = async (soul: ConnectedSoul) => {
    setActiveSoul(null);
    setErrorMessage(null);
    // Fetch their full blueprint for the chat — proceed even if it fails,
    // the chat still works from the summary chart data
    let soulBlueprint = null;
    try {
      const data = await apiFetch(`/souls/${soul.connection_id}/blueprint`, {}, token);
      soulBlueprint = data?.blueprint || null;
    } catch {
      // Non-blocking: surface a quiet note but continue
      setErrorMessage("Couldn't pull their full chart — reading from the basics.");
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

  // Persist a newly-added person and auto-select them as the bond partner
  const handlePersonAdded = (person: SavedPerson) => {
    const next = [person, ...savedPeople].slice(0, 50);
    setSavedPeople(next);
    writeSavedPeople(next);
    setBondPartner({ kind: "saved", person });
    setAddPersonOpen(false);
  };

  const handlePersonRemove = (id: string) => {
    const next = savedPeople.filter((p) => p.id !== id);
    setSavedPeople(next);
    writeSavedPeople(next);
    if (bondPartner?.kind === "saved" && bondPartner.person.id === id) {
      setBondPartner(null);
    }
  };

  // Fire the Bond reading — route to /chat?compat=1 with context
  const readTheBond = async () => {
    if (!bondPartner) return;
    setReadingBond(true);
    setErrorMessage(null);

    const chart = partnerChart(bondPartner);
    const pName = partnerName(bondPartner);
    const lensLabel =
      bondLens === "romantic" ? "romantic dynamic"
      : bondLens === "friendship" ? "friendship dynamic"
      : "working dynamic";

    const chartSummary = [
      chart.sun_sign && `Sun in ${chart.sun_sign}`,
      chart.hd_type && `Human Design: ${chart.hd_type}${chart.hd_profile ? ` ${chart.hd_profile}` : ""}`,
    ].filter(Boolean).join(", ");

    // For saved-person partners we already have a computed blueprint-shape
    // from /souls/calculate-blueprint; for connection partners we fetch it.
    let soulBlueprint: unknown = null;
    if (bondPartner.kind === "connection") {
      try {
        const data = await apiFetch(`/souls/${bondPartner.connection.connection_id}/blueprint`, {}, token);
        soulBlueprint = data?.blueprint || null;
      } catch {
        setErrorMessage("Couldn't pull their full chart — reading from the basics.");
      }
    }

    const introMessage = chartSummary
      ? `Read the ${lensLabel} between me and ${pName}. Their chart: ${chartSummary}. Where does our energy meet, and where does it friction?`
      : `Read the ${lensLabel} between me and ${pName}. Where does our energy meet, and where does it friction?`;

    sessionStorage.setItem("solray_compat_context", JSON.stringify({
      soulName: pName,
      introMessage,
      soulBlueprint,
      lens: bondLens,
    }));

    setReadingBond(false);
    router.push("/chat?compat=1");
  };

  return (
    <ProtectedRoute>
      <div className="min-h-[100dvh] bg-forest-deep pb-24">
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
          <h1 className="font-heading text-3xl text-text-primary leading-tight" style={{ fontWeight: 300, letterSpacing: "-0.01em" }}>Souls</h1>
          <p
            className="font-body text-sm mt-3 leading-relaxed"
            style={{ color: "#4a6670", fontStyle: "italic" }}
          >
            Someone is on your mind. Read what the charts say.
          </p>
          </div>{/* end z-10 */}
        </div>{/* end header */}

        <div className="max-w-lg mx-auto px-5 space-y-8 animate-fade-in">
          {/* Hero: Read the Bond */}
          <BondCard
            myName={myUsername || null}
            partner={bondPartner}
            lens={bondLens}
            onPickPartner={() => {
              // If nothing saved and no connections, jump straight to Add
              if (savedPeople.length === 0 && connectedSouls.length === 0) {
                setAddPersonOpen(true);
              } else {
                setPartnerPickerOpen(true);
              }
            }}
            onChangeLens={setBondLens}
            onRead={readTheBond}
            reading={readingBond}
          />

          {/* Search — for deeper two-way connections with Solray users */}
          <div>
            <p className="text-text-secondary text-[10px] font-body tracking-[0.22em] uppercase mb-2">Find a Soul</p>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={e => handleSearch(e.target.value)}
                placeholder="@username or email"
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
                      <span className="font-heading text-base text-text-primary">{user.name?.[0]?.toUpperCase() || "·"}</span>
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
                      className="shrink-0 px-3 py-1.5 bg-[#4a6670]/10 border border-[#4a6670]/30 text-[#4a6670] rounded-lg text-xs font-body transition-all hover:bg-[#3a5560]/20 disabled:opacity-40"
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

          {/* Quiet inline error surface — replaces alert() popups */}
          {errorMessage && (
            <div
              className="rounded-xl px-4 py-3 font-body text-[12px] transition-opacity"
              style={{
                background: "rgba(196, 98, 58, 0.08)",
                border: "1px solid rgba(196, 98, 58, 0.25)",
                color: "#c4623a",
              }}
              role="status"
              aria-live="polite"
            >
              {errorMessage}
            </div>
          )}

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
                          background: "linear-gradient(135deg, rgba(74,102,112,0.08) 0%, #0a1f12 60%)",
                          borderColor: "rgba(74,102,112,0.25)",
                        }}
                      >
                        <div className="w-10 h-10 rounded-full bg-forest-border flex items-center justify-center shrink-0">
                          <span className="font-heading text-lg text-text-primary">{invite.requester.name?.[0]?.toUpperCase() || "·"}</span>
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
                            className="px-3 py-1.5 text-[#f5f0e8] rounded-lg text-xs font-body font-semibold transition-all hover:opacity-90"
                            style={{
                              background: "linear-gradient(135deg, #4a6670, #3a5560)",
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
                    <p className="text-text-secondary text-[10px] font-body tracking-[0.22em] uppercase mb-3">Connections</p>
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
                  <div className="text-center pt-4 pb-2">
                    <p className="font-body text-text-secondary text-[12px] max-w-xs mx-auto">
                      No two-way connections yet. Invite someone above to share readings together.
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

        {/* Partner picker sheet */}
        {partnerPickerOpen && (
          <PartnerPicker
            savedPeople={savedPeople}
            connections={connectedSouls}
            onPick={(p) => {
              setBondPartner(p);
              setPartnerPickerOpen(false);
            }}
            onAddNew={() => {
              setPartnerPickerOpen(false);
              setAddPersonOpen(true);
            }}
            onRemoveSaved={handlePersonRemove}
            onClose={() => setPartnerPickerOpen(false)}
          />
        )}

        {/* Add-person sheet */}
        {addPersonOpen && (
          <AddPersonSheet
            onClose={() => setAddPersonOpen(false)}
            onAdded={handlePersonAdded}
          />
        )}

        <BottomNav />
      </div>
    </ProtectedRoute>
  );
}

// ---------------------------------------------------------------------------
// Bond entry card — hero on the Souls page
// ---------------------------------------------------------------------------

interface BondCardProps {
  myName: string | null;
  partner: BondPartner | null;
  lens: BondLens;
  onPickPartner: () => void;
  onChangeLens: (l: BondLens) => void;
  onRead: () => void;
  reading: boolean;
}

function BondCard({ myName, partner, lens, onPickPartner, onChangeLens, onRead, reading }: BondCardProps) {
  const lenses: { key: BondLens; label: string; hint: string }[] = [
    { key: "romantic",   label: "Romantic",   hint: "intimacy, attraction, merge" },
    { key: "friendship", label: "Friendship", hint: "trust, play, distance" },
    { key: "working",    label: "Working",    hint: "collaboration, friction, flow" },
  ];
  const chart = partner ? partnerChart(partner) : null;

  return (
    <div
      className="rounded-3xl p-6 relative overflow-hidden"
      style={{
        background: "linear-gradient(155deg, rgba(74,102,112,0.10) 0%, rgba(10,31,18,0.95) 55%, #0a1f12 100%)",
        border: "1px solid rgba(74,102,112,0.25)",
        boxShadow: "0 20px 60px -30px rgba(74,102,112,0.35)",
      }}
    >
      <p className="font-body text-[10px] tracking-[0.22em] uppercase text-[#4a6670]/70 mb-1">Read the Bond</p>
      <h2 className="font-heading text-2xl text-text-primary leading-tight mb-5" style={{ fontWeight: 300, fontStyle: "italic", letterSpacing: "-0.01em" }}>
        Where two charts meet.
      </h2>

      {/* You & Partner pills */}
      <div className="flex items-center gap-3 mb-5">
        {/* You — fixed */}
        <div
          className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full"
          style={{
            background: "rgba(245,240,232,0.04)",
            border: "1px solid rgba(245,240,232,0.12)",
          }}
        >
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[#f5f0e8] font-heading text-sm"
               style={{ background: "linear-gradient(135deg, #4a6670, #3a5560)" }}>
            {myName?.[0]?.toUpperCase() || "·"}
          </div>
          <span className="font-body text-[12px] text-text-primary">You</span>
        </div>

        <span className="text-[#4a6670]/60 text-sm" aria-hidden="true">✦</span>

        {/* Partner — picker */}
        <button
          type="button"
          onClick={onPickPartner}
          className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full flex-1 min-w-0 transition-all hover:border-[#5a7680]/60"
          style={{
            background: partner ? "rgba(74,102,112,0.08)" : "transparent",
            border: partner ? "1px solid rgba(74,102,112,0.45)" : "1px dashed rgba(245,240,232,0.25)",
          }}
        >
          {partner ? (
            <>
              <div className="w-7 h-7 rounded-full bg-forest-border flex items-center justify-center font-heading text-sm text-text-primary shrink-0">
                {partnerInitial(partner)}
              </div>
              <span className="font-body text-[12px] text-text-primary truncate">{partnerName(partner)}</span>
            </>
          ) : (
            <>
              <div className="w-7 h-7 rounded-full flex items-center justify-center font-body text-[13px] text-text-secondary shrink-0"
                   style={{ border: "1px dashed rgba(245,240,232,0.25)" }}>+</div>
              <span className="font-body text-[12px] text-text-secondary">Choose someone</span>
            </>
          )}
        </button>
      </div>

      {/* Chart whisper for the selected partner */}
      {partner && chart && (chart.sun_sign || chart.hd_type) && (
        <p className="font-body text-[11px] text-text-secondary mb-5 -mt-2 pl-1">
          {chart.sun_sign && <>☉ {chart.sun_sign}</>}
          {chart.sun_sign && chart.hd_type && " · "}
          {chart.hd_type && (
            <>{chart.hd_type}{chart.hd_profile ? ` ${chart.hd_profile}` : ""}</>
          )}
        </p>
      )}

      {/* Lens pills */}
      <div className="mb-6">
        <p className="font-body text-[9px] tracking-[0.22em] uppercase text-text-secondary mb-2">Lens</p>
        <div className="flex gap-2">
          {lenses.map((l) => {
            const active = lens === l.key;
            return (
              <button
                key={l.key}
                type="button"
                onClick={() => onChangeLens(l.key)}
                className="flex-1 py-2 rounded-xl transition-all"
                style={{
                  background: active ? "rgba(74,102,112,0.15)" : "rgba(245,240,232,0.03)",
                  border: active ? "1px solid rgba(74,102,112,0.55)" : "1px solid rgba(245,240,232,0.08)",
                  color: active ? "#f5f0e8" : "#8a9e8d",
                }}
                title={l.hint}
              >
                <span className="font-body text-[11px]">{l.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={onRead}
        disabled={!partner || reading}
        className="w-full py-3.5 rounded-xl font-body font-semibold text-[13px] tracking-[0.2em] uppercase transition-all disabled:opacity-35 disabled:cursor-not-allowed"
        style={{
          background: "linear-gradient(135deg, #4a6670, #3a5560)",
          color: "#f5f0e8",
        }}
      >
        {reading ? <LoadingSpinner size="sm" /> : "Read the Bond →"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Partner picker — choose from saved people, connections, or add new
// ---------------------------------------------------------------------------

interface PartnerPickerProps {
  savedPeople: SavedPerson[];
  connections: ConnectedSoul[];
  onPick: (partner: BondPartner) => void;
  onAddNew: () => void;
  onRemoveSaved: (id: string) => void;
  onClose: () => void;
}

function PartnerPicker({ savedPeople, connections, onPick, onAddNew, onRemoveSaved, onClose }: PartnerPickerProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-forest-deep/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-forest-dark border-t border-forest-border rounded-t-3xl px-5 pt-5 pb-24 max-h-[92dvh] overflow-y-auto">
        <div className="w-10 h-1 bg-forest-border rounded-full mx-auto mb-5" />
        <h3 className="font-heading text-text-primary mb-4 px-1" style={{ fontSize: "1.1rem", fontWeight: 400 }}>Choose someone</h3>

        <button
          type="button"
          onClick={onAddNew}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl mb-4 transition-all"
          style={{
            background: "rgba(74,102,112,0.08)",
            border: "1px solid rgba(74,102,112,0.35)",
          }}
        >
          <div className="w-9 h-9 rounded-full flex items-center justify-center font-heading text-lg text-[#f5f0e8] shrink-0"
               style={{ background: "linear-gradient(135deg, #4a6670, #3a5560)" }}>+</div>
          <div className="flex-1 text-left">
            <p className="font-body text-text-primary text-sm font-semibold">Add someone new</p>
            <p className="font-body text-text-secondary text-[11px]">Their birth data stays on your device</p>
          </div>
        </button>

        {savedPeople.length > 0 && (
          <div className="mb-4">
            <p className="text-text-secondary text-[10px] font-body tracking-[0.22em] uppercase mb-2 px-1">Your People</p>
            <div className="space-y-2">
              {savedPeople.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3 bg-forest-card border border-forest-border rounded-xl">
                  <button
                    type="button"
                    onClick={() => onPick({ kind: "saved", person: p })}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                  >
                    <div className="w-9 h-9 rounded-full bg-forest-border flex items-center justify-center shrink-0">
                      <span className="font-heading text-base text-text-primary">{p.name?.[0]?.toUpperCase() || "·"}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-body text-text-primary text-sm font-semibold truncate">{p.name}</p>
                      <p className="text-text-secondary text-[11px] font-body truncate">
                        {p.profile.sun_sign && <>☉ {p.profile.sun_sign}</>}
                        {p.profile.sun_sign && p.profile.hd_type && " · "}
                        {p.profile.hd_type}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${p.name}`}
                    onClick={() => onRemoveSaved(p.id)}
                    className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-text-secondary hover:text-ember transition-colors"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {connections.length > 0 && (
          <div>
            <p className="text-text-secondary text-[10px] font-body tracking-[0.22em] uppercase mb-2 px-1">Connections</p>
            <div className="space-y-2">
              {connections.map((c) => (
                <button
                  key={c.connection_id}
                  type="button"
                  onClick={() => onPick({ kind: "connection", connection: c })}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-forest-card border border-forest-border rounded-xl text-left"
                >
                  <div className="w-9 h-9 rounded-full bg-forest-border flex items-center justify-center shrink-0">
                    <span className="font-heading text-base text-text-primary">{c.soul.name?.[0]?.toUpperCase() || "·"}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-body text-text-primary text-sm font-semibold truncate">{c.soul.name}</p>
                    <p className="text-text-secondary text-[11px] font-body truncate">
                      {c.soul.sun_sign && <>☉ {c.soul.sun_sign}</>}
                      {c.soul.sun_sign && c.soul.hd_type && " · "}
                      {c.soul.hd_type}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {savedPeople.length === 0 && connections.length === 0 && (
          <p className="text-text-secondary text-xs font-body text-center py-6">
            No one here yet. Add your first person above.
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add-person sheet — collects birth data, calls /souls/calculate-blueprint
// ---------------------------------------------------------------------------

interface AddPersonSheetProps {
  onClose: () => void;
  onAdded: (person: SavedPerson) => void;
}

function AddPersonSheet({ onClose, onAdded }: AddPersonSheetProps) {
  const [name, setName] = useState("");
  const [sex, setSex] = useState<"female" | "male" | "">("");
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [timeUnknown, setTimeUnknown] = useState(false);
  const [birthCity, setBirthCity] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    name.trim().length > 0 &&
    (sex === "female" || sex === "male") &&
    birthDate.length === 10 &&
    (timeUnknown || birthTime.length === 5) &&
    birthCity.trim().length > 0 &&
    !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    try {
      const res = await fetch(`${apiUrl}/souls/calculate-blueprint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          sex: sex || null,
          birth_date: birthDate,
          birth_time: timeUnknown ? "12:00" : birthTime,
          birth_city: birthCity,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Couldn't read their chart. Check the city name.");
      }
      const data = await res.json();
      const person: SavedPerson = {
        id: typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: name.trim(),
        sex: sex || null,
        birth_date: birthDate,
        birth_time: timeUnknown ? "12:00" : birthTime,
        birth_city: birthCity.trim(),
        profile: {
          sun_sign: data?.profile?.sun_sign ?? null,
          hd_type: data?.profile?.hd_type ?? null,
          hd_profile: data?.profile?.hd_profile ?? null,
        },
        created_at: Date.now(),
      };
      onAdded(person);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Something drifted. Try again.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-forest-deep/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-forest-dark border-t border-forest-border rounded-t-3xl px-6 pt-5 pb-16 max-h-[96dvh] overflow-y-auto">
        <div className="w-10 h-1 bg-forest-border rounded-full mx-auto mb-5" />
        <h3 className="font-heading text-text-primary mb-1" style={{ fontSize: "1.2rem", fontWeight: 400, fontStyle: "italic" }}>Add someone</h3>
        <p className="font-body text-text-secondary text-[12px] mb-5">Their birth data stays on your device. Nothing is shared without their consent.</p>

        <div className="space-y-4">
          <div>
            <label className="font-body text-[10px] tracking-[0.18em] uppercase text-text-secondary">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Their first name"
              className="w-full bg-transparent border-b border-forest-border text-text-primary font-body py-2 focus:outline-none focus:border-[#5a7680] transition-colors"
            />
          </div>

          <div>
            <label className="font-body text-[10px] tracking-[0.18em] uppercase text-text-secondary mb-1 block">Gender</label>
            <div className="grid grid-cols-2 gap-2">
              {(["female", "male"] as const).map((opt) => {
                const active = sex === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setSex(opt)}
                    className="py-2.5 rounded-xl transition-all font-body text-[12px]"
                    style={{
                      background: active ? "rgba(74,102,112,0.10)" : "transparent",
                      border: active ? "1px solid rgba(74,102,112,0.55)" : "1px solid rgba(245,240,232,0.12)",
                      color: active ? "#f5f0e8" : "#8a9e8d",
                    }}
                  >
                    {opt === "female" ? "Female" : "Male"}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="font-body text-[10px] tracking-[0.18em] uppercase text-text-secondary">Birth date</label>
              <input
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="w-full bg-transparent border-b border-forest-border text-text-primary font-body py-2 focus:outline-none focus:border-[#5a7680] transition-colors"
                style={{ colorScheme: "dark" }}
              />
            </div>
            <div>
              <label className="font-body text-[10px] tracking-[0.18em] uppercase text-text-secondary">Birth time</label>
              <input
                type="time"
                value={birthTime}
                onChange={(e) => setBirthTime(e.target.value)}
                disabled={timeUnknown}
                className="w-full bg-transparent border-b border-forest-border text-text-primary font-body py-2 focus:outline-none focus:border-[#5a7680] transition-colors disabled:opacity-40"
                style={{ colorScheme: "dark" }}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => setTimeUnknown(!timeUnknown)}
            className={`font-body text-[11px] tracking-wider transition-colors -mt-2 ${
              timeUnknown ? "text-[#4a6670]" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {timeUnknown ? "✓ Using noon" : "Unknown birth time"}
          </button>

          <div>
            <label className="font-body text-[10px] tracking-[0.18em] uppercase text-text-secondary">Birth city</label>
            <input
              type="text"
              value={birthCity}
              onChange={(e) => setBirthCity(e.target.value)}
              placeholder="City, Country"
              className="w-full bg-transparent border-b border-forest-border text-text-primary font-body py-2 focus:outline-none focus:border-[#5a7680] transition-colors"
            />
          </div>

          {error && (
            <p className="text-ember text-[12px] font-body">{error}</p>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="w-full py-3.5 rounded-xl font-body font-semibold text-[13px] tracking-[0.2em] uppercase transition-all disabled:opacity-30"
            style={{
              background: "linear-gradient(135deg, #4a6670, #3a5560)",
              color: "#f5f0e8",
            }}
          >
            {submitting ? <LoadingSpinner size="sm" /> : "Read their chart"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Soul card component
interface SoulCardProps {
  connection: ConnectedSoul;
  onOpen: () => void;
}

function SoulCard({ connection, onOpen }: SoulCardProps) {
  const { soul } = connection;
  const avatarInitial = soul.name?.[0]?.toUpperCase() || "·";

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
            background: "linear-gradient(135deg, #4a6670, #4a6670)",
            padding: "2px",
          }}
        >
          <div className="w-full h-full rounded-full bg-forest-card flex items-center justify-center">
            <span className="font-heading text-xl text-text-primary">{avatarInitial}</span>
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
