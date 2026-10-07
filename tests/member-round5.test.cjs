// Codex review round 4 (app), findings 1 to 4.
//  1. Account isolation across tabs: per-account cache keys bound to the
//     tab's own account, and cross-tab sign-out / account change handling.
//  2. Partner (Dynamics) reference follows a synchronized transcript.
//  3. A conversation name cleared on another device stays cleared.
//  4. Admin Now card preview: only the latest request for the selected
//     language may fill the card.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { installBrowser, load } = require("./helpers.cjs");

const win = installBrowser();
const session = load("lib/account-session.js");
const sync = load("lib/chat-sync.js");
const soul = load("lib/chat-soul.js");
const nowCard = load("lib/now-card.js");
const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

function signIn(id, token) {
  win.localStorage.setItem("solray_user", JSON.stringify({ id, email: `${id}@x`, name: id }));
  win.localStorage.setItem("solray_token", token);
}

// ── 1. Cross-tab account isolation ─────────────────────────────────────────

test("finding 1: the current member's unscoped caches move into their namespace", () => {
  win.localStorage.clear();
  signIn("A", "tok-A");
  win.localStorage.setItem("solray_blueprint", '{"name":"A"}');
  win.localStorage.setItem("solray_chat_s1", '{"sessionId":"s1","messages":[]}');
  win.localStorage.setItem("solray_chat_sessions", '["s1"]');
  win.localStorage.setItem("solray_forecast_2026-10-07", '{"day_title":"A day"}');
  win.localStorage.setItem("solray_language", "es");
  win.localStorage.setItem("solray_chat_migrated_v1", "1");
  session.bindAccount("A");
  assert.equal(win.localStorage.getItem("solray_blueprint"), null);
  assert.equal(win.localStorage.getItem("solray_blueprint@u:A"), '{"name":"A"}');
  assert.equal(win.localStorage.getItem("solray_chat_s1@u:A"), '{"sessionId":"s1","messages":[]}');
  assert.equal(win.localStorage.getItem("solray_forecast_2026-10-07@u:A"), '{"day_title":"A day"}');
  // Device-wide keys stay where they are.
  assert.equal(win.localStorage.getItem("solray_language"), "es");
  assert.equal(win.localStorage.getItem("solray_chat_migrated_v1"), "1");
  // The chat cache reads the migrated copy.
  assert.deepEqual(sync.getSessionIds(), ["s1"]);
  assert.equal(sync.loadSession("s1").sessionId, "s1");
});

test("finding 1: unscoped caches are never moved into a member the session does not name", () => {
  win.localStorage.clear();
  signIn("A", "tok-A");
  win.localStorage.setItem("solray_blueprint", '{"name":"A"}');
  session.bindAccount("B");
  assert.equal(win.localStorage.getItem("solray_blueprint@u:B"), null);
  assert.equal(win.localStorage.getItem("solray_blueprint"), '{"name":"A"}');
});

test("finding 1: B signing in from another tab unbinds A's tab and drops its work", () => {
  win.localStorage.clear();
  signIn("A", "tok-A");
  session.bindAccount("A");
  const acct = session.captureAccount();
  sync.saveSession({ sessionId: "a1", date: "", messages: [{ id: "m", role: "user", content: "A private" }] });
  assert.ok(win.localStorage.getItem("solray_chat_a1@u:A"));

  // Another tab: A signs out, B signs in (user record first, then token).
  win.localStorage.removeItem("solray_token");
  win.localStorage.removeItem("solray_user");
  signIn("B", "tok-B");
  const change = session.identityStorageChange("solray_user", "tok-A");
  assert.equal(change, "switched");
  assert.equal(acct.live, false, "in-flight work of A is now stale");

  // Anything A's stale tab still writes cannot land where B's tab reads.
  sync.saveSession({ sessionId: "a2", date: "", messages: [{ id: "m", role: "user", content: "A late" }] });
  sync.saveSessionIds(["a2"]);
  const bTabKeys = Object.keys(Object.fromEntries(win.localStorage.m)).filter((k) => k.endsWith("@u:B"));
  assert.deepEqual(bTabKeys, []);
  // B's tab (bound to B) sees none of A's conversations.
  session.bindAccount("B");
  assert.equal(sync.loadSession("a1"), null);
  assert.equal(sync.loadSession("a2"), null);
  assert.deepEqual(sync.getSessionIds(), []);
});

