// Request shapes for the Oracle chat routes (/chat, /chat/synthesize).
//
// The backend resolves the other person's chart itself (A14): the app names
// WHO the reading is with (an accepted soul connection or a saved person)
// and never hands over a chart as data. A client chart is only sent for a
// saved person the server has never confirmed (created offline, not synced
// yet), where the server recomputes the chart from its birth details.

/** One more person in a family reading, by reference only. */
export type FamilyRef = { name?: string | null; connectionId?: string | null; savedPersonId?: string | null };

export type SoulRef = {
  connectionId?: string | null;
  savedPersonId?: string | null;
  // Legacy fallback only (see above). Never sent when an id is known.
  blueprint?: Record<string, unknown> | null;
  // A family reading: everyone selected besides the focal person above.
  // The server resolves each chart and checks each person's sharing,
  // consent or recorded permission; no chart or summary goes from here.
  family?: FamilyRef[] | null;
};

/** The family members as the chat request names them. */
export function familyRequestRefs(family: FamilyRef[] | null | undefined): Array<Record<string, string>> {
  if (!Array.isArray(family)) return [];
  const out: Array<Record<string, string>> = [];
  for (const f of family) {
    if (f?.connectionId) out.push({ soul_connection_id: f.connectionId });
    else if (f?.savedPersonId) out.push({ saved_person_id: f.savedPersonId });
  }
  return out;
}

export function soulRequestFields(ref: SoulRef | null | undefined): Record<string, unknown> {
  if (!ref) return {};
  const family = familyRequestRefs(ref.family);
  const extra = family.length > 0 ? { family_partners: family } : {};
  if (ref.connectionId) return { soul_connection_id: ref.connectionId, ...extra };
  if (ref.savedPersonId) return { saved_person_id: ref.savedPersonId, ...extra };
  if (ref.blueprint) return { soul_blueprint: ref.blueprint, ...extra };
  return extra;
}

export type HistoryMessage = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
  safety?: string;
  crisis?: { variant?: string } | null;
};

/** True for both messages of a crisis turn: tagged, or the fixed card itself. */
export function isCrisisTurn(m: HistoryMessage): boolean {
  if (m.safety === "crisis") return true;
  return m.role === "assistant" && !!m.crisis && (m.crisis.variant === "standard" || m.crisis.variant === "urgent");
}

/**
 * Conversation history as the server wants it: the opening greeting left
 * out, app-side error bubbles marked isError so the Oracle never reads
 * them back as something she said, and crisis turns marked
 * safety: "crisis" so the server keeps them away from the AI (and knows
 * the conversation is in care mode).
 */
export function historyForServer(
  messages: HistoryMessage[],
): Array<{ role: string; content: string; isError?: boolean; safety?: "crisis" }> {
  return messages
    .filter((m) => m.id !== "greeting")
    .map((m) => {
      const out: { role: string; content: string; isError?: boolean; safety?: "crisis" } = {
        role: m.role, content: m.content,
      };
      if (m.isError) out.isError = true;
      if (isCrisisTurn(m)) out.safety = "crisis";
      return out;
    });
}

/**
 * A voice message: the text that goes to /chat and the transcript inside
 * it, sent along as voice_transcript so the server classifies the spoken
 * words on their own (typed words around them can never lower their
 * safety class).
 */
export function voiceMessage(typed: string, transcript: string): { text: string; voiceTranscript: string } {
  const base = (typed || "").replace(/\s+$/, "");
  const spoken = (transcript || "").trim();
  return { text: base ? base + " " + spoken : spoken, voiceTranscript: spoken };
}

/** The transcript to send with a message, when the message still contains it. */
export function voiceTranscriptFor(text: string, transcript: string | null | undefined): string | undefined {
  const spoken = (transcript || "").trim();
  return spoken && (text || "").includes(spoken) ? spoken : undefined;
}

/** Who a Dynamics conversation is with, as stored on its opening message
 *  (family: everyone else in a family reading). Ids only, never a chart. */
export type TranscriptFamilyMember = { name?: string | null; connection_id?: string | null; saved_person_id?: string | null };
export type TranscriptSoul = {
  name?: string | null; connection_id?: string | null; saved_person_id?: string | null;
  family?: TranscriptFamilyMember[] | null;
};

/** The family members a transcript names, as references. */
export function familyFromTranscriptSoul(s: { family?: unknown } | null | undefined): FamilyRef[] {
  const raw = s && Array.isArray(s.family) ? s.family : [];
  const out: FamilyRef[] = [];
  for (const f of raw) {
    if (!f || typeof f !== "object") continue;
    const r = f as TranscriptFamilyMember;
    const connectionId = typeof r.connection_id === "string" && r.connection_id ? r.connection_id : null;
    const savedPersonId = typeof r.saved_person_id === "string" && r.saved_person_id ? r.saved_person_id : null;
    if (!connectionId && !savedPersonId) continue;
    out.push({ name: typeof r.name === "string" ? r.name : null, connectionId, savedPersonId });
  }
  return out;
}

/** Family references as the transcript stores them. */
export function familyForTranscript(family: FamilyRef[] | null | undefined): TranscriptFamilyMember[] {
  if (!Array.isArray(family)) return [];
  return family
    .filter((f) => f && (f.connectionId || f.savedPersonId))
    .map((f) => ({ name: f.name ?? null, connection_id: f.connectionId ?? null, saved_person_id: f.savedPersonId ?? null }));
}

/**
 * The Dynamics partner recorded in a transcript (the newest message that
 * carries one), as the chat keeps it in memory. This is what lets a
 * conversation synced from another device, or kept through a reinstall,
 * go on naming its partner: the server then loads that chart and checks
 * the partner's current sharing and consent itself. No chart is stored.
 */
export function soulFromTranscript(
  messages: Array<{ soul?: TranscriptSoul | null }> | null | undefined,
): { name: string | null; connectionId: string | null; savedPersonId: string | null; family?: FamilyRef[] } | null {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const s = messages[i]?.soul;
    if (!s || typeof s !== "object") continue;
    const connectionId = typeof s.connection_id === "string" && s.connection_id ? s.connection_id : null;
    const savedPersonId = typeof s.saved_person_id === "string" && s.saved_person_id ? s.saved_person_id : null;
    if (!connectionId && !savedPersonId) continue;
    const family = familyFromTranscriptSoul(s);
    return {
      name: typeof s.name === "string" ? s.name : null, connectionId, savedPersonId,
      ...(family.length > 0 ? { family } : {}),
    };
  }
  return null;
}
