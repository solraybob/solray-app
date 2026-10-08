// Round thirteen (Codex out10-5):
// #1 session-close synthesis sends only what belongs to the transcript: no
//    pending, interrupted or refused message, and the two-turn minimum is
//    counted on that filtered history;
// #2 a status change made out of sight (a late refusal, a release as
//    interrupted) is announced, bound to the account, so a reopened Chat
//    redraws its notes and buttons.
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
const { historyForServer } = load("lib/oracle-request.js");

const msg = (id, role, content = `msg ${id}`) => ({ id, role, content, timestamp: `2026-10-08T10:00:${id.padStart(2, "0")}Z` });

test("synthesis history: refused and pending messages are left out, and do not count", () => {
  const msgs = [msg("1", "user"), msg("2", "assistant"), msg("3", "user", "word ".repeat(1200)), msg("4", "user")];
  sync.markMessagePending("3");
  sync.settleMessage("3", true);
  sync.markMessagePending("4");
  const history = historyForServer(sync.uploadableMessages(msgs));
  assert.deepEqual(history.map((m) => m.content), ["msg 1", "msg 2"]);
  // One answered user turn: under the minimum, nothing is synthesized.
  assert.equal(history.filter((m) => m.role === "user").length, 1);
  sync.settleMessage("4");
});

test("chat page: synthesis builds its history from uploadable messages only", () => {
  const src = page();
  const i = src.indexOf("const triggerSessionSynthesis = useCallback(");
  const block = src.slice(i, src.indexOf("keepalive: true", i));
  assert.ok(block.includes("const history = historyForServer(uploadableMessages(msgs));"));
  assert.ok(!block.includes("historyForServer(msgs)"));
  assert.ok(block.indexOf("uploadableMessages(msgs)") < block.indexOf('const userCount = history.filter((m) => m.role === "user").length'));
  assert.ok(block.includes("conversation_history: history"));
  // Every place the page sends a member's transcript as history filters it.
  const sends = src.match(/historyForServer\(([^)]*)\)/g) || [];
  assert.ok(sends.length >= 2);
  for (const s of sends) assert.ok(s.startsWith("historyForServer(uploadableMessages("), s);
});

test("status events: refusal and release out of sight are announced for this account", () => {
  const seen = [];
  const on = (e) => seen.push(sync.isOwnStatusEvent(e));
  window.addEventListener(sync.CHAT_STATUS_EVENT, on);
  sync.markMessagePending("late");
  assert.equal(seen.length, 1);
  // The late 413 for a send from a page since left.
  sync.settleMessage("late", true);
  assert.equal(seen.length, 2);
  assert.equal(sync.messageStatuses().late, "refused");
  // A failure out of sight releases it as interrupted: announced too.
  sync.markMessagePending("gone");
  const before = seen.length;
  sync.releaseMessage("gone");
  assert.equal(seen.length, before + 1);
  assert.equal(sync.messageStatuses().gone, "interrupted");
  // Releasing again changes nothing and says nothing.
  sync.releaseMessage("gone");
  assert.equal(seen.length, before + 1);
  assert.ok(seen.every((x) => x === true));
  window.removeEventListener(sync.CHAT_STATUS_EVENT, on);
});

test("status events: an event from another account or generation is not ours", () => {
  const ev = (detail) => new CustomEvent(sync.CHAT_STATUS_EVENT, { detail });
  const key = session.accountKey("solray_chat_msg_status");
  const g = session.getAuthGeneration();
  assert.equal(sync.isOwnStatusEvent(ev({ key, generation: g })), true);
  assert.equal(sync.isOwnStatusEvent(ev({ key, generation: g + 1 })), false);
  assert.equal(sync.isOwnStatusEvent(ev({ key: "someone-else:solray_chat_msg_status", generation: g })), false);
  assert.equal(sync.isOwnStatusEvent(ev(undefined)), false);
});

test("chat page: Chat redraws statuses on this account's status events", () => {
  const src = page();
  const i = src.indexOf("const [statusTick, setStatusTick] = useState(0);");
  const block = src.slice(i, i + 700);
  assert.ok(block.includes("if (isOwnStatusEvent(e)) setStatusTick((n) => n + 1);"));
  assert.ok(block.includes("window.addEventListener(CHAT_STATUS_EVENT, onStatus)"));
  assert.ok(block.includes("window.removeEventListener(CHAT_STATUS_EVENT, onStatus)"));
  assert.ok(src.includes("useMemo(() => messageStatuses(), [messages, sending, statusTick])"));
});
