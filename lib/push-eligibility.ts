/**
 * When the push permission sheet may be offered, per member.
 *
 * Everything here is keyed by the signed-in member's id, so what one
 * account has seen never qualifies another account on the same phone.
 * "Value seen" means one of:
 *   - an Oracle reply arrived for this member, or
 *   - a Today reading was actually displayed for this member on a later
 *     local day than the first one they were shown.
 * Opening the Today route alone counts for nothing: a failing or empty
 * Today never signals a reading (see signalReadingShown in native-push).
 *
 * The soft ask ("Not now" waits ten days, at most three offers) is also
 * per member. Pure storage helpers; no React, no Capacitor.
 */

const VALUE_SEEN_PREFIX = "solray_push_value_seen:";
const FIRST_READING_PREFIX = "solray_push_first_reading:";
const SOFT_ASK_PREFIX = "solray_push_soft_ask:";

// Device-wide keys from the previous build. They mixed accounts, so they
// are removed rather than migrated to anyone.
const LEGACY_KEYS = ["solray_push_value_seen", "solray_push_first_today", "solray_push_soft_ask"];

export const SOFT_ASK_MAX = 3;
export const SOFT_ASK_SNOOZE_MS = 10 * 24 * 60 * 60 * 1000;

export function localDay(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function write(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}

export function sweepLegacyEligibility(): void {
  try { for (const k of LEGACY_KEYS) localStorage.removeItem(k); } catch { /* ignore */ }
}

/** A Today reading was displayed for this member. */
export function noteReadingShown(memberId: string, day: string = localDay()): void {
  if (!memberId) return;
  const key = FIRST_READING_PREFIX + memberId;
  const first = read(key);
  if (!first) write(key, day);
  else if (first < day) write(VALUE_SEEN_PREFIX + memberId, "1");
}

/** An Oracle reply arrived for this member. */
export function noteOracleReply(memberId: string): void {
  if (!memberId) return;
  write(VALUE_SEEN_PREFIX + memberId, "1");
}

export function hasSeenValue(memberId: string): boolean {
  return !!memberId && read(VALUE_SEEN_PREFIX + memberId) === "1";
}

function softAskState(memberId: string): { count: number; at: number } {
  try {
    const raw = read(SOFT_ASK_PREFIX + memberId);
    if (!raw) return { count: 0, at: 0 };
    const v = JSON.parse(raw);
    return { count: Number(v.count) || 0, at: Number(v.at) || 0 };
  } catch {
    return { count: 0, at: 0 };
  }
}

export function softAskAllowed(memberId: string, now: number = Date.now()): boolean {
  if (!memberId) return false;
  const s = softAskState(memberId);
  if (s.count >= SOFT_ASK_MAX) return false;
  return !s.at || now - s.at >= SOFT_ASK_SNOOZE_MS;
}

export function recordSoftAsk(memberId: string, now: number = Date.now()): void {
  if (!memberId) return;
  const s = softAskState(memberId);
  write(SOFT_ASK_PREFIX + memberId, JSON.stringify({ count: s.count + 1, at: now }));
}

/** May the sheet be offered to this member now (ignoring OS permission)? */
export function mayOfferPushAsk(memberId: string, now: number = Date.now()): boolean {
  return hasSeenValue(memberId) && softAskAllowed(memberId, now);
}
