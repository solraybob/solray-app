// Fixes from the second real-browser run of the release (r8 e2e).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const en = JSON.parse(read("messages/en.json"));
const es = JSON.parse(read("messages/es.json"));
const { installBrowser, load } = require("./helpers.cjs");

const NEW_KEYS = [
  "today.consent_card_title", "today.consent_card_body",
  "chat.consent_notice", "chat.consent_agree",
  "subscribe.pending_title", "subscribe.pending_body", "subscribe.pending_body_no_email",
  "subscribe.pending_confirmed", "subscribe.pending_not_yet", "subscribe.pending_help",
  "subscribe.pending_free_parts", "souls.view_profile_sub_private",
  "birth_fold.summer", "birth_fold.winter", "birth_fold.earlier_note", "birth_fold.later_note",
  "settings.private_switch", "settings.private_state_on", "settings.private_state_off",
  "settings.switch_state",
];
const get = (o, k) => k.split(".").reduce((c, p) => (c ? c[p] : undefined), o);

test("every new string exists in English and Spanish, with no long dash", () => {
  for (const k of NEW_KEYS) {
    for (const [l, b] of [["en", en], ["es", es]]) {
      const v = get(b, k);
      assert.ok(typeof v === "string" && v.trim(), `${l}:${k}`);
      assert.doesNotMatch(v, /\u2014/, `${l}:${k}`);
    }
  }
});

test("Today without AI consent: the sky and the cycles, and a quiet card that opens the sheet", () => {
  const src = read("app/today/page.tsx");
  assert.match(src, /if \(kind === "consent"\) \{\s*return \{ _pending: true, _consent: true/);
  // Not the preparing screen, not the error screen: the deck, with the consent card first.
  assert.match(src, /forecast\._pending === true && !forecast\._consent \? \(\s*<PendingTodayState/);
  assert.match(src, /title=\{t\("today\.consent_card_title"\)\}[\s\S]{0,200}onAction=\{\(\) => openAiConsentSheet\(\)\}/);
});

test("the Now deck box is measured, so the dots clear the bottom on every screen", () => {
  const src = read("app/today/page.tsx");
  assert.match(src, /el\.style\.setProperty\("--today-above"/);
  const css = read("app/globals.css");
  assert.match(css, /\.sol-today-box \{\s*min-height: calc\(100dvh - var\(--today-above/);
});

test("chat: missing consent is a calm notice with an Agree button, not an error bubble", () => {
  const src = read("app/chat/page.tsx");
  assert.match(src, /err\.code === AI_CONSENT_REQUIRED_CODE\) \{\s*setChatNotice\(\{ kind: "consent", sessionId: sentSessionId \}\);\s*return;/);
  assert.match(src, /chatNotice\.kind === "consent" && \(\s*<button\s*onClick=\{\(\) => openAiConsentSheet\(\)\}/);
});

test("chat header shares the messages' column, gutter outside", () => {
  const src = read("app/chat/page.tsx");
  assert.match(src, /<div className="w-full px-5 pt-3">\s*<div className="max-w-lg lg:max-w-\[620px\] mx-auto">/);
});

test("a new conversation is uploaded without asking the server for it first", async () => {
  const win = installBrowser();
  const session = load("lib/account-session.js");
  const sync = load("lib/chat-sync.js");
  const log = [];
  global.fetch = async (url, init = {}) => {
    const method = (init.method || "GET").toUpperCase();
    log.push(`${method} ${new URL(url).pathname}`);
    if (method === "GET") return { ok: false, status: 404, json: async () => ({ detail: "Session not found" }) };
    return { ok: true, status: 200, json: async () => ({ session_id: "n1", last_message_at: "2026-10-08T10:00:00Z", revision: 1, messages: [] }) };
  };
  win.localStorage.clear();
  sync.noteNewSession("new-1");
  sync.saveSession({ sessionId: "new-1", date: "", messages: [{ id: "1", role: "user", content: "hi", timestamp: "2026-10-08T10:00:00Z" }] });
  assert.equal(await sync.pushSessionToServer(sync.loadSession("new-1"), "tok", session.getAuthGeneration()), true);
  assert.deepEqual(log, ["PUT /chat/sessions/new-1"]);
});

test("subscribe: a trial waiting for the email gets its own screen, no billing controls", () => {
  const src = read("app/subscribe/page.tsx");
  assert.match(src, /if \(sub && sub\.subscribed && sub\.trial_pending_verification\) \{\s*return \(\s*<PendingTrialView/);
  const view = src.slice(src.indexOf("function PendingTrialView"), src.indexOf("/** A web member whose free trial waits on email verification. */"));
  assert.ok(view.length > 200);
  for (const k of ["subscribe.cancel", "subscribe.add_payment", "subscribe.subscribe_now", "PlanPicker"]) {
    assert.ok(!view.includes(k), k);
  }
  assert.match(view, /<ResendVerification token=\{token\} \/>/);
  assert.match(view, /subscribe\.pending_help/);
  // Confirmed meanwhile: on to Today.
  assert.match(src, /if \(wasPending\.current && sub\?\.has_access\) router\.replace\("\/today"\);/);
});

test("language: the device's language is saved once to an account that never chose one", () => {
  const auth = read("lib/auth-context.tsx");
  assert.match(auth, /if \(userObj\.language_saved === false\) \{\s*const device = deviceLanguage\(\);/);
  assert.match(auth, /\/users\/language`, \{\s*method: "PATCH"/);
  assert.match(read("app/onboard/page.tsx"), /language = lang \|\| deviceLanguage\(\);/);
  const win = installBrowser();
  const { deviceLanguage } = load("lib/i18n.js");
  win.localStorage.clear();
  Object.defineProperty(globalThis, "navigator", { value: { language: "es-ES" }, configurable: true, writable: true });
  assert.equal(deviceLanguage(), "es");
  win.localStorage.setItem("solray_language", "en");
  assert.equal(deviceLanguage(), "en");
});

test("wording: clock-change choices in words, private charts not promised, Private switch on = private", () => {
  const fold = read("components/BirthTimeFoldSheet.tsx");
  assert.match(fold, /o\.fold === "first" \? "birth_fold\.summer" : "birth_fold\.winter"/);
  assert.equal(en.birth_fold.summer, "Summer time");
  assert.equal(en.birth_fold.winter, "Winter time");
  assert.match(read("app/souls/page.tsx"), /soul\.soul\.is_public \? "souls\.view_profile_sub" : "souls\.view_profile_sub_private"/);
  assert.doesNotMatch(en.souls.view_profile_sub_private, /See .*chart/);
  const settings = read("app/profile/settings/page.tsx");
  assert.match(settings, /label=\{t\("settings\.private_switch"\)\}\s*checked=\{!isPublic\}/);
  assert.match(settings, /aria-label=\{srLabel\}/);
});

test("Settings: the memory switch's description sits under the switch, before Clear memory", () => {
  const s = read("app/profile/settings/page.tsx");
  const sec = s.slice(s.indexOf('label={t("settings.memory_section")}'), s.indexOf("── 5. Birth details"));
  assert.ok(sec.indexOf("settings.memory_on_hint") < sec.indexOf("settings.memory_clear\")"));
  assert.ok(!/hint=\{memoryOn/.test(sec));
});
