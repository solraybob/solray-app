// Terms of Use link for the paywall, by platform.
//
// On iOS, Apple's standard licence agreement (EULA) is the Terms of Use for an
// App Store subscription and App Review expects it. Everywhere else (Android,
// the web) the member's terms are Solray's own, at solray.ai/legal.
export const APPLE_EULA_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";
export const SOLRAY_TERMS_URL = "https://solray.ai/legal";

export function termsOfUseUrl(): string {
  try {
    const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
    if (cap?.getPlatform?.() === "ios") return APPLE_EULA_URL;
  } catch { /* SSR or not native */ }
  return SOLRAY_TERMS_URL;
}
