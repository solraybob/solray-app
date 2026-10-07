// Round 5 polish (legal page gaps):
//  4. The AI consent names every provider that receives data (Anthropic,
//     OpenAI, Groq, ElevenLabs for voice) in English and Spanish, and the
//     consent version moved to 2026-10-07.
//  5. Settings has a Memory section: the personalization_memory switch
//     (GET /users/me/consents, PUT /users/me/consents/personalization_memory)
//     and "Clear memory" (DELETE /memory) behind a confirm step.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { installBrowser, deferredFetch, load, tick } = require("./helpers.cjs");

installBrowser();
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const messages = (lang) => JSON.parse(read(`messages/${lang}.json`));

test("4: the consent version is 2026-10-07", () => {
  const { AI_CONSENT_VERSION } = load("lib/ai-consent.js");
  assert.equal(AI_CONSENT_VERSION, "2026-10-07");
});

test("4: every consent text names all four providers, in both languages", () => {
  for (const lang of ["en", "es"]) {
    const m = messages(lang);
    for (const text of [m.onboard.ai_consent, m.settings.ai_consent_on_hint]) {
      for (const p of ["Anthropic", "OpenAI", "Groq", "ElevenLabs"]) {
        assert.ok(text.includes(p), `${lang}: ${p} missing from "${text}"`);
      }
    }
  }
  // The sheet shows the signup wording itself.
  assert.match(read("components/AiConsentSheet.tsx"), /t\("onboard\.ai_consent"\)/);
});

test("5: memory setting reads the personalization_memory scope", async () => {
  const mem = load("lib/memory-settings.js");
  assert.equal(mem.memoryFromConsents({ scopes: { personalization_memory: true } }), true);
  assert.equal(mem.memoryFromConsents({ scopes: { personalization_memory: false } }), false);
  assert.equal(mem.memoryFromConsents({ scopes: {} }), null);
  assert.equal(mem.memoryFromConsents(null), null);

  const calls = deferredFetch();
  const p = mem.loadMemorySetting("tok");
  await tick();
  assert.ok(calls[0].url.endsWith("/users/me/consents"));
  assert.equal((calls[0].init.method || "GET").toUpperCase(), "GET");
  calls[0].respond(200, { scopes: { personalization_memory: false, anonymous_cohort_learning: true } });
  assert.equal(await p, false);
});

test("5: the switch saves through PUT and reports what the server stored", async () => {
  const mem = load("lib/memory-settings.js");
  const calls = deferredFetch();
  const p = mem.saveMemorySetting(false, "tok");
  await tick();
  assert.ok(calls[0].url.endsWith("/users/me/consents/personalization_memory"));
  assert.equal(calls[0].init.method, "PUT");
  assert.deepEqual(JSON.parse(calls[0].init.body), { granted: false });
  calls[0].respond(200, { scope: "personalization_memory", granted: false });
  assert.equal(await p, false);

  const p2 = mem.saveMemorySetting(true, "tok");
  await tick();
  calls[1].respond(500, { detail: "boom" });
  await assert.rejects(p2);
});

test("5: clear memory is a DELETE /memory that must confirm it cleared", async () => {
  const mem = load("lib/memory-settings.js");
  const calls = deferredFetch();
  const p = mem.clearMemory("tok");
  await tick();
  assert.ok(calls[0].url.endsWith("/memory"));
  assert.equal(calls[0].init.method, "DELETE");
  calls[0].respond(200, { cleared: true, deleted_count: 3 });
  await p;

  const p2 = mem.clearMemory("tok");
  await tick();
  calls[1].respond(200, { cleared: false });
  await assert.rejects(p2);
});

test("5: Settings has a Memory section with a serialised switch and a confirmed clear", () => {
  const src = read("app/profile/settings/page.tsx");
  assert.match(src, /t\("settings\.memory_section"\)/);
  // The switch: one save at a time, reverts to the server's value on failure.
  const start = src.indexOf("const toggleMemory = async");
  assert.ok(start > 0);
  const body = src.slice(start, src.indexOf("\n  };\n", start));
  assert.match(body, /memoryStatus === "saving"\) return/);
  assert.match(body, /saveMemorySetting\(next, token\)/);
  assert.match(body, /setMemoryOn\(confirmed\)/);
  assert.match(src, /disabled=\{memoryOn === null \|\| memoryStatus === "saving"\}/);
  // Clear: only from the confirm step.
  const clearStart = src.indexOf("const confirmClearMemory = async");
  assert.ok(clearStart > 0);
  assert.match(src.slice(clearStart, src.indexOf("\n  };\n", clearStart)), /clearMemory\(token\)/);
  assert.match(src, /onClick=\{confirmClearMemory\}/);
  assert.match(src, /memoryClearOpen \?/);
});

test("5: Memory copy exists in both languages, plain and without long dashes", () => {
  const keys = ["memory_section", "memory_on_hint", "memory_off_hint", "memory_load_failed",
    "memory_clear", "memory_clear_hint", "memory_clear_body", "memory_clear_confirm",
    "memory_cleared", "memory_clear_failed"];
  for (const lang of ["en", "es"]) {
    const s = messages(lang).settings;
    for (const k of keys) {
      assert.equal(typeof s[k], "string", `${lang}.settings.${k}`);
      assert.ok(!/[—–]/.test(s[k]), `${lang}.settings.${k} has a long dash`);
    }
  }
});
