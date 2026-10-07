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

test("F3: a delete waits for the person's pending save and targets the server's id", async () => {
  const sp = load("lib/saved-people-sync.js");
  sp.resetPersonWrites();
  const log = [];
  let finishPost;
  const post = sp.forPerson("local-1", () => new Promise((r) => { finishPost = () => { log.push("POST"); sp.rememberServerId("local-1", "srv-1"); r({ person: { id: "srv-1" } }); }; }));
  sp.markDeletedHere("local-1");
  const del = sp.forPerson("local-1", async () => { log.push(`DELETE ${sp.serverIdOf("local-1")}`); return { ok: true }; });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(log, [], "delete has not overtaken the save");
  finishPost();
  await post;
  assert.equal(sp.deleteConfirmed(await del), true);
  assert.deepEqual(log, ["POST", "DELETE srv-1"]);
  assert.equal(sp.wasDeletedHere("local-1"), true);
});

test("F3: {ok:false} is not a confirmed delete; absence only counts from a later list read", () => {
  const sp = load("lib/saved-people-sync.js");
  sp.resetPersonWrites();
  assert.equal(sp.deleteConfirmed({ ok: false }), false);
  assert.equal(sp.deleteConfirmed({}), false);
  assert.equal(sp.deleteConfirmed(null), false);
  assert.equal(sp.deleteConfirmed({ ok: true }), true);
  const before = sp.nextSeq();          // a list read began
  sp.noteDeleteAttempt("p");            // then the delete was sent
  const after = sp.nextSeq();           // a later list read
  assert.equal(sp.absenceConfirmsDelete("p", before, new Set()), false, "older list proves nothing");
  assert.equal(sp.absenceConfirmsDelete("p", after, new Set(["p"])), false, "still on the server");
  assert.equal(sp.absenceConfirmsDelete("p", after, new Set()), true);
});

test("F3: an older server list cannot bring back someone removed here", () => {
  const sp = load("lib/saved-people-sync.js");
  sp.resetPersonWrites();
  sp.markDeletedHere("gone");
  // The delete was confirmed, so the tombstone is already cleared; the list
  // was read before it.
  const staleList = [{ id: "gone", _synced: true }, { id: "kept", _synced: true }];
  const removed = new Set([...sp.deletedHereIds()]);
  const final = sp.mergeSavedPeople([{ id: "kept", _synced: true }], staleList.filter((p) => !removed.has(p.id)), new Set(), removed);
  assert.deepEqual(final.map((p) => p.id), ["kept"]);
  const src = read("app/souls/page.tsx");
  assert.match(src, /const server = listed\.filter\(\(p\) => !gone\(\)\.has\(p\.id\)\);/);
  assert.match(src, /if \(deleteConfirmed\(r\)\) \{ dropTombstone\(id\); forgetSharingPermission\(id\); \}/);
  assert.ok(!/\.then\(\(\) => dropTombstone\(id\)\)/.test(src), "a 200 is no longer taken as a confirmed delete");
  assert.match(src, /if \(wasDeletedHere\(person\.id\)\) return null;/);
});

