// Centralized clearing of per-user cached data in localStorage.
//
// The app scatters per-user data across many shared, non-user-scoped keys
// (forecast, blueprint, cycles, avatar, astrocartography, saved people, chat
// sessions, compatibility, per-card dismissals). When the authenticated
// identity changes, every one of these must be wiped, or one account on a
// device reads another account's data. A test account's active "Saturn Return"
// cycle leaking onto a different account's profile (via the non-user-scoped
// solray_cycles_* key) was a real instance of this.
//
// Allowlist approach: wipe every solray_* key EXCEPT the handful that are
// genuinely device-global. Defined once here so the login path
// (auth-context) and the 401 path (api) can never drift apart.

// Device-global keys only. Anything tied to a backend account is per-user and
// must NOT be listed here. Push registration/preference and the trial banner
// are deliberately NOT preserved: they are per-account, so a switch should
// force the new user to re-register push and see their own trial state
// (logout already clears push via the native-push helper).
const PRESERVE_EXACT = new Set<string>([
  "solray_token",                       // session — re-set immediately after login
  "solray_user",                        // session — re-set immediately after login
  "solray_language",                    // device UI language
  "solray_analytics_opt_out",           // device-level consent choice
  "solray_analytics_session",           // anonymous analytics session id
  "solray_install_banner_dismissed_at", // device-level UI dismissal
  "solray_chat_migrated_v1",            // one-time storage-schema migration flag
]);

const PRESERVE_PREFIX = ["solray_cache_cleared", "solray_track_once_"];

/**
 * Remove every per-user solray_* localStorage key, preserving only the
 * device-global allowlist above. Safe to call when storage is unavailable.
 */
export function clearUserScopedCaches(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith("solray_")) continue;
      if (PRESERVE_EXACT.has(k)) continue;
      if (PRESERVE_PREFIX.some((p) => k.startsWith(p))) continue;
      localStorage.removeItem(k);
    }
  } catch {
    /* ignore storage errors (private mode / unavailable) */
  }
}
