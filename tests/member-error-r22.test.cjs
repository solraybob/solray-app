// Round twenty-two (Codex out18-5): a member never reads a server's own
// detail text (English, possibly naming configuration, possibly an object).
// Transcription refusals carry codes worded in EN/ES; every failure a member
// reads goes through memberErrorText.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { installBrowser, load } = require("./helpers.cjs");

installBrowser();
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const { ApiError } = load("lib/api.js");
const { memberErrorText, MemberError, MEMBER_CODE_KEYS } = load("lib/member-error.js");
const es = JSON.parse(read("messages/es.json"));
const en = JSON.parse(read("messages/en.json"));
const tr = (dict) => (key) => key.split(".").reduce((o, k) => (o ? o[k] : undefined), dict) ?? key;
const tEs = tr(es);

test("transcription codes read in Spanish, never the English detail", () => {
  const cases = [
    [413, "audio_too_large", "Audio clip too long. Keep it under about 10 minutes.", "chat.voice_too_long"],
    [400, "audio_empty", "Empty audio payload.", "chat.voice_empty"],
    [503, "transcription_unavailable", "Voice transcription isn't configured on this server.", "chat.voice_warming_up"],
    [502, "transcription_failed", "Transcription failed (500). Try again in a moment.", "chat.voice_transcription_failed"],
  ];
  for (const [status, code, detail, key] of cases) {
    const text = memberErrorText(new ApiError(detail, status, code, { code, message: detail }), tEs, "chat.voice_failed");
    assert.equal(text, tEs(key), code);
    assert.notEqual(text, detail);
    assert.ok(es.chat[key.split(".")[1]] && en.chat[key.split(".")[1]], key);
    assert.equal(MEMBER_CODE_KEYS[code], key);
  }
});

test("an uncoded refusal from an older server: the screen's status words, else its fallback", () => {
  const old413 = new ApiError("Audio clip too long. Keep it under about 10 minutes.", 413);
  assert.equal(memberErrorText(old413, tEs, "chat.voice_transcription_failed", { byStatus: { 413: "chat.voice_too_long" } }), tEs("chat.voice_too_long"));
  const odd = new ApiError("Request body too large.", 418);
  assert.equal(memberErrorText(odd, tEs, "chat.voice_transcription_failed"), tEs("chat.voice_transcription_failed"));
  assert.equal(memberErrorText(new ApiError("Too many", 429), tEs, "x.y"), tEs("common.error_too_many"));
  assert.equal(memberErrorText(new TypeError("Failed to fetch"), tEs, "login.error_failed", { network: "login.error_no_signal" }), tEs("login.error_no_signal"));
  assert.equal(memberErrorText(new Error("some JS error"), tEs, "common.error_generic"), tEs("common.error_generic"));
  // Words the app wrote itself in the member's language pass through.
  assert.equal(memberErrorText(new MemberError("Hola"), tEs, "common.error_generic"), "Hola");
  // Coded Oracle refusals keep their own words.
  assert.equal(memberErrorText(new ApiError("x", 429, "ai_daily_limit"), tEs, "common.error_generic"), tEs("oracle_errors.ai_daily_limit"));
});

test("every new key exists in English and Spanish, without long dashes", () => {
  const keys = ["common.error_too_many", "chat.voice_too_long", "chat.voice_empty", "login.error_invalid", "onboard.email_exists",
    "onboard.details_invalid", "reset.link_invalid", "profile.username_unavailable", "souls.invite_self", "souls.invite_already",
    "souls.invite_no_account", "souls.invite_gone", "settings.birth_invalid"];
  for (const k of keys) {
    const a = tr(en)(k), b = tEs(k);
    assert.ok(a !== k && b !== k && a !== b, k);
    assert.ok(!/—/.test(a + b), k);
  }
});

test("sweep: no screen shows an error's own message text any more", () => {
  const files = ["app/chat/page.tsx", "app/subscribe/page.tsx", "app/forgot-password/page.tsx", "app/reset-password/[token]/page.tsx",
    "app/preview/page.tsx", "app/souls/page.tsx", "app/profile/[id]/page.tsx", "app/profile/page.tsx", "app/profile/settings/page.tsx",
    "app/login/page.tsx", "app/onboard/page.tsx", "app/verify-email/page.tsx", "components/CardForm.tsx"];
  for (const f of files) {
    const src = read(f);
    assert.ok(!/instanceof Error \? (e|err)\.message/.test(src), f);
    assert.ok(!/instanceof Error && (e|err)\.message\s*\?\s*(e|err)\.message/.test(src), f);
    assert.ok(!/setMessage\(e\.message/.test(src), f);
    assert.ok(!/throw new Error\(errorText\(/.test(src), f);
    assert.ok(!/throw new Error\(detail/.test(src), f);
  }
  const chat = read("app/chat/page.tsx");
  assert.ok(chat.includes('const msg = memberErrorText(err, t, "chat.voice_failed");'));
  assert.ok(chat.includes('{ byStatus: { 400: "chat.voice_empty", 413: "chat.voice_too_long", 503: "chat.voice_warming_up" } }'));
});
