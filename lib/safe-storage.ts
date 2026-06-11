"use client";

/**
 * Storage that never throws.
 *
 * localStorage and sessionStorage throw in real browsers more often than
 * intuition suggests: Safari private mode (quota 0 historically, still
 * fussy), Firefox with cookies disabled, embedded webviews with storage
 * partitioned off, and plain quota exhaustion. The 2026-06-11 audit found
 * four paths where such a throw crashed the app shell, blocked login after
 * a SUCCESSFUL backend auth, broke tab navigation, or stopped chat saves.
 * Every storage access in those paths goes through here now: persistence
 * is best-effort, the app keeps working from memory.
 */

export function safeGet(key: string, session = false): string | null {
  try {
    return (session ? window.sessionStorage : window.localStorage).getItem(key);
  } catch {
    return null;
  }
}

export function safeSet(key: string, value: string, session = false): boolean {
  try {
    (session ? window.sessionStorage : window.localStorage).setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeRemove(key: string, session = false): void {
  try {
    (session ? window.sessionStorage : window.localStorage).removeItem(key);
  } catch {
    /* gone is gone */
  }
}
