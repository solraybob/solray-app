/**
 * Flatten a FastAPI `detail` payload into a readable sentence.
 *
 * FastAPI returns `detail` as a string for HTTPException, but as an array of
 * `{loc, msg, type}` objects for request-validation (422) errors, and some of
 * our own routes return an object. Passing any of the non-string shapes to
 * `new Error()` printed "[object Object]" to members. Every error path that
 * surfaces a backend detail goes through here.
 */
export function errorText(detail: unknown, fallback: string): string {
  if (detail == null) return fallback;
  if (typeof detail === "string") return detail.trim() || fallback;
  if (typeof detail === "number" || typeof detail === "boolean") return String(detail);
  if (Array.isArray(detail)) {
    const parts = detail
      .map((d) => {
        if (typeof d === "string") return d;
        if (d && typeof d === "object") {
          const o = d as Record<string, unknown>;
          if (typeof o.msg === "string") return o.msg;
          if (typeof o.message === "string") return o.message;
        }
        return "";
      })
      .filter(Boolean);
    return parts.length ? parts.join(". ") : fallback;
  }
  if (typeof detail === "object") {
    const o = detail as Record<string, unknown>;
    for (const k of ["message", "msg", "detail", "error"]) {
      const v = o[k];
      if (v != null && v !== detail) {
        const s = errorText(v, "");
        if (s) return s;
      }
    }
  }
  return fallback;
}
