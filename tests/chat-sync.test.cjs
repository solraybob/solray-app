// F2: chat history uploads never erase turns, and nothing is uploaded until
// the device has reconciled with the server.
const test = require("node:test");
const assert = require("node:assert/strict");
const { installBrowser, load, tick } = require("./helpers.cjs");

const win = installBrowser();
const session = load("lib/account-session.js");
const sync = load("lib/chat-sync.js");

const m = (id, ts) => ({ id, role: "user", content: `msg ${id}`, timestamp: `2026-10-07T10:0${ts}:00Z` });

/** A small in-memory /chat/sessions server. */
function fakeServer() {
  const sessions = new Map();
  const log = [];
  let failList = null;
  global.fetch = async (url, init = {}) => {
    const method = (init.method || "GET").toUpperCase();
    const u = new URL(url);
    log.push(`${method} ${u.pathname}`);
    const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
    if (u.pathname === "/chat/sessions") {
      if (failList === "network") throw new TypeError("Failed to fetch");
      if (failList) return json(failList, { detail: "down" });
      return json(200, { sessions: Array.from(sessions.values()).map((s) => ({ session_id: s.session_id, last_message_at: s.last_message_at })) });
    }
    const id = decodeURIComponent(u.pathname.split("/").pop());
    if (method === "GET") return sessions.has(id) ? json(200, sessions.get(id)) : json(404, { detail: "Session not found" });
    if (method === "PUT") {
      const body = JSON.parse(init.body);
      const at = new Date(Date.now() + log.length * 1000).toISOString();
      sessions.set(id, { session_id: id, custom_name: body.custom_name, date_label: body.date_label, messages: body.messages, last_message_at: at });
      return json(200, { session_id: id, last_message_at: at });
    }
    if (method === "DELETE") return sessions.delete(id) ? json(200, { deleted: true }) : json(404, {});
    return json(405, {});
  };
  return { sessions, log, setFailList: (v) => { failList = v; } };
}

test("an upload keeps a turn another device added, and brings it here", async () => {
  const srv = fakeServer();
  srv.sessions.set("s1", { session_id: "s1", messages: [m("1", 1), m("2", 2), m("3", 3)], last_message_at: "x" });
  sync.saveSession({ sessionId: "s1", date: "", messages: [m("1", 1), m("2", 2), m("4", 4)] });
  let announced = null;
  win.addEventListener(sync.CHAT_MERGED_EVENT, (e) => { announced = e.detail; });
  const ok = await sync.pushSessionToServer(sync.loadSession("s1"), "tok", session.getAuthGeneration());
  assert.equal(ok, true);
  assert.deepEqual(srv.sessions.get("s1").messages.map((x) => x.id), ["1", "2", "3", "4"]);
  assert.deepEqual(sync.loadSession("s1").messages.map((x) => x.id), ["1", "2", "3", "4"]);
  assert.equal(announced.sessionId, "s1");
  assert.equal(sync.getUnsent().has("s1"), false);
});

test("two devices each adding a turn: neither turn is lost", async () => {
  const srv = fakeServer();
  srv.sessions.set("s2", { session_id: "s2", messages: [m("1", 1)], last_message_at: "x" });
  // Device A writes turn a; then device B (whose cache never saw a) writes b.
  sync.saveSession({ sessionId: "s2", date: "", messages: [m("1", 1), m("a", 2)] });
  await sync.pushSessionToServer(sync.loadSession("s2"), "tok", session.getAuthGeneration());
  sync.saveSession({ sessionId: "s2", date: "", messages: [m("1", 1), m("b", 3)] }); // B's stale view
  await sync.pushSessionToServer(sync.loadSession("s2"), "tok", session.getAuthGeneration());
  assert.deepEqual(srv.sessions.get("s2").messages.map((x) => x.id), ["1", "a", "b"]);
});

