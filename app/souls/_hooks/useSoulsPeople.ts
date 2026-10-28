"use client";

import { useState } from "react";
import { apiFetch, ApiError, trackRequest } from "@/lib/api";
import { type BirthFold, type FoldChoice } from "@/lib/birth-time-fold";
import { captureAccount, isStaleAccountError } from "@/lib/account-session";
import { deleteConfirmed, forgetSharingPermission, forPerson, markDeletedHere, moveSharingPermission, noteDeleteAttempt, recordSharingPermission, rememberServerId, serverIdOf, unmarkDeletedHere, wasDeletedHere, recordPendingUpdate, settlePendingUpdate } from "@/lib/saved-people-sync";
import { fill } from "@/lib/i18n";
import { type BondPartner, type SavedPerson, writeSavedPeople, forServer, savedBirthCheck, addTombstone, dropTombstone } from "../_lib/souls-data";
import type { useSoulsState } from "./useSoulsState";

export function useSoulsPeople(pageCtx: ReturnType<typeof useSoulsState>) {
  const {
    bondLens, confirmedPeopleRef, connectedSouls, savedPeople, setActiveSoul, setAddPersonOpen,
    setBondPartners, setErrorMessage, setSavedPeople, t, token
  } = pageCtx;

  // One list for the grid. Connected souls come first, then the people you
  // saved yourself; they were three sections on the page and are one set of
  // equal things, which is what a grid is for.
  const connectionCards = [
    ...connectedSouls.map((c) => ({
      key: `soul-${c.connection_id}`,
      name: c.soul.name,
      photo: c.soul.profile_photo || null,
      connected: true,
      // The card names the person only; their sign and type wait inside (9 Oct 2026).
      detail: t("souls.connected"),
      onOpen: () => setActiveSoul(c),
    })),
    ...savedPeople.map((person) => ({
      key: `saved-${person.id}`,
      name: person.name,
      photo: null as string | null,
      connected: false,
      detail: t("souls.saved"),
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

  return {
    confirmSavedBirthTime, connectionCards, handlePersonAdded, handlePersonRemove, savedFoldAsk,
    setSavedFoldAsk
  };
}
