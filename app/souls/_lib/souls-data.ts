import { savedPersonFold, savedPersonForServer, savedPersonBirthCheck } from "@/lib/saved-people-sync";
import { accountKey } from "@/lib/account-session";

// Types
export interface SearchResult {
  id: string;
  username: string;
  name: string;
  sun_sign: string | null;
  hd_type: string | null;
  hd_profile: string | null;
}

export interface PendingInvite {
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

export interface ConnectedSoul {
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
export interface SavedPerson {
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
  // The server holds the member's confirmed permission for this person
  // (needed before a reading with them reaches an AI provider).
  sharing_permission?: boolean;
  // Local bookkeeping, never sent: true once the server has confirmed it
  // holds this person. A confirmed person later missing from the server was
  // deleted on another device and must not be uploaded again.
  _synced?: boolean;
}

export type BondLens = "romantic" | "friendship" | "working" | "family";
export type BondPartner =
  | { kind: "saved"; person: SavedPerson }
  | { kind: "connection"; connection: ConnectedSoul };

const SAVED_PEOPLE_KEY = "solray_saved_people";

export function loadSavedPeople(): SavedPerson[] {
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

export function writeSavedPeople(people: SavedPerson[]) {
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
export function loadTombstones(): Set<string> {
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
export function addTombstone(id: string) { const t = loadTombstones(); t.add(id); writeTombstones(t); }
export function dropTombstone(id: string) { const t = loadTombstones(); if (t.delete(id)) writeTombstones(t); }

// The chosen clock-change occurrence, the POST body, and the server's
// birth time check for a saved person (lib/saved-people-sync).
export function savedFold(p: SavedPerson): "first" | "second" | undefined {
  return savedPersonFold(p);
}
export function forServer(p: SavedPerson) {
  return savedPersonForServer(p);
}
export function savedBirthCheck(p: SavedPerson) {
  return savedPersonBirthCheck(p);
}

// Who a Dynamics reading is with, for the chat request. The server loads
// a connection's chart itself and computes a synced saved person's chart
// from their stored birth details; a chart only rides along for a saved
// person the server has not confirmed yet (it recomputes from it).
export function partnerSoulRef(p: BondPartner): { soulConnectionId?: string; savedPersonId?: string } {
  if (p.kind === "connection") return { soulConnectionId: p.connection.connection_id };
  return p.person._synced ? { savedPersonId: p.person.id } : {};
}

export function partnerName(p: BondPartner): string {
  return p.kind === "saved" ? p.person.name : p.connection.soul.name;
}

export function partnerInitial(p: BondPartner): string {
  const n = partnerName(p);
  return n?.[0]?.toUpperCase() || "·";
}

export function partnerPhoto(p: BondPartner): string | null {
  if (p.kind === "connection") return p.connection.soul.profile_photo || null;
  return null;
}

export function partnerChart(p: BondPartner): { sun_sign: string | null; hd_type: string | null; hd_profile: string | null } {
  if (p.kind === "saved") return p.person.profile;
  const s = p.connection.soul;
  return { sun_sign: s.sun_sign, hd_type: s.hd_type, hd_profile: s.hd_profile };
}

// Generate a short session code

// Deduplicate connected souls by the underlying user id
// (both sides of a connection may appear in the list)
export function dedupeSouls(souls: ConnectedSoul[]): ConnectedSoul[] {
  const seen = new Set<string>();
  return souls.filter((s) => {
    if (seen.has(s.soul.id)) return false;
    seen.add(s.soul.id);
    return true;
  });
}
