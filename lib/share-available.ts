// Share availability, kept apart from lib/share-card (which pulls in the
// canvas capture library) so screens can decide whether to show a share
// button without loading it.

export function nativePlatform(): string {
  try {
    const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string; isNativePlatform?: () => boolean } }).Capacitor;
    if (cap?.isNativePlatform?.()) return cap.getPlatform?.() || "native";
  } catch { /* not native */ }
  return "";
}

export class ShareUnavailableError extends Error {
  constructor() {
    super("Sharing is not available here.");
    this.name = "ShareUnavailableError";
  }
}

/**
 * Whether a share button can do anything on this device. On the web the
 * download fallback always works. Inside the native shell a download link
 * does nothing (the Android WebView has no download handler and no Web Share
 * API), so the button is only offered when the system share sheet exists.
 */
export function cardShareAvailable(): boolean {
  if (typeof window === "undefined") return false;
  if (!nativePlatform()) return true;
  return typeof (navigator as Navigator & { share?: unknown }).share === "function";
}
