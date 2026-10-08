// Crisis tiers, round six (judge-first): crisis turns tagged in the
// transcript and kept from the AI, the voice transcript's safety floor, a
// crisis voice message never lost, and the server-issued session id.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { installBrowser, load } = require("./helpers.cjs");

installBrowser();
const root = path.join(__dirname, "..");
const page = () => fs.readFileSync(path.join(root, "app/chat/page.tsx"), "utf8");

test("history: both messages of a crisis turn go to the server tagged", () => {
  const { historyForServer, isCrisisTurn } = load("lib/oracle-request.js");
  const out = historyForServer([
    { id: "greeting", role: "assistant", content: "Hello" },
    { id: "1", role: "user", content: "hi" },
    { id: "2", role: "user", content: "something heavy", safety: "crisis" },
    { id: "3", role: "assistant", content: "card text", crisis: { variant: "urgent" } },
    { id: "4", role: "assistant", content: "support text", crisis: { variant: "support" } },
    { id: "5", role: "assistant", content: "oops", isError: true },
  ]);
  assert.deepEqual(out, [
    { role: "user", content: "hi" },
    { role: "user", content: "something heavy", safety: "crisis" },
    { role: "assistant", content: "card text", safety: "crisis" },
    { role: "assistant", content: "support text" },
    { role: "assistant", content: "oops", isError: true },
  ]);
  assert.equal(isCrisisTurn({ role: "assistant", content: "x", crisis: { variant: "standard" } }), true);
  assert.equal(isCrisisTurn({ role: "user", content: "x" }), false);
});

test("voice: the transcript travels on its own so typed words cannot lower it", () => {
  const { voiceMessage, voiceTranscriptFor } = load("lib/oracle-request.js");
  assert.deepEqual(voiceMessage("I am hungry  ", " I want to kill myself tonight "),
    { text: "I am hungry I want to kill myself tonight", voiceTranscript: "I want to kill myself tonight" });
  assert.deepEqual(voiceMessage("", "hello"), { text: "hello", voiceTranscript: "hello" });
  assert.equal(voiceTranscriptFor("so I said hello there", "hello there"), "hello there");
  assert.equal(voiceTranscriptFor("edited it all away", "hello there"), undefined);
  assert.equal(voiceTranscriptFor("anything", null), undefined);
});

test("chat page: a crisis voice message waits for a busy send instead of being lost", () => {
  const src = page();
  const i = src.indexOf('if (data?.crisis === true && landing(true) === "send")');
  assert.ok(i > 0);
  // Round ten: a card the transcription already carries is drawn at once
  // (crisis-r10). Without one, the /chat path below.
  const k = src.indexOf("if (turn) {", i);
  assert.ok(k > i);
  const after = src.indexOf("}", src.indexOf("return;", k));
  const block = src.slice(after, src.indexOf("return;", after));
  // The words stay in the box until a send is accepted, never cleared first.
  assert.ok(block.includes("setInput(vm.text)"));
  assert.ok(!block.includes('setInput("")'));
  assert.ok(block.includes("pendingVoiceRef.current = pending"));
  assert.ok(block.includes("voiceTranscript: vm.voiceTranscript"));
  // ...and goes out when the other send settles.
  assert.match(src, /if \(sending\) return;\s*const p = pendingVoiceRef\.current;/);
  // sendMessage refuses a second send synchronously and says so.
  assert.match(src, /if \(!text \|\| sending \|\| sendingRef\.current\) return false;/);
  assert.ok(src.includes("...(voiceTranscript ? { voice_transcript: voiceTranscript } : {})"));
});

test("chat page: the crisis turn is tagged and a server-issued session id is kept", () => {
  const src = page();
  assert.ok(src.includes('data.crisis_turn === true || card.variant === "standard" || card.variant === "urgent"'));
  assert.ok(src.includes('crisisTurn && m.id === userMsg.id ? { ...m, safety: "crisis" as const } : m'));
  assert.match(src, /if \(!sentSessionId && typeof data\.session_id === "string" && data\.session_id\) \{/);
});