test("finding 1: a sign-out in another tab is a sign-out here", () => {
  win.localStorage.clear();
  signIn("A", "tok-A");
  session.bindAccount("A");
  const gen = session.getAuthGeneration();
  win.localStorage.removeItem("solray_token");
  assert.equal(session.identityStorageChange("solray_token", "tok-A"), "signed-out");
  assert.notEqual(session.getAuthGeneration(), gen);
  assert.equal(session.boundAccountId(), null);
  assert.match(session.accountKey("solray_blueprint"), /@u:-$/);
});

test("finding 1: storage.clear() in another tab signs this one out too", () => {
  win.localStorage.clear();
  signIn("A", "tok-A");
  session.bindAccount("A");
  win.localStorage.clear();
  assert.equal(session.identityStorageChange(null, "tok-A"), "signed-out");
});

test("finding 1: a fresh token for the same member keeps the tab, other keys are ignored", () => {
  win.localStorage.clear();
  signIn("A", "tok-A");
  session.bindAccount("A");
  const gen = session.getAuthGeneration();
  assert.equal(session.identityStorageChange("solray_forecast_x", "tok-A"), "none");
  assert.equal(session.identityStorageChange("solray_token", "tok-A"), "none");
  win.localStorage.setItem("solray_token", "tok-A2");
  assert.equal(session.identityStorageChange("solray_token", "tok-A"), "token");
  assert.equal(session.getAuthGeneration(), gen);
  assert.equal(session.boundAccountId(), "A");
});