test("F4: permission is recorded per person and gates uploads and readings", () => {
  const sp = load("lib/saved-people-sync.js");
  sp.resetPersonWrites();
  win.localStorage.removeItem("solray_saved_people_permission");
  const legacy = [{ id: "old-1" }, { id: "old-2", _synced: true }];
  assert.deepEqual(sp.needingPermission(legacy).map((p) => p.id), ["old-1", "old-2"]);
  sp.recordSharingPermission(["old-1"]);
  assert.deepEqual(sp.needingPermission(legacy).map((p) => p.id), ["old-2"]);
  // The server gave old-1 a new id: the permission follows.
  sp.rememberServerId("old-1", "srv-9");
  sp.moveSharingPermission("old-1", "srv-9");
  assert.equal(sp.hasSharingPermission("srv-9"), true);
  assert.equal(sp.hasSharingPermission("old-1"), true, "looked up through the server id");
  sp.forgetSharingPermission("srv-9");
  assert.equal(sp.hasSharingPermission("srv-9"), false);
  const src = read("app/souls/page.tsx");
  assert.match(src, /peopleToUpload\(local, serverIds, gone\(\)\)\.filter\(\(p\) => hasSharingPermission\(p\.id\)\)/);
  const bond = src.slice(src.indexOf("const readTheBond"), src.indexOf("const acct = captureAccount();", src.indexOf("const readTheBond")));
  assert.match(bond, /needingPermission\(/);
  assert.match(bond, /setPermissionAsk\(unconfirmed\);\n\s+return;/);
  assert.match(src, /recordSharingPermission\(\[person\.id\]\);/);
});

test("F10 (B4): backend aspect spellings reach the Spanish prompt translated", () => {
  const { buildTodayPrompts, aspectName } = load("lib/today-prompts.js");
  const en = require(process.env.SOLRAY_TEST_BUILD + "/messages/en.json");
  const es = require(process.env.SOLRAY_TEST_BUILD + "/messages/es.json");
  const tr = (bundle) => (key) => key.split(".").reduce((o, k) => (o ? o[k] : undefined), bundle) ?? key;
  assert.equal(aspectName("conjunct"), "Conjunction");
  assert.equal(aspectName("Squares"), "Square");
  assert.equal(aspectName("opposite"), "Opposition");
  assert.equal(aspectName("semi-sextile"), "Semi-Sextile");
  assert.equal(aspectName("wiggles"), null);
  const f = (dt) => ({ dominant_transit: dt });
  const esQ = buildTodayPrompts(f("Saturn conjunct natal Neptune"), tr(es), "es")[0].question;
  assert.match(esQ, /Saturno en conjunción con mi Neptuno/);
  assert.ok(!/conjunct/i.test(esQ), esQ);
  assert.match(buildTodayPrompts(f("Mars opposite natal Venus"), tr(es), "es")[0].question, /Marte en oposición con mi Venus/);
  assert.match(buildTodayPrompts(f("Saturn conjunct natal Neptune"), tr(en), "en")[0].question, /Saturn in conjunction to my Neptune/);
});

test("F10 (B4): the install manifest follows the language", () => {
  const { manifestFor } = load("lib/i18n.js");
  assert.equal(manifestFor("en"), "/manifest.json");
  assert.equal(manifestFor("es"), "/manifest.es.json");
  assert.equal(manifestFor("es-419"), "/manifest.es.json");
  const en = JSON.parse(read("public/manifest.json"));
  const es = JSON.parse(read("public/manifest.es.json"));
  assert.deepEqual(Object.keys(es).sort(), Object.keys(en).sort());
  assert.equal(es.lang, "es");
  assert.equal(es.shortcuts.length, en.shortcuts.length);
  for (const sc of es.shortcuts) assert.ok(!/Today|Reading/.test(sc.name), sc.name);
  assert.ok(!/Higher Self|Human Design/.test(es.description));
  assert.match(read("lib/i18n.tsx"), /link\[rel="manifest"\]/);
});

// ── C5: birth times on a clock-change night ────────────────────────────────

function birthServer(answers) {
  const calls = [];
  global.fetch = async (url, init = {}) => {
    calls.push({ url, body: init.body ? JSON.parse(init.body) : null });
    const [status, body] = answers[Math.min(calls.length - 1, answers.length - 1)];
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return calls;
}
const AMBIGUOUS = [400, { detail: { code: "birth_time_ambiguous", message: "That time happened twice.", options: [
  { fold: "first", utc_offset: "+02:00" }, { fold: "second", utc_offset: "+01:00" },
] } }];

test("C5: an ambiguous birth time asks once and re-sends with the chosen fold", async () => {
  const api = load("lib/api.js");
  const { sendBirthRequest } = load("lib/birth-time-fold.js");
  const calls = birthServer([AMBIGUOUS, [200, { blueprint: { ok: 1 } }]]);
  const body = { birth_date: "1990-10-28", birth_time: "02:30" };
  let asked = null;
  const out = await sendBirthRequest(
    (fold) => api.apiFetch("/users/birth", { method: "PATCH", body: JSON.stringify(fold ? { ...body, birth_time_fold: fold } : body) }, "tok"),
    async (options) => { asked = options; return "second"; },
  );
  assert.deepEqual(asked, [{ fold: "first", offset: "UTC+2" }, { fold: "second", offset: "UTC+1" }]);
  assert.equal(out.status, "ok");
  assert.equal(out.fold, "second");
  assert.deepEqual(out.value, { blueprint: { ok: 1 } });
  assert.equal(calls.length, 2);
  assert.equal("birth_time_fold" in calls[0].body, false);
  assert.equal(calls[1].body.birth_time_fold, "second");
  assert.equal(calls[1].body.birth_time, "02:30");
});

test("C5: backing out sends nothing more; a nonexistent time comes back to fix", async () => {
  const api = load("lib/api.js");
  const { sendBirthRequest } = load("lib/birth-time-fold.js");
  let calls = birthServer([AMBIGUOUS]);
  const send = (fold) => api.apiFetch("/users/birth", { method: "PATCH", body: JSON.stringify({ birth_time_fold: fold || undefined }) }, "tok");
  assert.deepEqual(await sendBirthRequest(send, async () => null), { status: "cancelled" });
  assert.equal(calls.length, 1);
  calls = birthServer([[400, { detail: { code: "birth_time_nonexistent", message: "That time did not exist." } }]]);
  let asked = false;
  assert.deepEqual(await sendBirthRequest(send, async () => { asked = true; return "first"; }), { status: "nonexistent" });
  assert.equal(asked, false);
  assert.equal(calls.length, 1);
});

test("C5: other errors pass through, and a second ambiguous answer is not asked again", async () => {
  const api = load("lib/api.js");
  const { sendBirthRequest } = load("lib/birth-time-fold.js");
  const send = (fold) => api.apiFetch("/users/birth", { method: "PATCH", body: JSON.stringify({ birth_time_fold: fold || undefined }) }, "tok");
  birthServer([[400, { detail: "Could not find that city" }]]);
  await assert.rejects(sendBirthRequest(send, async () => "first"), (e) => e instanceof api.ApiError && /city/.test(e.message));
  let n = 0;
  birthServer([AMBIGUOUS, AMBIGUOUS]);
  await assert.rejects(sendBirthRequest(send, async () => { n += 1; return "first"; }), (e) => e instanceof api.ApiError && e.code === "birth_time_ambiguous");
  assert.equal(n, 1);
});

test("C5: offsets read the way a person reads them", () => {
  const { formatUtcOffset, birthTimeIssue } = load("lib/birth-time-fold.js");
  assert.equal(formatUtcOffset("+01:00"), "UTC+1");
  assert.equal(formatUtcOffset("-0330"), "UTC-3:30");
  assert.equal(formatUtcOffset("UTC+5:30"), "UTC+5:30");
  assert.equal(formatUtcOffset(2), "UTC+2");          // hours
  assert.equal(formatUtcOffset(-180), "UTC-3");       // minutes
  assert.equal(formatUtcOffset(3600), "UTC+1");       // seconds
  assert.equal(formatUtcOffset(0), "UTC+0");
  assert.equal(formatUtcOffset(undefined), "");
  assert.equal(birthTimeIssue({ status: 400, detail: { code: "something_else" } }), null);
  assert.equal(birthTimeIssue({ status: 403, detail: { code: "birth_time_ambiguous" } }), null);
  // Options missing their offsets still give two labelled choices.
  assert.deepEqual(birthTimeIssue({ status: 400, detail: { code: "birth_time_ambiguous" } }).options.map((o) => o.fold), ["first", "second"]);
});

test("C5: onboarding and settings send the fold through the shared flow, copy in EN and ES", () => {
  const onboard = read("app/onboard/page.tsx");
  assert.match(onboard, /sendBirthRequest\(register, askFold\)/);
  assert.match(onboard, /\.\.\.\(fold \? \{ birth_time_fold: fold \} : \{\}\)/);
  assert.match(onboard, /setError\(t\("birth_fold\.nonexistent"\)\)/);
  assert.match(onboard, /<BirthTimeFoldSheet/);
  const settings = read("app/profile/settings/page.tsx");
  assert.match(settings, /sendBirthRequest\(/);
  assert.match(settings, /birth_time_fold: fold/);
  assert.match(settings, /setBirthError\(t\("birth_fold\.nonexistent"\)\)/);
  assert.match(settings, /<BirthTimeFoldSheet/);
  for (const lang of ["en", "es"]) {
    const m = JSON.parse(read(`messages/${lang}.json`)).birth_fold;
    for (const k of ["title", "body", "earlier", "later", "hint", "back", "nonexistent"]) assert.ok(m[k], `${lang} birth_fold.${k}`);
  }
  assert.equal(JSON.parse(read("messages/en.json")).birth_fold.body, "Your birth time happened twice that night because the clocks went back. Which one?");
});
