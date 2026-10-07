// Account generation.
//
// Every time the signed-in identity changes (login, signup, logout, a dead
// session wiped by a 401) the generation number goes up. Any work that
// started under an older generation belongs to the previous account and must
// not touch state that the current account will read: no cache writes, no
// uploads, no logout triggered by its late 401.
//
// apiFetch captures the generation when a request starts and throws
// StaleAccountError if the generation moved while it was in flight, so the
// code after an `await apiFetch(...)` never runs for a previous account.
// Code that uses raw fetch, or several awaits in a row, captures
// getAuthGeneration() up front and checks isCurrentGeneration() after each
// await before writing anything.

let generation = 0;

export function getAuthGeneration(): number {
  return generation;
}

export function isCurrentGeneration(g: number): boolean {
  return g === generation;
}

/** Called by the auth layer whenever the signed-in identity changes. */
export function bumpAuthGeneration(): number {
  generation += 1;
  return generation;
}

export class StaleAccountError extends Error {
  constructor() {
    super("The account changed while this request was in flight.");
    this.name = "StaleAccountError";
  }
}

export function isStaleAccountError(e: unknown): boolean {
  return e instanceof StaleAccountError;
}