test("a failed server list rejects the sync and uploads nothing", async () => {
  for (const failure of [500, "network"]) {
    const srv = fakeServer();
    srv.setFailList(failure);
    sync.saveSession({ sessionId: "old-local", date: "", messages: [m("1", 1)] });
    await assert.rejects(sync.syncSessionsFromServer("tok", session.getAuthGeneration()), (e) => e instanceof sync.ChatSyncUnavailable);
    assert.ok(!srv.log.some((l) => l.startsWith("PUT")), `no upload after ${failure}`);
  }
});

test("a successful sync sends turns written while offline", async () => {
  const srv = fakeServer();
  srv.sessions.set("s3", { session_id: "s3", messages: [m("1", 1)], last_message_at: "2026-10-07T10:01:00Z" });
  sync.saveSession({ sessionId: "s3", date: "", messages: [m("1", 1), m("offline", 5)] });
  sync.markServerConfirmed(["s3"]);
  win.localStorage.setItem(session.accountKey("solray_chat_session_meta"), JSON.stringify({ s3: { last_message_at: "2026-10-07T10:01:00Z" } }));
  sync.markUnsent("s3");
  await sync.syncSessionsFromServer("tok", session.getAuthGeneration());
  assert.deepEqual(srv.sessions.get("s3").messages.map((x) => x.id), ["1", "offline"]);
  assert.equal(sync.getUnsent().has("s3"), false);
});

test("pulling a newer server copy keeps this device's unsent turns", async () => {
  const srv = fakeServer();
  srv.sessions.set("s4", { session_id: "s4", messages: [m("1", 1), m("2", 2)], last_message_at: "2026-10-07T12:00:00Z" });
  sync.saveSession({ sessionId: "s4", date: "", messages: [m("1", 1), m("mine", 3)] });
  win.localStorage.setItem(session.accountKey("solray_chat_session_meta"), JSON.stringify({ s4: { last_message_at: "2026-10-07T10:00:00Z" } }));
  await sync.syncSessionsFromServer("tok", session.getAuthGeneration());
  assert.deepEqual(sync.loadSession("s4").messages.map((x) => x.id), ["1", "2", "mine"]);
  assert.deepEqual(srv.sessions.get("s4").messages.map((x) => x.id), ["1", "2", "mine"]);
});

test("a conversation deleted on another device is not recreated by an upload", async () => {
  const srv = fakeServer();
  sync.saveSession({ sessionId: "s5", date: "", messages: [m("1", 1)] });
  sync.markServerConfirmed(["s5"]);
  const ok = await sync.pushSessionToServer(sync.loadSession("s5"), "tok", session.getAuthGeneration());
  assert.equal(ok, false);
  assert.ok(!srv.log.some((l) => l === "PUT /chat/sessions/s5"));
});

test("a delete waits for a queued upload, and later uploads are dropped", async () => {
  const srv = fakeServer();
  sync.saveSession({ sessionId: "s6", date: "", messages: [m("1", 1)] });
  const gen = session.getAuthGeneration();
  const up = sync.pushSessionToServer(sync.loadSession("s6"), "tok", gen);
  const del = sync.deleteSessionOnServer("s6", "tok", gen);
  const late = sync.pushSessionToServer({ sessionId: "s6", date: "", messages: [m("1", 1)] }, "tok", gen);
  await up; assert.equal(await del, true); assert.equal(await late, false);
  assert.equal(srv.sessions.has("s6"), false);
  // The upload queued before the delete is either finished first or
  // dropped; nothing touches the conversation after its DELETE.
  const s6 = srv.log.filter((l) => l.endsWith("/s6"));
  assert.equal(s6[s6.length - 1], "DELETE /chat/sessions/s6");
  assert.equal(s6.filter((l) => l.startsWith("DELETE")).length, 1);
});

test("an upload for a signed-out account is dropped", async () => {
  const srv = fakeServer();
  sync.saveSession({ sessionId: "s7", date: "", messages: [m("1", 1)] });
  const gen = session.getAuthGeneration();
  session.bumpAuthGeneration();
  assert.equal(await sync.pushSessionToServer(sync.loadSession("s7"), "tok", gen), false);
  assert.equal(srv.log.length, 0);
  await tick();
});

