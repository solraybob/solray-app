// Round fourteen (Codex out11-5):
// #1 a full localStorage never stops a conversation from reaching the
//    server: the newest transcript is kept in memory (by account) before
//    storage is tried, queued uploads read it, and a full storage frees
//    only what can be rebuilt (old dated forecast/week caches, then the
//    oldest transcripts the server already holds whole);
// #2 the automatic chat entries ("Go deeper" seeded question, Dynamics
//    opening) read /chat answers as an ordinary send does: cards kept whole
//    and drawn without streaming, crisis turns tagged, refusal support cards.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { installBrowser, load, MemStorage } = require("./helpers.cjs");

installBrowser();
/** Storage with a size limit (characters of keys and values). */
class QuotaStorage extends MemStorage {
  constructor(limit) { super(); this.limit = limit; }
  used() { let n = 0; for (const [k, v] of this.m) n += k.length + v.length; return n; }
  setItem(k, v) {
    const prev = this.m.has(k) ? k.length + this.m.get(k).length : 0;
    if (this.used() - prev + k.length + String(v).length > this.limit) {
      const e = new Error("QuotaExceededError"); e.name = "QuotaExceededError"; throw e;
    }
    super.setItem(k, v);
  }
}
const store = new QuotaStorage(Infinity);
global.localStorage = store;
window.localStorage = store;

const root = path.join(__dirname, "..");
const page = () => fs.readFileSync(path.join(root, "app/chat/page.tsx"), "utf8");
const session = load("lib/account-session.js");
const sync = load("lib/chat-sync.js");

function server() {
  const sessions = new Map();
  const puts = [];
  global.fetch = async (url, init = {}) => {
    const method = (init.method || "GET").toUpperCase();
    const u = new URL(url);
    const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
    const id = decodeURIComponent(u.pathname.split("/").pop());
    if (method === "GET") return sessions.has(id) ? json(200, sessions.get(id)) : json(404, { detail: "Session not found" });
    if (method === "PUT") {
      const body = JSON.parse(init.body);
      puts.push({ id, ids: body.messages.map((x) => x.id) });
      const cur = sessions.get(id);
      const known = new Set((cur?.messages || []).map((x) => x.id));
      const messages = [...(cur?.messages || []), ...body.messages.filter((x) => !known.has(x.id))];
      const rev = (cur?.revision || 0) + 1;
      sessions.set(id, { session_id: id, messages, revision: rev, last_message_at: "t" + rev });
      return json(200, { session_id: id, messages, revision: rev, last_message_at: "t" + rev });
    }
    return json(405, {});
  };
  return { sessions, puts };
}
const msg = (id, role = "user", content = `msg ${id}`) =>
  ({ id, role, content, timestamp: `2026-10-08T10:00:${String(id).padStart(2, "0").slice(-2)}Z` });
const gen = () => session.getAuthGeneration();
const full = () => { store.limit = store.used(); };
const roomy = () => { store.limit = Infinity; };

test("storage full: a new conversation still uploads its turns", async () => {
  const srv = server();
  roomy();
  full();
  sync.noteNewSession("q1");
  sync.saveSession({ sessionId: "q1", date: "", messages: [msg("1"), msg("2", "assistant")] });
  // Not in storage, but readable.
  assert.equal(store.getItem(session.accountKey("solray_chat_q1")), null);
  assert.deepEqual(sync.loadSession("q1").messages.map((m) => m.id), ["1", "2"]);
  assert.ok(sync.getSessionIds().includes("q1"));
  assert.equal(await sync.pushSessionToServer(sync.loadSession("q1"), "tok", gen()), true);
  assert.deepEqual(srv.sessions.get("q1").messages.map((m) => m.id), ["1", "2"]);
  roomy();
});

test("storage full: an existing conversation uploads its newest turns, not the older cached copy", async () => {
  const srv = server();
  roomy();
  sync.noteNewSession("q2");
  sync.saveSession({ sessionId: "q2", date: "", messages: [msg("1")] });
  assert.equal(await sync.pushSessionToServer(sync.loadSession("q2"), "tok", gen()), true);
  full();
  sync.saveSession({ sessionId: "q2", date: "", messages: [msg("1"), msg("2", "assistant"), msg("3")] });
  // Storage still holds the older copy; the upload reads the newest.
  assert.equal(JSON.parse(store.getItem(session.accountKey("solray_chat_q2"))).messages.length, 1);
  assert.equal(await sync.pushSessionToServer(sync.loadSession("q2"), "tok", gen()), true);
  assert.deepEqual(srv.sessions.get("q2").messages.map((m) => m.id), ["1", "2", "3"]);
  // Pending filtering still holds on the in-memory copy.
  sync.markMessagePending("4");
  sync.saveSession({ sessionId: "q2", date: "", messages: [msg("1"), msg("2", "assistant"), msg("3"), msg("4")] });
  assert.equal(await sync.pushSessionToServer(sync.loadSession("q2"), "tok", gen()), true);
  assert.ok(!srv.puts.at(-1).ids.includes("4"));
  sync.settleMessage("4");
  // Space again: the next write reaches storage and memory lets go.
  roomy();
  sync.saveSession({ sessionId: "q2", date: "", messages: [msg("1"), msg("2", "assistant"), msg("3"), msg("4")] });
  assert.equal(JSON.parse(store.getItem(session.accountKey("solray_chat_q2"))).messages.length, 4);
  store.setItem(session.accountKey("solray_chat_q2"), JSON.stringify({ sessionId: "q2", date: "", messages: [msg("9")] }));
  assert.deepEqual(sync.loadSession("q2").messages.map((m) => m.id), ["9"]);
});

