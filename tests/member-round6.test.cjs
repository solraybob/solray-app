// Codex review round 5 (app), findings 1 and 2.
//  1. Unsent turns are not a pending rename: a name cleared (or changed) on
//     another device is taken here unless this device renamed it, and the
//     upload carries the server's name, not the stale one.
//  2. sessionStorage handoffs (a question seeded into the Oracle, a
//     Dynamics context) belong to the account the tab was bound to: swept
//     on a cross-tab sign-out or switch, and rejected when the tab's owner
//     changed before they were consumed.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { installBrowser, load } = require("./helpers.cjs");

const win = installBrowser();
const session = load("lib/account-session.js");
const sync = load("lib/chat-sync.js");
const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

function signIn(id, token) {
  win.localStorage.setItem("solray_user", JSON.stringify({ id, email: `${id}@x`, name: id }));
  win.localStorage.setItem("solray_token", token);
}

// ── 1. Pending renames are tracked apart from unsent turns ─────────────────

const M1 = { id: "m1", role: "user", content: "q", timestamp: "2026-10-07T10:00:00Z" };
const M2 = { id: "m2", role: "user", content: "offline turn", timestamp: "2026-10-07T11:00:00Z" };

/** Server holding n1 at revision 5 with `serverName`; records PUT bodies
 *  and answers them the way the backend merges a name (round 9: only an
 *  explicit rename changes it; an ordinary upload leaves it as it is). */
function nameServer(serverName) {
  const state = { name: serverName, revision: 5, puts: [] };
  global.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
    if (u.pathname === "/chat/sessions") {
      return json(200, { sessions: [{ session_id: "n1", last_message_at: "2026-10-07T10:00:00Z", revision: state.revision }], next_cursor: null });
    }
    if ((init.method || "GET") === "GET") {
      return json(200, { session_id: "n1", custom_name: state.name, date_label: "Oct 7", last_message_at: "2026-10-07T10:00:00Z",
        revision: state.revision, messages: [M1] });
    }
    const body = JSON.parse(init.body);
    state.puts.push(body);
    const upToDate = body.base_revision === state.revision;
    if (body.rename === true) state.name = body.custom_name;
    state.revision += 1;
    return json(200, { session_id: "n1", custom_name: state.name, date_label: "Oct 7", last_message_at: "2026-10-07T11:00:00Z",
      revision: state.revision, conflict: !upToDate, messages: body.messages });
  };
  return state;
}

function freshDevice(name, messages) {
  win.localStorage.clear();
  signIn("A", "tok-A");
  session.bindAccount("A");
  win.localStorage.setItem("solray_chat_migrated_v1", "1");
  sync.saveSession({ sessionId: "n1", date: "Oct 7", customName: name, messages });
  sync.saveSessionIds(["n1"]);
  sync.markServerConfirmed(["n1"]);
  sync.setSessionLocalMeta("n1", "2026-10-07T09:00:00Z", 4);
  sync.bindChatSyncToAccount(session.getAuthGeneration());
}

test("finding 1: unsent turns do not keep a name cleared on another device", async () => {
  freshDevice("Old name", [M1, M2]);
  sync.markUnsent("n1");            // turns written offline, no rename here
  const server = nameServer(null);  // cleared on device A
  await sync.syncSessionsFromServer("tok-A", session.getAuthGeneration());
  await sync.settled("n1");
  assert.equal(sync.loadSession("n1").customName, undefined);
  assert.ok(server.puts.length >= 1, "the offline turns went up");
  for (const p of server.puts) assert.equal(p.custom_name, null);
  assert.equal(server.name, null, "the server name stays cleared");
});

test("finding 1: unsent turns do not keep a name changed on another device", async () => {
  freshDevice("Old name", [M1, M2]);
  sync.markUnsent("n1");
  const server = nameServer("Newer name");
  await sync.syncSessionsFromServer("tok-A", session.getAuthGeneration());
  await sync.settled("n1");
  assert.equal(sync.loadSession("n1").customName, "Newer name");
  assert.equal(server.name, "Newer name");
});

test("finding 1: a rename made here and not uploaded yet still wins", async () => {
  freshDevice("Old name", [M1]);
  sync.saveSession({ sessionId: "n1", date: "Oct 7", customName: "Mine", messages: [M1] });
  sync.markRenamePending("n1");
  sync.markUnsent("n1");
  const server = nameServer(null);
  await sync.syncSessionsFromServer("tok-A", session.getAuthGeneration());
  await sync.settled("n1");
  assert.equal(sync.loadSession("n1").customName, "Mine");
  assert.equal(server.name, "Mine");
  assert.equal(sync.getPendingRenames().has("n1"), false, "cleared once the server took it");
});

