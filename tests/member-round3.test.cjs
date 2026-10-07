// Member app, Codex review round 2 (out2-5): account-generation gaps,
// chart revisions, Dynamics partner references, voice drafts, and the Souls
// clock-change chooser (out2-4 C5).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { installBrowser, load, tick } = require("./helpers.cjs");

const win = installBrowser();
const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const session = load("lib/account-session.js");
const api = load("lib/api.js");

// ── Finding 3: queued saved-person writes keep their account ────────────────

test("R3-3: a queued delete from the previous account never starts", async () => {
  const sp = load("lib/saved-people-sync.js");
  sp.resetPersonWrites();
  const calls = [];
  global.fetch = (url, init) => new Promise((resolve) => {
    calls.push({ url, init, respond: (status, body) => resolve({ ok: status < 300, status, json: async () => body }) });
  });
  const genA = session.getAuthGeneration();
  const post = sp.forPerson("p1", genA, () => api.apiFetch("/saved-people", { method: "POST" }, "token-A", { generation: genA }));
  const del = sp.forPerson("p1", genA, () => api.apiFetch("/saved-people/p1", { method: "DELETE" }, "token-A", { generation: genA }));
  await tick();
  assert.equal(calls.length, 1);
  session.bumpAuthGeneration();       // A signs out, B signs in
  win.localStorage.setItem("solray_token", "token-B");
  win.location.replaced = null;
  calls[0].respond(200, { person: { id: "p1" } });
  await assert.rejects(post, (e) => session.isStaleAccountError(e));
  await assert.rejects(del, (e) => session.isStaleAccountError(e));
  assert.equal(calls.length, 1, "the old account's DELETE was never sent");
  assert.equal(win.localStorage.getItem("solray_token"), "token-B");
  assert.equal(win.location.replaced, null);
});

test("R3-3: apiFetch bound to an old generation refuses before sending", async () => {
  let sent = 0;
  global.fetch = async () => { sent += 1; return { ok: false, status: 401, json: async () => ({}) }; };
  const old = session.getAuthGeneration();
  session.bumpAuthGeneration();
  win.localStorage.setItem("solray_token", "token-B");
  await assert.rejects(api.apiFetch("/saved-people/x", { method: "DELETE" }, "token-A", { generation: old }), (e) => session.isStaleAccountError(e));
  assert.equal(sent, 0);
  assert.equal(win.localStorage.getItem("solray_token"), "token-B");
});

test("R3-3: every Souls person write is bound to the generation it was queued under", () => {
  const src = read("app/souls/page.tsx");
  const calls = src.split("forPerson(").slice(1);
  assert.ok(calls.length >= 4);
  for (const c of calls) {
    assert.match(c.slice(0, 40), /^[^,]+, [a-zA-Z.]*[gG]en(eration)?\b/, "forPerson(id, gen, ...)");
  }
  const inner = src.match(/forPerson\([^]*?\}\)\)?;/g) || [];
  for (const block of inner) {
    if (block.includes("apiFetch(")) assert.match(block, /\{ generation: [a-zA-Z.]*[gG]en(eration)? \}/);
  }
});

// ── Finding 1: a birth save finishing after a sign-out writes nothing ───────

test("R3-1: the birth save is bound to its account through every await and cache write", () => {
  const src = read("app/profile/settings/page.tsx");
  const store = src.slice(src.indexOf("const storeBirthResult"), src.indexOf("const saveBirth"));
  assert.match(store, /const storeBirthResult = async \(res: any, acct: AccountGuard\)/);
  assert.ok(!/\.catch\(\(\) => null\)/.test(store), "a stale account is not taken for an offline lookup");
  assert.match(store, /if \(isStaleAccountError\(e\)\) throw e;/);
  // Checked before the first cache write and again after /users/me.
  assert.ok(store.indexOf("acct.check();") < store.indexOf("clearChartDerivedCaches()"));
  const afterMe = store.slice(store.indexOf('apiFetch("/users/me"'));
  assert.ok(afterMe.indexOf("acct.check();") > -1 && afterMe.indexOf("acct.check();") < afterMe.indexOf('localStorage.setItem("solray_blueprint"'));
  for (const fn of ["const saveBirth", "const confirmBirthFold"]) {
    const body = src.slice(src.indexOf(fn), src.indexOf("\n  const ", src.indexOf(fn) + 10));
    const cap = body.indexOf("const acct = captureAccount();");
    assert.ok(cap > -1 && cap < body.indexOf('"/users/birth"'), `${fn} captures the account before the PATCH`);
    assert.match(body, /\{ generation: acct\.generation \}/);
    assert.match(body, /await storeBirthResult\(res, acct\);/);
    assert.match(body, /if \(isStaleAccountError\(e\)\) return;/);
  }
});

