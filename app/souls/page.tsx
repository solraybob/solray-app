"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useAuth } from "@/lib/auth-context";
import { ShareOffscreenWrapper, SoulsInviteCard } from "@/components/ShareCard";
import { apiFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { Wordmark } from "@/components/Wordmark";
import BirthWheels from "@/components/BirthWheels";

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

// Person saved locally without an account, birth data + cached profile
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
    // quota etc, fail quiet
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
  onViewProfile: () => void;
}

function SoulActions({ soul, onClose, onSoloReading, onViewProfile }: SoulActionsProps) {
  const { t } = useT();
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
            <h3 className="font-heading text-text-primary" style={{ fontSize: "1.05rem", fontWeight: 700 }}>{soul.soul.name}</h3>
            <p className="font-body text-text-secondary text-[17px]">
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
            className="w-full text-left px-5 py-4 bg-forest-card border border-forest-border rounded-2xl transition-all hover:border-mist/30"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-body text-text-primary font-semibold text-[17px]">{t("souls.view_profile")}</p>
                <p className="font-body text-text-secondary text-[14px] mt-0.5">{t("souls.view_profile_sub").replace("{name}", soul.soul.name)}</p>
              </div>
              <span className="font-body text-indigo text-[14px]">{t("souls.open")}</span>
            </div>
          </button>
          <button
            onClick={onSoloReading}
            className="w-full text-left px-5 py-4 bg-forest-card border border-forest-border rounded-2xl transition-all hover:border-mist/30"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-body text-text-primary font-semibold text-[17px]">{t("souls.your_reading")}</p>
                <p className="font-body text-text-secondary text-[14px] mt-0.5">{t("souls.your_reading_sub").replace("{name}", soul.soul.name)}</p>
              </div>
              <span className="font-body text-indigo text-[14px]">{t("souls.open")}</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}


