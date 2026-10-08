// Birth-data revision for chart-derived caches.
//
// The blueprint, astrocartography, cycles, forecasts, the week view and
// compatibility readings are all computed from the member's birth moment and
// cached in localStorage. When the birth details change (an edit here, or on
// another device) every one of them is stale. The revision is a fingerprint
// of the birth fields (including the chosen clock-change occurrence); whenever the app reads the profile it compares the
// fingerprint with the one the caches were built under and drops them all on
// a mismatch.

import { accountKey, baseOfKey } from "./account-session";

const REV_KEY = "solray_birth_rev";
/** localStorage key of the stored fingerprint (another tab changing it fires `storage`). */
export const BIRTH_REV_STORAGE_KEY = REV_KEY;

/**
 * Window event fired whenever the chart-derived caches are dropped (a birth
 * change here, or one noticed from another device). Screens showing chart
 * results refetch on it (lib/use-chart-revision), so nothing computed from
 * the old chart stays on screen.
 */
export const CHART_CHANGED_EVENT = "solray:chart-changed";

function announceChartChanged(): void {
  try { window.dispatchEvent(new CustomEvent(CHART_CHANGED_EVENT)); } catch { /* no window */ }
}

const DERIVED_EXACT = ["solray_blueprint", "solray_astrocarto"];
const DERIVED_PREFIX = ["solray_cycles_", "solray_forecast_", "solray_week_", "solray_compat_"];

type BirthFields = {
  birth_date?: unknown;
  birth_time?: unknown;
  birth_city?: unknown;
  birth_lat?: unknown;
  birth_lon?: unknown;
  birth_time_fold?: unknown;
};

export function birthRevision(p: BirthFields | null | undefined): string | null {
  if (!p || !p.birth_date) return null;
  const n = (v: unknown) => (typeof v === "number" && isFinite(v) ? v.toFixed(4) : "");
  const parts = [String(p.birth_date), String(p.birth_time ?? ""), String(p.birth_city ?? ""), n(p.birth_lat), n(p.birth_lon)];
  // Which occurrence of a repeated clock-change birth time the member chose:
  // the same displayed time gives a different chart. Only added when set, so
  // members without one keep their fingerprint.
  if (p.birth_time_fold === "first" || p.birth_time_fold === "second") parts.push(`fold:${p.birth_time_fold}`);
  return parts.join("|");
}

export function currentBirthRevision(): string | null {
  try { return localStorage.getItem(accountKey(REV_KEY)); } catch { return null; }
}

// Bumped whenever the derived caches are dropped in this tab. Together with
// the stored revision it tells work that started before a birth change
// apart from work that started after it, even when an edit is undone
// (A to B to A gives the same revision but a new epoch).
let chartEpoch = 0;

function isDerivedKey(key: string): boolean {
  // Per-account keys (`<base>@u:<id>`, lib/account-session) by their base.
  const k = baseOfKey(key);
  return DERIVED_EXACT.includes(k) || DERIVED_PREFIX.some((p) => k.startsWith(p));
}

/** Drop every cache computed from the birth chart. */
export function clearChartDerivedCaches(): void {
  chartEpoch += 1;
  for (const store of [() => localStorage, () => sessionStorage]) {
    try {
      const st = store();
      for (let i = st.length - 1; i >= 0; i--) {
        const k = st.key(i);
        if (k && isDerivedKey(k)) st.removeItem(k);
      }
    } catch { /* storage unavailable: nothing cached */ }
  }
  announceChartChanged();
}

/**
 * The chart a piece of work starts from. Capture it BEFORE requesting
 * anything computed from the birth chart; when the answer lands, only
 * cache it (and only call it current) if chartStampCurrent(stamp) still
 * holds. Otherwise the birth details changed while the request was in
 * flight and the answer may describe the old chart.
 */
export type ChartStamp = { rev: string | null; epoch: number };

export function chartWorkStamp(): ChartStamp {
  return { rev: currentBirthRevision(), epoch: chartEpoch };
}

export function chartStampCurrent(stamp: ChartStamp): boolean {
  return stamp.epoch === chartEpoch && stamp.rev === currentBirthRevision();
}

/**
 * Writes a chart-derived cache entry only if the chart has not changed since
 * `stamp`. A per-tab (session) entry carries the birth revision it was built
 * under, and readChartCache serves it only under that same revision: another
 * tab's birth correction cannot clear this tab's sessionStorage, so the entry
 * itself has to prove which chart it describes (Codex out20-5 #1).
 */
export function writeChartCache(stamp: ChartStamp, key: string, value: unknown, store: "local" | "session" = "local"): boolean {
  if (!chartStampCurrent(stamp)) return false;
  try {
    if (store === "session") {
      if (!stamp.rev) return false;   // no known chart: nothing to prove it by
      sessionStorage.setItem(key, JSON.stringify({ [SESSION_REV_FIELD]: stamp.rev, value }));
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
    return true;
  } catch {
    return false;
  }
}

const SESSION_REV_FIELD = "__chart_rev";

/** A per-tab chart-derived entry, only when built under the current birth
 *  revision; anything else (another chart, an unstamped older entry) is
 *  removed and null is returned. */
export function readSessionChartCache<T = unknown>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown> | null;
    const rev = currentBirthRevision();
    if (parsed && rev && parsed[SESSION_REV_FIELD] === rev && "value" in parsed) return parsed.value as T;
    sessionStorage.removeItem(key);
    return null;
  } catch {
    return null;
  }
}

/** This tab's own per-tab chart-derived entries (another tab cannot reach
 *  them). */
function clearSessionChartCaches(): void {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k && isDerivedKey(k)) sessionStorage.removeItem(k);
    }
  } catch { /* nothing cached */ }
}

/**
 * A birth correction made in another tab: that tab dropped the shared
 * (localStorage) caches and stored the new fingerprint, which fires
 * `storage` here. This tab drops its own per-tab caches and starts a new
 * chart epoch, so work in flight here for the old chart is never cached or
 * called current. The shared caches are left alone: the other tab may
 * already have written fresh ones for the new chart.
 */
export function onBirthRevisionChangedElsewhere(): void {
  chartEpoch += 1;
  clearSessionChartCaches();
  // (Screens hear the same storage event through useChartRevision; no
  // second announcement, so they load once.)
}

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("storage", (e: StorageEvent) => {
    if (e.key === accountKey(REV_KEY)) onBirthRevisionChangedElsewhere();
  });
}

/**
 * Compare the profile's birth fingerprint with the one the caches were built
 * under. On a change, clears the derived caches and records the new one.
 * Returns true when caches were dropped (the caller should refetch).
 * Accepts a /users/me payload or its profile object.
 */
export function syncBirthRevision(meOrProfile: unknown): boolean {
  const o = (meOrProfile && typeof meOrProfile === "object" ? meOrProfile : {}) as Record<string, unknown>;
  const profile = (o.profile && typeof o.profile === "object" ? o.profile : o) as BirthFields;
  const rev = birthRevision(profile);
  if (!rev) return false;
  const prev = currentBirthRevision();
  if (prev === rev) return false;
  // Also on the first sighting on this device: caches written before the
  // revision existed cannot prove which birth details they were built from,
  // so they are rebuilt once.
  clearChartDerivedCaches();
  try { localStorage.setItem(accountKey(REV_KEY), rev); } catch { /* ignore */ }
  // Again now the new fingerprint is stored, so a screen refetching on the
  // event stamps its request with it.
  announceChartChanged();
  return true;
}
