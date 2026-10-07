"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useAuth } from "@/lib/auth-context";
import { ShareOffscreenWrapper, SoulsInviteCard } from "@/components/ShareCard";
import { apiFetch, ApiError, detailCode, trackRequest } from "@/lib/api";
import { sendBirthRequest, type BirthFold, type FoldChoice } from "@/lib/birth-time-fold";
import BirthTimeFoldSheet from "@/components/BirthTimeFoldSheet";
import { captureAccount, getAuthGeneration, isStaleAccountError } from "@/lib/account-session";
import {
  absenceConfirmsDelete,
  deleteConfirmed,
  deletedHereIds,
  forgetSharingPermission,
  forPerson,
  hasSharingPermission,
  markDeletedHere,
  mergeSavedPeople,
  moveSharingPermission,
  needingPermission,
  nextSeq,
  noteDeleteAttempt,
  peopleToUpload,
  recordSharingPermission,
  rememberServerId,
  bindPersonWritesToAccount,
  serverIdOf,
  unmarkDeletedHere,
  wasDeletedHere,
  savedPersonFold,
  savedPersonForServer,
  savedPersonBirthCheck,
  hasQueuedWrites,
  recordPendingUpdate,
  settlePendingUpdate,
  pendingUpdateFor,
  pendingUpdateIds,
  prunePendingUpdates,
  overlayPendingUpdates,
} from "@/lib/saved-people-sync";
import { useT, fill } from "@/lib/i18n";
import { tx } from "@/lib/astro-i18n";
import { errorText } from "@/lib/errors";
import { useCityAutocomplete, type CitySuggestion } from "@/lib/city-search";
import { cardShareAvailable } from "@/lib/share-available";
import { Wordmark } from "@/components/Wordmark";
import BirthWheels from "@/components/BirthWheels";
import { accountKey } from "@/lib/account-session";

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
    // Whether their chart is shared with connections (false: name and
    // photo only), so nothing here promises a chart that is private.
    is_public?: boolean;
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
  // A birth time on a night the clocks went back happened twice: which one
  // the member chose. Also kept in the chart (blueprint.meta), which is how
  // it travels with the person to the server and other devices.
  birth_time_fold?: "first" | "second";
  // The server's clock-change check of the saved birth time (GET/POST
  // /saved-people): needs_confirmation asks the member which occurrence it
  // was (or to correct a time that never happened). Read-only, never sent.
  birth_time_check?: unknown;
  // Local bookkeeping, never sent: true once the server has confirmed it
  // holds this person. A confirmed person later missing from the server was
  // deleted on another device and must not be uploaded again.
  _synced?: boolean;
}

type BondLens = "romantic" | "friendship" | "working" | "family";
type BondPartner =
  | { kind: "saved"; person: SavedPerson }
  | { kind: "connection"; connection: ConnectedSoul };

const SAVED_PEOPLE_KEY = "solray_saved_people";