// ── Finding 5: choosing the other occurrence invalidates other devices ─────

test("R3-5: birth_time_fold is part of the birth fingerprint", () => {
  const cr = load("lib/chart-revision.js");
  const base = { birth_date: "2000-10-29", birth_time: "01:30", birth_city: "London", birth_lat: 51.5, birth_lon: -0.12 };
  const first = cr.birthRevision({ ...base, birth_time_fold: "first" });
  const second = cr.birthRevision({ ...base, birth_time_fold: "second" });
  assert.notEqual(first, second);
  assert.notEqual(cr.birthRevision(base), first);
  // Members with no fold keep their fingerprint (no needless rebuild).
  assert.equal(cr.birthRevision(base), "2000-10-29|01:30|London|51.5000|-0.1200");
  win.localStorage.setItem("solray_blueprint", "{}");
  cr.syncBirthRevision({ profile: { ...base, birth_time_fold: "first" } });
  win.localStorage.setItem("solray_blueprint", "{}");
  assert.equal(cr.syncBirthRevision({ profile: { ...base, birth_time_fold: "second" } }), true);
  assert.equal(win.localStorage.getItem("solray_blueprint"), null);
});

// ── Finding 6: a stale chart result is never displayed ─────────────────────

test("R3-6: dropping chart caches announces it, so mounted screens refetch", () => {
  const cr = load("lib/chart-revision.js");
  let n = 0;
  const on = () => { n += 1; };
  win.addEventListener(cr.CHART_CHANGED_EVENT, on);
  cr.clearChartDerivedCaches();
  assert.equal(n, 1);
  cr.syncBirthRevision({ profile: { birth_date: "1990-01-01", birth_time: "09:00" } });
  assert.ok(n >= 2);
  win.removeEventListener(cr.CHART_CHANGED_EVENT, on);
});

test("R3-6: chart screens show a result only under the chart it was fetched for", () => {
  const thenBody = (src, call) => {
    const at = src.indexOf(call);
    return src.slice(at, src.indexOf(".catch(", at));
  };
  // Cycles and the week summary: guarded before state, rerun on a chart change.
  for (const [f, call, setter] of [
    ["components/CurrentCycles.tsx", 'apiFetch("/transits/long-range"', "setCycles(cycleList)"],
    ["components/WeekSummaryCard.tsx", 'apiFetch("/forecast/week"', "setSummary(d.week_summary)"],
  ]) {
    const src = read(f);
    assert.match(src, /const chartRev = useChartRevision\(\);/, f);
    assert.match(src, /\}, \[[^\]]*chartRev[^\]]*\]\);/, `${f} reruns on a chart change`);
    const body = thenBody(src, call);
    const guard = body.search(/if \(off \|\| !chartStampCurrent\(stamp\)\) return;/);
    assert.ok(guard > -1 && guard < body.indexOf(setter), `${f} discards a stale result before showing it`);
  }
  // Geography: never shows a stale map after its retries; a retryable failure instead.
  const geo = read("components/AstroGeography.tsx");
  assert.match(geo, /const chartRev = useChartRevision\(\);/);
  assert.ok(!/if \(!chartStampCurrent\(stamp\) && attempt < 2\) \{ load\(attempt \+ 1\); return; \}\n\s+setData\(d\)/.test(geo));
  assert.match(geo, /if \(!chartStampCurrent\(stamp\)\) \{\n\s+if \(attempt < 2\) \{ load\(attempt \+ 1\); return; \}\n\s+setError\("load_failed"\);/);
  assert.match(geo, /onClick=\{\(\) => setRetryNonce\(\(n\) => n \+ 1\)\}/);
  // Today: a forecast still stale after its retry is not shown.
  const today = read("app/today/page.tsx");
  assert.match(today, /if \(!chartStampCurrent\(stamp\)\) \{\n\s+if \(!retried\) return fetchAndUpdate\(isBackground, true\);\n\s+setForecast\(null\);\n\s+setError\("today.error_no_sky"\);/);
  const refresh = today.slice(today.indexOf("const onRefresh = (e: Event)"));
  assert.ok(refresh.indexOf("if (!chartStampCurrent(stamp))") < refresh.indexOf("setForecast(parsed)"));
});
