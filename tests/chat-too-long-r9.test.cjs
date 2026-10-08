// Round nine: when a message (a long voice message, say) is too long to
// send, the words come back to the composer whole (never lost, never cut)
// and the spoken part still travels as voice_transcript.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { installBrowser, load } = require("./helpers.cjs");

installBrowser();
const root = path.join(__dirname, "..");
const page = () => fs.readFileSync(path.join(root, "app/chat/page.tsx"), "utf8");

test("composer: unsent words come back whole, before anything typed meanwhile", () => {
  const { composerWithUnsent } = load("lib/oracle-request.js");
  const long = "word ".repeat(1200).trim();
  assert.equal(composerWithUnsent(long, ""), long);
  assert.equal(composerWithUnsent(long, "  "), long);
  assert.equal(composerWithUnsent("first", "typed later"), "first\n\ntyped later");
});

test("errors: message_too_long is a known, coded refusal", () => {
  const { MESSAGE_TOO_LONG_CODE, ORACLE_ERROR_KEYS } = load("lib/oracle-errors.js");
  assert.equal(MESSAGE_TOO_LONG_CODE, "message_too_long");
  assert.equal(ORACLE_ERROR_KEYS.message_too_long, "oracle_errors.message_too_long");
});

test("chat page: a too-long message returns to the composer with its transcript", () => {
  const src = page();
  assert.ok(src.indexOf("err.code === MESSAGE_TOO_LONG_CODE") > 0);
  // The branch drawn in the open conversation (round twelve: the refusal
  // itself is recorded first, before any screen check).
  const send = src.indexOf("const sendMessage = async");
  const i = src.indexOf("if (tooLong) {", send);
  assert.ok(i > 0);
  const block = src.slice(i, src.indexOf("return;", i));
  assert.ok(block.includes("prev.filter((m) => m.id !== userMsg.id)"));
  assert.ok(block.includes("setInput((prev) => composerWithUnsent(text, prev))"));
  assert.ok(block.includes("lastTranscriptRef.current = voiceTranscript ?? null"));
  assert.ok(block.includes('t("oracle_errors.message_too_long_kept")'));
  // No client-side length cap: the server decides.
  assert.ok(!/maxLength=\{?\d/.test(src));
});

test("copy: the kept-message note exists in English and Spanish, without long dashes", () => {
  for (const lang of ["en", "es"]) {
    const m = JSON.parse(fs.readFileSync(path.join(root, "messages", `${lang}.json`), "utf8"));
    const s = m.oracle_errors.message_too_long_kept;
    assert.ok(typeof s === "string" && s.length > 20, lang);
    assert.ok(!s.includes("—") && !s.includes("–"), lang);
  }
});
