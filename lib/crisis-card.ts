// The crisis card payload the server sends (ai/crisis_lines.py): on /chat as
// `crisis_card` (a crisis turn), as `support_card` (an under-age account) or
// inside a consent refusal as `detail.support` (a member without AI consent
// who may be struggling). Drawn by components/CrisisCard.tsx.

export interface CrisisLine {
  type: "call" | "text" | "chat";
  value: string;
  href: string;
  label: string;
  service?: string;
  keyword?: string;
}

export interface CrisisCountry {
  country: string;
  name: string;
  service: string;
  emergency?: string;
  lines: CrisisLine[];
}

export interface CrisisCardData {
  variant: "standard" | "urgent" | "support";
  language?: string;
  country?: string | null;
  intro: string;
  emergency?: { number?: string | null; text: string; href?: string | null; label?: string | null };
  steps?: string[];
  primary_title?: string;
  primary?: CrisisCountry | null;
  others_title?: string;
  others?: CrisisCountry[];
  findahelpline?: { text: string; href: string; label: string };
  closing?: string;
}

export const SAFE_HREF = /^(tel:|sms:|https:\/\/)/;

/** A card payload from the server, or null when it is not one. */
export function asCrisisCard(v: unknown): CrisisCardData | null {
  if (!v || typeof v !== "object") return null;
  const c = v as Partial<CrisisCardData>;
  if (typeof c.intro !== "string" || !c.variant) return null;
  if (!["standard", "urgent", "support"].includes(c.variant)) return null;
  return c as CrisisCardData;
}

