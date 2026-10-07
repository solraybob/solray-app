// Fixes from the first real-browser run of the release (r7 e2e).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

test("Not now holds: a background consent refusal does not reopen the sheet this session", () => {
  const sheet = read("components/AiConsentSheet.tsx");
  assert.match(sheet, /quiet && safeGet\(SNOOZE_KEY, true\) === "1"\) return;/);
  // Today's automatic loads ask quietly; nothing on Today asks loudly by itself.
  const today = read("app/today/page.tsx");
  for (const route of ["/forecast/today", "/insight/pending", "/insight/sky-echo", "/transits/long-range", "/forecast/today/plain"]) {
    const calls = [...today.matchAll(new RegExp(`apiFetch\\("${route.replace(/\//g, "\\/")}"[^)]*\\)`, "g"))].map((m) => m[0]);
    assert.ok(calls.length > 0, route);
    for (const c of calls) assert.match(c, /quietConsent: true/, c);
  }
  assert.match(read("components/CurrentCycles.tsx"), /apiFetch\("\/transits\/long-range", \{\}, token, \{ quietConsent: true \}\)/);
});

test("theme state starts on the paper the screen actually shows", () => {
  const src = read("lib/theme-context.tsx");
  assert.match(src, /useState<Theme>\("light"\)/);
  assert.match(src, /return attr === "dark" \? "dark" : "light";/);
  assert.doesNotMatch(src, /getAttribute\("data-theme"\) as Theme \| null\) \|\| "dark"/);
  // globals.css: the root (no data-theme) is the paper palette.
  assert.match(read("app/globals.css"), /Default = the connector's paper/);
});

test("someone else's birth wheels say 'they were born', in both languages", () => {
  const en = JSON.parse(read("messages/en.json"));
  const es = JSON.parse(read("messages/es.json"));
  assert.match(en.souls.birth_wheel_prompt, /they were born/);
  assert.ok(es.souls.birth_wheel_prompt && !/naciste/.test(es.souls.birth_wheel_prompt));
  assert.match(read("app/souls/page.tsx"), /prompt=\{t\("souls\.birth_wheel_prompt"\)\}/);
  assert.match(read("components/BirthWheels.tsx"), /\(prompt \|\| t\("settings\.birth_wheel_prompt"\)\)/);
});

test("a private chart's Between you offers no Try again; own missing consent still does", () => {
  const { installBrowser, load } = require("./helpers.cjs");
  installBrowser();
  const { isFinalRefusal } = load("lib/oracle-errors.js");
  const { ApiError } = load("lib/api.js");
  assert.equal(isFinalRefusal(new ApiError("x", 403, "chart_private")), true);
  assert.equal(isFinalRefusal(new ApiError("x", 403, "partner_ai_consent_required")), true);
  assert.equal(isFinalRefusal(new ApiError("x", 403, "ai_consent_required")), false);
  assert.equal(isFinalRefusal(new ApiError("x", 500)), false);
  assert.match(read("app/profile/[id]/page.tsx"), /setRetryable\(!isFinalRefusal\(e\)\)/);
  assert.match(read("app/profile/[id]/page.tsx"), /\{retryable && \(\s*<HairlineButton onClick=\{\(\) => load\(true\)\}/);
});

test("subscribe: a trial waiting for the email does not wear the Trial badge; dates are day-first", () => {
  const src = read("app/subscribe/page.tsx");
  assert.match(src, /sub\.trial_pending_verification \? "awaiting_email"/);
  assert.match(src, /awaiting_email: t\("subscribe\.badge_awaiting_email"\)/);
  assert.match(src, /lang === "en" \? "en-GB" : lang/);
  for (const l of ["en", "es"]) assert.ok(JSON.parse(read(`messages/${l}.json`)).subscribe.badge_awaiting_email, l);
});

test("Today's sky line names the Moon in the member's language", () => {
  const src = read("app/today/page.tsx");
  assert.doesNotMatch(src, /`Moon in \$\{moon\.sign\}`/);
  assert.match(src, /t\("moon\.moon_in"\)\} \$\{t\(`signs\.\$\{moon\.sign\.toLowerCase\(\)\}`\)\}/);
  assert.match(src, /\{skyLine\(forecast, t\)\}/);
  assert.equal(JSON.parse(read("messages/es.json")).moon.moon_in, "Luna en");
});

test("trial banner line wraps instead of cutting the Spanish sentence", () => {
  const src = read("components/TrialBanner.tsx");
  assert.doesNotMatch(src, /className="font-body truncate"/);
});

test("Souls shows signs and Human Design types in the member's language, and the reading opener too", () => {
  const src = read("app/souls/page.tsx");
  assert.doesNotMatch(src, /☉ \{(soul\.soul|soul|c\.soul|p\.profile|chart)\.sun_sign\}/);
  assert.doesNotMatch(src, /`☉ \$\{(c\.soul|person\.profile|invite\.requester|user)\.sun_sign\}`/);
  assert.doesNotMatch(src, /I want to understand the dynamic between me and/);
  assert.match(src, /fill\(t\("souls\.compat_intro_chart"\)/);
  const { installBrowser, load } = require("./helpers.cjs");
  installBrowser();
  const { tx } = load("lib/astro-i18n.js");
  assert.equal(tx("Generator", "es"), "Generador");
  assert.equal(tx("Scorpio", "es"), "Escorpio");
  for (const l of ["en", "es"]) {
    const s = JSON.parse(read(`messages/${l}.json`)).souls;
    for (const k of ["compat_sun_in", "compat_moon_in", "compat_hd", "compat_intro", "compat_intro_chart"]) assert.ok(s[k], `${l} ${k}`);
  }
  assert.match(JSON.parse(read("messages/es.json")).souls.compat_intro_chart, /^Quiero entender/);
});