test("finding 1: an upload adopts the server's name when nothing was renamed here", async () => {
  // Online device that last saw revision 4 (no name); another device named
  // the conversation at revision 5. A new turn goes up from here.
  freshDevice(undefined, [M1]);
  const server = nameServer("From elsewhere");
  sync.saveSession({ sessionId: "n1", date: "Oct 7", messages: [M1, M2] });
  await sync.pushSessionToServer(sync.loadSession("n1"), "tok-A", session.getAuthGeneration());
  assert.equal(server.name, "From elsewhere");
  assert.equal(sync.loadSession("n1").customName, "From elsewhere");
});

test("finding 1: the chat page marks a rename as pending", () => {
  const src = read("app/chat/page.tsx");
  const commit = src.slice(src.indexOf("const commitRename"), src.indexOf("// ── Delete session"));
  assert.match(commit, /markRenamePending\(sid\)/);
  const helper = read("lib/chat-sync.ts");
  const fn = helper.slice(helper.indexOf("function serverName"), helper.indexOf("function storeServerCopy"));
  assert.doesNotMatch(fn, /getUnsent\(\)/, "unsent turns are not a rename");
});

// ── 2. sessionStorage handoffs belong to the tab's account ─────────────────

test("finding 2: a cross-tab switch sweeps this tab's handoffs", () => {
  win.localStorage.clear();
  win.sessionStorage.clear();
  signIn("A", "tok-A");
  session.bindAccount("A");
  win.sessionStorage.setItem("solray_chat_prompt", JSON.stringify({ topic: "t", question: "A private question" }));
  win.sessionStorage.setItem("solray_compat_context", JSON.stringify({ soulName: "S", introMessage: "x" }));
  win.sessionStorage.setItem("swipe_dir", "back");
  win.localStorage.removeItem("solray_token");
  win.localStorage.removeItem("solray_user");
  signIn("B", "tok-B");
  assert.equal(session.identityStorageChange("solray_user", "tok-A"), "switched");
  assert.equal(win.sessionStorage.getItem("solray_chat_prompt"), null);
  assert.equal(win.sessionStorage.getItem("solray_compat_context"), null);
  assert.equal(win.sessionStorage.getItem("swipe_dir"), "back", "non-account keys are left alone");
});

test("finding 2: a cross-tab sign-out sweeps this tab's handoffs", () => {
  win.localStorage.clear();
  win.sessionStorage.clear();
  signIn("A", "tok-A");
  session.bindAccount("A");
  win.sessionStorage.setItem("solray_chat_prompt", JSON.stringify({ topic: "t", question: "q" }));
  win.localStorage.removeItem("solray_token");
  assert.equal(session.identityStorageChange("solray_token", "tok-A"), "signed-out");
  assert.equal(win.sessionStorage.getItem("solray_chat_prompt"), null);
});

test("finding 2: a handoff written under A is rejected once the tab belongs to B", () => {
  win.localStorage.clear();
  win.sessionStorage.clear();
  signIn("A", "tok-A");
  session.bindAccount("A");
  win.sessionStorage.setItem("solray_chat_prompt", JSON.stringify({ topic: "t", question: "A private question" }));
  // The storage event never reached this tab (interrupted navigation); it
  // reloads with B's session in shared storage and binds to B.
  win.localStorage.removeItem("solray_token");
  win.localStorage.removeItem("solray_user");
  signIn("B", "tok-B");
  session.bindAccount("B");
  assert.equal(session.takeHandoff("solray_chat_prompt"), null);
  assert.equal(win.sessionStorage.getItem("solray_chat_prompt"), null);
});

test("finding 2: the same member's handoff is taken once", () => {
  win.localStorage.clear();
  win.sessionStorage.clear();
  signIn("A", "tok-A");
  session.bindAccount("A");
  const v = JSON.stringify({ topic: "t", question: "mine" });
  win.sessionStorage.setItem("solray_chat_prompt", v);
  session.bindAccount("A");         // a reload of the same member
  assert.equal(session.takeHandoff("solray_chat_prompt"), v);
  assert.equal(session.takeHandoff("solray_chat_prompt"), null);
});

test("finding 2: the chat page consumes handoffs only through takeHandoff", () => {
  const src = read("app/chat/page.tsx");
  assert.doesNotMatch(src, /sessionStorage\.getItem\("solray_chat_prompt"\)/);
  assert.doesNotMatch(src, /sessionStorage\.getItem\("solray_compat_context"\)/);
  assert.match(src, /takeHandoff\("solray_chat_prompt"\)/);
  assert.match(src, /takeHandoff\("solray_compat_context"\)/);
});
