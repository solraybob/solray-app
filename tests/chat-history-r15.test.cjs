// Round fifteen (Codex out12-5 #2): a conversation evicted from the device
// cache to make room stays in History (name, date, first line kept), and is
// read back from the server when opened, with loading and failure states.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { installBrowser, load, MemStorage } = require("./helpers.cjs");

installBrowser();
class QuotaStorage extends MemStorage {
  constructor() { super(); this.limit = Infinity; }
  used() { let n = 0; for (const [k, v] of this.m) n += k.length + v.length; return n; }
  setItem(k, v) {
    const prev = this.m.has(k) ? k.length + this.m.get(k).length : 0;
    if (this.used() - prev + k.length + String(v).length > this.limit) throw new Error("QuotaExceededError");
    super.setItem(k, v);
  }
}
const store = new QuotaStorage();
global.localStorage = store;
window.localStorage = store;

const root = path.join(__dirname, "..");
const page = () => fs.readFileSync(path.join(root, "app/chat/page.tsx"), "utf8");
const session = load("lib/account-session.js");
const sync = load("lib/chat-sync.js");
const gen = () => session.getAuthGeneration();
const msg = (id, role = "user", content = `msg ${id}`) => ({ id, role, content, timestamp: `2026-10-0${id.length % 9}T10:00:00Z` });

let serverCopy = null;
let serverStatus = 200;
global.fetch = async () => ({
  ok: serverStatus === 200, status: serverStatus,
  json: async () => (serverStatus === 200 ? serverCopy : serverStatus === 404 ? { detail: "Session not found" } : {}),
});

/** Evict "old" by filling storage while writing "new". */
let round = 0;
function evictOld() {
  round++;
  store.limit = Infinity;
  sync.removeCachedSession("new");
  sync.saveSession({ sessionId: "old", date: "Oct 1", customName: "Saturn talk", messages: [msg("o1", "user", "What is my Saturn return?"), msg("o2", "assistant", "z".repeat(800))] });
  sync.markServerConfirmed(["old"]);
  sync.saveSessionIds(["new", "old"]);
  store.limit = store.used();
  sync.saveSession({ sessionId: "new", date: "Oct 8", messages: [msg("n1", "user", "w".repeat(400 + round))] });
  store.limit = Infinity;
}

test("an evicted conversation stays in History from its summary", () => {
  evictOld();
  assert.equal(sync.loadSession("old"), null);
  const rows = sync.historySessions();
  const old = rows.find((r) => r.sessionId === "old");
  assert.ok(old, "still listed");
  assert.equal(old.customName, "Saturn talk");
  assert.equal(old.date, "Oct 1");
  assert.equal(old.evicted.preview, "What is my Saturn return?");
  assert.deepEqual(old.messages, []);
  assert.ok(rows.find((r) => r.sessionId === "new" && !r.evicted));
});

test("opening it reads it back from the server; the summary gives way to the transcript", async () => {
  evictOld();
  serverStatus = 200;
  serverCopy = { session_id: "old", date_label: "Oct 1", custom_name: "Saturn talk", messages: [msg("o1"), msg("o2", "assistant")], revision: 3, last_message_at: "t3" };
  const got = await sync.fetchSessionFromServer("old", "tok", gen());
  assert.equal(got.kind, "found");
  assert.deepEqual(got.session.messages.map((m) => m.id), ["o1", "o2"]);
  assert.ok(sync.loadSession("old"));
  assert.equal(sync.getEvictedSummary("old"), null);
  assert.equal(sync.historySessions().find((r) => r.sessionId === "old").evicted, undefined);
});

test("a failed read keeps the summary (to try again); a server not-found forgets it", async () => {
  evictOld();
  serverStatus = 500;
  assert.equal((await sync.fetchSessionFromServer("old", "tok", gen())).kind, "failed");
  assert.ok(sync.getEvictedSummary("old"));
  assert.ok(sync.getSessionIds().includes("old"));
  // Another account by now: nothing is read or written.
  assert.equal((await sync.fetchSessionFromServer("old", "tok", gen() + 1)).kind, "failed");
  serverStatus = 404;
  assert.equal((await sync.fetchSessionFromServer("old", "tok", gen())).kind, "gone");
  assert.equal(sync.getEvictedSummary("old"), null);
  assert.ok(!sync.getSessionIds().includes("old"));
  serverStatus = 200;
});

test("deleting forgets the summary; a failed delete can put it back", () => {
  evictOld();
  const snap = sync.getEvictedSummary("old");
  sync.removeCachedSession("old");
  assert.equal(sync.getEvictedSummary("old"), null);
  sync.restoreEvicted("old", snap);
  assert.deepEqual(sync.getEvictedSummary("old"), snap);
});

test("chat page: History lists evicted rows and opens them with loading and failure states", () => {
  const src = page();
  assert.ok(src.includes("setPastSessions(historySessions());"));
  assert.ok(!src.includes(".filter((s): s is StoredSession => s !== null)"));
  const i = src.indexOf("const loadPastSession = useCallback(");
  const lp = src.slice(i, src.indexOf("// ── Open history panel", i));
  assert.ok(lp.includes("if (!session && getEvictedSummary(sid))"));
  assert.ok(lp.includes("fetchSessionFromServer(sid, tok, gen)"));
  assert.ok(lp.includes('setHistoryError(t("chat.history_gone"))'));
  assert.ok(lp.includes("{ id: sid, failed: true }"));
  assert.ok(src.includes('t("chat.history_load_failed") : t("chat.history_loading")'));
  assert.ok(src.includes("restoreEvicted(sid, evictedSnap)"));
  const en = JSON.parse(fs.readFileSync(path.join(root, "messages/en.json"), "utf8")).chat;
  const es = JSON.parse(fs.readFileSync(path.join(root, "messages/es.json"), "utf8")).chat;
  for (const k of ["history_loading", "history_load_failed", "history_gone"]) {
    assert.ok(en[k] && es[k] && en[k] !== es[k], k);
    assert.ok(!/—/.test(en[k] + es[k]), k);
  }
});
