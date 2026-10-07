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
