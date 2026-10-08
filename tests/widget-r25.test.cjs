// Round twenty-five (Codex out21-5):
// #1 the widget checks a cached (or fresh) reading against the member's
//    current chart (/users/me, syncBirthRevision): a birth correction made
//    on another device replaces it, and a reading for the old chart is
//    never shown or cached;
// #2 it moves to the new day at local midnight, on waking and on coming
//    back into view, like Today.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { installBrowser, load } = require("./helpers.cjs");

installBrowser();
const { localDayKey } = load("lib/forecast-kind.js");
const w = fs.readFileSync(path.join(__dirname, "..", "app/widget/page.tsx"), "utf8");

test("localDayKey is the local calendar day, zero-padded", () => {
  assert.equal(localDayKey(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
  assert.equal(localDayKey(new Date(2026, 9, 8, 0, 1)), "2026-10-08");
});

test("cached reading: shown, then revalidated against the current chart", () => {
  const i = w.indexOf('if (forecastKind(parsed) === "complete") {');
  const b = w.slice(i, i + 300);
  assert.ok(b.indexOf('show("complete", parsed as ForecastData);') < b.indexOf("void chartStillCurrent();"));
  const c = w.slice(w.indexOf("const chartStillCurrent = async"), w.indexOf("// Cache first"));
  assert.ok(c.includes('await apiFetch("/users/me", {}, token);'));
  assert.ok(c.includes("if (cancelled) return false;"));
  assert.ok(c.includes("return !syncBirthRevision(me);"));
});

test("fresh reading: fetched with the chart check; never shown or cached for a changed chart", () => {
  assert.ok(w.includes('const [data, current] = await Promise.all([\n          apiFetch("/forecast/today", {}, token, { quietConsent: true }),\n          chartStillCurrent(),\n        ]);'));
  assert.ok(w.includes("if (cancelled || !current) return;"));
  const after = w.slice(w.indexOf("if (cancelled || !current) return;"));
  assert.ok(after.indexOf('if (kind === "complete") writeChartCache(stamp, cacheKey, data);') > 0);
});

test("the day moves on at midnight, on waking and on coming back into view", () => {
  assert.ok(w.includes("const [dayKey, setDayKey] = useState(() => localDayKey());"));
  assert.ok(w.includes('document.addEventListener("visibilitychange", onVisible);'));
  assert.ok(w.includes('window.addEventListener("focus", check);'));
  assert.ok(w.includes("const timer = window.setTimeout(check, Math.max(1000, nextMidnight - now.getTime()));"));
  assert.ok(w.includes("const cacheKey = accountKey(`solray_forecast_${dayKey}`);"));
  assert.ok(w.includes("}, [token, chartRev, consentNonce, dayKey]);"));
  assert.ok(w.includes("if (shownRevRef.current !== chartRev || shownDayRef.current !== dayKey) {"));
});
