"use client";

/**
 * Browser-side card tokenization against Teya/Borgun RPG.
 *
 * The card number is sent by the VISITOR'S BROWSER directly to Borgun's
 * /api/token/single endpoint using the PUBLIC access token (a publishable
 * key, like Stripe's pk_). The PAN never touches a Solray server; we only
 * ever see the resulting single-use token, which the backend converts into
 * a multi-use token for monthly billing. This is the integration path Teya
 * support prescribed (2026-06-11) in place of SecurePay, which never
 * returns reusable tokens.
 */

const RPG_URL =
  (process.env.NEXT_PUBLIC_TEYA_RPG_URL || "https://ecommerce.borgun.is/rpg").replace(/\/$/, "");
const PUBLIC_KEY = (process.env.NEXT_PUBLIC_TEYA_PUBLIC_KEY || "").trim();
const TOKENIZE_DEADLINE_MS = 20_000;

/** code lets the UI pick a localized message; message is for logs only. */
export class CardTokenError extends Error {
  code: "not_configured" | "network" | "declined";
  constructor(code: "not_configured" | "network" | "declined", message = "") {
    super(message);
    this.code = code;
  }
}

export function luhnValid(pan: string): boolean {
  const digits = pan.replace(/\D/g, "");
  if (digits.length < 12 || digits.length > 19) return false;
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

export async function createSingleUseToken(
  pan: string,
  expMonth: string,
  expYear: string
): Promise<string> {
  if (!PUBLIC_KEY) throw new CardTokenError("not_configured", "Card service is not configured.");
  const body = new URLSearchParams({
    PAN: pan.replace(/\D/g, ""),
    ExpMonth: expMonth.padStart(2, "0"),
    ExpYear: expYear.length === 2 ? `20${expYear}` : expYear,
    TokenLifetime: "300",
  });
  let res: Response;
  // Bounded: a hung card service must not leave the form on "Saving..."
  // forever. Tokenising charges nothing, so a timeout is safe to retry.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TOKENIZE_DEADLINE_MS);
  try {
    res = await fetch(`${RPG_URL}/api/token/single`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${PUBLIC_KEY}:`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      signal: ctrl.signal,
    });
  } catch {
    throw new CardTokenError("network", "Could not reach the card service.");
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.Token) {
    // The processor's raw Message stays out of the UI (Codex audit):
    // decline phrasing and validator internals are telemetry, not copy.
    if (data.Message) console.debug("[teya-card]", String(data.Message).slice(0, 120));
    throw new CardTokenError("declined");
  }
  return data.Token as string;
}
