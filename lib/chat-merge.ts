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
 * still running), in time order. The server's copy wins for shared ids,
 * except that fields it lacks are taken from this device's copy (a Dynamics
 * partner reference written onto an opening message), as the server does.
 */
export function mergeMessages<T extends MergeableMessage>(server: T[], local: T[]): T[] {
  const byId = new Map(local.map((m) => [m.id, m] as const));
  let filled = false;
  const base = server.map((m) => {
    const mine = byId.get(m.id) as Record<string, unknown> | undefined;
    if (!mine) return m;
    let out: Record<string, unknown> | null = null;
    for (const k of Object.keys(mine)) {
      if (!(k in m) && mine[k] !== undefined && mine[k] !== null) {
        out = out || { ...(m as unknown as Record<string, unknown>) };
        out[k] = mine[k];
      }
    }
    if (!out) return m;
    filled = true;
    return out as unknown as T;
  });
  const seen = new Set(server.map((m) => m.id));
  const extra = local.filter((m) => !seen.has(m.id));
  if (extra.length === 0) return filled ? base : server;
  return [...base, ...extra].sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
}

function soulKey(m: MergeableMessage): string {
  const s = (m as { soul?: unknown }).soul;
  return s ? JSON.stringify(s) : "";
}

export function sameTranscript<T extends MergeableMessage>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].content !== b[i].content || soulKey(a[i]) !== soulKey(b[i])) return false;
  }
  return true;
}
