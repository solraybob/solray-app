// Pure helpers for chat history sync (app/chat/page.tsx), kept here so they
// can be tested without the page.

export interface MergeableMessage {
  id: string;
  content: string;
  timestamp: string;
}

/**
 * Union of two transcripts of the same conversation, by message id: the
 * server's copy, plus anything only this device has (sent while the sync was
 * still running), in time order. The server's copy wins for shared ids.
 */
export function mergeMessages<T extends MergeableMessage>(server: T[], local: T[]): T[] {
  const seen = new Set(server.map((m) => m.id));
  const extra = local.filter((m) => !seen.has(m.id));
  if (extra.length === 0) return server;
  return [...server, ...extra].sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
}

export function sameTranscript<T extends MergeableMessage>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].content !== b[i].content) return false;
  }
  return true;
}
