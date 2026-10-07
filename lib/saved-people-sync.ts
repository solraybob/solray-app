// Pure decisions for syncing Souls saved people (app/souls/page.tsx).
//
// _synced marks a person the server has confirmed holding. A confirmed person
// that later is missing from the server was deleted on another device: it is
// dropped, never uploaded again. Tombstones are local deletions the server
// has not confirmed yet; they win over the server list.

import { isCurrentGeneration, StaleAccountError } from "./account-session";

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

// ─── Per-person writes ─────────────────────────────────────────────────────
//
// Saving and deleting the same person must never overtake each other. A
// DELETE sent while that person's POST is still on its way would find
// nothing on the server (the backend answers {ok:false}), and the POST would
// then create the person after the member removed them. So every write for
// one person runs after the previous one has finished, and a delete always
// targets the id the server ended up using.

//
// Each write belongs to the account it was queued under (`generation`, from
// getAuthGeneration() at the moment it is queued, never when it starts):
// one whose turn comes after that account signed out is rejected with
// StaleAccountError without being sent, so a queued request can never go
// out with the old account's token under the next account (whose 401 would
// sign the next member out). Pass the same generation to apiFetch.

const chains = new Map<string, Promise<unknown>>();
const serverIdFor = new Map<string, string>();
const deletedHere = new Set<string>();

/** Runs `work` after every write already queued for this person, only while
 *  the account it was queued under is still signed in. */
export function forPerson<T>(id: string, generation: number, work: () => Promise<T>): Promise<T> {
  const prev = chains.get(id) || Promise.resolve();
  const next = prev.catch(() => undefined).then(() => {
    if (!isCurrentGeneration(generation)) throw new StaleAccountError();
    return work();
  });
  chains.set(id, next);
  void next.finally(() => { if (chains.get(id) === next) chains.delete(id); }).catch(() => undefined);
  return next;
}

export function hasQueuedWrites(id: string): boolean {
  return chains.has(id);
}

/** The server minted its own id for a person created here. */
export function rememberServerId(localId: string, serverId: string): void {
  if (localId && serverId && localId !== serverId) serverIdFor.set(localId, serverId);
}

export function serverIdOf(id: string): string {
  return serverIdFor.get(id) || id;
}

/**
 * Removed on this device while the page is open. A server list read before
 * the removal, or a save that finishes after it, must not bring the person
 * back, even once the server has confirmed the delete.
 */
export function markDeletedHere(id: string): void { deletedHere.add(id); }
export function unmarkDeletedHere(id: string): void { deletedHere.delete(id); }
export function wasDeletedHere(id: string): boolean {
  return deletedHere.has(id) || deletedHere.has(serverIdOf(id));
}
export function deletedHereIds(): Set<string> { return new Set(deletedHere); }

/**
 * Call with the current account generation whenever Souls opens. The
 * in-memory bookkeeping survives leaving and reopening Souls (writes may
 * still be running), and is forgotten only when the account changed.
 */
let boundGeneration: number | null = null;
export function bindPersonWritesToAccount(generation: number): void {
  if (boundGeneration !== null && boundGeneration !== generation) resetPersonWrites();
  boundGeneration = generation;
}

export function resetPersonWrites(): void {
  chains.clear();
  serverIdFor.clear();
  deletedHere.clear();
  lastDeleteAt.clear();
}

/**
 * DELETE /saved-people/{id} answers 200 {ok:true} when it removed the
 * person and 200 {ok:false} when it did not (nothing there, or it failed).
 * Only {ok:true} confirms the delete.
 */
export function deleteConfirmed(resp: unknown): boolean {
  return !!resp && typeof resp === "object" && (resp as { ok?: unknown }).ok === true;
}

// Ordering between deletes and server list reads. A tombstone whose delete
// was not confirmed is dropped only when a list read that STARTED after the
// last delete attempt no longer has the person (the server does not hold
// it), and no write for that person is still queued.
let seq = 0;
const lastDeleteAt = new Map<string, number>();

export function nextSeq(): number { seq += 1; return seq; }
export function noteDeleteAttempt(id: string): void { lastDeleteAt.set(id, nextSeq()); }
export function absenceConfirmsDelete(id: string, listStartedAt: number, serverIds: Set<string>): boolean {
  if (serverIds.has(id) || serverIds.has(serverIdOf(id))) return false;
  if (hasQueuedWrites(id)) return false;
  return listStartedAt > (lastDeleteAt.get(id) ?? 0);
}

// ─── Permission to share someone else's birth details ──────────────────────
//
// The member confirms, per person, that they have that person's permission
// to send their birth details to Solray and its AI providers. People saved
// before that question existed have no record: they are not uploaded and
// get no AI reading until the member confirms. Kept per account on this
// device (cleared with the other per-account caches on sign-out).

const PERMISSION_KEY = "solray_saved_people_permission";

function readPermissions(): Record<string, number> {
  try {
    const v = JSON.parse(localStorage.getItem(PERMISSION_KEY) || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}
function writePermissions(p: Record<string, number>): void {
  try { localStorage.setItem(PERMISSION_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

export function hasSharingPermission(id: string): boolean {
  const p = readPermissions();
  return typeof p[id] === "number" || typeof p[serverIdOf(id)] === "number";
}

export function recordSharingPermission(ids: string[], at: number = Date.now()): void {
  const p = readPermissions();
  for (const id of ids) if (id) p[id] = at;
  writePermissions(p);
}

/** Carries the record over when the server gave the person a new id. */
export function moveSharingPermission(from: string, to: string): void {
  if (!from || !to || from === to) return;
  const p = readPermissions();
  if (typeof p[from] === "number") {
    p[to] = p[from];
    delete p[from];
    writePermissions(p);
  }
}

export function forgetSharingPermission(id: string): void {
  const p = readPermissions();
  if (id in p) { delete p[id]; writePermissions(p); }
}

/** The people in `people` the member has not confirmed permission for. */
export function needingPermission<T extends SyncablePerson>(people: T[]): T[] {
  return people.filter((p) => p && p.id && !hasSharingPermission(p.id));
}
