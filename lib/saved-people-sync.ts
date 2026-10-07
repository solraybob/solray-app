// Pure decisions for syncing Souls saved people (app/souls/page.tsx).
//
// _synced marks a person the server has confirmed holding. A confirmed person
// that later is missing from the server was deleted on another device: it is
// dropped, never uploaded again. Tombstones are local deletions the server
// has not confirmed yet; they win over the server list.

export interface SyncablePerson {
  id: string;
  _synced?: boolean;
}

/** Local people to upload: created here and never confirmed by the server. */
export function peopleToUpload<T extends SyncablePerson>(local: T[], serverIds: Set<string>, tombstones: Set<string>): T[] {
  return local.filter((p) => p && p.id && !serverIds.has(p.id) && !p._synced && !tombstones.has(p.id));
}

/**
 * The list after a sync, built from the CURRENT list (so a person added or
 * removed while the sync ran is respected): local-only people still waiting
 * for upload first, then everything the server confirmed. Tombstoned ids and
 * people replaced by a server-minted id are left out.
 */
export function mergeSavedPeople<T extends SyncablePerson>(
  current: T[],
  confirmed: T[],
  replacedIds: Set<string>,
  tombstones: Set<string>,
): T[] {
  const confirmedIds = new Set(confirmed.map((p) => p.id));
  const keepLocal = current.filter((p) =>
    p && p.id && !p._synced && !confirmedIds.has(p.id) && !replacedIds.has(p.id) && !tombstones.has(p.id),
  );
  const seen = new Set<string>();
  return [...keepLocal, ...confirmed].filter((p) => {
    if (!p || !p.id || seen.has(p.id) || tombstones.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}
