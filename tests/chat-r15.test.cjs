// Round fifteen (Codex out12-5):
// #1 every path that sends a message to /chat (an ordinary send, the "Go
//    deeper" question, a Dynamics opening) shares one send lifecycle:
//    pending before it is shown or saved, answered, refused on a length
//    refusal, interrupted when unresolved out of sight.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { installBrowser, load } = require("./helpers.cjs");

installBrowser();
const root = path.join(__dirname, "..");
const page = () => fs.readFileSync(path.join(root, "app/chat/page.tsx"), "utf8");
const sync = load("lib/chat-sync.js");

const m = (id) => ({ id, role: "user", content: id, timestamp: "2026-10-08T10:00:00Z" });

test("send lifecycle: pending, then answered", () => {
  const life = sync.beginSend("a1");
  assert.equal(sync.messageStatuses().a1, "sending");
  assert.deepEqual(sync.uploadableMessages([m("a1")]), []);
  life.answered();
  life.finish(false);
  assert.equal(sync.messageStatuses().a1, undefined);
  assert.deepEqual(sync.uploadableMessages([m("a1")]).map((x) => x.id), ["a1"]);
});

test("send lifecycle: refused stays refused, whatever finish says", () => {
  const life = sync.beginSend("a2");
  life.refused();
  life.finish(true);
  life.answered();
  assert.equal(sync.messageStatuses().a2, "refused");
  assert.deepEqual(sync.uploadableMessages([m("a2")]), []);
});

test("send lifecycle: an unresolved failure is uploadable when shown, interrupted out of sight", () => {
  const shown = sync.beginSend("a3");
  shown.finish(true);
  assert.equal(sync.messageStatuses().a3, undefined);
  const unseen = sync.beginSend("a4");
  unseen.finish(false);
  assert.equal(sync.messageStatuses().a4, "interrupted");
  assert.deepEqual(sync.uploadableMessages([m("a4")]), []);
  // finish is once only.
  unseen.finish(true);
  assert.equal(sync.messageStatuses().a4, "interrupted");
});

test("chat page: all three paths that send to /chat use the shared lifecycle", () => {
  const src = page();
  // No path marks or settles messages by hand any more.
  assert.ok(!src.includes("markMessagePending("));
  assert.ok(!/settleMessage\(userMsg/.test(src));
  assert.ok(!src.includes("releaseMessage("));
  const sendAt = src.indexOf("const sendMessage = async");
  const send = src.slice(sendAt, src.indexOf("// Takes a message without an answer"));
  const seededAt = src.indexOf('takeHandoff("solray_chat_prompt")');
  const seeded = src.slice(seededAt, src.indexOf("// fall through", seededAt));
  const dynAt = src.indexOf('takeHandoff("solray_compat_context")');
  const dyn = src.slice(dynAt, src.indexOf("// Fall through to normal init", dynAt));
  for (const [name, block, shownAt] of [
    ["send", send, "setMessages(updatedMessages)"],
    ["seeded", seeded, "persistSession(newSession)"],
    ["dynamics", dyn, "persistSession(newSession)"],
  ]) {
    const begin = block.indexOf("const life = beginSend(userMsg.id)");
    assert.ok(begin > 0, name);
    assert.ok(begin < block.indexOf(shownAt), `${name}: pending before it is shown or saved`);
    const call = block.indexOf('"/chat"');
    assert.ok(call > 0 && block.indexOf("life.answered();", call) > call, `${name}: answered after /chat`);
    const fin = block.slice(block.lastIndexOf("} finally {"));
    assert.ok(fin.includes("life.finish(isMountedRef.current && activeSessionRef.current === "), name);
  }
  // Openings: refusals and failures through the shared handler, which
  // refuses a length refusal before anything else.
  assert.ok(seeded.includes("openingFailed(err, {") && dyn.includes("openingFailed(err, {"));
  const of = src.slice(src.indexOf("const openingFailed = "), src.indexOf("useEffect(() => {", src.indexOf("const openingFailed = ")));
  assert.ok(of.indexOf("o.life.refused()") < of.indexOf("if (isStaleAccountError(err)) return;"));
  assert.ok(of.includes("setInput((prev) => composerWithUnsent(o.userMsg.content, prev))"));
  assert.ok(of.includes('note(t("oracle_errors.message_too_long_kept"))'));
});