test("self-heal: old dated forecast and week caches go first; today's stay", () => {
  roomy();
  const k = (b) => session.accountKey(b);
  const pad = "x".repeat(400);
  store.setItem(k("solray_forecast_2020-01-01"), pad);
  store.setItem(k("solray_week_en_2020-01-02"), pad);
  const today = new Date().toISOString().split("T")[0];
  store.setItem(k(`solray_forecast_${today}`), pad);
  store.setItem(k("solray_blueprint"), pad);
  full();
  sync.saveSession({ sessionId: "q3", date: "", messages: [msg("1", "user", "y".repeat(300))] });
  assert.ok(store.getItem(k("solray_chat_q3")), "written after freeing space");
  assert.equal(store.getItem(k("solray_forecast_2020-01-01")), null);
  assert.ok(store.getItem(k(`solray_forecast_${today}`)));
  assert.ok(store.getItem(k("solray_blueprint")), "charts are never evicted");
  roomy();
});

test("self-heal: only the oldest transcripts the server holds whole are evicted", () => {
  roomy();
  const k = (b) => session.accountKey(b);
  // Newest first in the list. "old-synced" is evictable; the others are not.
  const keep = ["old-unsent", "old-unconfirmed", "old-status"];
  for (const id of ["old-synced", ...keep]) {
    sync.saveSession({ sessionId: id, date: "", messages: [msg("5" + id.length, "user", "z".repeat(500)), { ...msg(id), id: `${id}-m` }] });
  }
  sync.markServerConfirmed(["old-synced", "old-unsent", "old-status"]);
  sync.markUnsent("old-unsent");
  sync.markMessagePending("old-status-m");
  sync.releaseMessage("old-status-m");
  // The list: these four are the oldest.
  sync.saveSessionIds([...sync.getSessionIds().filter((x) => x !== "old-synced" && !keep.includes(x)), ...keep, "old-synced"]);
  full();
  sync.saveSession({ sessionId: "q4", date: "", messages: [msg("1", "user", "w".repeat(300))] });
  assert.ok(store.getItem(k("solray_chat_q4")));
  assert.equal(store.getItem(k("solray_chat_old-synced")), null);
  for (const id of keep) assert.ok(store.getItem(k(`solray_chat_${id}`)), id);
  // Its sync record is gone, so the next sync reads it back from the server.
  assert.equal(sync.getLocalMeta()["old-synced"], undefined);
  roomy();
});

test("a removed conversation is gone from memory too; sign-out forgets memory", () => {
  roomy();
  full();
  sync.saveSession({ sessionId: "q5", date: "", messages: [msg("1")] });
  assert.ok(sync.loadSession("q5"));
  sync.removeCachedSession("q5");
  assert.equal(sync.loadSession("q5"), null);
  sync.saveSession({ sessionId: "q6", date: "", messages: [msg("1")] });
  assert.ok(sync.loadSession("q6"));
  session.runAccountSignOutHooks(null);
  assert.equal(sync.loadSession("q6"), null);
  roomy();
});

test("chat page: deleting and restoring a conversation go through the cache helpers", () => {
  const src = page();
  assert.ok(src.includes("removeCachedSession(sid);"));
  assert.ok(src.includes("storeTranscript(snapshot);"));
  assert.ok(!/localStorage\.(setItem|removeItem)\(accountKey\(`solray_chat_/.test(src));
});

test("chat page: the seeded question and the Dynamics opening read /chat as a send does", () => {
  const src = page();
  const seeded = src.slice(src.indexOf('const data = await apiFetch("/chat", {'), src.indexOf("// fall through"));
  assert.ok(seeded.includes('const answer = answerFromChat(data, t("chat.error_no_response"));'));
  assert.ok(seeded.includes("const next = withAnswer(seed, userMsg.id, answer);"));
  assert.ok(seeded.includes("land(next, answer.reply.crisis || answer.reply.isError ? undefined : answer.reply);"));
  // (Round fifteen: failures go through the shared openingFailed.)
  assert.ok(seeded.includes("openingFailed(err, {"));
  assert.ok(!seeded.includes("data.response || data.message"));
  const i = src.indexOf("// Auto-send the compatibility message");
  const dyn = src.slice(i, src.indexOf("// Fall through to normal init", i));
  assert.ok(dyn.includes('const answer = answerFromChat(data, t("chat.error_no_response"));'));
  assert.ok(dyn.includes("const next = withAnswer(newSession.messages, userMsg.id, answer);"));
  assert.ok(dyn.includes("land(next, answer.reply.crisis ? undefined : answer.reply);"));
  assert.ok(dyn.includes('if (answer.reply.isError) throw new Error("empty souls reply");'));
  assert.ok(dyn.includes("openingFailed(err, {"));
  assert.ok(src.includes("const support = supportFromRefusal(err instanceof ApiError ? err.detail : null, failedAt);"));
  // Every /chat answer in the page goes through the shared reading or the
  // send's own card handling; none keeps only the text.
  assert.equal((src.match(/data\.response \|\| data\.message/g) || []).length, 1);
});

test("withAnswer on an automatic entry: crisis card kept whole and both messages tagged", () => {
  const outcome = load("lib/chat-outcome.js");
  const seed = [msg("q")];
  const answer = outcome.answerFromChat({ response: "Call 112.", crisis_card: { variant: "standard", intro: "x" }, crisis_turn: true }, "none");
  const next = outcome.withAnswer(seed, "q", answer);
  assert.equal(next[0].safety, "crisis");
  assert.equal(next[1].safety, "crisis");
  assert.equal(next[1].crisis.variant, "standard");
});
