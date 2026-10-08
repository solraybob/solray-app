// Round twenty-four (Codex out20-5):
// #1 a per-tab compatibility cache carries the birth revision it was built
//    under and is served only under that revision; a birth correction in
//    another tab clears this tab's per-tab caches and the screen goes
//    straight to the network;
// #2 the widget reads answers like Today (lib/forecast-kind): only a
//    complete reading is shown or cached; no consent is said so and asked
//    again after consent;
// #3 the widget speaks the member's language.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { installBrowser, load } = require("./helpers.cjs");

const win = installBrowser();
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const session = load("lib/account-session.js");
const cr = load("lib/chart-revision.js");
const { forecastKind } = load("lib/forecast-kind.js");

const me = (time) => ({ profile: { birth_date: "1989-09-05", birth_time: time, birth_city: "Reykjavik", birth_lat: 64.1, birth_lon: -21.9 } });

test("per-tab chart cache: served only under the revision it was built for", () => {
  cr.syncBirthRevision(me("08:00"));
  const key = "solray_compat_v_s1";
  assert.equal(cr.writeChartCache(cr.chartWorkStamp(), key, { reading: { a: 1 } }, "session"), true);
  assert.deepEqual(cr.readSessionChartCache(key), { reading: { a: 1 } });
  // Another tab corrects the birth time: it rewrites the shared fingerprint
  // (this tab's sessionStorage is out of its reach).
  win.localStorage.setItem(session.accountKey(cr.BIRTH_REV_STORAGE_KEY), cr.birthRevision(me("09:30").profile));
  assert.equal(cr.readSessionChartCache(key), null, "a reading for the old chart is never served");
  assert.equal(win.sessionStorage.getItem(key), null, "and is removed");
  // An entry from before stamping (no revision) is never served either.
  win.sessionStorage.setItem(key, JSON.stringify({ reading: { old: true } }));
  assert.equal(cr.readSessionChartCache(key), null);
});

test("a birth correction in another tab clears this tab's per-tab caches and starts a new epoch", () => {
  cr.syncBirthRevision(me("10:00"));
  const key = "solray_compat_v_s2";
  cr.writeChartCache(cr.chartWorkStamp(), key, { reading: {} }, "session");
  const stamp = cr.chartWorkStamp();
  win.localStorage.setItem("solray_forecast_2026-10-08", "{}");
  cr.onBirthRevisionChangedElsewhere();
  assert.equal(win.sessionStorage.getItem(key), null);
  assert.equal(cr.chartStampCurrent(stamp), false, "work in flight here is never cached");
  assert.equal(win.localStorage.getItem("solray_forecast_2026-10-08"), "{}", "the other tab's fresh shared caches stay");
  const src = read("lib/chart-revision.ts");
  assert.ok(src.includes('if (e.key === accountKey(REV_KEY)) onBirthRevisionChangedElsewhere();'));
});

test("compatibility: reads the stamped cache and goes to the network after a chart change", () => {
  const c = read("app/profile/[id]/page.tsx");
  assert.ok(c.includes("readSessionChartCache<"));
  assert.ok(!c.includes("sessionStorage.getItem(cacheKey)"));
  assert.ok(c.includes('writeChartCache(stamp, cacheKey, parsed, "session")'));
  assert.ok(c.includes("load(chartChanged, chartChanged);"));
});

test("forecastKind: one reading of an answer for Today and the widget", () => {
  const full = { day_title: "d", reading: "r", tags: {}, energy: {} };
  assert.equal(forecastKind(full), "complete");
  assert.equal(forecastKind({ ...full, ai_consent_required: true }), "consent");
  assert.equal(forecastKind({ planets: [], ai_consent_required: true }), "consent");
  assert.equal(forecastKind({ _pending: true, _consent: true, planets: [] }), "consent");
  assert.equal(forecastKind({ _pending: true, planets: [] }), "pending");
  assert.equal(forecastKind({ day_title: "d" }), "pending");
  assert.equal(forecastKind(null), "pending");
  const today = read("app/today/page.tsx");
  assert.ok(today.includes("const kind = forecastKind(data);"));
  assert.equal((today.match(/forecastKind\(parsed\) === "complete"/g) || []).length, 3);
});

test("widget: only a complete reading is shown or cached; consent handled and refetched", () => {
  const w = read("app/widget/page.tsx");
  assert.ok(w.includes('if (forecastKind(parsed) === "complete") { show("complete", parsed as ForecastData); return; }'));
  assert.ok(w.includes('if (kind === "complete") writeChartCache(stamp, cacheKey, data);'));
  assert.ok(w.includes('show(isAiConsentError(e) ? "consent" : "failed", null);'));
  assert.ok(w.includes("window.addEventListener(AI_CONSENT_CHANGED_EVENT, onChanged);"));
  assert.ok(w.includes("}, [token, chartRev, consentNonce]);"));
  assert.ok(!w.includes("_pending !== true"));
});

test("widget: moon phases and every note in English and Spanish", () => {
  const w = read("app/widget/page.tsx");
  assert.ok(w.includes("{t(moonPhase.labelKey)}"));
  assert.ok(!/return "(New Moon|Full Moon|Waxing Crescent)"/.test(w));
  assert.ok(!w.includes("Unable to load forecast"));
  const en = JSON.parse(read("messages/en.json"));
  const es = JSON.parse(read("messages/es.json"));
  for (const k of ["phase_new_moon", "phase_waxing_crescent", "phase_first_quarter", "phase_waxing_gibbous", "phase_full_moon",
    "phase_waning_gibbous", "phase_third_quarter", "phase_waning_crescent"]) {
    assert.ok(en.moon[k] && es.moon[k] && w.includes(`"moon.${k}"`), k);
  }
  for (const k of ["load_failed", "consent_needed", "pending"]) {
    assert.ok(en.widget[k] && es.widget[k] && en.widget[k] !== es.widget[k], k);
    assert.ok(!/—/.test(en.widget[k] + es.widget[k]), k);
  }
});
