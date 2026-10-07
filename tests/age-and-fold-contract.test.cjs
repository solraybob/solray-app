// Backend contract from the Oracle and engines rounds: the 16+ age gate
// (under_minimum_age, age_restricted) and the saved birth time check for
// existing members (birth_time_check on /users/me).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { installBrowser, load } = require("./helpers.cjs");

installBrowser();
const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const api = load("lib/api.js");
const { oracleErrorKey, ORACLE_ERROR_KEYS } = load("lib/oracle-errors.js");
const consent = load("lib/ai-consent.js");
const fold = load("lib/birth-time-fold.js");

function flat(o, p = "") {
  return Object.entries(o).reduce((acc, [k, v]) => (typeof v === "object" ? { ...acc, ...flat(v, p + k + ".") } : { ...acc, [p + k]: v }), {});
}

test("A4: under_minimum_age is a known Oracle refusal with a gentle EN and ES note", () => {
  assert.equal(ORACLE_ERROR_KEYS.under_minimum_age, "oracle_errors.under_minimum_age");
  assert.equal(oracleErrorKey(new api.ApiError("x", 403, "under_minimum_age")), "oracle_errors.under_minimum_age");
  assert.ok(api.isUnderMinimumAgeError(new api.ApiError("x", 403, "under_minimum_age")));
  assert.ok(api.isUnderMinimumAgeError(new api.ApiError("x", 400, "under_minimum_age")));
  assert.ok(!api.isUnderMinimumAgeError(new api.ApiError("x", 403, "ai_consent_required")));
  assert.ok(!api.isUnderMinimumAgeError(new api.ApiError("x", 403)));
  for (const lang of ["en", "es"]) {
    const m = flat(JSON.parse(read(`messages/${lang}.json`)));
    for (const k of ["oracle_errors.under_minimum_age", "settings.birth_under_age", "settings.ai_consent_age_restricted",
                     "onboard.under_age"]) {
      assert.ok(m[k] && m[k].trim(), `${lang} ${k}`);
      assert.ok(!m[k].includes("—"), `${lang} ${k} em dash`);
      assert.match(m[k], /16/, `${lang} ${k} names the age`);
    }
  }
});

test("A4: age_restricted is read from /users/me, top level or profile", () => {
  assert.equal(consent.ageRestrictedFromMe({ age_restricted: true }), true);
  assert.equal(consent.ageRestrictedFromMe({ profile: { age_restricted: true } }), true);
  assert.equal(consent.ageRestrictedFromMe({ age_restricted: false }), false);
  assert.equal(consent.ageRestrictedFromMe({}), false);
  assert.equal(consent.ageRestrictedFromMe(null), false);
});

test("A4: no consent sheet for an age-restricted account; no paywall on its 403; signup and birth update refuse kindly", () => {
  const sheet = read("components/AiConsentSheet.tsx");
  assert.match(sheet, /consentFromMe\(me\)\.required && !ageRestrictedFromMe\(me\)/);
  const today = read("app/today/page.tsx");
  const ageAt = today.indexOf("isUnderMinimumAgeError(err)");
  const paywallAt = today.indexOf('router.replace("/subscribe")', ageAt - 2000);
  assert.ok(ageAt > 0 && paywallAt > ageAt, "Today handles under_minimum_age before the 403 paywall redirect");
  assert.match(today, /setError\("oracle_errors\.under_minimum_age"\)/);
  const onboard = read("app/onboard/page.tsx");
  assert.match(onboard, /isUnderMinimumAgeError\(err\)[\s\S]{0,120}setStep\(3\);\s*setError\(t\("onboard\.under_age"\)\)/);
  const settings = read("app/profile/settings/page.tsx");
  assert.match(settings, /isUnderMinimumAgeError\(e\)\s*\?\s*t\("settings\.birth_under_age"\)/);
  assert.match(settings, /ageRestricted \? \(/);
  assert.match(settings, /settings\.ai_consent_age_restricted/);
});

test("C5: the saved birth time check follows the backend contract", () => {
  // utc_offset is a float in hours east of UTC; options come first, then second.
  const c = fold.storedBirthTimeCheck({
    birth_time_check: {
      status: "ambiguous", fold: null, needs_confirmation: true,
      options: [{ fold: "second", utc_offset: 0.0 }, { fold: "first", utc_offset: 1.0 }],
    },
  });
  assert.equal(c.status, "ambiguous");
  assert.equal(c.needsConfirmation, true);
  assert.deepEqual(c.options, [{ fold: "first", offset: "UTC+1" }, { fold: "second", offset: "UTC+0" }]);
  const half = fold.storedBirthTimeCheck({ birth_time_check: {
    status: "ambiguous", fold: null, needs_confirmation: true,
    options: [{ fold: "first", utc_offset: -2.5 }, { fold: "second", utc_offset: -3.5 }] } });
  assert.deepEqual(half.options.map((o) => o.offset), ["UTC-2:30", "UTC-3:30"]);
  const done = fold.storedBirthTimeCheck({ birth_time_check: {
    status: "ambiguous", fold: "second", needs_confirmation: false,
    options: [{ fold: "first", utc_offset: 1.0 }, { fold: "second", utc_offset: 0.0 }] } });
  assert.equal(done.needsConfirmation, false);
  assert.equal(done.fold, "second");
  const skipped = fold.storedBirthTimeCheck({ birth_time_check: { status: "nonexistent", fold: null, options: [], needs_confirmation: true } });
  assert.equal(skipped.status, "nonexistent");
  assert.equal(skipped.needsConfirmation, true);
  assert.deepEqual(skipped.options, []);
  assert.deepEqual(fold.storedBirthTimeCheck({ birth_time_check: { status: "ok", fold: null, options: [], needs_confirmation: false } }),
    { status: "ok", fold: null, options: [], needsConfirmation: false });
  // An older server without the field never prompts.
  assert.equal(fold.storedBirthTimeCheck({ profile: {} }).needsConfirmation, false);
  assert.equal(fold.storedBirthTimeCheck(null).needsConfirmation, false);
});

test("C5: existing members are asked once (Today prompt) and confirm in Settings with the saved details", () => {
  const banner = read("components/BirthTimeCheckBanner.tsx");
  assert.match(banner, /solray_birth_check_prompted/);
  assert.match(banner, /\/profile\/settings\?birth=confirm/);
  const today = read("app/today/page.tsx");
  assert.match(today, /setBirthCheck\(storedBirthTimeCheck\(userData\)\)/);
  assert.match(today, /<BirthTimeCheckBanner check=\{birthCheck\} \/>/);
  const settings = read("app/profile/settings/page.tsx");
  assert.match(settings, /const confirmBirthFold = async/);
  assert.match(settings, /birth_date: saved\.date,[\s\S]{0,200}birth_time_fold: fold,/);
  assert.match(settings, /askFold\(birthCheck\.options\)/);
  assert.match(settings, /birth_check\.settings_nonexistent/);
  for (const lang of ["en", "es"]) {
    const m = JSON.parse(read(`messages/${lang}.json`)).birth_check;
    for (const k of ["prompt_title", "prompt_ambiguous", "prompt_nonexistent", "check_now", "later",
                     "settings_ambiguous", "settings_choose", "settings_nonexistent", "confirmed"]) {
      assert.ok(m[k] && !m[k].includes("—"), `${lang} birth_check.${k}`);
    }
  }
});