function loadSavedPeople(): SavedPerson[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(accountKey(SAVED_PEOPLE_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSavedPeople(people: SavedPerson[]) {
  try {
    localStorage.setItem(accountKey(SAVED_PEOPLE_KEY), JSON.stringify(people));
  } catch {
    // quota etc, fail quiet
  }
}

// Deletions the server has not confirmed yet (offline, or the request
// failed). Kept so the next sync finishes the delete instead of pulling the
// person back from the server.
const SAVED_TOMBSTONES_KEY = "solray_saved_people_deleted";
function loadTombstones(): Set<string> {
  try {
    const arr = JSON.parse(localStorage.getItem(accountKey(SAVED_TOMBSTONES_KEY)) || "[]");
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}
function writeTombstones(ids: Set<string>) {
  try { localStorage.setItem(accountKey(SAVED_TOMBSTONES_KEY), JSON.stringify(Array.from(ids))); } catch { /* ignore */ }
}
function addTombstone(id: string) { const t = loadTombstones(); t.add(id); writeTombstones(t); }
function dropTombstone(id: string) { const t = loadTombstones(); if (t.delete(id)) writeTombstones(t); }

// The chosen clock-change occurrence, the POST body, and the server's
// birth time check for a saved person (lib/saved-people-sync).
function savedFold(p: SavedPerson): "first" | "second" | undefined {
  return savedPersonFold(p);
}
function forServer(p: SavedPerson) {
  return savedPersonForServer(p);
}
function savedBirthCheck(p: SavedPerson) {
  return savedPersonBirthCheck(p);
}

// Who a Dynamics reading is with, for the chat request. The server loads
// a connection's chart itself and computes a synced saved person's chart
// from their stored birth details; a chart only rides along for a saved
// person the server has not confirmed yet (it recomputes from it).
function partnerSoulRef(p: BondPartner): { soulConnectionId?: string; savedPersonId?: string } {
  if (p.kind === "connection") return { soulConnectionId: p.connection.connection_id };
  return p.person._synced ? { savedPersonId: p.person.id } : {};
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
  // Ends the connection for both people (DELETE /souls/{connection_id}).
  // Resolves on success; rejects so the sheet can say it failed.
  onRemove: () => Promise<void>;
}

function SoulActions({ soul, onClose, onSoloReading, onViewProfile, onRemove }: SoulActionsProps) {
  const { t, lang } = useT();
  // Removing is permanent for both people, so it asks once more first.
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeFailed, setRemoveFailed] = useState(false);
  const doRemove = async () => {
    if (removing) return;
    setRemoving(true);
    setRemoveFailed(false);
    try {
      await onRemove();
    } catch {
      setRemoveFailed(true);
      setRemoving(false);
    }
  };
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
                <>☉ {tx(soul.soul.sun_sign, lang)}</>
              )}
              {soul.soul.sun_sign && soul.soul.hd_type && " · "}
              {tx(soul.soul.hd_type, lang)}
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
                <p className="font-body text-text-secondary text-[14px] mt-0.5">{t(soul.soul.is_public ? "souls.view_profile_sub" : "souls.view_profile_sub_private").replace("{name}", soul.soul.name)}</p>
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
          {!confirmRemove ? (
            <button
              onClick={() => { setConfirmRemove(true); setRemoveFailed(false); }}
              className="w-full text-left px-5 py-4 bg-forest-card border border-forest-border rounded-2xl transition-all hover:border-mist/30"
              style={{ minHeight: 44 }}
            >
              <p className="font-body text-text-primary font-semibold text-[17px]">{t("souls.remove_connection")}</p>
              <p className="font-body text-text-secondary text-[14px] mt-0.5">{fill(t("souls.remove_connection_sub"), { name: soul.soul.name })}</p>
            </button>
          ) : (
            <div className="px-5 py-4 bg-forest-card border border-forest-border rounded-2xl" role="alertdialog" aria-live="polite">
              <p className="font-body text-text-primary font-semibold text-[17px]">{fill(t("souls.remove_confirm_title"), { name: soul.soul.name })}</p>
              <p className="font-body text-text-secondary text-[14px] mt-1" style={{ lineHeight: 1.5 }}>{t("souls.remove_confirm_body")}</p>
              {removeFailed && (
                <p className="font-body text-[14px] mt-2" style={{ color: "rgb(var(--rgb-text-primary))" }}>{t("souls.remove_connection_failed")}</p>
              )}
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => { setConfirmRemove(false); setRemoveFailed(false); }}
                  disabled={removing}
                  className="flex-1 py-3 rounded-full border border-forest-border font-body text-[14px] text-text-secondary"
                  style={{ minHeight: 44 }}
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={doRemove}
                  disabled={removing}
                  className="flex-1 py-3 rounded-full font-body text-[14px] font-bold"
                  style={{ minHeight: 44, background: "rgb(var(--rgb-text-primary))", color: "rgb(var(--rgb-bg-deep))", opacity: removing ? 0.6 : 1 }}
                >
                  {t("souls.remove_confirm_yes")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


// Main page
export default function SoulsPage() {
  const { token, user } = useAuth();
  const { t, lang } = useT();
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
  const [shareOk, setShareOk] = useState(false);
  const [shareError, setShareError] = useState(false);
  useEffect(() => { setShareOk(cardShareAvailable()); }, []);
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
    setShareError(false);
    try {
      const { shareOrDownloadCard } = await import("@/lib/share-card");
      const link = inviteInfo?.link || "https://solray.ai";
      await shareOrDownloadCard({
        node: inviteShareRef.current,
        filename: "solray-invite.png",
        title: t("souls.invite_share_title"),
        text: t("souls.invite_share_text").replace("{link}", link),
      });
    } catch (err) {
      console.warn("[share] souls invite failed", err);
      setShareError(true);
    } finally {
      setInviteSharing(false);
    }
  };
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  // A failed search is not the same as "no one found": say which it was.
  const [searchFailed, setSearchFailed] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
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
  // Load failure is separate from the transient action errors above: it
  // stays on screen until the member retries, and it never wipes data that
  // did load (each call is settled on its own).
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [retryingLoad, setRetryingLoad] = useState(false);

  // False once the member has left Souls: work that lands later (a chart
  // recalculation) must not navigate or write from a screen that is gone.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Quick Bond state, hybrid local-chart flow
  const [savedPeople, setSavedPeople] = useState<SavedPerson[]>([]);
  const [bondPartners, setBondPartners] = useState<BondPartner[]>([]);
  // Saved people as the server confirmed them, by the id they were added
  // under. Set as soon as a save lands (before React renders it), so a
  // reading started right after still names the confirmed person.
  const confirmedPeopleRef = useRef(new Map<string, SavedPerson>());
  const confirmedPartner = (p: BondPartner): BondPartner =>
    p.kind === "saved" && !p.person._synced && confirmedPeopleRef.current.has(p.person.id)
      ? { kind: "saved", person: confirmedPeopleRef.current.get(p.person.id) as SavedPerson }
      : p;
  const [bondLens, setBondLens] = useState<BondLens>("family");
  const [partnerPickerOpen, setPartnerPickerOpen] = useState(false);
  const [addPersonOpen, setAddPersonOpen] = useState(false);
  const [readingBond, setReadingBond] = useState(false);
  // Saved people in the reading the member has not yet confirmed permission
  // for (saved before the question existed, or on another device).
  const [permissionAsk, setPermissionAsk] = useState<SavedPerson[] | null>(null);

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
      // allSettled, not all: one failing call used to throw away the two
      // that succeeded and leave an empty list that looked like "no souls".
      const [meR, pendingR, soulsR] = await Promise.allSettled([
        apiFetch("/users/me", {}, token),
        apiFetch("/souls/pending", {}, token),
        apiFetch("/souls", {}, token),
      ]);
      if (meR.status === "fulfilled") {
        const me = meR.value;
        setMyUsername(me?.profile?.username || null);
        const serverPhoto = me?.profile?.profile_photo || null;
        const localPhoto = (() => { try { return localStorage.getItem(accountKey("solray_avatar")); } catch { return null; } })();
        setMyAvatar(serverPhoto || localPhoto);
      }
      if (pendingR.status === "fulfilled") setPendingInvites(pendingR.value?.pending || []);
      if (soulsR.status === "fulfilled") setConnectedSouls(dedupeSouls(soulsR.value?.souls || []));
      setLoadError(pendingR.status === "rejected" || soulsR.status === "rejected");
      setLoading(false);
      setRetryingLoad(false);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, loadAttempt]);

  // Sync saved people with the server so they survive reinstalls and follow the
  // user across devices. The server is the source of truth; people that only
  // exist locally (created before server persistence, or while offline) are
  // migrated up once, but only people the member has confirmed permission
  // for. Falls back silently to the localStorage copy if offline.
  //
  // Every write for one person goes through forPerson (one at a time, in
  // order), and anything removed on this device stays removed even if a
  // list read or a save started before the removal finishes after it.
  const [peopleSyncNonce, setPeopleSyncNonce] = useState(0);
  useEffect(() => {
    bindPersonWritesToAccount(getAuthGeneration());
  }, [token]);
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    // Every write below belongs to this account; one whose turn comes after
    // a sign-out is never sent (lib/saved-people-sync forPerson).
    const acct = captureAccount();
    const gen = acct.generation;
    (async () => {
      try {
        // 1. Finish deletions made offline or that failed earlier.
        for (const id of Array.from(loadTombstones())) {
          noteDeleteAttempt(id);
          try {
            const r = await forPerson(id, gen, () => apiFetch(`/saved-people/${serverIdOf(id)}`, { method: "DELETE" }, token, { generation: gen }));
            acct.check();
            if (deleteConfirmed(r)) { dropTombstone(id); forgetSharingPermission(id); }
          } catch (e) {
            if (isStaleAccountError(e)) throw e;
            if (e instanceof ApiError && e.status === 404) dropTombstone(id);
          }
        }
        const listStartedAt = nextSeq();
        const res = await apiFetch("/saved-people", {}, token);
        const listed: SavedPerson[] = (Array.isArray(res?.people) ? res.people : [])
          .map((p: SavedPerson) => ({ ...p, _synced: true }));
        const listedIds = new Set(listed.map((p) => p.id));
        // A tombstone whose delete was not confirmed is finished once a list
        // read that began after the delete no longer has the person.
        for (const id of Array.from(loadTombstones())) {
          if (absenceConfirmsDelete(id, listStartedAt, listedIds)) { dropTombstone(id); forgetSharingPermission(id); }
        }
        // Removed here (even if the server has confirmed it since this list
        // was read): never merged back.
        const gone = () => new Set([...Array.from(loadTombstones()), ...Array.from(deletedHereIds())]);
        const server = listed.filter((p) => !gone().has(p.id));
        const serverIds = new Set(server.map((p) => p.id));
        // 1b. Changes to people the server holds that it has not confirmed
        //     yet (a birth-time confirmation whose save failed): sent again
        //     now, before the server's copy is taken. One still unconfirmed
        //     is shown in place of the server's older copy and retried on
        //     the next sync; one for a person the server no longer holds is
        //     dropped.
        prunePendingUpdates(serverIds);
        const refreshed = new Map<string, SavedPerson>();
        for (const id of pendingUpdateIds()) {
          const pend = pendingUpdateFor<SavedPerson>(id);
          if (!pend) continue;
          try {
            const r = await forPerson(id, gen, async () => {
              if (wasDeletedHere(id) || loadTombstones().has(id)) return null;
              return apiFetch("/saved-people", { method: "POST", body: JSON.stringify(forServer({ ...pend.person, id })) }, token, { generation: gen });
            });
            acct.check();
            const raw = r?.person as SavedPerson | undefined;
            if (raw && raw.id === id) {
              settlePendingUpdate(id, pend.stamp);
              refreshed.set(id, { ...raw, _synced: true });
            }
          } catch (e) {
            if (isStaleAccountError(e)) throw e;
            /* offline / error: still pending, retried next load */
          }
        }
        const serverNow = overlayPendingUpdates(server.map((p) => refreshed.get(p.id) || p));
        // 2. Upload only people this device created, the server has never
        //    confirmed, and the member has confirmed permission for. A
        //    confirmed person missing from the server was deleted on another
        //    device: it is dropped here, not re-created.
        const local = loadSavedPeople();
        const toMigrate = peopleToUpload(local, serverIds, gone()).filter((p) => hasSharingPermission(p.id));
        const migrated: SavedPerson[] = [];
        const idRemap: Record<string, string> = {};
        for (const p of toMigrate) {
          try {
            const r = await forPerson(p.id, gen, async () => {
              // Removed while waiting its turn: do not create it.
              if (wasDeletedHere(p.id) || loadTombstones().has(p.id)) return null;
              return apiFetch("/saved-people", { method: "POST", body: JSON.stringify(forServer(p)) }, token, { generation: gen });
            });
            acct.check();
            if (r?.person) {
              const sp = { ...(r.person as SavedPerson), _synced: true };
              if (sp.id && sp.id !== p.id) {
                rememberServerId(p.id, sp.id);
                moveSharingPermission(p.id, sp.id);
                idRemap[p.id] = sp.id;
              }
              // Removed while the save ran: the delete queued behind it
              // removes it from the server; it is not shown again.
              if (!wasDeletedHere(p.id)) migrated.push(sp);
            }
          } catch (e) {
            if (isStaleAccountError(e)) throw e;
            /* offline / error: the local copy stays and is retried next load */
          }
        }
        if (cancelled || !acct.live) return;
        const replacedIds = new Set(Object.keys(idRemap));
        const confirmed = [...migrated, ...serverNow].filter((p) => !gone().has(p.id));
        const confirmedIds = new Set(confirmed.map((p) => p.id));
        // 3. Merge against the CURRENT list, not the snapshot read above, so a
        //    person added or removed while this sync ran is respected.
        setSavedPeople((prev) => {
          const final = mergeSavedPeople(prev, confirmed, replacedIds, gone());
          writeSavedPeople(final);
          return final;
        });
        // Selected bond partners take the confirmed person (the server's id
        // when it minted one, and _synced either way), so a reading names
        // them by id and the conversation keeps its partner on every device.
        const byId = new Map(confirmed.map((p) => [p.id, p] as const));
        for (const [from, to] of Object.entries(idRemap)) {
          const np = byId.get(to);
          if (np) confirmedPeopleRef.current.set(from, np);
        }
        for (const p of confirmed) confirmedPeopleRef.current.set(p.id, p);
        setBondPartners(prev => prev.map(bp => {
          if (bp.kind !== "saved") return bp;
          const np = byId.get(idRemap[bp.person.id] || bp.person.id);
          return np && np !== bp.person ? { kind: "saved", person: np } : bp;
        }));
        // Partners removed on another device leave the bond too.
        setBondPartners(prev => prev.filter(bp => bp.kind !== "saved" || confirmedIds.has(bp.person.id) || !bp.person._synced));
      } catch {
        // offline or error: keep whatever localStorage already gave us
      }
    })();
    return () => { cancelled = true; };
  }, [token, peopleSyncNonce]);

  // Debounced search, avoid firing /users/search on every keystroke
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Only the latest search may write results (older responses are ignored).
  const searchSeqRef = useRef(0);
  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const seq = ++searchSeqRef.current;
    setSearchFailed(false);
    setSearchDone(false);
    if (!q || q.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const data = await apiFetch(`/users/search?q=${encodeURIComponent(q)}`, {}, token);
        if (seq !== searchSeqRef.current) return;
        setSearchResults(data?.results || []);
        setSearchDone(true);
      } catch {
        if (seq !== searchSeqRef.current) return;
        setSearchResults([]);
        setSearchFailed(true);
      } finally {
        if (seq === searchSeqRef.current) setSearching(false);
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
    // The chat names the connection; the server loads their chart itself
    // (and says so plainly if they keep it private or have not agreed to
    // AI processing). No chart travels through the app.

    // The member's own opening line in the chat, so in their language.
    const chartSummary = [
      soul.soul.sun_sign && fill(t("souls.compat_sun_in"), { sign: tx(soul.soul.sun_sign, lang) }),
      soul.soul.moon_sign && fill(t("souls.compat_moon_in"), { sign: tx(soul.soul.moon_sign, lang) }),
      soul.soul.hd_type && fill(t("souls.compat_hd"), { type: tx(soul.soul.hd_type, lang) }),
    ].filter(Boolean).join(", ");

    const introMessage = chartSummary
      ? fill(t("souls.compat_intro_chart"), { name: soul.soul.name, chart: chartSummary })
      : fill(t("souls.compat_intro"), { name: soul.soul.name });

    sessionStorage.setItem("solray_compat_context", JSON.stringify({
      soulName: soul.soul.name,
      introMessage,
      soulConnectionId: soul.connection_id,
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
      detail: [c.soul.sun_sign ? `☉ ${tx(c.soul.sun_sign, lang)}` : null, c.soul.hd_type ? tx(c.soul.hd_type, lang) : null]
        .filter(Boolean)
        .join(" · ") || t("souls.connected"),
      onOpen: () => setActiveSoul(c),
    })),
    ...savedPeople.map((person) => ({
      key: `saved-${person.id}`,
      name: person.name,
      photo: null as string | null,
      connected: false,
      detail: [person.profile?.sun_sign ? `☉ ${tx(person.profile.sun_sign, lang)}` : null, person.profile?.hd_type ? tx(person.profile.hd_type, lang) : null]
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
    // The sheet only adds someone once the member has confirmed that
    // person's permission; recorded per person.
    recordSharingPermission([person.id]);
    // Persist to the server so the person survives reinstalls and syncs across
    // devices. Optimistic above; reconcile the id if the server minted its own.
    if (token) {
      // Queued under this account: never sent, and its answer never
      // applied, once the account has changed.
      const acct = captureAccount();
      const gen = acct.generation;
      (async () => {
        try {
          const r = await forPerson(person.id, gen, async () => {
            // Removed before the save got its turn: do not create it.
            if (wasDeletedHere(person.id)) return null;
            return apiFetch("/saved-people", {
              method: "POST",
              body: JSON.stringify(forServer(person)),
            }, token, { generation: gen });
          });
          if (!acct.live) return;
          const raw = r?.person as SavedPerson | undefined;
          const saved = raw ? { ...raw, _synced: true } : undefined;
          if (saved && saved.id && saved.id !== person.id) {
            rememberServerId(person.id, saved.id);
            moveSharingPermission(person.id, saved.id);
          }
          if (saved && saved.id) confirmedPeopleRef.current.set(person.id, saved);
          // Removed while the save ran: the delete queued behind it takes it
          // off the server again; nothing is put back on screen.
          if (wasDeletedHere(person.id)) return;
          if (saved && saved.id) {
            // Confirmed by the server (with its own id, if it minted one).
            setSavedPeople(prev => {
              if (!prev.some(p => p.id === person.id)) return prev; // removed meanwhile
              const updated = prev.map(p => (p.id === person.id ? saved : p));
              writeSavedPeople(updated);
              return updated;
            });
          }
          // Every successful save, the id changed or not: the selected
          // partner becomes the confirmed person, so a reading names them by
          // id (savedPersonId) and the conversation records who it is with.
          if (saved && saved.id) {
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

  // An existing saved person whose birth time fell on a clock-change night
  // (the server's birth_time_check.needs_confirmation): ask which occurrence
  // it was with the same chooser as signup, redraw the chart with it, and
  // save the choice back (top-level birth_time_fold) so every device and
  // every later recalculation uses it. A time that never happened cannot be
  // chosen; the member is told to add the person again with the right time.
  const [savedFoldAsk, setSavedFoldAsk] = useState<{ options: FoldChoice[]; resolve: (f: BirthFold | null) => void } | null>(null);
  const confirmSavedBirthTime = async (person: SavedPerson) => {
    const check = savedBirthCheck(person);
    if (!check.needsConfirmation) return;
    setErrorMessage(null);
    if (check.status === "nonexistent" || check.options.length === 0) {
      setErrorMessage(fill(t("souls.birth_check_nonexistent"), { name: person.name }));
      return;
    }
    const fold = await new Promise<BirthFold | null>((resolve) => setSavedFoldAsk({ options: check.options, resolve }));
    if (!fold) return;
    const acct = captureAccount();
    const gen = acct.generation;
    const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").trim();
    try {
      const { ok, data } = await trackRequest(async () => {
        const res = await fetch(`${apiUrl}/souls/calculate-blueprint`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: person.name,
            sex: person.sex,
            birth_date: person.birth_date,
            birth_time: person.birth_time,
            birth_city: person.birth_city,
            birth_time_fold: fold,
          }),
        });
        return { ok: res.ok, data: res.ok ? await res.json() : null };
      });
      if (!acct.live) return;
      if (!ok || !data?.blueprint) {
        setErrorMessage(t("souls.birth_check_failed"));
        return;
      }
      const updated: SavedPerson = {
        ...person,
        profile: {
          sun_sign: data?.profile?.sun_sign ?? person.profile.sun_sign,
          hd_type: data?.profile?.hd_type ?? person.profile.hd_type,
          hd_profile: data?.profile?.hd_profile ?? person.profile.hd_profile,
        },
        blueprint: data.blueprint,
        birth_time_fold: fold,
        birth_time_check: data?.birth_time_check,
      };
      const apply = (next: SavedPerson) => {
        setSavedPeople((prev) => {
          if (!prev.some((p) => p.id === person.id)) return prev; // removed meanwhile
          const list = prev.map((p) => (p.id === person.id ? next : p));
          writeSavedPeople(list);
          return list;
        });
        setBondPartners((prev) => prev.map((bp) =>
          bp.kind === "saved" && bp.person.id === person.id ? { kind: "saved", person: next } : bp));
      };
      apply(updated);
      // Kept on this device until the server confirms it: if the save below
      // fails, the next sync sends it again instead of taking the server's
      // older copy over it.
      const stamp = recordPendingUpdate(updated);
      if (!token) return;
      const r = await forPerson(person.id, gen, async () => {
        if (wasDeletedHere(person.id)) return null;
        return apiFetch("/saved-people", { method: "POST", body: JSON.stringify(forServer(updated)) }, token, { generation: gen });
      });
      if (!acct.live || wasDeletedHere(person.id)) return;
      const raw = r?.person as SavedPerson | undefined;
      if (raw && raw.id === person.id) {
        settlePendingUpdate(person.id, stamp);
        const saved = { ...raw, _synced: true };
        confirmedPeopleRef.current.set(person.id, saved);
        apply(saved);
      } else {
        setErrorMessage(t("souls.birth_check_failed"));
      }
    } catch (e) {
      if (isStaleAccountError(e) || !acct.live) return;
      // Offline or refused: the choice stays here, in the chart and in the
      // pending updates, and is sent again on the next sync.
      setErrorMessage(t("souls.birth_check_failed"));
    }
  };

  const handlePersonRemove = (id: string) => {
    const removedIdx = savedPeople.findIndex((p) => p.id === id);
    const removed = removedIdx >= 0 ? savedPeople[removedIdx] : null;
    const next = savedPeople.filter((p) => p.id !== id);
    setSavedPeople(next);
    writeSavedPeople(next);
    setBondPartners(prev => prev.filter(p => !(p.kind === "saved" && p.person.id === id)));
    setErrorMessage(null);
    if (token) {
      // Recorded until the server confirms, so a sync running right now (or
      // another device's copy) cannot bring the person back.
      addTombstone(id);
      markDeletedHere(id);
      noteDeleteAttempt(id);
      // After any save still on its way for this person, and against the id
      // the server ended up giving them. Bound to this account: never sent
      // (and its answer never applied) after a sign-out.
      const acct = captureAccount();
      const gen = acct.generation;
      forPerson(id, gen, () => apiFetch(`/saved-people/${serverIdOf(id)}`, { method: "DELETE" }, token, { generation: gen }))
        .then((r: unknown) => {
          if (!acct.live) return;
          // {ok:true}: gone. {ok:false}: the server did not remove anything
          // (it never had the person, or the delete failed there). The
          // tombstone stays, the delete is retried on the next sync, and it
          // is dropped once the server's list shows the person is not there.
          if (deleteConfirmed(r)) { dropTombstone(id); forgetSharingPermission(id); }
        })
        .catch((e: unknown) => {
          if (isStaleAccountError(e) || !acct.live) return;
          // 404: the server never had it (local-only person), so it is gone.
          if (e instanceof ApiError && e.status === 404) { dropTombstone(id); forgetSharingPermission(id); return; }
          // No answer (offline): the tombstone stays and the next sync
          // finishes the delete. The person stays removed here.
          if (!(e instanceof ApiError)) return;
          dropTombstone(id);
          unmarkDeletedHere(id);
          // The server refused: the delete did not happen, put the person back.
          if (removed) {
            setSavedPeople((prev) => {
              if (prev.some((p) => p.id === id)) return prev;
              const restored = [...prev];
              restored.splice(Math.min(removedIdx, restored.length), 0, removed);
              writeSavedPeople(restored);
              return restored;
            });
          }
          setErrorMessage(t("souls.remove_failed"));
        });
    }
  };

  // Fire the Bond reading, route to /chat?compat=1 with context
  const readTheBond = async () => {
    if (bondPartners.length === 0) return;
    // Every saved person in the reading needs the member's confirmed
    // permission before their birth details go to Solray and its AI
    // providers (their chart, and their summary in a family reading).
    const unconfirmed = needingPermission(
      bondPartners.flatMap((p) => (p.kind === "saved" ? [p.person] : [])),
    );
    if (unconfirmed.length > 0) {
      setPermissionAsk(unconfirmed);
      return;
    }
    // Everything below (a chart recalculation, the cache write, the handoff
    // to chat) belongs to the account signed in now. If that changes or the
    // member leaves Souls while it runs, nothing is written and no one is
    // sent anywhere.
    const acct = captureAccount();
    const stillHere = () => acct.live && mountedRef.current;
    const abandon = () => { if (mountedRef.current) setReadingBond(false); };
    setReadingBond(true);
    setErrorMessage(null);

    // A person added a moment ago may still be on the way to the server:
    // wait for that save, so the reading names them by their confirmed id
    // (and the conversation keeps its partner on the member's other
    // devices). Offline, the reading goes ahead with their chart and the
    // id is written into the conversation once the save lands.
    const pendingSaves = bondPartners.filter((p) => p.kind === "saved" && !p.person._synced && hasQueuedWrites(p.person.id));
    if (pendingSaves.length > 0) {
      await Promise.all(pendingSaves.map((p) =>
        p.kind === "saved" ? forPerson(p.person.id, acct.generation, async () => null).catch(() => null) : null));
      if (!stillHere()) return abandon();
    }
    const partners = bondPartners.map(confirmedPartner);
    // A saved person still unconfirmed: their local id travels along.
    const localIdOf = (p: BondPartner) => (p.kind === "saved" && !p.person._synced ? p.person.id : null);

    // The opening question is shown in the chat as the member's own words,
    // so it is written in their language.
    const lensLabel = t(
      bondLens === "romantic"   ? "souls.bond_lens_romantic"
      : bondLens === "friendship" ? "souls.bond_lens_friendship"
      : bondLens === "family"     ? "souls.bond_lens_family"
      : "souls.bond_lens_work");
    const term = (v: string) => (lang === "en" ? v : tx(v, lang));
    const summarize = (chart: { sun_sign: string | null; hd_type: string | null; hd_profile: string | null }) => [
      chart.sun_sign && fill(t("souls.bond_sun_in"), { sign: term(chart.sun_sign) }),
      chart.hd_type  && fill(t("souls.bond_hd"), { type: term(chart.hd_type) + (chart.hd_profile ? ` ${chart.hd_profile}` : "") }),
    ].filter(Boolean).join(", ");

    // Family with multiple people: build a group context
    if (bondLens === "family" && partners.length > 1) {
      const lines: string[] = [];
      let primaryBlueprint: unknown = null;
      // The family reading's focal person is the first partner.
      const primaryRef = partnerSoulRef(partners[0]);

      for (const p of partners) {
        const chart = partnerChart(p);
        const name  = partnerName(p);
        const summary = summarize(chart);
        lines.push(`${name}: ${summary || t("souls.bond_no_chart")}`);

        // Same priority order as single-partner: connection > cached
        // saved blueprint > fall through. We only need ONE primary
        // blueprint for the chat (it's the focal lens for the whole
        // family reading); the rest of the family's charts stay in
        // the summary-line text.
        if (!primaryBlueprint && p === partners[0] && p.kind === "saved" && p.person.blueprint) {
          primaryBlueprint = p.person.blueprint;
        }
      }

      const names = partners.map(partnerName);
      const nameList = names.length === 2
        ? names.join(t("souls.bond_and"))
        : `${names.slice(0, -1).join(", ")}${t("souls.bond_and_last")}${names[names.length - 1]}`;

      const introMessage = fill(t("souls.bond_family_intro"), { names: nameList, charts: lines.join("; ") });

      sessionStorage.setItem("solray_compat_context", JSON.stringify({
        soulName: nameList,
        introMessage,
        soulBlueprint: primaryBlueprint,
        ...primaryRef,
        localPersonId: localIdOf(partners[0]),
        lens: bondLens,
      }));

      if (!stillHere()) return abandon();
      setReadingBond(false);
      router.push("/chat?compat=1");
      return;
    }

    // Single partner reading (all non-family lenses, or family with one person)
    const bondPartner = partners[0];
    const chart  = partnerChart(bondPartner);
    const pName  = partnerName(bondPartner);

    const chartSummary = summarize(chart);

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
    // A connection's chart is loaded by the server (soulConnectionId).
    if (bondPartner.kind === "saved") {
      const saved = bondPartner.person;
      if (saved.blueprint) {
        soulBlueprint = saved.blueprint;
      } else {
        // Back-compat: people saved before we cached the full blueprint.
        // Recompute on the fly. Slow (~2-3s) but only happens once per
        // legacy person, we re-store the blueprint after.
        try {
          const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").trim();
          const { ok, data } = await trackRequest(async () => {
            const res = await fetch(`${apiUrl}/souls/calculate-blueprint`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: saved.name,
                sex: saved.sex,
                birth_date: saved.birth_date,
                birth_time: saved.birth_time,
                birth_city: saved.birth_city,
                birth_time_fold: savedFold(saved),
              }),
            });
            return { ok: res.ok, data: res.ok ? await res.json() : null };
          });
          if (!stillHere()) return abandon();
          if (ok) {
            soulBlueprint = data?.blueprint || null;
            // Persist for next time so this user doesn't pay the cost again.
            // Against the CURRENT list: the snapshot this function started
            // with may be out of date by now (a sync or a removal ran).
            if (soulBlueprint) {
              setSavedPeople((prev) => {
                if (!prev.some((p) => p.id === saved.id)) return prev;
                const next = prev.map((p) =>
                  p.id === saved.id ? { ...p, blueprint: soulBlueprint } : p
                );
                writeSavedPeople(next);
                return next;
              });
            }
          }
        } catch {
          if (!stillHere()) return abandon();
          setErrorMessage(t("souls.error_partial_chart"));
        }
      }
    }

    const introMessage = chartSummary
      ? fill(t("souls.bond_intro_chart"), { lens: lensLabel, name: pName, chart: chartSummary })
      : fill(t("souls.bond_intro"), { lens: lensLabel, name: pName });

    if (!stillHere()) return abandon();
    sessionStorage.setItem("solray_compat_context", JSON.stringify({
      soulName: pName,
      introMessage,
      soulBlueprint,
      ...partnerSoulRef(bondPartner),
      localPersonId: localIdOf(bondPartner),
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
              {shareOk && <button
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
              </button>}
            </span>
          </div>
          <div style={{ height: 1, background: "rgb(var(--rgb-border))", marginTop: 12 }} />
          <p
            className="font-body uppercase"
            style={{ fontSize: 11, letterSpacing: "0.3em", color: "rgb(var(--rgb-text-muted))", marginTop: 12 }}
          >
            {t("souls.your_field")}
          </p>
          {shareError && (
            <p role="status" className="font-body" style={{ fontSize: 13, marginTop: 8, color: "rgb(var(--rgb-text-muted))" }}>
              {t("common.share_failed")}
            </p>
          )}
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

          {loadError && (
            <div style={{ borderTop: "1px solid rgb(var(--rgb-border))", paddingTop: 16 }}>
              <p className="font-body" style={{ fontSize: 15, lineHeight: 1.55, color: "rgb(var(--rgb-ember))", marginBottom: 14 }}>
                {t("souls.error_field")}
              </p>
              <button
                onClick={() => { setRetryingLoad(true); setLoadAttempt((n) => n + 1); }}
                disabled={retryingLoad}
                className="w-full py-4 px-8 rounded-full text-[14px] tracking-[0.3em] uppercase font-bold disabled:opacity-50"
                style={{ background: "transparent", color: "rgb(var(--rgb-text-secondary))", border: "1px solid rgb(var(--rgb-border))" }}
              >
                {retryingLoad ? t("common.loading") : t("common.retry")}
              </button>
            </div>
          )}

          {errorMessage && !loadError && (
            <p className="font-body" role="status" style={{ fontSize: 15, lineHeight: 1.55, color: "rgb(var(--rgb-ember))" }}>
              {errorMessage}
            </p>
          )}

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
                            {invite.requester.sun_sign ? `☉ ${tx(invite.requester.sun_sign, lang)}` : t("souls.wants_to_connect")}
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
                    {!searching && searchFailed && (
                      <p role="alert" className="font-body pt-3" style={{ fontSize: 14, color: "rgb(var(--rgb-ember))" }}>
                        {t("souls.search_failed")}
                      </p>
                    )}
                    {!searching && searchDone && !searchFailed && searchResults.length === 0 && (
                      <p className="font-body pt-3" style={{ fontSize: 14, color: "rgb(var(--rgb-text-muted))" }}>
                        {t("souls.no_users_found")}
                      </p>
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
                                {[user.sun_sign ? `☉ ${tx(user.sun_sign, lang)}` : null, user.username ? `@${user.username}` : null].filter(Boolean).join("  ·  ")}
                              </p>
                            </div>
                            <button
                              onClick={() => { if (!inviteSent.has(user.username)) handleSendInvite(user.username); }}
                              disabled={sendingInvite === user.username || inviteSent.has(user.username)}
                              className="font-body shrink-0 disabled:opacity-40"
                              style={{
                                border: "1.5px solid rgb(var(--rgb-text-primary))", borderRadius: 999,
                                background: "none", color: "rgb(var(--rgb-text-primary))",
                                fontSize: 13, fontWeight: 700, padding: "8px 16px",
                              }}
                            >
                              {sendingInvite === user.username
                                ? "…"
                                : inviteSent.has(user.username)
                                ? t("souls.sent")
                                : t("souls.connect")}
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
            onRemove={async () => {
              const gone = activeSoul;
              await apiFetch(`/souls/${gone.connection_id}`, { method: "DELETE" }, token);
              // The server ends every connection row between the two of
              // you, so drop them all (either direction) from the list.
              setConnectedSouls((prev) => prev.filter(
                (c) => c.connection_id !== gone.connection_id && c.soul.id !== gone.soul.id,
              ));
              setBondPartners((prev) => prev.filter(
                (p) => !(p.kind === "connection" && p.connection.soul.id === gone.soul.id),
              ));
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
            onConfirmSaved={(p) => { setPartnerPickerOpen(false); void confirmSavedBirthTime(p); }}
            onClose={() => setPartnerPickerOpen(false)}
          />
        )}

        {/* Add-person sheet */}
        {permissionAsk && (
          <PermissionSheet
            people={permissionAsk}
            onCancel={() => setPermissionAsk(null)}
            onConfirm={() => {
              recordSharingPermission(permissionAsk.map((p) => p.id));
              setPermissionAsk(null);
              // People kept only on this device can now be saved to the account.
              setPeopleSyncNonce((n) => n + 1);
              void readTheBond();
            }}
          />
        )}

        {addPersonOpen && (
          <AddPersonSheet
            onClose={() => setAddPersonOpen(false)}
            onAdded={handlePersonAdded}
          />
        )}

        {savedFoldAsk && (
          <BirthTimeFoldSheet
            options={savedFoldAsk.options}
            body={t("souls.birth_check_body")}
            hint={t("souls.birth_check_hint")}
            onChoose={(f) => { savedFoldAsk.resolve(f); setSavedFoldAsk(null); }}
            onCancel={() => { savedFoldAsk.resolve(null); setSavedFoldAsk(null); }}
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
  const { t, lang } = useT();
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
            <img src={myAvatar} alt={t("souls.you")} className="w-7 h-7 rounded-full object-cover shrink-0" />
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
          {chart.sun_sign && <>☉ {tx(chart.sun_sign, lang)}</>}
          {chart.sun_sign && chart.hd_type && " · "}
          {chart.hd_type && (
            <>{tx(chart.hd_type, lang)}{chart.hd_profile ? ` ${chart.hd_profile}` : ""}</>
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
  /** A saved person whose birth time the server flagged (clock change). */
  onConfirmSaved: (person: SavedPerson) => void;
  onClose: () => void;
}

function PartnerPicker({ savedPeople, connections, onPick, onAddNew, onRemoveSaved, onConfirmSaved, onClose }: PartnerPickerProps) {
  const { t, lang } = useT();
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
                        {p.profile.sun_sign && <>☉ {tx(p.profile.sun_sign, lang)}</>}
                        {p.profile.sun_sign && p.profile.hd_type && " · "}
                        {tx(p.profile.hd_type, lang)}
                      </p>
                    </div>
                  </button>
                  {savedBirthCheck(p).needsConfirmation && (
                    <button
                      type="button"
                      onClick={() => onConfirmSaved(p)}
                      className="shrink-0 px-3 py-1 rounded-full border border-forest-border font-body text-[13px] text-text-primary"
                    >
                      {t("souls.birth_check_button")}
                    </button>
                  )}
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
                      {c.soul.sun_sign && <>☉ {tx(c.soul.sun_sign, lang)}</>}
                      {c.soul.sun_sign && c.soul.hd_type && " · "}
                      {tx(c.soul.hd_type, lang)}
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
// Permission sheet: asked once per saved person before their first reading
// when the member has not confirmed it yet (people saved before the
// question existed, or saved on another device).
// ---------------------------------------------------------------------------

function PermissionSheet({ people, onCancel, onConfirm }: { people: SavedPerson[]; onCancel: () => void; onConfirm: () => void }) {
  const { t } = useT();
  const [checked, setChecked] = useState(false);
  const names = people.map((p) => p.name);
  const nameList = names.length <= 1
    ? (names[0] || t("souls.permission_this_person"))
    : names.length === 2
    ? names.join(t("souls.bond_and"))
    : `${names.slice(0, -1).join(", ")}${t("souls.bond_and_last")}${names[names.length - 1]}`;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby="souls-permission-title">
      <div className="absolute inset-0 bg-forest-deep/80 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-lg bg-forest-dark border-t border-forest-border rounded-t-3xl px-6 pt-5 pb-16">
        <div className="w-10 h-1 bg-forest-border rounded-full mx-auto mb-5" />
        <h3 id="souls-permission-title" className="font-heading text-text-primary mb-2" style={{ fontSize: "1.2rem", fontWeight: 700 }}>
          {t("souls.permission_needed_title")}
        </h3>
        <p className="font-body text-text-secondary text-[15px] leading-relaxed mb-5">
          {fill(t("souls.permission_needed_body"), { names: nameList })}
        </p>
        <label className="flex items-start gap-3 cursor-pointer select-none mb-6" style={{ minHeight: 44 }}>
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-1 w-4 h-4 cursor-pointer flex-shrink-0"
            style={{ accentColor: "rgb(var(--rgb-text-primary))" }}
          />
          <span className="font-body text-[15px] leading-relaxed text-text-secondary">
            {t("souls.permission_confirm").replace("{name}", nameList)}
          </span>
        </label>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!checked}
          className="w-full py-3.5 rounded-xl font-body font-semibold text-[17px] tracking-[0.2em] uppercase transition-all disabled:opacity-30"
          style={{ background: "linear-gradient(135deg, rgb(var(--rgb-mist)), rgb(var(--rgb-mist)))", color: "var(--text-primary)" }}
        >
          {t("souls.permission_continue")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="w-full mt-3 py-3 font-body text-[15px] text-text-secondary"
          style={{ minHeight: 44 }}
        >
          {t("souls.permission_not_now")}
        </button>
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
  const city = useCityAutocomplete(birthCity);
  const pickCity = (c: CitySuggestion) => {
    setBirthCity(c.display);
    city.settle(c.display);
  };
  const cityInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Another person's birth details leave this device (to Solray to draw the
  // chart, and to its AI providers when the member asks about them), so the
  // member confirms they have that person's permission first.
  const [hasPermission, setHasPermission] = useState(false);
  // The "which one was it" question for a birth time that happened twice.
  const [foldAsk, setFoldAsk] = useState<{ options: FoldChoice[]; resolve: (f: BirthFold | null) => void } | null>(null);
  const askFold = (options: FoldChoice[]) =>
    new Promise<BirthFold | null>((resolve) => setFoldAsk({ options, resolve }));
  // A chart that lands after the sheet closed, or after the account
  // changed, is dropped: it must never be added to anyone's list.
  const sheetMountedRef = useRef(true);
  useEffect(() => {
    sheetMountedRef.current = true;
    return () => { sheetMountedRef.current = false; };
  }, []);

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

  const canSubmit =
    name.trim().length > 0 &&
    (sex === "female" || sex === "male") &&
    birthDate.length === 10 &&
    (timeUnknown || birthTime.length === 5) &&
    birthCity.trim().length > 0 &&
    hasPermission &&
    !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").trim();
    const acct = captureAccount();
    const stillHere = () => acct.live && sheetMountedRef.current;
    try {
      const body = {
        name,
        sex: sex || null,
        birth_date: birthDate,
        birth_time: timeUnknown ? "12:00" : birthTime,
        birth_city: birthCity,
      };
      // A birth time in the hour the clocks went back happened twice: the
      // member says which one and the chart is drawn again with it. One that
      // never happened (clocks went forward) comes back to be corrected.
      const calculate = async (fold: BirthFold | null) => {
        const { ok, status, data } = await trackRequest(async () => {
          const res = await fetch(`${apiUrl}/souls/calculate-blueprint`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(fold ? { ...body, birth_time_fold: fold } : body),
          });
          if (!stillHere()) return { ok: false, status: 0, data: null };
          return { ok: res.ok, status: res.status, data: res.ok ? await res.json() : await res.json().catch(() => ({})) };
        });
        if (!stillHere()) return null;
        if (!ok) {
          throw new ApiError(errorText(data?.detail, t("souls.error_read_chart")), status, detailCode(data?.detail), data?.detail);
        }
        return data;
      };
      const outcome = await sendBirthRequest(calculate, askFold);
      if (!stillHere()) return;
      if (outcome.status === "cancelled") return;
      if (outcome.status === "nonexistent") {
        setError(t("birth_fold.nonexistent"));
        return;
      }
      const data = outcome.value;
      if (!data) return;
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
        birth_time_fold: outcome.fold ?? undefined,
      };
      onAdded(person);
    } catch (e: unknown) {
      if (!stillHere()) return;
      const msg = e instanceof Error ? e.message : t("souls.error_drifted_short");
      setError(msg);
    } finally {
      if (sheetMountedRef.current) setSubmitting(false);
    }
  };

  return (
    <>
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
              prompt={t("souls.birth_wheel_prompt")}
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
                onChange={(e) => setBirthCity(e.target.value)}
                onKeyDown={(e) => { city.onKeyDown(e, pickCity); }}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={city.open && city.suggestions.length > 0}
                aria-controls="souls-city-list"
                aria-activedescendant={city.active >= 0 ? `souls-city-${city.active}` : undefined}
                placeholder={t("onboard.city_placeholder")}
                autoComplete="off"
                className="w-full bg-transparent border-b border-forest-border text-text-primary font-body py-2 focus:outline-none focus:border-mist transition-colors"
                style={{ paddingRight: city.loading ? "2rem" : undefined }}
              />
              {city.loading && (
                <span className="absolute right-0 top-1/2 -translate-y-1/2 text-text-secondary">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                </span>
              )}
              {city.open && city.suggestions.length > 0 && (
                <div
                  ref={suggestionsRef} role="listbox" id="souls-city-list"
                  className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl overflow-hidden shadow-xl"
                  style={{
                    background: "rgb(var(--rgb-card))",
                    border: "1px solid rgb(var(--rgb-text-primary) / 0.12)",
                    maxHeight: "14rem",
                    overflowY: "auto",
                  }}
                >
                  {city.suggestions.map((s, i) => (
                    <button
                      key={s.display}
                      id={`souls-city-${i}`}
                      type="button"
                      role="option"
                      aria-selected={i === city.active}
                      className={`w-full text-left px-4 py-2.5 font-body text-[17px] text-text-primary hover:bg-white/5 transition-colors border-b border-forest-border/40 last:border-b-0${i === city.active ? " is-active" : ""}`}
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
            <p className="text-ember text-[15px] font-body">{error}</p>
          )}

          <label className="flex items-start gap-3 cursor-pointer select-none" style={{ minHeight: 44 }}>
            <input
              type="checkbox"
              checked={hasPermission}
              onChange={(e) => setHasPermission(e.target.checked)}
              className="mt-1 w-4 h-4 cursor-pointer flex-shrink-0"
              style={{ accentColor: "rgb(var(--rgb-text-primary))" }}
            />
            <span className="font-body text-[15px] leading-relaxed text-text-secondary">
              {t("souls.permission_confirm").replace("{name}", name.trim() || t("souls.permission_this_person"))}
            </span>
          </label>

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
    {/* Above the add-person sheet. */}
    {foldAsk && (
      <BirthTimeFoldSheet
        options={foldAsk.options}
        onChoose={(f) => { foldAsk.resolve(f); setFoldAsk(null); }}
        onCancel={() => { foldAsk.resolve(null); setFoldAsk(null); }}
      />
    )}
    </>
  );
}

// Soul card component
interface SoulCardProps {
  connection: ConnectedSoul;
  onOpen: () => void;
}

function SoulCard({ connection, onOpen }: SoulCardProps) {
  const { t, lang } = useT();
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
                ☉ {tx(soul.sun_sign, lang)}
              </span>
            )}
            {soul.sun_sign && soul.hd_type && (
              <span className="text-forest-border text-xs">·</span>
            )}
            {soul.hd_type && (
              <span className="text-text-secondary text-xs font-body">
                {tx(soul.hd_type, lang)}{soul.hd_profile ? ` ${soul.hd_profile}` : ""}
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
