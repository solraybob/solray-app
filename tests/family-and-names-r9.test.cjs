// Codex review round 6 (out6-5), findings 1, 3 and 4.
//  1. A family reading names every selected person by reference
//     (family_partners): no chart or summary of anyone is written into the
//     opening message, the references travel with every turn and with the
//     transcript, and a saved person's confirmed permission is recorded on
//     the server before the reading.
//  3. An ordinary transcript upload never changes the conversation's name
//     (rename: false); the reply's name is taken here.
//  4. A rename (or clear) stays pending until the server reports the very
//     name that was asked for; otherwise it is sent again.
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

// ── 3 and 4: names ─────────────────────────────────────────────────────────

const M1 = { id: "m1", role: "user", content: "q", timestamp: "2026-10-07T10:00:00Z" };
const M2 = { id: "m2", role: "user", content: "next turn", timestamp: "2026-10-07T11:00:00Z" };

/** A server at revision 5 named `name`. `mode` "backend" merges names as
 *  the backend does (only rename: true changes it); "ignore" never changes
 *  it (a rename the server did not take). */
function server(name, mode = "backend") {
  const state = { name, revision: 5, puts: [] };
  global.fetch = async (url, init = {}) => {
    const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
    if ((init.method || "GET") === "GET") {
      return json(200, { session_id: "n1", custom_name: state.name, date_label: "Oct 7",
        last_message_at: "2026-10-07T10:00:00Z", revision: state.revision, messages: [M1] });
    }
    const body = JSON.parse(init.body);
    state.puts.push(body);
    if (mode === "backend" && body.rename === true) state.name = body.custom_name;
    const conflict = body.base_revision !== state.revision;
    state.revision += 1;
    return json(200, { session_id: "n1", custom_name: state.name, date_label: "Oct 7",
      last_message_at: "2026-10-07T11:00:00Z", revision: state.revision, conflict, messages: body.messages });
  };
  return state;
}

