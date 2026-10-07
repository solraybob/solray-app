// Round 4 merge: the app follows the backend's chat provenance rules.
// /chat/synthesize needs the session id, and a 403
// partner_ai_consent_required closes a conversation that carries a member
// who is no longer sharing their chart.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { installBrowser, load } = require("./helpers.cjs");

installBrowser();
const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const src = read("app/chat/page.tsx");

test("session-close synthesis sends the closing session's id, read from a ref", () => {
  const fn = src.slice(src.indexOf("const triggerSessionSynthesis = useCallback"), src.indexOf("// Wire to beforeunload"));
  assert.match(fn, /const sid = activeSessionRef\.current;/);
  assert.match(fn, /if \(!tok \|\| !msgs\.length \|\| !sid\) return;/);
  assert.match(fn, /JSON\.stringify\(\{ conversation_history: history, session_id: sid \}\)/);
  assert.match(fn, /\}, \[\]\);/, "still memoised once: the id comes from the ref, not a stale closure");
});

test("the partner consent refusal is recognised only for its own 403 code", () => {
  const { isPartnerConsentRefusal, PARTNER_AI_CONSENT_REQUIRED_CODE } = load("lib/oracle-errors.js");
  const { ApiError } = load("lib/api.js");
  assert.equal(PARTNER_AI_CONSENT_REQUIRED_CODE, "partner_ai_consent_required");
  const mk = (status, code) => { const e = new ApiError("x", status); e.code = code; return e; };
  assert.equal(isPartnerConsentRefusal(mk(403, "partner_ai_consent_required")), true);
  assert.equal(isPartnerConsentRefusal(mk(403, "ai_consent_required")), false);
  assert.equal(isPartnerConsentRefusal(mk(400, "partner_ai_consent_required")), false);
  assert.equal(isPartnerConsentRefusal(new Error("partner_ai_consent_required")), false);
});

test("an ordinary conversation closed by the refusal starts a fresh one with the unsent message in the composer", () => {
  const send = src.slice(src.indexOf("const sendMessage = async"), src.indexOf("const sendMessageRef = useRef"));
  const branch = send.slice(send.indexOf("if (isPartnerConsentRefusal(err))"), send.indexOf("// Missing AI consent (the consent sheet"));
  assert.ok(branch.length > 0, "handled before the generic Oracle refusal notes");
  assert.match(branch, /if \(activeSessionRef\.current !== sentSessionId\) return;/);
  assert.match(branch, /if \(sentSoulRef\) \{/);
  const ordinary = branch.slice(branch.indexOf("// Ordinary conversation"));
  // The unsent turn leaves the closed conversation.
  assert.match(ordinary, /sessionId: sentSessionId,[\s\S]*messages: updatedMessages\.slice\(0, -1\),/);
  assert.match(ordinary, /const freshId = generateSessionId\(\);\n\s+setSessionId\(freshId\);/);
  assert.match(ordinary, /setMessages\(\[\]\);/);
  assert.match(ordinary, /setInput\(\(prev\) => \(prev\.trim\(\) \? `\$\{text\}\\n\\n\$\{prev\}` : text\)\);/);
  assert.match(ordinary, /setChatNotice\(\{ kind: "closed" \}\);/);
  // Never sent on its own, and the closed conversation is not synthesized.
  assert.ok(!/sendMessage\(/.test(ordinary));
  assert.ok(!/apiFetch\(/.test(ordinary));
  assert.ok(!/triggerSessionSynthesis\(/.test(ordinary));
  assert.match(src, /\{t\("chat\.conversation_closed_partner"\)\}/);
});

test("in Dynamics the partner consent copy stays and an ordinary conversation is offered", () => {
  const send = src.slice(src.indexOf("const sendMessage = async"), src.indexOf("const sendMessageRef = useRef"));
  const dyn = send.slice(send.indexOf("if (sentSoulRef) {"), send.indexOf("// Ordinary conversation"));
  assert.match(dyn, /content: t\(ORACLE_ERROR_KEYS\.partner_ai_consent_required\),/);
  assert.match(dyn, /setChatNotice\(\{ kind: "dynamics", sessionId: sentSessionId \}\);/);
  assert.ok(!/setSessionId\(/.test(dyn), "the Dynamics conversation is not replaced on its own");
  assert.match(src, /onClick=\{\(\) => \{ setChatNotice\(null\); startNewChat\(\); \}\}/);
  assert.match(src, /\{t\("chat\.start_ordinary_conversation"\)\}/);
});

test("the new copy exists in English and Spanish, with no long dash", () => {
  const en = JSON.parse(read("messages/en.json")).chat;
  const es = JSON.parse(read("messages/es.json")).chat;
  assert.equal(en.conversation_closed_partner,
    "Someone in this conversation is no longer sharing their chart, so this conversation is closed. Starting a fresh one.");
  for (const k of ["conversation_closed_partner", "start_ordinary_conversation", "dismiss_notice"]) {
    assert.ok(en[k] && es[k], k);
    assert.notEqual(en[k], es[k], k);
    assert.ok(!/—/.test(en[k] + es[k]), k);
  }
});
