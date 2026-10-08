// Round six, simplified in round twenty-six (the crisis cards are gone):
// an older transcript's card or tag never reaches the server as anything but
// plain text, the voice transcript still travels when the message holds it,
// and the server-issued session id is kept.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { installBrowser, load } = require("./helpers.cjs");

installBrowser();
const root = path.join(__dirname, "..");
const page = () => fs.readFileSync(path.join(root, "app/chat/page.tsx"), "utf8");

test("history: an older transcript's crisis card and tags go to the server as plain messages", () => {
  const { historyForServer } = load("lib/oracle-request.js");
  const out = historyForServer([
    { id: "greeting", role: "assistant", content: "Hello" },
    { id: "1", role: "user", content: "hi" },
    { id: "2", role: "user", content: "something heavy", safety: "crisis" },
    { id: "3", role: "assistant", content: "card text", crisis: { variant: "urgent", intro: "x" }, safety: "crisis" },
    { id: "4", role: "assistant", content: "support text", crisis: { variant: "support" } },
    { id: "5", role: "assistant", content: "oops", isError: true },
  ]);
  assert.deepEqual(out, [
    { role: "user", content: "hi" },
    { role: "user", content: "something heavy" },
    { role: "assistant", content: "card text" },
    { role: "assistant", content: "support text" },
    { role: "assistant", content: "oops", isError: true },
  ]);
});

test("voice: the transcript travels only while the message still holds it", () => {
  const { voiceTranscriptFor } = load("lib/oracle-request.js");
  assert.equal(voiceTranscriptFor("so I said hello there", "hello there"), "hello there");
  assert.equal(voiceTranscriptFor("edited it all away", "hello there"), undefined);
  assert.equal(voiceTranscriptFor("anything", null), undefined);
  const src = page();
  // sendMessage refuses a second send synchronously and says so.
  assert.match(src, /if \(!text \|\| sending \|\| sendingRef\.current\) return false;/);
  assert.ok(src.includes("...(voiceTranscript ? { voice_transcript: voiceTranscript } : {})"));
});

test("chat page: a server-issued session id is kept", () => {
  assert.match(page(), /if \(!sentSessionId && typeof data\.session_id === "string" && data\.session_id\) \{/);
});

test("an older stored transcript with a crisis card and tags still loads and syncs as ordinary messages", async () => {
  const sync = load("lib/chat-sync.js");
  const session = load("lib/account-session.js");
  const old = [
    { id: "1", role: "user", content: "something heavy", timestamp: "2026-10-01T10:00:00Z", safety: "crisis" },
    { id: "2", role: "assistant", content: "You are not alone.", timestamp: "2026-10-01T10:00:01Z",
      safety: "crisis", crisis: { variant: "urgent", intro: "You are not alone.", primary: null } },
    { id: "3", role: "assistant", content: "Odd", timestamp: "2026-10-01T10:00:02Z", crisis: "not even an object" },
  ];
  sync.noteNewSession("old1");
  sync.saveSession({ sessionId: "old1", date: "", messages: old });
  const loaded = sync.loadSession("old1").messages;
  assert.deepEqual(loaded.map((m) => m.content), ["something heavy", "You are not alone.", "Odd"]);
  assert.deepEqual(sync.uploadableMessages(loaded).map((m) => m.id), ["1", "2", "3"]);
  const puts = [];
  global.fetch = async (_url, init = {}) => {
    if ((init.method || "GET").toUpperCase() === "PUT") {
      const body = JSON.parse(init.body);
      puts.push(body);
      return { ok: true, status: 200, json: async () => ({ session_id: "old1", messages: body.messages, revision: 1, last_message_at: "t1" }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  assert.equal(await sync.pushSessionToServer(sync.loadSession("old1"), "tok", session.getAuthGeneration()), true);
  assert.equal(puts.length, 1);
});