function device(name, messages) {
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

test("finding 3: an open device's ordinary upload is not a rename and takes the cleared name", async () => {
  device("Old name", [M1]);
  const srv = server(null);            // cleared on the other device at revision 5
  sync.saveSession({ sessionId: "n1", date: "Oct 7", customName: "Old name", messages: [M1, M2] });
  const ok = await sync.pushSessionToServer(sync.loadSession("n1"), "tok-A", session.getAuthGeneration());
  assert.equal(ok, true);
  assert.equal(srv.puts.length, 1);
  assert.equal(srv.puts[0].rename, false, "an ordinary upload says it is not a rename");
  assert.equal(srv.name, null);
  assert.equal(sync.loadSession("n1").customName, undefined, "the cleared name is taken here");
});

test("finding 4: a clear made here on a stale revision goes up as a rename and is confirmed", async () => {
  device("Old name", [M1]);
  const srv = server("Old name");
  sync.saveSession({ sessionId: "n1", date: "Oct 7", messages: [M1] });   // cleared here
  sync.markRenamePending("n1");
  await sync.pushSessionToServer(sync.loadSession("n1"), "tok-A", session.getAuthGeneration());
  assert.equal(srv.puts[0].rename, true);
  assert.equal(srv.puts[0].custom_name, null);
  assert.equal(srv.name, null);
  assert.equal(sync.getPendingRenames().has("n1"), false);
  assert.equal(sync.getUnsent().has("n1"), false);
});

test("finding 4: a rename the server did not take stays pending and is sent again", async () => {
  device("Old name", [M1]);
  const srv = server("Old name", "ignore");
  sync.saveSession({ sessionId: "n1", date: "Oct 7", messages: [M1] });
  sync.markRenamePending("n1");
  await sync.pushSessionToServer(sync.loadSession("n1"), "tok-A", session.getAuthGeneration());
  assert.equal(srv.puts.length, 2, "retried once with the revision just learned");
  assert.equal(srv.puts[1].base_revision, 6);
  assert.ok(srv.puts.every((p) => p.rename === true && p.custom_name === null));
  assert.equal(sync.getPendingRenames().has("n1"), true, "not marked done");
  assert.equal(sync.getUnsent().has("n1"), true, "the next sync sends it again");
  assert.equal(sync.loadSession("n1").customName, undefined, "the member's clear is kept here");
});

// ── 1: family references ───────────────────────────────────────────────────

test("finding 1: the chat request names every family member by reference only", () => {
  const { soulRequestFields } = load("lib/oracle-request.js");
  const fields = soulRequestFields({
    connectionId: "c-1", savedPersonId: null, blueprint: null,
    family: [{ name: "Cara", connectionId: "c-2" }, { name: "Dora", savedPersonId: "p-3" }, { name: "x" }],
  });
  assert.deepEqual(fields, {
    soul_connection_id: "c-1",
    family_partners: [{ soul_connection_id: "c-2" }, { saved_person_id: "p-3" }],
  });
  assert.deepEqual(soulRequestFields({ connectionId: "c-1" }), { soul_connection_id: "c-1" });
});

test("finding 1: the transcript keeps the family references for other devices", () => {
  const cs = load("lib/chat-soul.js");
  const { soulFromTranscript } = load("lib/oracle-request.js");
  const soul = cs.transcriptSoulOf({ name: "Brimir and Cara", blueprint: null, connectionId: "c-1",
    family: [{ name: "Cara", connectionId: "c-2", savedPersonId: null }] });
  assert.deepEqual(soul.family, [{ name: "Cara", connection_id: "c-2", saved_person_id: null }]);
  const back = soulFromTranscript([{ soul }]);
  assert.deepEqual(back.family, [{ name: "Cara", connectionId: "c-2", savedPersonId: null }]);
});

test("finding 1: the opening message carries no chart summary, in either language", () => {
  const en = JSON.parse(read("messages/en.json"));
  const es = JSON.parse(read("messages/es.json"));
  for (const m of [en, es]) {
    assert.doesNotMatch(m.souls.bond_family_intro, /\{charts\}/);
    assert.equal(m.souls.bond_intro_chart, undefined);
    assert.ok(m.souls.family_not_saved_yet && m.souls.permission_save_failed);
    assert.ok(m.oracle_errors.saved_person_permission_required);
  }
  const src = read("app/souls/page.tsx");
  const fn = src.slice(src.indexOf("const readTheBond"), src.indexOf("  return (\n    <ProtectedRoute>"));
  assert.doesNotMatch(fn, /partnerChart\(/, "no chart read for the opening message");
  assert.doesNotMatch(fn, /bond_intro_chart|bond_sun_in|charts:/);
  assert.match(fn, /familyPartners: partners\.slice\(1\)/);
  assert.match(fn, /sharing-permission/);
  const chat = read("app/chat/page.tsx");
  assert.match(chat, /familyPartners\?: FamilyRef\[\]/);
});

test("finding 1: a saved person's confirmed permission is sent and recorded on the server", () => {
  win.localStorage.clear();
  signIn("A", "tok-A");
  session.bindAccount("A");
  const sp = load("lib/saved-people-sync.js");
  const p = { id: "p-1", name: "Dora", _synced: true };
  assert.equal(sp.savedPersonForServer(p).sharing_permission, undefined);
  assert.deepEqual(sp.permissionToRecordOnServer([p]), []);
  sp.recordSharingPermission(["p-1"]);
  assert.equal(sp.savedPersonForServer(p).sharing_permission, true);
  assert.deepEqual(sp.permissionToRecordOnServer([p]).map((x) => x.id), ["p-1"]);
  assert.deepEqual(sp.permissionToRecordOnServer([{ ...p, sharing_permission: true }]), []);
  // Recorded on the server (another device): not asked again here.
  assert.deepEqual(sp.needingPermission([{ id: "p-2", _synced: true, sharing_permission: true }]), []);
  assert.equal(sp.needingPermission([{ id: "p-3", _synced: true }]).length, 1);
});

test("finding 1: the new refusal has its message and offers no retry", () => {
  const errs = load("lib/oracle-errors.js");
  const { ApiError } = load("lib/api.js");
  assert.equal(errs.ORACLE_ERROR_KEYS.saved_person_permission_required, "oracle_errors.saved_person_permission_required");
  const e = new ApiError("x", 403);
  e.code = "saved_person_permission_required";
  assert.equal(errs.isFinalRefusal(e), true);
});
