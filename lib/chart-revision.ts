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

/** Drop every cache computed from the birth chart. */
export function clearChartDerivedCaches(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (DERIVED_EXACT.includes(k) || DERIVED_PREFIX.some((p) => k.startsWith(p))) {
        localStorage.removeItem(k);
      }
    }
  } catch { /* storage unavailable: nothing cached */ }
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
