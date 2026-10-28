"use client";

import { apiFetch, trackRequest } from "@/lib/api";
import { captureAccount } from "@/lib/account-session";
import { forPerson, needingPermission, permissionToRecordOnServer, hasQueuedWrites } from "@/lib/saved-people-sync";
import { fill } from "@/lib/i18n";
import { type BondPartner, partnerSoulRef, writeSavedPeople, partnerName, savedFold } from "../_lib/souls-data";
import type { useSoulsState } from "./useSoulsState";

export function useSoulsBond(pageCtx: ReturnType<typeof useSoulsState>) {
  const {
    bondLens, bondPartners, confirmedPartner, mountedRef, router, setErrorMessage, setPermissionAsk,
    setReadingBond, setSavedPeople, t, token
  } = pageCtx;
  // Fire the Bond reading, route to /chat?compat=1 with context
  const readTheBond = async () => {
    if (bondPartners.length === 0) return;
    // Every saved person in the reading needs the member's confirmed
    // permission before their birth details go to Solray and its AI
    // providers (their chart is computed and read on the server).
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

    // A family reading names everyone by reference (the server resolves
    // and checks each chart), so everyone in it must be on the server.
    const isFamily = bondLens === "family" && partners.length > 1;
    if (isFamily && partners.some((p) => !partnerSoulRef(p).soulConnectionId && !partnerSoulRef(p).savedPersonId)) {
      setErrorMessage(t("souls.family_not_saved_yet"));
      return abandon();
    }

    // The server refuses a reading with a saved person until the member's
    // permission for them is recorded there: record what was confirmed
    // here (people saved before the question existed, or on this device
    // only) before the reading starts.
    const toRecord = permissionToRecordOnServer(
      partners.flatMap((p) => (p.kind === "saved" ? [p.person] : [])),
    );
    if (toRecord.length > 0) {
      try {
        await Promise.all(toRecord.map((person) => apiFetch(
          `/saved-people/${encodeURIComponent(person.id)}/sharing-permission`,
          { method: "POST" }, token, { generation: acct.generation })));
      } catch {
        if (!stillHere()) return abandon();
        setErrorMessage(t("souls.permission_save_failed"));
        return abandon();
      }
      if (!stillHere()) return abandon();
      const recorded = new Set(toRecord.map((p) => p.id));
      setSavedPeople((prev) => {
        if (!prev.some((p) => recorded.has(p.id))) return prev;
        const next = prev.map((p) => (recorded.has(p.id) ? { ...p, sharing_permission: true } : p));
        writeSavedPeople(next);
        return next;
      });
    }

    // The opening question is shown in the chat as the member's own words,
    // so it is written in their language.
    const lensLabel = t(
      bondLens === "romantic"   ? "souls.bond_lens_romantic"
      : bondLens === "friendship" ? "souls.bond_lens_friendship"
      : bondLens === "family"     ? "souls.bond_lens_family"
      : "souls.bond_lens_work");
    // Family with multiple people. The opening message names them only:
    // no chart or summary of anyone goes from here. Every person travels
    // as a reference (the first is the focal one); the server resolves
    // each chart and checks each person's sharing and consent.
    if (isFamily) {
      const names = partners.map(partnerName);
      const nameList = names.length === 2
        ? names.join(t("souls.bond_and"))
        : `${names.slice(0, -1).join(", ")}${t("souls.bond_and_last")}${names[names.length - 1]}`;

      const introMessage = fill(t("souls.bond_family_intro"), { names: nameList });

      sessionStorage.setItem("solray_compat_context", JSON.stringify({
        soulName: nameList,
        introMessage,
        soulBlueprint: null,
        ...partnerSoulRef(partners[0]),
        localPersonId: null,
        familyPartners: partners.slice(1).map((p) => ({
          name: partnerName(p),
          connectionId: partnerSoulRef(p).soulConnectionId ?? null,
          savedPersonId: partnerSoulRef(p).savedPersonId ?? null,
        })),
        lens: bondLens,
      }));

      if (!stillHere()) return abandon();
      setReadingBond(false);
      router.push("/chat?compat=1");
      return;
    }

    // Single partner reading (all non-family lenses, or family with one person)
    const bondPartner = partners[0];
    const pName  = partnerName(bondPartner);

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

    // Names only: the server resolves the chart and checks the person's
    // sharing and consent (or the member's recorded permission).
    const introMessage = fill(t("souls.bond_intro"), { lens: lensLabel, name: pName });

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

  return { readTheBond };
}
