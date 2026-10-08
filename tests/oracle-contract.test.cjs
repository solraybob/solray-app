// Cross-team contract with the Oracle backend (A2, A14, E6, E10, A6/A8).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { installBrowser, load } = require("./helpers.cjs");

installBrowser();
const root = path.join(__dirname, "..");
const api = load("lib/api.js");
const { oracleErrorKey, ORACLE_ERROR_KEYS } = load("lib/oracle-errors.js");
const { soulRequestFields, historyForServer } = load("lib/oracle-request.js");

function flat(o, p = "") {
  return Object.entries(o).reduce((acc, [k, v]) => (typeof v === "object" ? { ...acc, ...flat(v, p + k + ".") } : { ...acc, [p + k]: v }), {});
}

test("every Oracle refusal code has EN and ES copy, no em dash", () => {
  for (const lang of ["en", "es"]) {
    const m = flat(JSON.parse(fs.readFileSync(path.join(root, `messages/${lang}.json`), "utf8")));
    for (const code of ["ai_consent_required", "chart_private", "partner_ai_consent_required", "ai_daily_limit", "message_too_long", "soul_connection_gone"]) {
      const key = ORACLE_ERROR_KEYS[code];
      assert.ok(key, code);
      assert.ok(m[key] && m[key].trim(), `${lang} ${key}`);
      assert.ok(!m[key].includes("—"), `${lang} ${key} em dash`);
    }
    assert.ok(m["first_mirror.missing_chart"], `${lang} first mirror 409`);
    assert.ok(!/mail|correo/i.test(m["souls.search_placeholder"]), `${lang} search has no email`);
    for (const k of ["remove_connection", "remove_confirm_title", "remove_confirm_body", "remove_confirm_yes", "remove_connection_failed"]) {
      assert.ok(m[`souls.${k}`], `${lang} souls.${k}`);
    }
  }
});

test("known refusals map to copy; anything else falls through", () => {
  assert.equal(oracleErrorKey(new api.ApiError("x", 429, "ai_daily_limit")), "oracle_errors.ai_daily_limit");
  assert.equal(oracleErrorKey(new api.ApiError("x", 413, "message_too_long")), "oracle_errors.message_too_long");
  assert.equal(oracleErrorKey(new api.ApiError("x", 403, "chart_private")), "oracle_errors.chart_private");
  assert.equal(oracleErrorKey(new api.ApiError("x", 403, "partner_ai_consent_required")), "oracle_errors.partner_ai_consent_required");
  assert.equal(oracleErrorKey(new api.ApiError("x", 403, "ai_consent_required")), "chat.consent_needed");
  assert.equal(oracleErrorKey(new api.ApiError("x", 403)), null); // paywall path stays
  assert.equal(oracleErrorKey(new Error("net")), null);
});

test("chat names who the reading is with; a chart only rides for an unsynced person", () => {
  const bp = { meta: { name: "R" } };
  assert.deepEqual(soulRequestFields({ connectionId: "c1", blueprint: bp }), { soul_connection_id: "c1" });
  assert.deepEqual(soulRequestFields({ savedPersonId: "p1", blueprint: bp }), { saved_person_id: "p1" });
  assert.deepEqual(soulRequestFields({ blueprint: bp }), { soul_blueprint: bp });
  assert.deepEqual(soulRequestFields(null), {});
});

test("history drops the greeting and marks error bubbles", () => {
  const h = historyForServer([
    { id: "greeting", role: "assistant", content: "hi" },
    { id: "1", role: "user", content: "q" },
    { id: "2", role: "assistant", content: "could not reach", isError: true },
    { id: "3", role: "assistant", content: "real" },
  ]);
  assert.deepEqual(h, [
    { role: "user", content: "q" },
    { role: "assistant", content: "could not reach", isError: true },
    { role: "assistant", content: "real" },
  ]);
});

test("the chat page sends session_id and no client chart when an id is known", () => {
  const src = fs.readFileSync(path.join(root, "app/chat/page.tsx"), "utf8");
  assert.ok(!/body\.soul_blueprint\s*=/.test(src));
  assert.ok(!/soul_blueprint:\s*ctx\.soulBlueprint/.test(src));
  // /chat (two sends), the group chat and session-close synthesis.
  assert.equal((src.match(/session_id: (sid|sentSessionId)/g) || []).length, 4);
  assert.ok(!/crisis/.test(src));
  const souls = fs.readFileSync(path.join(root, "app/souls/page.tsx"), "utf8");
  assert.ok(/apiFetch\(`\/souls\/\$\{gone\.connection_id\}`, \{ method: "DELETE" \}/.test(souls));
  assert.ok(!/\/souls\/\$\{[^}]*connection_id\}\/blueprint/.test(souls));
});

test("F6: a Dynamics conversation names its partner from the transcript on any device", () => {
  const { soulFromTranscript, soulRequestFields } = load("lib/oracle-request.js");
  const transcript = [
    { id: "greeting", role: "assistant", content: "...", soul: { name: "Rut", connection_id: "c-1", saved_person_id: null } },
    { id: "2", role: "user", content: "and us?" },
  ];
  const ref = soulFromTranscript(transcript);
  assert.deepEqual(ref, { name: "Rut", connectionId: "c-1", savedPersonId: null });
  assert.deepEqual(soulRequestFields(ref), { soul_connection_id: "c-1" });
  assert.deepEqual(soulRequestFields(soulFromTranscript([{ soul: { saved_person_id: "p-9" } }])), { saved_person_id: "p-9" });
  assert.equal(soulFromTranscript([{ id: "1", content: "hi" }]), null);
  assert.equal(soulFromTranscript([{ soul: { name: "only a name" } }]), null);
  // The chat page stamps the opening message and reads it back.
  const src = fs.readFileSync(path.join(__dirname, "..", "app/chat/page.tsx"), "utf8");
  assert.match(src, /soul: \{\n\s+name: ctx\.soulName \?\? null,\n\s+connection_id: ctx\.soulConnectionId \?\? null,/);
  assert.match(src, /getSoulCtx\(last\.sessionId, last\.messages\)/);
  assert.match(src, /getSoulCtx\(session\.sessionId, session\.messages\)/);
  // No chart rides in the transcript.
  assert.ok(!/soul: \{[^}]*blueprint/.test(src));
});
