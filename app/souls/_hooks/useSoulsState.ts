"use client";

import { memberErrorText } from "@/lib/member-error";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, ApiError } from "@/lib/api";
import { captureAccount, getAuthGeneration, isStaleAccountError } from "@/lib/account-session";
import { absenceConfirmsDelete, deleteConfirmed, deletedHereIds, forgetSharingPermission, forPerson, hasSharingPermission, mergeSavedPeople, moveSharingPermission, nextSeq, noteDeleteAttempt, peopleToUpload, rememberServerId, bindPersonWritesToAccount, serverIdOf, wasDeletedHere, settlePendingUpdate, pendingUpdateFor, pendingUpdateIds, prunePendingUpdates, overlayPendingUpdates } from "@/lib/saved-people-sync";
import { useT, fill } from "@/lib/i18n";
import { tx } from "@/lib/astro-i18n";
import { cardShareAvailable } from "@/lib/share-available";
import { accountKey } from "@/lib/account-session";
import { type SearchResult, type PendingInvite, type ConnectedSoul, type SavedPerson, type BondPartner, type BondLens, loadSavedPeople, dedupeSouls, loadTombstones, dropTombstone, forServer, writeSavedPeople } from "../_lib/souls-data";

export function useSoulsState() {
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
    // The account the search is typed under: the debounced request is sent
    // for it or not at all.
    const searchGen = getAuthGeneration();
    searchTimerRef.current = setTimeout(async () => {
      try {
        const data = await apiFetch(`/users/search?q=${encodeURIComponent(q)}`, {}, token, { generation: searchGen });
        if (seq !== searchSeqRef.current) return;
        setSearchResults(data?.results || []);
        setSearchDone(true);
      } catch (e) {
        if (seq !== searchSeqRef.current) return;
        if (isStaleAccountError(e)) return;
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
      const msg = memberErrorText(e, t, "souls.error_signal", {
        byStatus: { 400: "souls.invite_self", 404: "souls.invite_no_account", 409: "souls.invite_already" },
      });
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
      const msg = memberErrorText(e, t, "souls.error_drifted", { byStatus: { 404: "souls.invite_gone" } });
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


  return {
    activeSoul, addPersonOpen, bondLens, bondPartners, confirmedPartner, confirmedPeopleRef,
    connectedSouls, errorMessage, handleInviteResponse, handleInviteShare, handleSearch,
    handleSendInvite, inviteInfo, inviteSent, inviteShareRef, inviteSharing, lang, loadError,
    loading, mountedRef, myAvatar, myUsername, openSoloReading, partnerPickerOpen, pendingInvites,
    permissionAsk, readingBond, retryingLoad, router, savedPeople, searchDone, searchFailed,
    searchOpen, searchQuery, searchResults, searching, sendingInvite, setActiveSoul,
    setAddPersonOpen, setBondLens, setBondPartners, setConnectedSouls, setErrorMessage,
    setLoadAttempt, setPartnerPickerOpen, setPeopleSyncNonce, setPermissionAsk, setReadingBond,
    setRetryingLoad, setSavedPeople, setSearchOpen, shareError, shareOk, t, token
  };
}
