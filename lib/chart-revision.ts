// Birth-data revision for chart-derived caches.
//
// The blueprint, astrocartography, cycles, forecasts, the week view and
// compatibility readings are all computed from the member's birth moment and
// cached in localStorage. When the birth details change (an edit here, or on
// another device) every one of them is stale. The revision is a fingerprint
// of the birth fields; whenever the app reads the profile it compares the
// fingerprint with the one the caches were built under and drops them all on
// a mismatch.

const REV_KEY = "solray_birth_rev";

const DERIVED_EXACT = ["solray_blueprint", "solray_astrocarto"];
const DERIVED_PREFIX = ["solray_cycles_", "solray_forecast_", "solray_week_", "solray_compat_"];

type BirthFields = {
  birth_date?: unknown;
  birth_time?: unknown;
  birth_city?: unknown;
  birth_lat?: unknown;
  birth_lon?: unknown;
};

export function birthRevision(p: BirthFields | null | undefined): string | null {
  if (!p || !p.birth_date) return null;
  const n = (v: unknown) => (typeof v === "number" && isFinite(v) ? v.toFixed(4) : "");
  return [String(p.birth_date), String(p.birth_time ?? ""), String(p.birth_city ?? ""), n(p.birth_lat), n(p.birth_lon)].join("|");
}

export function currentBirthRevision(): string | null {
  try { return localStorage.getItem(REV_KEY); } catch { return null; }
}

// Bumped whenever the derived caches are dropped in this tab. Together with
// the stored revision it tells work that started before a birth change
// apart from work that started after it, even when an edit is undone
// (A to B to A gives the same revision but a new epoch).
let chartEpoch = 0;

function isDerivedKey(k: string): boolean {
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

/** Writes a chart-derived cache entry only if the chart has not changed since `stamp`. */
export function writeChartCache(stamp: ChartStamp, key: string, value: unknown, store: "local" | "session" = "local"): boolean {
  if (!chartStampCurrent(stamp)) return false;
  try {
    (store === "local" ? localStorage : sessionStorage).setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
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
  try { localStorage.setItem(REV_KEY, rev); } catch { /* ignore */ }
  return true;
}