test("finding 1: the auth provider listens for other tabs and acts on every change", () => {
  const src = read("lib/auth-context.tsx");
  assert.match(src, /addEventListener\("storage"/);
  assert.match(src, /identityStorageChange\(/);
  assert.match(src, /window\.location\.reload\(\)/);
  assert.match(src, /window\.location\.replace\("\/login"\)/);
  // Every identity change binds the tab, and the user record is written
  // before the token so another tab never pairs a new token with the old id.
  assert.ok((src.match(/bindAccount\(/g) || []).length >= 3);
  const setTok = src.slice(src.indexOf("const setToken"), src.indexOf("const login"));
  assert.ok(setTok.indexOf('setItem("solray_user"') < setTok.indexOf('setItem("solray_token"'));
});

test("finding 1: every per-member localStorage cache goes through accountKey", () => {
  const files = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
      const rel = path.join(d, e.name);
      if (e.isDirectory()) walk(rel);
      else if (/\.(ts|tsx)$/.test(e.name)) files.push(rel);
    }
  };
  ["app", "lib", "components"].forEach(walk);
  const offenders = [];
  for (const f of files) {
    if (f === path.join("lib", "account-session.ts")) continue;
    const src = read(f);
    // Literal keys and constants that hold a per-member base key.
    const consts = new Map();
    for (const m of src.matchAll(/const\s+(\w+)\s*=\s*["'`](solray_[^"'`$]*)/g)) consts.set(m[1], m[2]);
    for (const m of src.matchAll(/localStorage\.(?:getItem|setItem|removeItem)\(\s*([^,)]+)/g)) {
      const arg = m[1].trim();
      if (arg.startsWith("accountKey(")) continue;
      const lit = /^["'`](solray_[^"'`$]*)/.exec(arg);
      const base = lit ? lit[1] : consts.get(arg);
      if (base && session.isAccountScopedBase(base)) offenders.push(`${f}: ${arg}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("finding 1: chart-derived caches are recognised in any member's namespace", () => {
  const rev = load("lib/chart-revision.js");
  win.localStorage.clear();
  signIn("A", "tok-A");
  session.bindAccount("A");
  win.localStorage.setItem(session.accountKey("solray_blueprint"), "{}");
  win.localStorage.setItem(session.accountKey("solray_forecast_2026-10-07"), "{}");
  rev.clearChartDerivedCaches();
  assert.equal(win.localStorage.getItem("solray_blueprint@u:A"), null);
  assert.equal(win.localStorage.getItem("solray_forecast_2026-10-07@u:A"), null);
  // The birth fingerprint is this member's too.
  assert.equal(rev.syncBirthRevision({ birth_date: "1990-09-05" }), true);
  assert.ok(win.localStorage.getItem("solray_birth_rev@u:A"));
});

// ── 2. Partner reference from a synchronized transcript ────────────────────

test("finding 2: a partner named by the synced transcript reaches the open conversation", () => {
  const msgs = [{ id: "g", role: "assistant", content: "hi", soul: { name: "Sara", connection_id: null, saved_person_id: "p-9" } }];
  const next = soul.syncedSoulRef(null, msgs);
  assert.deepEqual(next, { ref: { connectionId: null, savedPersonId: "p-9", blueprint: null }, name: "Sara" });
  // A reference this device already holds is kept.
  assert.equal(soul.syncedSoulRef({ connectionId: "c-1", savedPersonId: null, blueprint: null }, msgs), null);
  // Nothing in the transcript: nothing changes.
  assert.equal(soul.syncedSoulRef(null, [{ id: "x", role: "user", content: "q" }]), null);
  // A legacy blueprint-only reference gains the id and keeps its chart.
  const bp = { sun: "Leo" };
  assert.deepEqual(soul.syncedSoulRef({ blueprint: bp }, msgs).ref, { connectionId: null, savedPersonId: "p-9", blueprint: bp });
});

test("finding 2: the chat applies synced partner state on reconcile, on merge, and when sending", () => {
  const src = read("app/chat/page.tsx");
  assert.ok((src.match(/adoptSyncedSoul\(merged\)/g) || []).length >= 2, "reconcile and merged-event paths");
  assert.match(src, /soulRequestFields\(sendSoulRef\)/);
});

// ── 3. Cleared conversation name ───────────────────────────────────────────

function nameServer(customName) {
  global.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
    if (u.pathname === "/chat/sessions") {
      return json(200, { sessions: [{ session_id: "n1", last_message_at: "2026-10-07T10:00:00Z", revision: 5 }], next_cursor: null });
    }
    if ((init.method || "GET") === "GET") {
      return json(200, { session_id: "n1", custom_name: customName, date_label: "Oct 7", last_message_at: "2026-10-07T10:00:00Z", revision: 5,
        messages: [{ id: "m1", role: "user", content: "q", timestamp: "2026-10-07T10:00:00Z" }] });
    }
    return json(200, {});
  };
}

test("finding 3: a name cleared on another device is cleared here", async () => {
  win.localStorage.clear();
  signIn("A", "tok-A");
  session.bindAccount("A");
  win.localStorage.setItem("solray_chat_migrated_v1", "1");
  sync.saveSession({ sessionId: "n1", date: "Oct 7", customName: "Old name",
    messages: [{ id: "m1", role: "user", content: "q", timestamp: "2026-10-07T10:00:00Z" }] });
  sync.saveSessionIds(["n1"]);
  sync.markServerConfirmed(["n1"]);
  sync.bindChatSyncToAccount(session.getAuthGeneration());
  nameServer(null);
  await sync.syncSessionsFromServer("tok-A", session.getAuthGeneration());
  assert.equal(sync.loadSession("n1").customName, undefined);
});

test("finding 3: a rename not uploaded yet survives a pull of the older name", async () => {
  win.localStorage.clear();
  signIn("A", "tok-A");
  session.bindAccount("A");
  win.localStorage.setItem("solray_chat_migrated_v1", "1");
  sync.saveSession({ sessionId: "n1", date: "Oct 7", customName: "New name",
    messages: [{ id: "m1", role: "user", content: "q", timestamp: "2026-10-07T10:00:00Z" }] });
  sync.saveSessionIds(["n1"]);
  sync.markServerConfirmed(["n1"]);
  sync.markRenamePending("n1");
  sync.markUnsent("n1");
  sync.bindChatSyncToAccount(session.getAuthGeneration());
  nameServer(null);
  // Uploads answer with an empty body here; the pull is what matters.
  await sync.syncSessionsFromServer("tok-A", session.getAuthGeneration()).catch(() => {});
  assert.equal(sync.loadSession("n1").customName, "New name");
});

// ── 4. Admin Now card preview ordering ─────────────────────────────────────

test("finding 4: only the latest preview request for the shown language may fill the card", () => {
  const gate = nowCard.previewRequests();
  const en = gate.start("en");
  const es = gate.start("es");
  assert.equal(es.current(), true);
  assert.equal(en.current(), false, "the English answer landing late is dropped");
  // A card whose language is not the one asked for is never shown.
  assert.equal(nowCard.plainCardFor({ status: "ok", language: "en", date: "", card_title: "t", card_body: "b" }, "es"), false);
  assert.equal(nowCard.plainCardFor({ status: "ok", language: "es", date: "", card_title: "t", card_body: "b" }, "es"), true);
  const page = read("app/admin/now-card/page.tsx");
  assert.match(page, /previewRequests\(\)/);
  assert.match(page, /if \(!req\.current\(\)\) return;/);
  assert.match(page, /setPlain\(null\)/);
});