test("F1: the chat page restores a deleted conversation only for the same account", () => {
  const fs = require("fs");
  const src = fs.readFileSync(require("path").join(__dirname, "..", "app/chat/page.tsx"), "utf8");
  const del = src.slice(src.indexOf("const deleteSession = useCallback"), src.indexOf("// ── Send message"));
  assert.match(del, /const acct = captureAccount\(\);/);
  assert.match(del, /const restore = \(\) => \{\n\s+if \(!acct\.live\) return;/);
  assert.match(del, /deleteSessionOnServer\(sid, token, acct\.generation\)/);
  assert.ok(!/fetch\(/.test(del), "no raw fetch left in the page's delete");
});

// ── Round 3, finding 2: the server merges by message id ─────────────────────

/** A /chat/sessions server like the backend now: PUT merges by id under a
 *  revision; `between` runs after a GET and before the next PUT lands. */
function mergingServer() {
  const sessions = new Map();
  const log = [];
  const hooks = { beforePut: null };
  const merge = (stored, incoming) => {
    const seen = new Map(stored.map((x) => [x.id, x]));
    const out = stored.map((x) => ({ ...x }));
    for (const x of incoming) {
      if (seen.has(x.id)) { const cur = out.find((y) => y.id === x.id); for (const k of Object.keys(x)) if (!(k in cur)) cur[k] = x[k]; continue; }
      out.push(x);
    }
    return out.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
  };
  global.fetch = async (url, init = {}) => {
    const method = (init.method || "GET").toUpperCase();
    const u = new URL(url);
    log.push({ line: `${method} ${u.pathname}`, body: init.body ? JSON.parse(init.body) : null });
    const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
    if (u.pathname === "/chat/sessions") {
      return json(200, { sessions: Array.from(sessions.values()).map((s) => ({ session_id: s.session_id, last_message_at: s.last_message_at })) });
    }
    const id = decodeURIComponent(u.pathname.split("/").pop());
    if (method === "GET") return sessions.has(id) ? json(200, sessions.get(id)) : json(404, { detail: "Session not found" });
    if (method === "PUT") {
      if (hooks.beforePut) { const h = hooks.beforePut; hooks.beforePut = null; h(); }
      const body = JSON.parse(init.body);
      const cur = sessions.get(id);
      if (!cur && body.expect_existing) return json(404, { detail: "Session not found" });
      const rev = (cur?.revision || 0) + 1;
      const at = `2026-10-07T11:${String(rev).padStart(2, "0")}:00Z`;
      const messages = merge(cur?.messages || [], body.messages);
      sessions.set(id, { session_id: id, messages, revision: rev, last_message_at: at, custom_name: body.custom_name });
      return json(200, { session_id: id, last_message_at: at, revision: rev, conflict: body.base_revision != null && body.base_revision !== (cur?.revision || 0), messages });
    }
    if (method === "DELETE") return sessions.delete(id) ? json(200, { deleted: true }) : json(404, {});
    return json(405, {});
  };
  return { sessions, log, hooks };
}

test("R3-2: a turn another device writes between this device's read and write reaches this device", async () => {
  const srv = mergingServer();
  srv.sessions.set("m1", { session_id: "m1", messages: [m("1", 1)], revision: 1, last_message_at: "x" });
  sync.saveSession({ sessionId: "m1", date: "", messages: [m("1", 1), m("mine", 3)] });
  // Device B lands its turn after our GET, before our PUT.
  srv.hooks.beforePut = () => {
    const cur = srv.sessions.get("m1");
    srv.sessions.set("m1", { ...cur, messages: [...cur.messages, m("theirs", 2)], revision: cur.revision + 1 });
  };
  let announced = null;
  const onMerged = (e) => { announced = e.detail; };
  win.addEventListener(sync.CHAT_MERGED_EVENT, onMerged);
  assert.equal(await sync.pushSessionToServer(sync.loadSession("m1"), "tok", session.getAuthGeneration()), true);
  win.removeEventListener(sync.CHAT_MERGED_EVENT, onMerged);
  assert.deepEqual(srv.sessions.get("m1").messages.map((x) => x.id), ["1", "theirs", "mine"]);
  assert.deepEqual(sync.loadSession("m1").messages.map((x) => x.id), ["1", "theirs", "mine"]);
  assert.deepEqual(announced.messages.map((x) => x.id), ["1", "theirs", "mine"]);
  assert.equal(sync.getLocalMeta().m1.revision, 3);
});

test("R3-2: once the server reported a revision, an upload is one merging PUT with base_revision", async () => {
  const srv = mergingServer();
  srv.sessions.set("m2", { session_id: "m2", messages: [m("1", 1)], revision: 4, last_message_at: "x" });
  sync.saveSession({ sessionId: "m2", date: "", messages: [m("1", 1), m("a", 2)] });
  sync.markServerConfirmed(["m2"]);
  sync.setSessionLocalMeta("m2", "x", 4);
  assert.equal(await sync.pushSessionToServer(sync.loadSession("m2"), "tok", session.getAuthGeneration()), true);
  const lines = srv.log.map((l) => l.line);
  assert.deepEqual(lines, ["PUT /chat/sessions/m2"]);
  const body = srv.log[0].body;
  assert.equal(body.base_revision, 4);
  assert.equal(body.expect_existing, true);
  assert.equal(sync.getLocalMeta().m2.revision, 5);
});

test("R3-2: a merging PUT never recreates a conversation deleted on another device", async () => {
  const srv = mergingServer();
  sync.saveSession({ sessionId: "m3", date: "", messages: [m("1", 1)] });
  sync.markServerConfirmed(["m3"]);
  sync.setSessionLocalMeta("m3", "x", 2);
  assert.equal(await sync.pushSessionToServer(sync.loadSession("m3"), "tok", session.getAuthGeneration()), false);
  assert.equal(srv.sessions.has("m3"), false);
});

test("R3-4: a conversation deleted while the sync reads it is not restored", async () => {
  win.localStorage.clear();
  win.localStorage.setItem("solray_chat_migrated_v1", "1");
  const gen = session.getAuthGeneration();
  sync.bindChatSyncToAccount(gen);
  let releaseGet;
  const serverSessions = new Map([["d1", { session_id: "d1", messages: [m("1", 1)], last_message_at: "2026-10-07T12:00:00Z", revision: 1 }]]);
  global.fetch = async (url, init = {}) => {
    const method = (init.method || "GET").toUpperCase();
    const u = new URL(url);
    const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
    if (u.pathname === "/chat/sessions") {
      return json(200, { sessions: Array.from(serverSessions.values()).map((s) => ({ session_id: s.session_id, last_message_at: s.last_message_at })) });
    }
    const id = decodeURIComponent(u.pathname.split("/").pop());
    if (method === "GET") {
      const body = serverSessions.get(id);
      return { ok: true, status: 200, json: () => new Promise((r) => { releaseGet = () => r(body); }) };
    }
    if (method === "DELETE") { serverSessions.delete(id); return json(200, { deleted: true }); }
    return json(405, {});
  };
  const syncing = sync.syncSessionsFromServer("tok", gen);
  while (!releaseGet) await tick();
  // The member deletes it (as the chat page does: local first, then server).
  win.localStorage.removeItem("solray_chat_d1");
  sync.saveSessionIds(sync.getSessionIds().filter((x) => x !== "d1"));
  assert.equal(await sync.deleteSessionOnServer("d1", "tok", gen), true);
  releaseGet();
  const ids = await syncing;
  assert.equal(sync.loadSession("d1"), null);
  assert.ok(!ids.includes("d1"));
  assert.ok(!sync.getSessionIds().includes("d1"));
});
