// The Oracle's memory, as the member controls it from Settings.
//
// Backend behaviour (api/main.py, db/database.py):
//  - personalization_memory ON (the default): the Oracle keeps what matters
//    from conversations and uses it in later ones.
//  - OFF: nothing new is remembered, and stored memory is not used; the
//    Oracle answers from the chart and the current conversation. What is
//    already stored stays until the member clears it.
//  - DELETE /memory ("Clear memory"): deletes memories, recalled moments,
//    the Oracle's notes on the member's arc, breakthroughs, anticipations
//    and the private reads, and stops any synthesis still running from
//    writing back. The chart and the visible conversations are kept.
import { apiFetch } from "./api";

export const MEMORY_SCOPE = "personalization_memory";

/** The memory switch from a GET /users/me/consents payload (null: unknown). */
export function memoryFromConsents(payload: unknown): boolean | null {
  const o = (payload && typeof payload === "object" ? payload : {}) as Record<string, any>;
  const v = o.scopes && typeof o.scopes === "object" ? o.scopes[MEMORY_SCOPE] : undefined;
  return typeof v === "boolean" ? v : null;
}

/** Reads the memory switch as the server holds it. Throws on failure. */
export async function loadMemorySetting(token: string): Promise<boolean | null> {
  return memoryFromConsents(await apiFetch("/users/me/consents", {}, token));
}

/** Saves the switch; resolves to the state the server stored. Throws on failure. */
export async function saveMemorySetting(granted: boolean, token: string): Promise<boolean> {
  const res = await apiFetch(`/users/me/consents/${MEMORY_SCOPE}`, {
    method: "PUT",
    body: JSON.stringify({ granted }),
  }, token);
  if (!res || typeof res.granted !== "boolean") throw new Error("memory setting not confirmed");
  return res.granted;
}

/** "Clear memory". Resolves once the server confirms; throws otherwise. */
export async function clearMemory(token: string): Promise<void> {
  const res = await apiFetch("/memory", { method: "DELETE" }, token);
  if (!res || res.cleared !== true) throw new Error("memory not cleared");
}
