// Round twelve (Codex out8-5):
// #1 a care turn's 413 message_too_long carries the support card
//    (detail.support, detail.support_text): drawn in the thread before the
//    length note, also out of sight (written into the saved conversation);
// #2 pending and refused statuses are stored with the cached conversations:
//    leaving Chat or restarting while a message is on its way keeps it out
//    of uploads (interrupted, visible, with Send again), a refused one for
//    good; an interrupted one is resolved by sending it again, removing it,
//    or the server's transcript already holding it.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { installBrowser, load } = require("./helpers.cjs");

installBrowser();
const root = path.join(__dirname, "..");
const page = () => fs.readFileSync(path.join(root, "app/chat/page.tsx"), "utf8");
const session = load("lib/account-session.js");
let sync = load("lib/chat-sync.js");
const outcome = load("lib/chat-outcome.js");

/** The app closed and opened again: chat-sync's memory is gone, storage stays. */
function restart() {
  const p = require.resolve(path.join(process.env.SOLRAY_TEST_BUILD, "lib/chat-sync.js"));
  delete require.cache[p];
  sync = load("lib/chat-sync.js");
}

/** A merging /chat/sessions server, recording what each PUT carried. */
function server() {
  const sessions = new Map();
  const puts = [];
  global.fetch = async (url, init = {}) => {
    const method = (init.method || "GET").toUpperCase();
    const u = new URL(url);
    const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
    const id = decodeURIComponent(u.pathname.split("/").pop());
    if (method === "GET") return sessions.has(id) ? json(200, sessions.get(id)) : json(404, {});
    if (method === "PUT") {
      const body = JSON.parse(init.body);
      puts.push(body.messages.map((x) => x.id));
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

const msg = (id, ts, content = `msg ${id}`) => ({ id, role: "user", content, timestamp: `2026-10-08T10:0${ts}:00Z` });
const gen = () => session.getAuthGeneration();
const supportCard = { variant: "support", intro: "You do not have to carry this alone.", steps: ["Talk to someone."] };

// ─── #1 the support card on a length refusal ────────────────────────────────

test("refusal: detail.support becomes the support card message, with support_text", () => {
  const m = outcome.supportFromRefusal(
    { code: "message_too_long", message: "too long", support: supportCard, support_text: "Here is someone to talk to." },
    1760000000000,
  );
  assert.ok(m);
  assert.equal(m.role, "assistant");
  assert.equal(m.content, "Here is someone to talk to.");
  assert.equal(m.crisis.variant, "support");
  assert.equal(m.safety, undefined);
  // No text: the card's own intro.
  assert.equal(outcome.supportFromRefusal({ support: supportCard }).content, supportCard.intro);
  // An ordinary refusal carries none.
  assert.equal(outcome.supportFromRefusal({ code: "message_too_long", message: "x" }), null);
  assert.equal(outcome.supportFromRefusal({ support: { nope: 1 } }), null);
  assert.equal(outcome.supportFromRefusal(undefined), null);
  assert.equal(outcome.supportFromRefusal("too long"), null);
});

test("chat page: a too-long refusal draws the support card before the note, keeping the composer path", () => {
  const src = page();
  const send = src.slice(src.indexOf("const sendMessage = async"), src.indexOf("// Takes a message without an answer"));
  const c = send.slice(send.indexOf("} catch (err) {"));
  assert.ok(c.includes("const refusalSupport = tooLong ? supportFromRefusal((err as ApiError).detail) : null;"));
  const branch = c.slice(c.indexOf("if (tooLong) {", c.indexOf("const known = oracleErrorKey(err)")));
  const filt = branch.indexOf("...prev.filter((m) => m.id !== userMsg.id)");
  const card = branch.indexOf("...(refusalSupport ? [refusalSupport] : [])");
  const note = branch.indexOf('t("oracle_errors.message_too_long_kept")');
  assert.ok(filt > 0 && filt < card && card < note);
  // Composer restoration and the spoken words still travel.
  assert.ok(branch.indexOf("setInput((prev) => composerWithUnsent(text, prev))") > note);
  assert.ok(branch.includes("lastTranscriptRef.current = voiceTranscript ?? null"));
  // Out of sight, the card goes into the saved conversation.
  const off = c.slice(c.indexOf("if (tooLong && offscreen) {"));
  assert.ok(off.slice(0, 600).includes("updateStoredSession(sentSessionId, accountGen"));
});

test("chat page: voice transcripts take the same send path (and so the same refusal handling)", () => {
  const src = page();
  assert.ok(src.includes("sendMessageRef.current(vm.text, { voiceTranscript: vm.voiceTranscript })"));
  assert.ok(src.includes("void sendMessageRef.current(p.text, { voiceTranscript: p.transcript })"));
});

// ─── #2 statuses stored with the cache ──────────────────────────────────────

test("a pending message survives a restart as interrupted and is never uploaded", async () => {
  const srv = server();
  sync.noteNewSession("r1");
  sync.saveSession({ sessionId: "r1", date: "", messages: [msg("1", 1), msg("2", 2)] });
  sync.markMessagePending("2");
  assert.equal(sync.messageStatuses()["2"], "sending");
  restart();
  assert.equal(sync.messageStatuses()["2"], "interrupted");
  assert.deepEqual(sync.uploadableMessages(sync.loadSession("r1").messages).map((m) => m.id), ["1"]);
  assert.equal(await sync.pushSessionToServer(sync.loadSession("r1"), "tok", gen()), true);
  for (const ids of srv.puts) assert.ok(!ids.includes("2"));
  // Still on this device, visible.
  assert.deepEqual(sync.loadSession("r1").messages.map((m) => m.id), ["1", "2"]);
  // Nothing else is owed: the conversation is not left unsent for ever.
  assert.equal(sync.getUnsent().has("r1"), false);
});

test("leaving Chat before a 413: the refusal recorded out of sight keeps it out, also after a restart", async () => {
  const srv = server();
  sync.noteNewSession("r2");
  const long = "word ".repeat(1200);
  sync.saveSession({ sessionId: "r2", date: "", messages: [msg("1", 1), msg("big", 2, long)] });
  sync.markMessagePending("big");
  // The page unmounted; the 413 lands and is recorded before any screen check.
  sync.settleMessage("big", true);
  assert.equal(sync.messageStatuses().big, "refused");
  restart();
  // A later plain settle (or anything else) never undoes a refusal.
  sync.settleMessage("big");
  sync.forgetMessage("big");
  assert.equal(sync.messageStatuses().big, "refused");
  assert.equal(await sync.pushSessionToServer(sync.loadSession("r2"), "tok", gen()), true);
  for (const ids of srv.puts) assert.ok(!ids.includes("big"));
  assert.deepEqual(srv.sessions.get("r2").messages.map((m) => m.id), ["1"]);
});

test("an interrupted message is resolved by sending it again (it then uploads as the new one)", async () => {
  const srv = server();
  sync.noteNewSession("r3");
  sync.saveSession({ sessionId: "r3", date: "", messages: [msg("1", 1), msg("old", 2)] });
  sync.markMessagePending("old");
  restart();
  assert.equal(sync.messageStatuses().old, "interrupted");
  // Send again: the old copy is replaced by a new message.
  sync.forgetMessage("old");
  sync.markMessagePending("new");
  sync.saveSession({ sessionId: "r3", date: "", messages: [msg("1", 1), msg("new", 3, "msg old")] });
  assert.equal(sync.messageStatuses().old, undefined);
  sync.settleMessage("new");
  assert.equal(await sync.pushSessionToServer(sync.loadSession("r3"), "tok", gen()), true);
  assert.deepEqual(srv.sessions.get("r3").messages.map((m) => m.id), ["1", "new"]);
});

test("an interrupted message the member removes is withdrawn for good", async () => {
  const srv = server();
  sync.noteNewSession("r4");
  sync.saveSession({ sessionId: "r4", date: "", messages: [msg("1", 1), msg("gone", 2)] });
  sync.markMessagePending("gone");
  restart();
  sync.settleMessage("gone", true);
  // Even a stale copy still holding it never uploads it.
  assert.equal(await sync.pushSessionToServer(sync.loadSession("r4"), "tok", gen()), true);
  for (const ids of srv.puts) assert.ok(!ids.includes("gone"));
});

test("an interrupted message the server's transcript already holds is resolved by sync", async () => {
  const srv = server();
  srv.sessions.set("r5", { session_id: "r5", messages: [msg("1", 1), msg("seen", 2)], revision: 1, last_message_at: "t1" });
  sync.markServerConfirmed(["r5"]);
  sync.saveSession({ sessionId: "r5", date: "", messages: [msg("1", 1), msg("seen", 2)] });
  sync.markMessagePending("seen");
  // Still running in this app session: not resolved by the server copy.
  assert.equal(await sync.pushSessionToServer(sync.loadSession("r5"), "tok", gen()), true);
  assert.equal(sync.messageStatuses().seen, "sending");
  restart();
  assert.equal(sync.messageStatuses().seen, "interrupted");
  assert.equal(await sync.pushSessionToServer(sync.loadSession("r5"), "tok", gen()), true);
  assert.equal(sync.messageStatuses().seen, undefined);
});

test("statuses are kept per account", () => {
  sync.markMessagePending("acct-a");
  const before = sync.messageStatuses()["acct-a"];
  assert.equal(before, "sending");
  // The key the statuses live under is account-scoped like the cache.
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
  const statusKey = keys.find((k) => k.includes("solray_chat_msg_status"));
  assert.ok(statusKey);
  assert.equal(statusKey, session.accountKey("solray_chat_msg_status"));
  sync.settleMessage("acct-a");
});

// ─── answers that land out of sight ─────────────────────────────────────────

test("an answer landing after the member left is written into its conversation, not lost", () => {
  const events = [];
  window.addEventListener(sync.CHAT_MERGED_EVENT, (e) => events.push(e.detail));
  sync.saveSession({ sessionId: "r6", date: "", messages: [msg("1", 1), msg("u", 2)] });
  const answer = outcome.answerFromChat({ response: "The Oracle's words." }, "no response", 1760000000000);
  assert.equal(sync.updateStoredSession("r6", gen(), (saved) => outcome.withAnswer(saved, "u", answer)), true);
  const saved = sync.loadSession("r6").messages;
  assert.deepEqual(saved.map((m) => m.content), ["msg 1", "msg u", "The Oracle's words."]);
  assert.equal(sync.getUnsent().has("r6"), true);
  assert.equal(events.at(-1).sessionId, "r6");
  // Idempotent.
  sync.updateStoredSession("r6", gen(), (s) => outcome.withAnswer(s, "u", answer));
  assert.equal(sync.loadSession("r6").messages.length, 3);
  // No saved copy, or another account: nothing written.
  assert.equal(sync.updateStoredSession("missing", gen(), (s) => s), false);
  assert.equal(sync.updateStoredSession("r6", gen() + 1, (s) => s), false);
});

test("answerFromChat: crisis turns tag the member's message; no words is the honest error", () => {
  const crisis = outcome.answerFromChat({ response: "Call now.", crisis_card: { variant: "urgent", intro: "x" }, crisis_turn: true }, "none");
  assert.equal(crisis.crisisTurn, true);
  assert.equal(crisis.reply.safety, "crisis");
  assert.equal(crisis.reply.crisis.variant, "urgent");
  const tagged = outcome.withAnswer([msg("u", 1)], "u", crisis);
  assert.equal(tagged[0].safety, "crisis");
  const support = outcome.answerFromChat({ response: "Here.", support_card: supportCard }, "none");
  assert.equal(support.crisisTurn, false);
  assert.equal(support.reply.crisis.variant, "support");
  const empty = outcome.answerFromChat({}, "No reply came.");
  assert.equal(empty.reply.isError, true);
  assert.equal(empty.reply.content, "No reply came.");
});

test("chat page: the outcome is recorded before the mounted and conversation guards", () => {
  const src = page();
  const send = src.slice(src.indexOf("const sendMessage = async"), src.indexOf("// Takes a message without an answer"));
  // Success: settled before the conversation check, answer kept out of sight.
  const ok = send.slice(send.indexOf('"/chat",'), send.indexOf("} catch (err) {"));
  assert.ok(ok.indexOf("life.answered();") > 0);
  assert.ok(ok.indexOf("life.answered();") < ok.indexOf("if (!isMountedRef.current || activeSessionRef.current !== sentSessionId)"));
  assert.ok(ok.includes("updateStoredSession(sentSessionId, accountGen, (saved) => withAnswer(saved, userMsg.id, answer))"));
  // 413: refused before `if (!isMountedRef.current) return;`.
  const c = send.slice(send.indexOf("} catch (err) {"), send.lastIndexOf("} finally {"));
  assert.ok(c.indexOf("life.refused()") > 0);
  assert.ok(c.indexOf("life.refused()") < c.indexOf("if (!isMountedRef.current) return;"));
  // Finally: a failure out of sight is released (interrupted), not uploaded.
  const fin = send.slice(send.lastIndexOf("} finally {"));
  // (lib/chat-sync beginSend: finish(visible) settles or releases.)
  assert.ok(fin.includes("life.finish(isMountedRef.current && activeSessionRef.current === sentSessionId && isCurrentGeneration(accountGen))"));
  // History to /chat leaves unanswered messages out; a resend replaces the old copy.
  assert.ok(send.includes("historyForServer(uploadableMessages(updatedMessages.slice(0, -1)))"));
  assert.ok(send.includes("messages.filter((m) => m.id !== opts.replaceId)"));
  assert.ok(send.includes("forgetMessage(opts.replaceId)"));
});

test("chat page: interrupted and refused messages stay visible with a way to send or edit them", () => {
  const src = page();
  for (const k of ["chat.turn_interrupted", "chat.turn_too_long", "chat.turn_send_again", "chat.turn_remove", "chat.turn_edit"]) {
    assert.ok(src.includes(`t("${k}")`), k);
  }
  assert.ok(src.includes("onClick={() => resendInterrupted(msg)}"));
  assert.ok(src.includes("void sendMessage(msg.content, { replaceId: msg.id })"));
  assert.ok(src.includes("onClick={() => editRefused(msg)}"));
  const en = JSON.parse(fs.readFileSync(path.join(root, "messages/en.json"), "utf8")).chat;
  const es = JSON.parse(fs.readFileSync(path.join(root, "messages/es.json"), "utf8")).chat;
  for (const k of ["turn_interrupted", "turn_too_long", "turn_send_again", "turn_remove", "turn_edit"]) {
    assert.ok(en[k] && es[k] && en[k] !== es[k], k);
    assert.ok(!/\u2014/.test(en[k] + es[k]), k);
  }
});
