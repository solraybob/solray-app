"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
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
    profile_photo?: string | null;
  };
  connected_since: string;
}

// Person saved locally without an account — birth data + cached profile
// + the FULL blueprint we computed from their birth data when they were
// added. We keep the full blueprint so the Oracle has every system to
// read against (astro, numerology, astrocartography, human design,
// gene keys), not just the summary fields. Without it, the AI ends up
// asking the user for moon sign, defined centres, etc., because the
// summary is only sun + HD type.
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  blueprint?: any;           // full blueprint dict (optional for back-compat with older saved entries)
  created_at: number;
}

type BondLens = "romantic" | "friendship" | "working" | "family";
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

function partnerPhoto(p: BondPartner): string | null {
  if (p.kind === "connection") return p.connection.soul.profile_photo || null;
  return null;
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
  onViewProfile: () => void;
}

function SoulActions({ soul, onClose, onSoloReading, onGroupReading, onViewProfile }: SoulActionsProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-forest-deep/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-forest-dark border-t border-forest-border rounded-t-3xl px-6 pt-6 pb-12">
        <div className="w-10 h-1 bg-forest-border rounded-full mx-auto mb-6" />
        <div className="flex items-center gap-4 mb-6">
          {soul.soul.profile_photo ? (
            <img src={soul.soul.profile_photo} alt={soul.soul.name} className="w-12 h-12 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-forest-border flex items-center justify-center shrink-0">
              <span className="font-heading text-xl text-text-primary">{soul.soul.name?.[0]?.toUpperCase() || "·"}</span>
            </div>
          )}
          <div>
            <h3 className="font-heading text-text-primary" style={{ fontSize: "1.05rem", fontWeight: 400 }}>{soul.soul.name}</h3>
            <p className="font-body text-text-secondary text-[15px]">
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
            onClick={onViewProfile}
            className="w-full text-left px-5 py-4 bg-forest-card border border-forest-border rounded-2xl transition-all hover:border-[#7a96a2]/30"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-body text-text-primary font-semibold text-[15px]">View Profile</p>
                <p className="font-body text-text-secondary text-[12px] mt-0.5">See {soul.soul.name}&rsquo;s chart, blueprint, and details</p>
              </div>
              <span className="font-body text-indigo text-[12px]">Open</span>
            </div>
          </button>
          <button
            onClick={onSoloReading}
            className="w-full text-left px-5 py-4 bg-forest-card border border-forest-border rounded-2xl transition-all hover:border-[#7a96a2]/30"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-body text-text-primary font-semibold text-[15px]">Your Reading</p>
                <p className="font-body text-text-secondary text-[12px] mt-0.5">Just you asking about your dynamic with {soul.soul.name}</p>
              </div>
              <span className="font-body text-indigo text-[12px]">Open</span>
            </div>
          </button>
          <button
            onClick={onGroupReading}
            className="w-full text-left px-5 py-4 bg-indigo/5 border border-indigo/30 rounded-2xl transition-all hover:bg-[#5a7582]/10"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-body text-text-primary font-semibold text-[15px]">Group Reading</p>
                <p className="font-body text-text-secondary text-[12px] mt-0.5">Invite {soul.soul.name} into a shared session together</p>
              </div>
              <span className="font-body text-indigo text-[12px]">Share</span>
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
        <p className="font-body text-text-secondary text-[15px] mb-6 leading-relaxed">
          Share this link with {soul.soul.name} to join your shared session. Both of you can ask questions and the guide speaks to you together.
        </p>

        <div className="bg-forest-card border border-forest-border rounded-xl px-4 py-3 mb-3 font-mono text-xs text-text-secondary break-all">
          {shareUrl}
        </div>

        <div className="space-y-3">
          <button
            onClick={handleCopy}
            className="w-full py-3.5 bg-indigo/10 border border-indigo/30 rounded-xl font-body text-indigo text-[15px] tracking-widest transition-all hover:bg-[#5a7582]/20"
          >
            {copied ? "Copied!" : `Copy link for ${soul.soul.name}`}
          </button>
          <button
            onClick={onEnterSession}
            className="w-full py-3.5 bg-indigo text-forest-deep font-body font-semibold rounded-xl text-[15px] tracking-widest transition-all hover:opacity-90"
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
  const [myAvatar, setMyAvatar] = useState<string | null>(null);
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
  const [bondPartners, setBondPartners] = useState<BondPartner[]>([]);
  const [bondLens, setBondLens] = useState<BondLens>("family");
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
        const serverPhoto = me?.profile?.profile_photo || null;
        const localPhoto = (() => { try { return localStorage.getItem("solray_avatar"); } catch { return null; } })();
        setMyAvatar(serverPhoto || localPhoto);
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

  // Persist a newly-added person and add them to the bond partners
  const handlePersonAdded = (person: SavedPerson) => {
    const next = [person, ...savedPeople].slice(0, 50);
    setSavedPeople(next);
    writeSavedPeople(next);
    const newPartner: BondPartner = { kind: "saved", person };
    if (bondLens === "family") {
      setBondPartners(prev => [...prev, newPartner]);
    } else {
      setBondPartners([newPartner]);
    }
    setAddPersonOpen(false);
  };

  const handlePersonRemove = (id: string) => {
    const next = savedPeople.filter((p) => p.id !== id);
    setSavedPeople(next);
    writeSavedPeople(next);
    setBondPartners(prev => prev.filter(p => !(p.kind === "saved" && p.person.id === id)));
  };

  // Fire the Bond reading — route to /chat?compat=1 with context
  const readTheBond = async () => {
    if (bondPartners.length === 0) return;
    setReadingBond(true);
    setErrorMessage(null);

    const lensLabel =
      bondLens === "romantic"   ? "romantic dynamic"
      : bondLens === "friendship" ? "friendship dynamic"
      : bondLens === "family"     ? "family dynamic"
      : "working dynamic";

    // Family with multiple people: build a group context
    if (bondLens === "family" && bondPartners.length > 1) {
      const lines: string[] = [];
      let primaryBlueprint: unknown = null;

      for (const p of bondPartners) {
        const chart = partnerChart(p);
        const name  = partnerName(p);
        const summary = [
          chart.sun_sign && `Sun in ${chart.sun_sign}`,
          chart.hd_type  && `Human Design: ${chart.hd_type}${chart.hd_profile ? ` ${chart.hd_profile}` : ""}`,
        ].filter(Boolean).join(", ");
        lines.push(`${name}: ${summary || "chart not yet computed"}`);

        // Same priority order as single-partner: connection > cached
        // saved blueprint > fall through. We only need ONE primary
        // blueprint for the chat (it's the focal lens for the whole
        // family reading); the rest of the family's charts stay in
        // the summary-line text.
        if (!primaryBlueprint) {
          if (p.kind === "connection") {
            try {
              const data = await apiFetch(`/souls/${p.connection.connection_id}/blueprint`, {}, token);
              primaryBlueprint = data?.blueprint || null;
            } catch { /* non-fatal */ }
          } else if (p.person.blueprint) {
            primaryBlueprint = p.person.blueprint;
          }
        }
      }

      const names = bondPartners.map(partnerName);
      const nameList = names.length === 2
        ? names.join(" and ")
        : `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;

      const introMessage =
        `Read the family dynamic between me, ${nameList}. ` +
        `Here are their charts: ${lines.join("; ")}. ` +
        `What is the energy of this family as a whole? Where is there harmony, friction, and what does each person bring to the group?`;

      sessionStorage.setItem("solray_compat_context", JSON.stringify({
        soulName: nameList,
        introMessage,
        soulBlueprint: primaryBlueprint,
        lens: bondLens,
      }));

      setReadingBond(false);
      router.push("/chat?compat=1");
      return;
    }

    // Single partner reading (all non-family lenses, or family with one person)
    const bondPartner = bondPartners[0];
    const chart  = partnerChart(bondPartner);
    const pName  = partnerName(bondPartner);

    const chartSummary = [
      chart.sun_sign && `Sun in ${chart.sun_sign}`,
      chart.hd_type  && `Human Design: ${chart.hd_type}${chart.hd_profile ? ` ${chart.hd_profile}` : ""}`,
    ].filter(Boolean).join(", ");

    // Pull the full blueprint to hand to the Oracle. Three sources, in
    // priority order:
    //   1. Connection: live fetch from /souls/{id}/blueprint (always
    //      authoritative).
    //   2. Saved person with cached blueprint: use it directly.
    //   3. Saved person without cached blueprint (added before this
    //      fix): recompute from their stored birth data.
    // Without this, the AI gets only a 3-field summary and asks the
    // user for moon sign and defined centres mid-reading.
    let soulBlueprint: unknown = null;
    if (bondPartner.kind === "connection") {
      try {
        const data = await apiFetch(`/souls/${bondPartner.connection.connection_id}/blueprint`, {}, token);
        soulBlueprint = data?.blueprint || null;
      } catch {
        setErrorMessage("Couldn't pull their full chart — reading from the basics.");
      }
    } else {
      const saved = bondPartner.person;
      if (saved.blueprint) {
        soulBlueprint = saved.blueprint;
      } else {
        // Back-compat: people saved before we cached the full blueprint.
        // Recompute on the fly. Slow (~2-3s) but only happens once per
        // legacy person — we re-store the blueprint after.
        try {
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
          const res = await fetch(`${apiUrl}/souls/calculate-blueprint`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: saved.name,
              sex: saved.sex,
              birth_date: saved.birth_date,
              birth_time: saved.birth_time,
              birth_city: saved.birth_city,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            soulBlueprint = data?.blueprint || null;
            // Persist for next time so this user doesn't pay the cost again.
            if (soulBlueprint) {
              const next = savedPeople.map((p) =>
                p.id === saved.id ? { ...p, blueprint: soulBlueprint } : p
              );
              setSavedPeople(next);
              writeSavedPeople(next);
            }
          }
        } catch {
          setErrorMessage("Couldn't pull their full chart — reading from the basics.");
        }
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
      <div
        className="min-h-[100dvh] bg-forest-deep"
        style={{ paddingBottom: "calc(160px + env(safe-area-inset-bottom, 16px))" }}
      >
        {/* Header: matches today + chat structure. Tag on left, SOULS absolute center. */}
        <div className="border-b border-forest-border/50">
          <div className="max-w-lg mx-auto px-5 pt-2 pb-3">
            <p className="font-body text-[12px] tracking-[0.18em] uppercase mb-1" style={{ color: "#6a8692" }}>
              Your Field
            </p>
            <div className="relative flex items-center" style={{ height: "26px" }}>
              <h1
                className="font-heading tracking-[0.15em] text-text-primary absolute left-1/2 -translate-x-1/2"
                style={{ fontWeight: 300, fontSize: "21px" }}
              >
                SOULS
              </h1>
            </div>
          </div>
        </div>

        <div className="max-w-lg mx-auto px-5 pt-5 space-y-6 animate-fade-in">
          {/* Page intro: exact same style as the chat greeting */}
          <div className="flex flex-col items-center text-center pt-2 pb-2">
            <p
              className="font-heading text-text-primary/80 leading-relaxed max-w-[280px]"
              style={{ fontSize: "1.15rem", fontWeight: 300, fontStyle: "italic", letterSpacing: "0.01em" }}
            >
              Add someone&apos;s birth details, pick how you relate and read what the charts say about your dynamic.
            </p>
            <div className="mt-5 w-12 h-px bg-forest-border/60" />
          </div>

          {/* Hero: Read the Bond */}
          <BondCard
            myName={myUsername || null}
            myAvatar={myAvatar}
            partners={bondPartners}
            lens={bondLens}
            onPickPartner={() => {
              if (savedPeople.length === 0 && connectedSouls.length === 0) {
                setAddPersonOpen(true);
              } else {
                setPartnerPickerOpen(true);
              }
            }}
            onRemovePartner={(i) => setBondPartners(prev => prev.filter((_, idx) => idx !== i))}
            onChangeLens={(l) => {
              setBondLens(l);
              // Trim to one person when leaving family
              if (l !== "family" && bondPartners.length > 1) {
                setBondPartners(prev => prev.slice(0, 1));
              }
            }}
            onRead={readTheBond}
            reading={readingBond}
          />

          {/* Search — for deeper two-way connections with Solray users */}
          <div>
            <p className="text-text-secondary text-[12px] font-body tracking-[0.22em] uppercase mb-2">Find a Soul</p>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={e => handleSearch(e.target.value)}
                placeholder="@username or email"
                className="w-full bg-forest-card border border-forest-border rounded-xl px-4 py-3.5 text-text-primary placeholder-text-secondary font-body text-base transition-all pr-10"
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#6a8692";
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
                      className="shrink-0 px-3 py-1.5 bg-indigo/10 border border-indigo/30 text-indigo rounded-lg text-xs font-body transition-all hover:bg-[#5a7582]/20 disabled:opacity-40"
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
              className="rounded-xl px-4 py-3 font-body text-[14px] transition-opacity"
              style={{
                background: "rgba(196, 98, 58, 0.08)",
                border: "1px solid rgba(196, 98, 58, 0.25)",
                color: "#d47a52",
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
                  <p className="text-text-secondary text-[12px] font-body tracking-[0.22em] uppercase mb-3">Pending Requests</p>
                  <div className="space-y-2">
                    {pendingInvites.map(invite => (
                      <div
                        key={invite.invite_id}
                        className="flex items-center gap-3 px-4 py-3 border rounded-2xl"
                        style={{
                          background: "linear-gradient(135deg, rgb(var(--rgb-indigo) / 0.08) 0%, rgb(var(--rgb-card)) 60%)",
                          borderColor: "rgba(106,134,146,0.25)",
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
                            className="px-3 py-1.5 text-[#f2ecd8] rounded-lg text-xs font-body font-semibold transition-all hover:opacity-90"
                            style={{
                              background: "linear-gradient(135deg, #6a8692, #5a7582)",
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
                    <p className="text-text-secondary text-[12px] font-body tracking-[0.22em] uppercase mb-3">Connections</p>
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
                    <p className="font-body text-text-secondary text-[14px] max-w-xs mx-auto">
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
            onViewProfile={() => {
              // The /profile/[id] page handles both public (full chart)
              // and private (name + photo only) cases via the
              // /users/:id/public-profile endpoint.
              router.push(`/profile/${activeSoul.soul.id}`);
              setActiveSoul(null);
            }}
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
              if (bondLens === "family") {
                // In family mode: add to the group (max 5 people + you = 6 total)
                setBondPartners(prev => prev.length < 5 ? [...prev, p] : prev);
              } else {
                setBondPartners([p]);
              }
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

      </div>
    </ProtectedRoute>
  );
}

// ---------------------------------------------------------------------------
// Bond entry card — hero on the Souls page
// ---------------------------------------------------------------------------

interface BondCardProps {
  myName: string | null;
  myAvatar?: string | null;
  partners: BondPartner[];
  lens: BondLens;
  onPickPartner: () => void;
  onRemovePartner: (i: number) => void;
  onChangeLens: (l: BondLens) => void;
  onRead: () => void;
  reading: boolean;
}

const MAX_FAMILY_MEMBERS = 5;

function BondCard({ myName, myAvatar, partners, lens, onPickPartner, onRemovePartner, onChangeLens, onRead, reading }: BondCardProps) {
  const lenses: { key: BondLens; label: string; hint: string }[] = [
    { key: "family",     label: "Family",     hint: "roots, roles, belonging" },
    { key: "friendship", label: "Friendship", hint: "trust, play, distance" },
    { key: "romantic",   label: "Romantic",   hint: "intimacy, attraction, merge" },
    { key: "working",    label: "Working",    hint: "collaboration, friction, flow" },
  ];

  const isFamily   = lens === "family";
  const partner    = partners[0] ?? null;
  const chart      = partner ? partnerChart(partner) : null;
  const canAddMore = isFamily && partners.length < MAX_FAMILY_MEMBERS;

  return (
    <div
      className="rounded-3xl p-6 relative overflow-hidden"
      style={{
        background: "linear-gradient(155deg, rgb(var(--rgb-indigo) / 0.10) 0%, rgb(var(--rgb-card) / 0.95) 55%, rgb(var(--rgb-card)) 100%)",
        border: "1px solid rgba(106,134,146,0.25)",
        boxShadow: "0 20px 60px -30px rgba(106,134,146,0.35)",
      }}
    >
      <p className="font-body text-[12px] tracking-[0.22em] uppercase text-indigo/70 mb-1">Dynamics</p>
      <h2 className="font-heading text-2xl text-text-primary leading-tight mb-5" style={{ fontWeight: 300, fontStyle: "italic", letterSpacing: "-0.01em" }}>
        Where two charts meet.
      </h2>

      {/* You + partner(s) pills */}
      <div className="flex flex-wrap items-center gap-2 mb-5">

        {/* You — always fixed */}
        <div
          className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full shrink-0"
          style={{ background: "rgba(242,236,216,0.04)", border: "1px solid rgba(242,236,216,0.12)" }}
        >
          {myAvatar ? (
            <img src={myAvatar} alt="You" className="w-7 h-7 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[#f2ecd8] font-heading text-sm shrink-0"
                 style={{ background: "linear-gradient(135deg, #6a8692, #5a7582)" }}>
              {myName?.[0]?.toUpperCase() || "·"}
            </div>
          )}
          <span className="font-body text-[14px] text-text-primary">You</span>
        </div>

        {/* Selected partners */}
        {partners.map((p, i) => (
          <div
            key={i}
            className="flex items-center gap-1.5 pl-1 pr-1.5 py-1 rounded-full shrink-0"
            style={{ background: "rgba(106,134,146,0.08)", border: "1px solid rgba(106,134,146,0.45)" }}
          >
            <span className="text-indigo/50 text-xs shrink-0" aria-hidden="true">✦</span>
            {partnerPhoto(p) ? (
              <img src={partnerPhoto(p)!} alt={partnerName(p)} className="w-6 h-6 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-forest-border flex items-center justify-center font-heading text-xs text-text-primary shrink-0">
                {partnerInitial(p)}
              </div>
            )}
            <span className="font-body text-[14px] text-text-primary max-w-[80px] truncate">{partnerName(p)}</span>
            <button
              type="button"
              onClick={() => onRemovePartner(i)}
              className="w-4 h-4 rounded-full flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors shrink-0 ml-0.5"
              aria-label={`Remove ${partnerName(p)}`}
            >
              ×
            </button>
          </div>
        ))}

        {/* Add button — always shown when no partners, or in family mode with room */}
        {(partners.length === 0 || canAddMore) && (
          <button
            type="button"
            onClick={onPickPartner}
            className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full shrink-0 transition-all hover:border-[#7a96a2]/60"
            style={{
              background: "transparent",
              border: "1px dashed rgba(242,236,216,0.25)",
            }}
          >
            {partners.length === 0 && (
              <span className="text-indigo/50 text-xs" aria-hidden="true">✦</span>
            )}
            <div className="w-6 h-6 rounded-full flex items-center justify-center font-body text-[15px] text-text-secondary shrink-0"
                 style={{ border: "1px dashed rgba(242,236,216,0.25)" }}>+</div>
            <span className="font-body text-[14px] text-text-secondary">
              {partners.length === 0 ? "Choose someone" : isFamily ? "Add another" : ""}
            </span>
          </button>
        )}
      </div>

      {/* Chart whisper — only for single partner on non-family lenses */}
      {!isFamily && partner && chart && (chart.sun_sign || chart.hd_type) && (
        <p className="font-body text-[13px] text-text-secondary mb-5 -mt-2 pl-1">
          {chart.sun_sign && <>☉ {chart.sun_sign}</>}
          {chart.sun_sign && chart.hd_type && " · "}
          {chart.hd_type && (
            <>{chart.hd_type}{chart.hd_profile ? ` ${chart.hd_profile}` : ""}</>
          )}
        </p>
      )}

      {/* Lens pills */}
      <div className="mb-6">
        <p className="font-body text-[11px] tracking-[0.22em] uppercase text-text-secondary mb-2">Lens</p>
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
                  background: active ? "rgba(106,134,146,0.15)" : "rgba(242,236,216,0.03)",
                  border: active ? "1px solid rgba(106,134,146,0.55)" : "1px solid rgba(242,236,216,0.08)",
                  color: active ? "#f2ecd8" : "#8a9e8d",
                }}
                title={l.hint}
              >
                <span className="font-body text-[13px]">{l.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={onRead}
        disabled={partners.length === 0 || reading}
        className="w-full py-3.5 rounded-xl font-body font-semibold text-[15px] tracking-[0.2em] uppercase transition-all disabled:opacity-35 disabled:cursor-not-allowed"
        style={{
          background: "linear-gradient(135deg, #6a8692, #5a7582)",
          color: "#f2ecd8",
        }}
      >
        {reading ? <LoadingSpinner size="sm" /> : isFamily && partners.length > 1 ? "Read the Family →" : "Read the Dynamic →"}
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
            background: "rgba(106,134,146,0.08)",
            border: "1px solid rgba(106,134,146,0.35)",
          }}
        >
          <div className="w-9 h-9 rounded-full flex items-center justify-center font-heading text-lg text-[#f2ecd8] shrink-0"
               style={{ background: "linear-gradient(135deg, #6a8692, #5a7582)" }}>+</div>
          <div className="flex-1 text-left">
            <p className="font-body text-text-primary text-sm font-semibold">Add someone new</p>
            <p className="font-body text-text-secondary text-[13px]">Their birth data stays on your device</p>
          </div>
        </button>

        {savedPeople.length > 0 && (
          <div className="mb-4">
            <p className="text-text-secondary text-[12px] font-body tracking-[0.22em] uppercase mb-2 px-1">Your People</p>
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
                      <p className="text-text-secondary text-[13px] font-body truncate">
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
            <p className="text-text-secondary text-[12px] font-body tracking-[0.22em] uppercase mb-2 px-1">Connections</p>
            <div className="space-y-2">
              {connections.map((c) => (
                <button
                  key={c.connection_id}
                  type="button"
                  onClick={() => onPick({ kind: "connection", connection: c })}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-forest-card border border-forest-border rounded-xl text-left"
                >
                  {c.soul.profile_photo ? (
                    <img src={c.soul.profile_photo} alt={c.soul.name} className="w-9 h-9 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-forest-border flex items-center justify-center shrink-0">
                      <span className="font-heading text-base text-text-primary">{c.soul.name?.[0]?.toUpperCase() || "·"}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-body text-text-primary text-sm font-semibold truncate">{c.soul.name}</p>
                    <p className="text-text-secondary text-[13px] font-body truncate">
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
  const [citySuggestions, setCitySuggestions] = useState<{ display: string }[]>([]);
  const [cityLoading, setCityLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const cityInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        // Persist the FULL blueprint the backend just computed. Without
        // this, the Oracle reads this person from a 3-field summary and
        // ends up asking the user for moon sign, defined centres, etc.
        // We already had the data — we were just throwing it away.
        blueprint: data?.blueprint ?? undefined,
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
        <p className="font-body text-text-secondary text-[14px] mb-5">Their birth data stays on your device. Nothing is shared without their consent.</p>

        <div className="space-y-4">
          <div>
            <label className="font-body text-[12px] tracking-[0.18em] uppercase text-text-secondary">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Their first name"
              className="w-full bg-transparent border-b border-forest-border text-text-primary font-body py-2 focus:outline-none focus:border-[#7a96a2] transition-colors"
            />
          </div>

          <div>
            <label className="font-body text-[12px] tracking-[0.18em] uppercase text-text-secondary mb-1 block">Gender</label>
            <div className="grid grid-cols-2 gap-2">
              {(["female", "male"] as const).map((opt) => {
                const active = sex === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setSex(opt)}
                    className="py-2.5 rounded-xl transition-all font-body text-[14px]"
                    style={{
                      background: active ? "rgba(106,134,146,0.10)" : "transparent",
                      border: active ? "1px solid rgba(106,134,146,0.55)" : "1px solid rgba(242,236,216,0.12)",
                      color: active ? "#f2ecd8" : "#8a9e8d",
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
              <label className="font-body text-[12px] tracking-[0.18em] uppercase text-text-secondary">Birth date</label>
              <input
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="w-full bg-transparent border-b border-forest-border text-text-primary font-body py-2 focus:outline-none focus:border-[#7a96a2] transition-colors"
                style={{ colorScheme: "dark" }}
              />
            </div>
            <div>
              <label className="font-body text-[12px] tracking-[0.18em] uppercase text-text-secondary">Birth time</label>
              <input
                type="time"
                value={birthTime}
                onChange={(e) => setBirthTime(e.target.value)}
                disabled={timeUnknown}
                className="w-full bg-transparent border-b border-forest-border text-text-primary font-body py-2 focus:outline-none focus:border-[#7a96a2] transition-colors disabled:opacity-40"
                style={{ colorScheme: "dark" }}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => setTimeUnknown(!timeUnknown)}
            className={`font-body text-[13px] tracking-wider transition-colors -mt-2 ${
              timeUnknown ? "text-indigo" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {timeUnknown ? "✓ Using noon" : "Unknown birth time"}
          </button>

          <div>
            <label className="font-body text-[12px] tracking-[0.18em] uppercase text-text-secondary">Birth city</label>
            <div className="relative">
              <input
                ref={cityInputRef}
                type="text"
                value={birthCity}
                onChange={(e) => {
                  setBirthCity(e.target.value);
                  setShowSuggestions(true);
                }}
                placeholder="City, Country"
                autoComplete="off"
                className="w-full bg-transparent border-b border-forest-border text-text-primary font-body py-2 focus:outline-none focus:border-[#7a96a2] transition-colors"
                style={{ paddingRight: cityLoading ? "2rem" : undefined }}
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
                  className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl overflow-hidden shadow-xl"
                  style={{
                    background: "rgb(var(--rgb-card))",
                    border: "1px solid rgb(var(--rgb-text-primary) / 0.12)",
                    maxHeight: "14rem",
                    overflowY: "auto",
                  }}
                >
                  {citySuggestions.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      className="w-full text-left px-4 py-2.5 font-body text-[15px] text-text-primary hover:bg-white/5 transition-colors border-b border-forest-border/40 last:border-b-0"
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
            <p className="text-ember text-[14px] font-body">{error}</p>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="w-full py-3.5 rounded-xl font-body font-semibold text-[15px] tracking-[0.2em] uppercase transition-all disabled:opacity-30"
            style={{
              background: "linear-gradient(135deg, #6a8692, #5a7582)",
              color: "#f2ecd8",
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
        background: "linear-gradient(135deg, rgb(var(--rgb-indigo) / 0.06) 0%, rgb(var(--rgb-card)) 60%)",
        border: "1px solid rgb(var(--rgb-indigo) / 0.25)",
      }}
    >
      <div className="flex items-center gap-4">
        {/* Avatar with gradient border */}
        <div
          className="w-12 h-12 rounded-full shrink-0 relative"
          style={{
            background: "linear-gradient(135deg, #6a8692, #6a8692)",
            padding: "2px",
          }}
        >
          {soul.profile_photo ? (
            <img src={soul.profile_photo} alt={soul.name} className="w-full h-full rounded-full object-cover" />
          ) : (
            <div className="w-full h-full rounded-full bg-forest-card flex items-center justify-center">
              <span className="font-heading text-xl text-text-primary">{avatarInitial}</span>
            </div>
          )}
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
        <span className="text-xs font-body tracking-wider opacity-70 shrink-0" style={{ color: "#6a8692" }}>
          Open →
        </span>
      </div>
    </button>
  );
}
