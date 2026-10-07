// Account generation.
//
// Every time the signed-in identity changes (login, signup, logout, a dead
// session wiped by a 401) the generation number goes up. Any work that
// started under an older generation belongs to the previous account and must
// not touch state that the current account will read: no cache writes, no
// uploads, no logout triggered by its late 401.
//
// apiFetch captures the generation when a request starts and throws
// StaleAccountError if the generation moved while it was in flight, so the
// code after an `await apiFetch(...)` never runs for a previous account.
// Code that uses raw fetch, or several awaits in a row, captures
// getAuthGeneration() up front and checks isCurrentGeneration() after each
// await before writing anything.

let generation = 0;

export function getAuthGeneration(): number {
  return generation;
}

export function isCurrentGeneration(g: number): boolean {
  return g === generation;
}

/** Called by the auth layer whenever the signed-in identity changes. */
export function bumpAuthGeneration(): number {
  generation += 1;
  return generation;
}

export class StaleAccountError extends Error {
  constructor() {
    super("The account changed while this request was in flight.");
    this.name = "StaleAccountError";
  }
}

export function isStaleAccountError(e: unknown): boolean {
  return e instanceof StaleAccountError;
}

// Sign-out hooks. Work that must run whenever a session ends, on every
// path (explicit logout, or a dead session wiped by a 401), registered by
// the module that owns it. Runs BEFORE per-user storage is cleared, with
// the leaving member's auth token when one is known. Used by native push
// to queue the release of this phone's binding.
type SignOutHook = (leavingToken: string | null) => void;
const signOutHooks = new Set<SignOutHook>();

export function onAccountSignOut(hook: SignOutHook): () => void {
  signOutHooks.add(hook);
  return () => { signOutHooks.delete(hook); };
}

export function runAccountSignOutHooks(leavingToken: string | null): void {
  signOutHooks.forEach((hook) => {
    try { hook(leavingToken); } catch { /* a hook never blocks sign-out */ }
  });
}

/**
 * The account a piece of raw work (a fetch outside apiFetch, a chain of
 * awaits, a callback that lands later) belongs to. Capture it before the
 * first request, then read `live` after every await and before every cache
 * write, callback, upload or navigation; `check()` throws StaleAccountError
 * instead, for code that unwinds through a catch.
 */
export interface AccountGuard {
  readonly generation: number;
  readonly live: boolean;
  check(): void;
}

export function captureAccount(): AccountGuard {
  const g = generation;
  return {
    generation: g,
    get live() { return g === generation; },
    check() { if (g !== generation) throw new StaleAccountError(); },
  };
}

// ── Which account this tab belongs to, and its own cache namespace ─────────
//
// Several tabs share one localStorage. The generation above only protects
// the tab that signed out; another tab still holding the previous member's
// session would keep writing that member's readings and transcripts into the
// shared cache, where the next member reads them. Two guards close that:
//
// 1. Per-account cache keys. Every per-member cache key is written as
//    `<base>@u:<account id>` through accountKey(), using the account THIS
//    tab is bound to (not whatever account the shared storage holds now).
//    A stale tab can then only ever write into its own member's namespace,
//    never into the namespace another member's tab reads.
// 2. Cross-tab identity events. The auth provider feeds every `storage`
//    event for the session keys to identityStorageChange(): a sign-out or a
//    different account in another tab bumps the generation and unbinds this
//    tab at once (in-flight work is dropped, later writes land nowhere a
//    member reads), and the provider then reloads or leaves for /login.

const NS_MARK = "@u:";
const SESSION_TOKEN_KEY = "solray_token";
const SESSION_USER_KEY = "solray_user";

// Per-member localStorage caches written through accountKey(). Existing
// unscoped copies of these are moved into the signed-in member's namespace
// once (migrateAccountCaches), so nobody loses their cache on update.
const ACCOUNT_SCOPED_EXACT = [
  "solray_avatar",
  "solray_astrocarto",
  "solray_push_enabled",
];
const ACCOUNT_SCOPED_PREFIX = [
  "solray_blueprint",
  "solray_forecast_",
  "solray_week_",
  "solray_cycles_",
  "solray_chat_",
  "solray_saved_people",
  "solray_birth_",
  "solray_bt_",
  "solray_echo_",
  "solray_lunar_",
  "solray_birthday_",
];
// Device-wide keys that share a scoped prefix.
const NOT_SCOPED = new Set<string>(["solray_chat_migrated_v1"]);

/** The base key of a per-account key (the key itself when not scoped). */
export function baseOfKey(key: string): string {
  const i = key.indexOf(NS_MARK);
  return i < 0 ? key : key.slice(0, i);
}

/** True for a localStorage key whose value belongs to one member. */
export function isAccountScopedBase(key: string): boolean {
  const base = baseOfKey(key);
  if (NOT_SCOPED.has(base)) return false;
  return ACCOUNT_SCOPED_EXACT.includes(base) || ACCOUNT_SCOPED_PREFIX.some((p) => base.startsWith(p));
}

/** The member id in the shared session record, or null. */
export function storedAccountId(): string | null {
  try {
    const raw = localStorage.getItem(SESSION_USER_KEY);
    const id = raw ? JSON.parse(raw)?.id : null;
    return id === null || id === undefined || id === "" ? null : String(id);
  } catch {
    return null;
  }
}

