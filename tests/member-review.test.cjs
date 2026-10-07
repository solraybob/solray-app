// Member app review follow-ups (out-5): F8 voice, F5 chart revisions,
// F3/F4 saved people, B4 aspects and manifest, C5 birth time fold.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { installBrowser, load } = require("./helpers.cjs");

const win = installBrowser();
const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

test("F8: a late transcript never auto-sends into another conversation or account", () => {
  const { voiceResultAction: act } = load("lib/voice-result.js");
  const base = { sameAccount: true, mounted: true, sameConversation: true, crisis: true };
  assert.equal(act(base), "send");
  assert.equal(act({ ...base, sameConversation: false }), "fill");
  assert.equal(act({ ...base, sameAccount: false }), "drop");
  assert.equal(act({ ...base, mounted: false }), "drop");
  assert.equal(act({ ...base, crisis: false }), "fill");
  const src = read("app/chat/page.tsx");
  const tb = src.slice(src.indexOf("const transcribeBlob = useCallback"), src.indexOf("const nativeRecordingRef"));
  assert.match(tb, /const acct = captureAccount\(\);/);
  assert.match(tb, /const spokenIn = activeSessionRef\.current;/);
  assert.match(tb, /if \(landing\(false\) === "drop"\) return;/);
  assert.match(tb, /data\?\.crisis === true && landing\(true\) === "send"/);
  assert.match(tb, /trackRequest\(/);
});

test("F5: an answer requested before a birth change is never cached as current", () => {
  const cr = load("lib/chart-revision.js");
  const me = (time) => ({ profile: { birth_date: "1989-09-05", birth_time: time, birth_city: "Reykjavik", birth_lat: 64.1, birth_lon: -21.9 } });
  cr.syncBirthRevision(me("08:00"));
  const stamp = cr.chartWorkStamp();          // astrocartography request starts
  assert.equal(cr.chartStampCurrent(stamp), true);
  cr.syncBirthRevision(me("09:30"));          // Profile sees the edit, caches dropped
  assert.equal(cr.chartStampCurrent(stamp), false);
  assert.equal(cr.writeChartCache(stamp, "solray_astrocarto", { lines: [] }), false);
  assert.equal(win.localStorage.getItem("solray_astrocarto"), null);
  // Edited and edited back: same revision, still a different chart epoch.
  const s2 = cr.chartWorkStamp();
  cr.clearChartDerivedCaches();
  assert.equal(cr.chartStampCurrent(s2), false);
  const s3 = cr.chartWorkStamp();
  assert.equal(cr.writeChartCache(s3, "solray_astrocarto", { lines: [1] }), true);
  // Compatibility readings kept in sessionStorage are chart-derived too.
  win.sessionStorage.setItem("solray_compat_v_s", "{}");
  cr.clearChartDerivedCaches();
  assert.equal(win.sessionStorage.getItem("solray_compat_v_s"), null);
});

test("F5: chart-derived screens stamp before requesting and cache through the stamp", () => {
  const astro = read("components/AstroGeography.tsx");
  assert.match(astro, /const stamp = chartWorkStamp\(\);\n\s+apiFetch\("\/astrocartography"/);
  assert.match(astro, /if \(!chartStampCurrent\(stamp\) && attempt < 2\) \{ load\(attempt \+ 1\); return; \}/);
  assert.ok(!/localStorage\.setItem\(cacheKey/.test(astro));
  const today = read("app/today/page.tsx");
  assert.match(today, /if \(!chartStampCurrent\(stamp\) && !retried\) \{\n\s+return fetchAndUpdate\(isBackground, true\);/);
  assert.ok(!/localStorage\.setItem\(cacheKey/.test(today));
  for (const f of ["components/CurrentCycles.tsx", "components/WeekSummaryCard.tsx", "app/widget/page.tsx", "app/profile/[id]/page.tsx"]) {
    assert.match(read(f), /writeChartCache\(stamp, /, f);
  }
});