// Main page
export default function SoulsPage() {
  const { token, user } = useAuth();
  const { t } = useT();
  const router = useRouter();

  const [myUsername, setMyUsername] = useState<string | null>(null);
  const [myAvatar, setMyAvatar] = useState<string | null>(null);

  // Souls invite share card refs and state. The card is rendered into
  // an off-screen container at the bottom of the page; html2canvas
  // captures it on demand when the user taps the invite share icon
  // in the SOULS header. Codex UX hook 4: highest-leverage viral
  // surface in the product, every invite is free CAC because the
  // recipient is a warm contact of the inviter.
  const inviteShareRef = useRef<HTMLDivElement | null>(null);
  const [inviteSharing, setInviteSharing] = useState(false);
  const [inviteInfo, setInviteInfo] = useState<{ code: string; link: string } | null>(null);

  // Load the user's permanent invite code/link once, so the share card can
  // carry the code (attribution) and the share text the tappable link.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    apiFetch("/users/me/invite", undefined, token)
      .then((json: { code: string; link: string }) => {
        if (!cancelled) setInviteInfo({ code: json.code, link: json.link });
      })
      .catch(() => { /* card falls back to the brand-only version */ });
    return () => { cancelled = true; };
  }, [token]);

  const handleInviteShare = async () => {
    if (inviteSharing) return;
    if (!inviteShareRef.current) return;
    setInviteSharing(true);
    try {
      const { shareOrDownloadCard } = await import("@/lib/share-card");
      const link = inviteInfo?.link || "https://solray.ai";
      await shareOrDownloadCard({
        node: inviteShareRef.current,
        filename: "solray-invite.png",
        title: "You're invited to Solray",
        text: `Read your chart against today's sky, and the dynamics with the people in your life. Join me on Solray: ${link}`,
      });
    } catch (err) {
      console.warn("[share] souls invite failed", err);
    } finally {
      setInviteSharing(false);
    }
  };
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
  const [searchOpen, setSearchOpen] = useState(false);
  // Inline error surface, softer than alert(), matches Japanese-way quiet
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Quick Bond state, hybrid local-chart flow
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
    const timer = setTimeout(() => setErrorMessage(null), 4000);
    return () => clearTimeout(timer);
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
        setErrorMessage(t("souls.error_field"));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  // Sync saved people with the server so they survive reinstalls and follow the
  // user across devices. The server is the source of truth; people that only
  // exist locally (created before server persistence, or while offline) are
  // migrated up once. Falls back silently to the localStorage copy if offline.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/saved-people", {}, token);
        const server: SavedPerson[] = Array.isArray(res?.people) ? res.people : [];
        const serverIds = new Set(server.map((p) => p.id));
        const local = loadSavedPeople();
        const toMigrate = local.filter((p) => p && p.id && !serverIds.has(p.id));
        const migrated: SavedPerson[] = [];
        const failed: SavedPerson[] = [];
        const idRemap: Record<string, string> = {};
        for (const p of toMigrate) {
          try {
            const r = await apiFetch("/saved-people", {
              method: "POST",
              body: JSON.stringify(p),
            }, token);
            if (r?.person) {
              const sp = r.person as SavedPerson;
              migrated.push(sp);
              if (sp.id && sp.id !== p.id) idRemap[p.id] = sp.id;
            } else {
              failed.push(p); // keep local copy so it is not lost
            }
          } catch {
            failed.push(p); // offline / error: keep local copy, retried next load
          }
        }
        if (cancelled) return;
        const seen = new Set<string>();
        // failed (still local-only) first so a dropped POST never loses the person
        const final = [...failed, ...migrated, ...server].filter((p) => {
          if (!p || !p.id || seen.has(p.id)) return false;
          seen.add(p.id);
          return true;
        });
        setSavedPeople(final);
        writeSavedPeople(final);
        // If migration changed any ids, reconcile selected bond partners too.
        if (Object.keys(idRemap).length) {
          const byId = new Map(final.map((p) => [p.id, p] as const));
          setBondPartners(prev => prev.map(bp => {
            if (bp.kind === "saved" && idRemap[bp.person.id]) {
              const np = byId.get(idRemap[bp.person.id]);
              return np ? { kind: "saved", person: np } : bp;
            }
            return bp;
          }));
        }
      } catch {
        // offline or error: keep whatever localStorage already gave us
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  // Debounced search, avoid firing /users/search on every keystroke
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
      const msg = e instanceof Error ? e.message : t("souls.error_signal");
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
      const msg = e instanceof Error ? e.message : t("souls.error_drifted");
      setErrorMessage(msg);
    } finally {
      setRespondingInvite(null);
    }
  };

  // Open solo compatibility chat
  const openSoloReading = async (soul: ConnectedSoul) => {
    setActiveSoul(null);
    setErrorMessage(null);
    // Fetch their full blueprint for the chat, proceed even if it fails,
    // the chat still works from the summary chart data
    let soulBlueprint = null;
    try {
      const data = await apiFetch(`/souls/${soul.connection_id}/blueprint`, {}, token);
      soulBlueprint = data?.blueprint || null;
    } catch {
      // Non-blocking: surface a quiet note but continue
      setErrorMessage(t("souls.error_partial_chart"));
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



  // One list for the grid. Connected souls come first, then the people you
  // saved yourself; they were three sections on the page and are one set of
  // equal things, which is what a grid is for.
  const connectionCards = [
    ...connectedSouls.map((c) => ({
      key: `soul-${c.connection_id}`,
      name: c.soul.name,
      photo: c.soul.profile_photo || null,
      connected: true,
      detail: [c.soul.sun_sign ? `☉ ${c.soul.sun_sign}` : null, c.soul.hd_type]
        .filter(Boolean)
        .join(" · ") || t("souls.connected"),
      onOpen: () => setActiveSoul(c),
    })),
    ...savedPeople.map((person) => ({
      key: `saved-${person.id}`,
      name: person.name,
      photo: null as string | null,
      connected: false,
      detail: [person.profile?.sun_sign ? `☉ ${person.profile.sun_sign}` : null, person.profile?.hd_type]
        .filter(Boolean)
        .join(" · ") || t("souls.saved"),
      onOpen: () => {
        const partner: BondPartner = { kind: "saved", person };
        if (bondLens === "family") {
          setBondPartners((prev) =>
            prev.some((b) => b.kind === "saved" && b.person.id === person.id)
              ? prev
              : prev.length < 5
              ? [...prev, partner]
              : prev
          );
        } else {
          setBondPartners([partner]);
        }
        if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
      },
    })),
  ];

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
    // Persist to the server so the person survives reinstalls and syncs across
    // devices. Optimistic above; reconcile the id if the server minted its own.
    if (token) {
      (async () => {
        try {
          const r = await apiFetch("/saved-people", {
            method: "POST",
            body: JSON.stringify(person),
          }, token);
          const saved = r?.person as SavedPerson | undefined;
          if (saved && saved.id && saved.id !== person.id) {
            setSavedPeople(prev => {
              const updated = prev.map(p => (p.id === person.id ? saved : p));
              writeSavedPeople(updated);
              return updated;
            });
            setBondPartners(prev => prev.map(bp =>
              bp.kind === "saved" && bp.person.id === person.id
                ? { kind: "saved", person: saved }
                : bp
            ));
          }
        } catch {
          // offline: local copy remains and migrates on the next load
        }
      })();
    }
  };

  const handlePersonRemove = (id: string) => {
    const next = savedPeople.filter((p) => p.id !== id);
    setSavedPeople(next);
    writeSavedPeople(next);
    setBondPartners(prev => prev.filter(p => !(p.kind === "saved" && p.person.id === id)));
    if (token) {
      apiFetch(`/saved-people/${id}`, { method: "DELETE" }, token).catch(() => {});
    }
  };

  // Fire the Bond reading, route to /chat?compat=1 with context
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
        setErrorMessage(t("souls.error_partial_chart"));
      }
    } else {
      const saved = bondPartner.person;
      if (saved.blueprint) {
        soulBlueprint = saved.blueprint;
      } else {
        // Back-compat: people saved before we cached the full blueprint.
        // Recompute on the fly. Slow (~2-3s) but only happens once per
        // legacy person, we re-store the blueprint after.
        try {
          const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").trim();
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
          setErrorMessage(t("souls.error_partial_chart"));
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
        style={{ paddingBottom: "calc(96px + var(--sab, 0px))" }}
      >
        {/* mundane's .head, the one the Mirror and Now already use: the mark
            on the left, the actions as 17px line glyphs on the right, one rule
            under it, then the small label line. The accent eyebrow and the
            centred title were a second and a third header on one screen. */}
        <div className="w-full max-w-lg lg:max-w-3xl mx-auto px-5 pt-3">
          <div className="flex items-center justify-between lg:justify-end" style={{ minHeight: 34 }}>
            {/* The fixed DesktopHeader carries the mark from lg up, so this
                one steps aside there rather than printing solray twice. */}
            <Wordmark size={17} className="text-text-primary lg:hidden" style={{ letterSpacing: "-.045em" }} />
            <span className="flex items-center" style={{ marginRight: -8 }}>
              <button
                onClick={handleInviteShare}
                aria-label={t("souls.share_invitation")}
                title={t("souls.share_invitation")}
                disabled={inviteSharing}
                className="sol-ico disabled:opacity-50"
              >
                {inviteSharing ? (
                  <span
                    className="inline-block w-3 h-3 border-2 rounded-full animate-spin"
                    style={{ borderColor: "currentColor", borderTopColor: "transparent" }}
                  />
                ) : (
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 10.5V16a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 16 16v-5.5" />
                    <path d="M13 5.5 10 2.5 7 5.5M10 2.5v10" />
                  </svg>
                )}
              </button>
            </span>
          </div>
          <div style={{ height: 1, background: "rgb(var(--rgb-border))", marginTop: 12 }} />
          <p
            className="font-body uppercase"
            style={{ fontSize: 11, letterSpacing: "0.3em", color: "rgb(var(--rgb-text-muted))", marginTop: 12 }}
          >
            {t("souls.your_field")}
          </p>
        </div>

        <div className="max-w-lg lg:max-w-3xl mx-auto px-5 pt-6 space-y-6 animate-fade-in">
          {/* The intro is prose, so it is set as prose: the Oracle's answer
              measurements, left, capped at 26em. It was a centred 900-weight
              block with its own divider, which read as a second headline. */}
          <p
            className="font-body"
            style={{ fontSize: 17, lineHeight: 1.62, color: "rgb(var(--rgb-text-secondary))", maxWidth: "26em", marginTop: 2 }}
          >
            {t("souls.intro")}
          </p>

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


          {/* CONNECTIONS. mundane's .pair grid of .card.small, which is how it
              lays out a set of equal things:
                .pair{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}
                .card.small{padding:14px 15px;border-radius:18px;display:flex;
                  flex-direction:column;gap:7px;align-items:flex-start;text-align:left}
                .card.small b{font-size:15.5px;font-weight:700;letter-spacing:-.015em}
                .card.small em{font-size:12px;color:var(--ink3)}
                .card .cdot{width:11px;height:11px;border-radius:50%;
                  border:1.5px solid rgba(34,32,28,.24);background:none}
              The people you are connected with and the people you have saved,
              one list. They were three separate sections with a search field
              and an invite card between them. */}
          {loading ? (
            <div className="flex justify-center pt-8">
              <LoadingSpinner size="md" />
            </div>
          ) : (
            <>
              {/* Requests still need an answer, so they stay above, quietly. */}
              {pendingInvites.length > 0 && (
                <div>
                  <p
                    className="font-body uppercase"
                    style={{ fontSize: 11.5, letterSpacing: "0.2em", fontWeight: 700, color: "rgb(var(--rgb-text-muted))", marginBottom: 10 }}
                  >
                    {t("souls.pending_requests")}
                  </p>
                  <div className="space-y-2">
                    {pendingInvites.map(invite => (
                      <div
                        key={invite.invite_id}
                        className="flex items-center gap-3"
                        style={{
                          background: "rgb(var(--rgb-card))",
                          border: "1px solid rgb(var(--rgb-border))",
                          borderRadius: 18,
                          padding: "12px 15px",
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-body text-text-primary truncate" style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: "-.015em" }}>
                            {invite.requester.name}
                          </p>
                          <p className="font-body truncate" style={{ fontSize: 12, color: "rgb(var(--rgb-text-muted))", marginTop: 3 }}>
                            {invite.requester.sun_sign ? `☉ ${invite.requester.sun_sign}` : t("souls.wants_to_connect")}
                          </p>
                        </div>
                        <button
                          onClick={() => handleInviteResponse(invite.invite_id, true)}
                          className="font-body shrink-0"
                          style={{
                            border: "1.5px solid rgb(var(--rgb-text-primary))", borderRadius: 999,
                            background: "rgb(var(--rgb-text-primary))", color: "rgb(var(--rgb-bg-deep))",
                            fontSize: 13, fontWeight: 700, padding: "8px 16px",
                          }}
                        >
                          {t("souls.accept")}
                        </button>
                        <button
                          onClick={() => handleInviteResponse(invite.invite_id, false)}
                          aria-label={t("souls.decline")}
                          className="sol-ico shrink-0"
                          style={{ width: 28, height: 28 }}
                        >
                          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                            <path d="M5 5l10 10M15 5L5 15" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p
                  className="font-body uppercase"
                  style={{ fontSize: 11.5, letterSpacing: "0.2em", fontWeight: 700, color: "rgb(var(--rgb-text-muted))" }}
                >
                  {t("souls.connections")}
                </p>

                {connectionCards.length > 0 ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                    {connectionCards.map((c) => (
                      <button
                        key={c.key}
                        type="button"
                        onClick={c.onOpen}
                        className="active:scale-[0.98] transition-transform"
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-start",
                          textAlign: "left",
                          gap: 7,
                          padding: "14px 15px",
                          borderRadius: 18,
                          background: "rgb(var(--rgb-card))",
                          border: "1px solid rgb(var(--rgb-border))",
                          boxShadow: "0 8px 20px rgb(var(--rgb-scrim) / .06)",
                          minWidth: 0,
                        }}
                      >
                        {c.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={c.photo}
                            alt=""
                            style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover", flex: "0 0 auto" }}
                          />
                        ) : (
                          <span
                            aria-hidden
                            style={{
                              width: 11, height: 11, borderRadius: "50%", boxSizing: "border-box", flex: "0 0 auto",
                              border: "1.5px solid rgb(var(--rgb-text-primary) / .24)",
                              background: c.connected ? "rgb(var(--rgb-amber))" : "none",
                              borderColor: c.connected ? "rgb(var(--rgb-amber))" : "rgb(var(--rgb-text-primary) / .24)",
                              marginTop: 5, marginBottom: 5,
                            }}
                          />
                        )}
                        <b
                          className="font-heading text-text-primary"
                          style={{
                            fontSize: 15.5, fontWeight: 700, letterSpacing: "-.015em",
                            display: "block", width: "100%", overflow: "hidden",
                            textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}
                        >
                          {c.name}
                        </b>
                        <em
                          className="font-body"
                          style={{
                            fontStyle: "normal", fontSize: 12, color: "rgb(var(--rgb-text-muted))",
                            display: "block", width: "100%", overflow: "hidden",
                            textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}
                        >
                          {c.detail}
                        </em>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="font-body" style={{ fontSize: 15, lineHeight: 1.6, color: "rgb(var(--rgb-text-secondary))", marginTop: 12, maxWidth: "26em" }}>
                    {t("souls.no_connections")}
                  </p>
                )}

                {/* Finding someone new is an action, not a section with a title
                    and a field sitting open on the page. */}
                <button
                  type="button"
                  onClick={() => setSearchOpen((v) => !v)}
                  className="font-body"
                  style={{
                    background: "none", border: "none", padding: "14px 0 0",
                    fontSize: 13, color: "rgb(var(--rgb-text-muted))",
                    textDecoration: "underline", textUnderlineOffset: 3,
                    textDecorationColor: "rgb(var(--rgb-text-primary) / .2)",
                  }}
                >
                  {t("souls.find_a_soul")}
                </button>

                {searchOpen && (
                  <div style={{ marginTop: 12 }}>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => handleSearch(e.target.value)}
                      placeholder={t("souls.search_placeholder")}
                      autoFocus
                      className="w-full font-body text-text-primary"
                      style={{
                        background: "rgb(var(--rgb-card))",
                        border: "1px solid rgb(var(--rgb-border))",
                        borderRadius: 18,
                        padding: "13px 15px",
                        fontSize: 15,
                      }}
                    />
                    {searching && (
                      <div className="pt-3 flex justify-center"><LoadingSpinner size="sm" /></div>
                    )}
                    {searchResults.length > 0 && (
                      <div className="space-y-2" style={{ marginTop: 10 }}>
                        {searchResults.map(user => (
                          <div
                            key={user.id}
                            className="flex items-center gap-3"
                            style={{
                              background: "rgb(var(--rgb-card))",
                              border: "1px solid rgb(var(--rgb-border))",
                              borderRadius: 18,
                              padding: "12px 15px",
                            }}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-body text-text-primary truncate" style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: "-.015em" }}>
                                {user.name}
                              </p>
                              <p className="font-body truncate" style={{ fontSize: 12, color: "rgb(var(--rgb-text-muted))", marginTop: 3 }}>
                                {[user.sun_sign ? `☉ ${user.sun_sign}` : null, user.username ? `@${user.username}` : null].filter(Boolean).join("  ·  ")}
                              </p>
                            </div>
                            <button
                              onClick={() => handleSendInvite(user.username)}
                              disabled={sendingInvite === user.username}
                              className="font-body shrink-0 disabled:opacity-40"
                              style={{
                                border: "1.5px solid rgb(var(--rgb-text-primary))", borderRadius: 999,
                                background: "none", color: "rgb(var(--rgb-text-primary))",
                                fontSize: 13, fontWeight: 700, padding: "8px 16px",
                              }}
                            >
                              {sendingInvite === user.username ? "…" : t("souls.connect")}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
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

      {/* Off-screen Souls invite share card. Captured by html2canvas
          when the user taps the share icon in the SOULS header. The
          inviter name resolves to the auth context name first, then
          username as fallback, then a neutral "Someone" so the card
          never renders blank. */}
      <ShareOffscreenWrapper containerRef={inviteShareRef}>
        <SoulsInviteCard data={{ code: inviteInfo?.code }} />
      </ShareOffscreenWrapper>
    </ProtectedRoute>
  );
}

// ---------------------------------------------------------------------------
// Bond entry card, hero on the Souls page
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
  const { t } = useT();
  const lenses: { key: BondLens; label: string; hint: string }[] = [
    { key: "family",     label: t("souls.lens_family"),     hint: t("souls.lens_family_hint") },
    { key: "friendship", label: t("souls.lens_friendship"), hint: t("souls.lens_friendship_hint") },
    { key: "romantic",   label: t("souls.lens_romantic"),   hint: t("souls.lens_romantic_hint") },
    { key: "working",    label: t("souls.lens_working"),    hint: t("souls.lens_working_hint") },
  ];

  const isFamily   = lens === "family";
  const partner    = partners[0] ?? null;
  const chart      = partner ? partnerChart(partner) : null;
  const canAddMore = isFamily && partners.length < MAX_FAMILY_MEMBERS;

  return (
    <div
      className="rounded-3xl p-6 relative overflow-hidden"
      style={{
        background: "rgb(var(--rgb-card))",
        border: "1px solid rgb(var(--rgb-border))",
        boxShadow: "0 14px 34px rgb(var(--rgb-scrim) / 0.08)",
      }}
    >
      <p
        className="font-body uppercase mb-1"
        style={{ fontSize: 11.5, letterSpacing: "0.2em", fontWeight: 700, color: "rgb(var(--rgb-text-muted))" }}
      >
        {t("souls.dynamics")}
      </p>
      <h2 className="font-heading text-2xl text-text-primary leading-tight mb-5" style={{ fontWeight: 900, letterSpacing: "-0.01em" }}>
        {t("souls.where_charts_meet")}
      </h2>

      {/* You + partner(s) pills */}
      <div className="flex flex-wrap items-center gap-2 mb-5">

        {/* You, always fixed */}
        <div
          className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full shrink-0"
          style={{ background: "rgb(var(--rgb-text-primary) / 0.04)", border: "1px solid rgb(var(--rgb-text-primary) / 0.12)" }}
        >
          {myAvatar ? (
            <img src={myAvatar} alt="You" className="w-7 h-7 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-text-primary font-heading text-sm shrink-0"
                 style={{ background: "linear-gradient(135deg, rgb(var(--rgb-mist)), rgb(var(--rgb-mist)))" }}>
              {myName?.[0]?.toUpperCase() || "·"}
            </div>
          )}
          <span className="font-body text-[15px] text-text-primary">{t("souls.you")}</span>
        </div>

        {/* Selected partners */}
        {partners.map((p, i) => (
          <div
            key={i}
            className="flex items-center gap-1.5 pl-1 pr-1.5 py-1 rounded-full shrink-0"
            style={{ background: "rgba(74,46,158,0.08)", border: "1px solid rgba(74,46,158,0.45)" }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" className="text-indigo shrink-0" aria-hidden="true">
              <path d="M12 2c.42 4.95 2.05 6.58 7 7-4.95.42-6.58 2.05-7 7-.42-4.95-2.05-6.58-7-7 4.95-.42 6.58-2.05 7-7z" />
            </svg>
            {partnerPhoto(p) ? (
              <img src={partnerPhoto(p)!} alt={partnerName(p)} className="w-6 h-6 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-forest-border flex items-center justify-center font-heading text-xs text-text-primary shrink-0">
                {partnerInitial(p)}
              </div>
            )}
            <span className="font-body text-[15px] text-text-primary max-w-[80px] truncate">{partnerName(p)}</span>
            <button
              type="button"
              onClick={() => onRemovePartner(i)}
              className="w-4 h-4 rounded-full flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors shrink-0 ml-0.5"
              aria-label={t("souls.remove_name").replace("{name}", partnerName(p))}
            >
              ×
            </button>
          </div>
        ))}

        {/* Add button, always shown when no partners, or in family mode with room */}
        {(partners.length === 0 || canAddMore) && (
          <button
            type="button"
            onClick={onPickPartner}
            className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full shrink-0 transition-all hover:border-mist/60"
            style={{
              background: "transparent",
              border: "1px dashed rgb(var(--rgb-text-primary) / 0.25)",
            }}
          >
            {partners.length === 0 && (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" className="text-indigo shrink-0" aria-hidden="true">
                <path d="M12 2c.42 4.95 2.05 6.58 7 7-4.95.42-6.58 2.05-7 7-.42-4.95-2.05-6.58-7-7 4.95-.42 6.58-2.05 7-7z" />
              </svg>
            )}
            <div className="w-6 h-6 rounded-full flex items-center justify-center font-body text-[17px] text-text-secondary shrink-0"
                 style={{ border: "1px dashed rgb(var(--rgb-text-primary) / 0.25)" }}>+</div>
            <span className="font-body text-[15px] text-text-secondary">
              {partners.length === 0 ? t("souls.choose_someone") : isFamily ? t("souls.add_another") : ""}
            </span>
          </button>
        )}
      </div>

      {/* Chart whisper, only for single partner on non-family lenses */}
      {!isFamily && partner && chart && (chart.sun_sign || chart.hd_type) && (
        <p className="font-body text-[15px] text-text-secondary mb-5 -mt-2 pl-1">
          {chart.sun_sign && <>☉ {chart.sun_sign}</>}
          {chart.sun_sign && chart.hd_type && " · "}
          {chart.hd_type && (
            <>{chart.hd_type}{chart.hd_profile ? ` ${chart.hd_profile}` : ""}</>
          )}
        </p>
      )}

      {/* Lens pills */}
      <div className="mb-6">
        <p className="font-body text-[13px] tracking-[0.22em] uppercase text-text-secondary mb-2 font-bold">{t("souls.lens")}</p>
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
                  background: active ? "rgb(var(--rgb-indigo) / 0.15)" : "rgb(var(--rgb-card) / 0.6)",
                  border: active ? "1px solid rgb(var(--rgb-indigo) / 0.55)" : "1px solid rgb(var(--rgb-border))",
                  color: active ? "var(--text-primary)" : "var(--text-muted)",
                }}
                title={l.hint}
              >
                <span className="font-body text-[15px]">{l.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={onRead}
        disabled={partners.length === 0 || reading}
        className="w-full font-body transition-all active:scale-[0.98] disabled:opacity-35 disabled:cursor-not-allowed"
        style={{
          border: "1.5px solid rgb(var(--rgb-text-primary))",
          borderRadius: 999,
          background: "rgb(var(--rgb-text-primary))",
          color: "rgb(var(--rgb-bg-deep))",
          fontSize: 15,
          fontWeight: 700,
          letterSpacing: "0.06em",
          padding: 14,
        }}
      >
        {reading ? <LoadingSpinner size="sm" /> : isFamily && partners.length > 1 ? t("souls.read_family") : t("souls.read_dynamic")}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Partner picker, choose from saved people, connections, or add new
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
  const { t } = useT();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-forest-deep/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-forest-dark border-t border-forest-border rounded-t-3xl px-5 pt-5 pb-24 max-h-[92dvh] overflow-y-auto">
        <div className="w-10 h-1 bg-forest-border rounded-full mx-auto mb-5" />
        <h3 className="font-heading text-text-primary mb-4 px-1" style={{ fontSize: "1.1rem", fontWeight: 700 }}>{t("souls.choose_someone")}</h3>

        <button
          type="button"
          onClick={onAddNew}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl mb-4 transition-all"
          style={{
            background: "rgba(74,46,158,0.08)",
            border: "1px solid rgba(74,46,158,0.35)",
          }}
        >
          <div className="w-9 h-9 rounded-full flex items-center justify-center font-heading text-lg text-text-primary shrink-0"
               style={{ background: "linear-gradient(135deg, rgb(var(--rgb-mist)), rgb(var(--rgb-mist)))" }}>+</div>
          <div className="flex-1 text-left">
            <p className="font-body text-text-primary text-sm font-semibold">{t("souls.add_someone_new")}</p>
            <p className="font-body text-text-secondary text-[15px]">{t("souls.birth_data_local")}</p>
          </div>
        </button>

        {savedPeople.length > 0 && (
          <div className="mb-4">
            <p className="text-text-secondary text-[14px] font-body tracking-[0.22em] uppercase mb-2 px-1 font-bold">{t("souls.your_people")}</p>
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
                      <p className="text-text-secondary text-[15px] font-body truncate">
                        {p.profile.sun_sign && <>☉ {p.profile.sun_sign}</>}
                        {p.profile.sun_sign && p.profile.hd_type && " · "}
                        {p.profile.hd_type}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    aria-label={t("souls.remove_name").replace("{name}", p.name)}
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
            <p className="text-text-secondary text-[14px] font-body tracking-[0.22em] uppercase mb-2 px-1 font-bold">{t("souls.connections")}</p>
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
                    <p className="text-text-secondary text-[15px] font-body truncate">
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
            {t("souls.no_one_yet")}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add-person sheet, collects birth data, calls /souls/calculate-blueprint
// ---------------------------------------------------------------------------

interface AddPersonSheetProps {
  onClose: () => void;
  onAdded: (person: SavedPerson) => void;
}

function AddPersonSheet({ onClose, onAdded }: AddPersonSheetProps) {
  const { t } = useT();
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
    const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").trim();
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
        throw new Error(err.detail || t("souls.error_read_chart"));
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
        // We already had the data, we were just throwing it away.
        blueprint: data?.blueprint ?? undefined,
        created_at: Date.now(),
      };
      onAdded(person);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t("souls.error_drifted_short");
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
        <h3 className="font-heading text-text-primary mb-1" style={{ fontSize: "1.2rem", fontWeight: 700 }}>{t("souls.add_someone")}</h3>
        <p className="font-body text-text-secondary text-[15px] mb-5">{t("souls.add_someone_sub")}</p>

        <div className="space-y-4">
          <div>
            <label className="font-body text-[14px] tracking-[0.18em] uppercase text-text-secondary font-bold">{t("souls.label_name")}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("souls.name_placeholder")}
              className="w-full bg-transparent border-b border-forest-border text-text-primary font-body py-2 focus:outline-none focus:border-mist transition-colors"
            />
          </div>

          <div>
            <label className="font-body text-[14px] tracking-[0.18em] uppercase text-text-secondary mb-1 block font-bold">{t("souls.label_gender")}</label>
            <div className="grid grid-cols-2 gap-2">
              {(["female", "male"] as const).map((opt) => {
                const active = sex === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setSex(opt)}
                    className="py-2.5 rounded-xl transition-all font-body text-[15px]"
                    style={{
                      background: active ? "rgba(74,46,158,0.10)" : "transparent",
                      border: active ? "1px solid rgba(74,46,158,0.55)" : "1px solid rgb(var(--rgb-text-primary) / 0.12)",
                      color: active ? "var(--text-primary)" : "var(--text-muted)",
                    }}
                  >
                    {opt === "female" ? t("onboard.female") : t("onboard.male")}
                  </button>
                );
              })}
            </div>
          </div>

          {/* The same instrument the person set their own birth on. Two
              native pickers side by side made someone else's birth into two
              unrelated fields, and opened two modals on a phone. */}
          <div>
            <label className="font-body text-[14px] tracking-[0.18em] uppercase text-text-secondary font-bold" style={{ display: "block", marginBottom: 8 }}>
              {t("souls.label_birth_date")}
            </label>
            <BirthWheels
              date={birthDate}
              time={birthTime}
              timeDisabled={timeUnknown}
              onChange={(d, tm) => { setBirthDate(d); setBirthTime(tm); }}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              const next = !timeUnknown;
              setTimeUnknown(next);
              if (next) setBirthTime("12:00");
            }}
            className={`font-body text-[15px] tracking-wider transition-colors -mt-2 ${
              timeUnknown ? "text-indigo" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {timeUnknown ? t("onboard.time_using_noon") : t("souls.unknown_birth_time")}
          </button>

          <div>
            <label className="font-body text-[14px] tracking-[0.18em] uppercase text-text-secondary font-bold">{t("souls.label_birth_city")}</label>
            <div className="relative">
              <input
                ref={cityInputRef}
                type="text"
                value={birthCity}
                onChange={(e) => {
                  setBirthCity(e.target.value);
                  setShowSuggestions(true);
                }}
                placeholder={t("onboard.city_placeholder")}
                autoComplete="off"
                className="w-full bg-transparent border-b border-forest-border text-text-primary font-body py-2 focus:outline-none focus:border-mist transition-colors"
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
                      className="w-full text-left px-4 py-2.5 font-body text-[17px] text-text-primary hover:bg-white/5 transition-colors border-b border-forest-border/40 last:border-b-0"
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
            <p className="text-ember text-[15px] font-body">{error}</p>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="w-full py-3.5 rounded-xl font-body font-semibold text-[17px] tracking-[0.2em] uppercase transition-all disabled:opacity-30"
            style={{
              background: "linear-gradient(135deg, rgb(var(--rgb-mist)), rgb(var(--rgb-mist)))",
              color: "var(--text-primary)",
            }}
          >
            {submitting ? <LoadingSpinner size="sm" /> : t("souls.read_their_chart")}
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
  const { t } = useT();
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
            background: "linear-gradient(135deg, rgb(var(--rgb-mist)), rgb(var(--rgb-mist)))",
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
        <div className="flex-1 min-w-0">
          <h3 className="font-heading text-xl text-text-primary truncate">{soul.name}</h3>
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
                <span className="text-text-secondary text-xs font-body">@{soul.username}</span>
              </>
            )}
          </div>
        </div>
        <span className="text-xs font-body tracking-wider opacity-70 shrink-0 whitespace-nowrap pl-1" style={{ color: "rgb(var(--rgb-mist))" }}>
          {t("souls.open_arrow")}
        </span>
      </div>
    </button>
  );
}