function storedToken(): string | null {
  try { return localStorage.getItem(SESSION_TOKEN_KEY); } catch { return null; }
}

// undefined: not resolved yet in this tab (resolved lazily from storage).
let boundAccount: string | null | undefined;

/**
 * Bind this tab to an account (null: signed out). Called by the auth layer
 * when the tab loads a session, signs in, or signs out. Binding to the
 * member the shared session names also moves that member's old unscoped
 * caches into their namespace.
 */
export function bindAccount(id: string | null): void {
  boundAccount = id === null || id === undefined || id === "" ? null : String(id);
  if (boundAccount && boundAccount === storedAccountId()) migrateAccountCaches(boundAccount);
  claimTabHandoffs(boundAccount);
}

/** The account this tab belongs to (resolved from storage on first use). */
export function boundAccountId(): string | null {
  if (boundAccount === undefined) bindAccount(storedAccountId());
  return boundAccount ?? null;
}

/**
 * The key a per-member cache uses in this tab: `<base>@u:<account id>`.
 * Signed out (or unbound after another tab changed the account) it is a
 * throwaway namespace no signed-in member reads. Idempotent.
 */
export function accountKey(base: string): string {
  if (base.includes(NS_MARK)) return base;
  return `${base}${NS_MARK}${boundAccountId() ?? "-"}`;
}

/**
 * Move unscoped per-member caches (written before keys were namespaced)
 * into `id`'s namespace. Only for the member the shared session names:
 * before namespacing, every account change wiped these keys, so what is
 * there belongs to that member. A namespaced copy already there wins.
 */
export function migrateAccountCaches(id: string): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && !k.includes(NS_MARK) && isAccountScopedBase(k)) keys.push(k);
    }
    for (const k of keys) {
      const v = localStorage.getItem(k);
      const target = `${k}${NS_MARK}${id}`;
      if (v !== null && localStorage.getItem(target) === null) {
        try { localStorage.setItem(target, v); } catch { continue; /* keep the old copy */ }
      }
      localStorage.removeItem(k);
    }
  } catch {
    /* storage unavailable: nothing to move */
  }
}

/**
 * What a `storage` event (another tab changed shared storage) means for
 * this tab, given the session token this tab holds:
 *  - "none": not about the session, or nothing changed for this tab.
 *  - "token": same member, new token (a fresh sign-in of the same member).
 *  - "signed-out": the session is gone.
 *  - "switched": a different member (or a member, where this tab had none).
 * For "signed-out" and "switched" the generation is bumped and the tab is
 * unbound here, synchronously, before anything else in this tab runs.
 */
export type IdentityChange = "none" | "token" | "signed-out" | "switched";

export function identityStorageChange(key: string | null, tabToken: string | null): IdentityChange {
  if (key !== null && key !== SESSION_TOKEN_KEY && key !== SESSION_USER_KEY) return "none";
  const mine = boundAccountId();
  const token = storedToken();
  const id = storedAccountId();
  let change: IdentityChange;
  if (!token || !id) change = mine || tabToken ? "signed-out" : "none";
  else if (id !== mine) change = "switched";
  else change = token !== tabToken ? "token" : "none";
  if (change === "signed-out" || change === "switched") {
    bumpAuthGeneration();
    boundAccount = null;
    // This tab's one-shot handoffs were written for the member who just
    // left: they go now, before the tab redirects or reloads.
    claimTabHandoffs(null);
  }
  return change;
}

// ── One-shot handoffs between screens (sessionStorage) ─────────────────────
//
// A question seeded into the Oracle, a Dynamics context: written by one
// screen, read once by another. sessionStorage belongs to the tab and
// survives a reload, so a handoff left behind by an interrupted navigation
// could otherwise be read after the tab changed member. The tab records
// which member its handoffs belong to (`solray_tab_owner`); whenever the
// tab is bound to a different member (or to none), every `solray_` key in
// its sessionStorage is dropped first, and takeHandoff() checks the owner
// again before it hands anything over.

const TAB_OWNER_KEY = "solray_tab_owner";
const SIGNED_OUT_OWNER = "-";

function clearTabHandoffs(): void {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith("solray_")) sessionStorage.removeItem(k);
    }
  } catch {
    /* storage unavailable: nothing to drop */
  }
}

/** Make `owner` the member this tab's handoffs belong to, dropping any
 *  left by someone else (or of unknown owner). */
function claimTabHandoffs(owner: string | null): void {
  const want = owner ?? SIGNED_OUT_OWNER;
  let current: string | null;
  try { current = sessionStorage.getItem(TAB_OWNER_KEY); } catch { return; }
  if (current === want) return;
  clearTabHandoffs();
  try { sessionStorage.setItem(TAB_OWNER_KEY, want); } catch { /* best-effort */ }
}

/**
 * Read and remove a one-shot handoff, only when it belongs to the member
 * this tab is bound to. Returns null when there is none, or when it was
 * left by another member (it is dropped).
 */
export function takeHandoff(key: string): string | null {
  claimTabHandoffs(boundAccountId());
  try {
    const v = sessionStorage.getItem(key);
    if (v !== null) sessionStorage.removeItem(key);
    return v;
  } catch {
    return null;
  }
}
