// Drafts the member typed and has not sent or saved yet.
//
// The update reload (components/VersionCheck) must never throw one away.
// Comparing a field's value with its defaultValue does not work for React
// controlled inputs: React keeps defaultValue in step with value on every
// render, so a typed chat message looks untouched. Instead every field the
// member types into is remembered here (from the input event), and a draft
// exists while such a field is still on the page and still holds text.
// Sending a message clears its field, and leaving the page removes it, so
// both end the draft.

type FieldLike = {
  tagName?: string;
  type?: string;
  value?: string;
  textContent?: string | null;
  isContentEditable?: boolean;
  isConnected?: boolean;
};

// Fields whose value the member chooses by typing or picking. Date and time
// pickers count too: a birth date picked and not saved is a draft.
const TEXT_TYPES = new Set([
  "", "text", "email", "search", "password", "tel", "url", "number",
  "date", "time", "datetime-local", "month", "week",
]);

const typed = new Set<FieldLike>();

export function isTextField(el: unknown): el is FieldLike {
  if (!el || typeof el !== "object") return false;
  const f = el as FieldLike;
  const tag = (f.tagName || "").toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") return TEXT_TYPES.has((f.type || "").toLowerCase());
  return f.isContentEditable === true;
}

/** Record that the member typed into this field. */
export function noteTyping(target: unknown): void {
  if (isTextField(target)) typed.add(target);
}

function textOf(f: FieldLike): string {
  if (f.isContentEditable && typeof f.value !== "string") return f.textContent || "";
  return typeof f.value === "string" ? f.value : "";
}

// Screens that know their own unsent text, whatever put it there: the chat
// composer is filled by voice transcription through React state, which fires
// no input event, so the field-based tracking above never sees it.
const sources = new Set<() => boolean>();

/**
 * Register a check for unsent text a screen holds (true while there is
 * some). Returns the cleanup, to call when the screen goes away.
 */
export function registerDraftSource(hasDraft: () => boolean): () => void {
  sources.add(hasDraft);
  return () => { sources.delete(hasDraft); };
}

/** True while some field the member typed into is on screen and not empty,
 *  or a registered screen holds unsent text. */
export function hasTypedDraft(): boolean {
  for (const f of Array.from(typed)) {
    if (f.isConnected === false) { typed.delete(f); continue; }
    if (textOf(f).trim() !== "") return true;
  }
  for (const has of Array.from(sources)) {
    try {
      if (has()) return true;
    } catch {
      return true; // unknown: never risk losing what the member wrote
    }
  }
  return false;
}

/** Listen for typing anywhere on the page. Returns the cleanup. */
export function installDraftTracking(doc: { addEventListener: Document["addEventListener"]; removeEventListener: Document["removeEventListener"] }): () => void {
  const onInput = (e: Event) => noteTyping(e.target);
  doc.addEventListener("input", onInput, true);
  return () => doc.removeEventListener("input", onInput, true);
}

// ─── Unfinished work that is not text ──────────────────────────────────────
//
// Things a reload would destroy that no field shows: a voice recording from
// the moment the microphone is asked for until its transcription has taken
// over (or it is cancelled), a photo being read and resized before upload,
// a store purchase sheet, a multi-step form whose earlier steps live only
// in memory. A screen either holds a token for the duration
// (beginUnfinishedWork) or registers a check (registerUnfinishedWork).
let held = 0;
const workSources = new Set<() => boolean>();

/** Hold the update reload until the returned release is called (once;
 *  later calls do nothing). */
export function beginUnfinishedWork(): () => void {
  held += 1;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    held -= 1;
  };
}

/** Register a check for unfinished work a screen holds (true while some).
 *  Returns the cleanup, to call when the screen goes away. */
export function registerUnfinishedWork(isBusy: () => boolean): () => void {
  workSources.add(isBusy);
  return () => { workSources.delete(isBusy); };
}

/** True while anything a reload would lose is under way. */
export function hasUnfinishedWork(): boolean {
  if (held > 0) return true;
  for (const busy of Array.from(workSources)) {
    try {
      if (busy()) return true;
    } catch {
      return true; // unknown: never risk it
    }
  }
  return false;
}

/** For tests. */
export function resetDraftTracking(): void {
  typed.clear();
  sources.clear();
  workSources.clear();
  held = 0;
}
