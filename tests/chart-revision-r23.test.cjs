// Round twenty-three (Codex out19-5): every screen showing data derived from
// the member's own chart follows useChartRevision(): a birth correction here
// or in another tab clears what is on screen, loads again, and an answer for
// the old chart never lands.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

test("Profile: the main loader follows the chart, clears it, and drops superseded loads", () => {
  const src = read("app/profile/page.tsx");
  assert.ok(src.includes("const chartRev = useChartRevision();"));
  const i = src.indexOf("const BP_CACHE_KEY = accountKey(\"solray_blueprint\");");
  const eff = src.slice(src.lastIndexOf("useEffect(() => {", i), src.indexOf("}, [token, loadAttempt, chartRev]);", i) + 40);
  assert.ok(eff.includes("}, [token, loadAttempt, chartRev]);"));
  assert.ok(eff.includes("let cancelled = false;"));
  assert.ok(eff.indexOf("setProfile(null);") > eff.indexOf("if (shownRevRef.current !== chartRev) {"));
  assert.ok(eff.includes("function loadFromBlueprint(bp: any) {\n      if (cancelled) return;"));
  // Every path returns its cleanup, and every answer checks it.
  assert.equal((eff.match(/return \(\) => \{ cancelled = true; \};/g) || []).length, 3);
  assert.ok((eff.match(/if \(cancelled\) return;/g) || []).length >= 4);
  assert.ok(eff.includes("if (!cancelled && syncBirthRevision(data))"));
});

test("Profile/[id]: compatibility (read from the member's own chart too) follows the chart", () => {
  const src = read("app/profile/[id]/page.tsx");
  const c = src.slice(src.indexOf("function CompatibilitySection("), src.indexOf("function Lens("));
  assert.ok(c.includes("const chartRev = useChartRevision();"));
  assert.ok(c.includes("}, [soulId, token, chartRev]);"));
  assert.ok(c.includes("load(chartChanged, chartChanged);"));
  assert.ok(c.includes("setReading(null);"));
  assert.ok(c.includes("const current = () => reqRef.current === req;"));
  assert.ok(c.includes(".then((d) => {\n        if (!current()) return;"));
  assert.ok(c.includes(".catch((e: unknown) => {\n        if (!current()) return;"));
});

test("Today: transits and the plain Now card follow the chart (the reading already did)", () => {
  const src = read("app/today/page.tsx");
  assert.ok(src.includes("}, [token, dayKey, reloadNonce, chartRev]);"), "the reading");
  assert.ok(src.includes("}, [token, dayKey, chartRev]);"), "long-range transits");
  assert.ok(src.includes("cyclesRevRef.current = chartRev;\n      setCycles([]);"));
  assert.ok(src.includes("}, [token, plainReading, chartRev]);"), "plain Now card");
});

test("Widget, First Mirror and the chat's chart-seeded suggestions follow the chart", () => {
  const w = read("app/widget/page.tsx");
  // (Round twenty-four: also refetched after consent; answers land through show().)
  assert.ok(w.includes("}, [token, chartRev, consentNonce]);") && w.includes("setForecast(null);") && w.includes("const show = (kind:") && w.includes("if (cancelled) return;\n      setForecast(kind === \"complete\" ? data : null);"));
  const f = read("app/first-mirror/page.tsx");
  assert.ok(f.includes("}, [token, router, chartRev]);") && f.includes("setMirror(null);"));
  const c = read("app/chat/page.tsx");
  assert.ok(c.includes("}, [lang, chartRev]);"));
});

test("components already following it stay so", () => {
  for (const f of ["components/AstroGeography.tsx", "components/WeekSummaryCard.tsx", "components/CurrentCycles.tsx"]) {
    assert.ok(read(f).includes("useChartRevision()"), f);
  }
});
