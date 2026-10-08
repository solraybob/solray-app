// Round seventeen (Codex out13-5):
// #1 a conversation started while startup sync is reading is kept in the
//    list and its turns uploaded by the sync itself (Chat may be closed);
// #2 a History read-back has a request identity: a newer selection, closing
//    History or New Chat supersede it, and a late answer never opens;
// #3 renaming an evicted conversation reads it back first, with feedback,
//    and a rename with no transcript is never a silent no-op.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { installBrowser, load } = require("./helpers.cjs");

installBrowser();
const root = path.join(__dirname, "..");
const page = () => fs.readFileSync(path.join(root, "app/chat/page.tsx"), "utf8");
const session = load("lib/account-session.js");
const sync = load("lib/chat-sync.js");
const msg = (id) => ({ id, role: "user", content: `msg ${id}`, timestamp: "2026-10-08T10:00:00Z" });

test("sync: a conversation started during the reconciliation is kept and uploaded", async () => {
  const sessions = new Map([["s-old", { session_id: "s-old", messages: [msg("o")], revision: 1, last_message_at: "t1" }]]);
  const puts = [];
  let releaseList;
  const listGate = new Promise((r) => { releaseList = r; });
  global.fetch = async (url, init = {}) => {
    const method = (init.method || "GET").toUpperCase();
    const u = new URL(url);
    const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
    if (method === "GET" && u.pathname === "/chat/sessions") {
      return json(200, { sessions: [{ session_id: "s-old", last_message_at: "t1", revision: 1 }] });
    }
    const id = decodeURIComponent(u.pathname.split("/").pop());
    // The sync is reading an older transcript (after its snapshot).
    if (method === "GET" && id === "s-old") await listGate;
    if (method === "GET") return sessions.has(id) ? json(200, sessions.get(id)) : json(404, { detail: "Session not found" });
    if (method === "PUT") {
      const body = JSON.parse(init.body);
      puts.push(id);
      sessions.set(id, { session_id: id, messages: body.messages, revision: 1, last_message_at: "t9" });
      return json(200, { session_id: id, messages: body.messages, revision: 1, last_message_at: "t9" });
    }
    return json(405, {});
  };
  localStorage.setItem("solray_chat_migrated_v1", "1");
  const running = sync.syncSessionsFromServer("tok", session.getAuthGeneration());
  // Meanwhile the member starts a conversation (Chat holds uploads until
  // the sync is done) and leaves Chat.
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
  sync.noteNewSession("s-new");
  sync.saveSession({ sessionId: "s-new", date: "", messages: [msg("n")] });
  sync.markUnsent("s-new");
  releaseList();
  const ids = await running;
  assert.ok(ids.includes("s-new"), "kept in the list the sync returns");
  assert.ok(sync.getSessionIds().includes("s-new"), "kept in the saved list");
  assert.equal(sync.getSessionIds()[0], "s-new");
  assert.ok(puts.includes("s-new"), "uploaded by the sync itself");
  assert.equal(sync.getUnsent().has("s-new"), false);
});

test("sync: a conversation deleted here during the reconciliation is not kept", async () => {
  global.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const method = (init.method || "GET").toUpperCase();
    if (method === "GET" && u.pathname === "/chat/sessions") return { ok: true, status: 200, json: async () => ({ sessions: [] }) };
    return { ok: true, status: 200, json: async () => ({}) };
  };
  sync.saveSession({ sessionId: "s-del", date: "", messages: [msg("d")] });
  const p = sync.syncSessionsFromServer("tok", session.getAuthGeneration());
  void sync.deleteSessionOnServer("s-del", "tok", session.getAuthGeneration());
  const ids = await p;
  assert.ok(!ids.includes("s-del"));
});

test("chat page: History read-backs carry a request identity and never override a newer choice", () => {
  const src = page();
  const rb = src.slice(src.indexOf("const readBackEvicted = "), src.indexOf("// History closed by any means"));
  assert.ok(rb.includes("const req = ++historyReqRef.current;"));
  assert.ok(rb.includes("const current = () => historyReqRef.current === req"));
  // Cached whatever happens (fetchSessionFromServer stores it); acts only when current.
  assert.ok(rb.indexOf("if (!current()) return;") < rb.indexOf("then(sid);"));
  // Superseded by: another selection, closing History, New Chat.
  const lp = src.slice(src.indexOf("const loadPastSession = useCallback("), src.indexOf("// The newest loadPastSession"));
  assert.ok(lp.indexOf("cancelHistoryReadBack();") > lp.indexOf("readBackEvicted(sid,"));
  assert.ok(src.includes("if (!showHistory) cancelHistoryReadBack();"));
  const nc = src.slice(src.indexOf("const startNewChat = useCallback("), src.indexOf("// ── Load past session"));
  assert.ok(nc.includes("cancelHistoryReadBack();"));
  assert.ok(src.includes("historyReqRef.current += 1;"));
});

test("chat page: renaming an evicted conversation reads it back first; never a silent no-op", () => {
  const src = page();
  const sr = src.slice(src.indexOf("const startRename = useCallback("), src.indexOf("const commitRename = useCallback("));
  assert.ok(sr.includes("if (!loadSession(sid) && getEvictedSummary(sid)) {"));
  assert.ok(sr.includes("readBackEvicted(sid, (id) => {"));
  assert.ok(sr.includes("setRenamingId(id);"));
  const cr = src.slice(src.indexOf("const commitRename = useCallback("), src.indexOf("// ── Delete session"));
  assert.ok(cr.includes('setHistoryError(t("chat.history_load_failed"));'));
  // The rename itself is the existing pending-rename upload.
  assert.ok(cr.includes("markRenamePending(sid);"));
});
