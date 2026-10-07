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

// ── Finding 8: a dictated, unsent message blocks the update reload ──────────

test("R3-8: the chat composer's unsent text counts as a draft, however it got there", () => {
  const dg = load("lib/draft-guard.js");
  dg.resetDraftTracking();
  let composer = "";
  const stop = dg.registerDraftSource(() => composer.trim() !== "");
  assert.equal(dg.hasTypedDraft(), false);
  composer = "words from the microphone";   // set by setInput, no input event
  assert.equal(dg.hasTypedDraft(), true);
  composer = "";                            // sent, or removed by the member
  assert.equal(dg.hasTypedDraft(), false);
  composer = "again";
  stop();                                   // the chat page left
  assert.equal(dg.hasTypedDraft(), false);
  const stopBad = dg.registerDraftSource(() => { throw new Error("x"); });
  assert.equal(dg.hasTypedDraft(), true, "unknown counts as a draft");
  stopBad();
  const src = read("app/chat/page.tsx");
  assert.match(src, /useEffect\(\(\) => \{ composerValueRef\.current = input; \}, \[input\]\);/);
  assert.match(src, /registerDraftSource\(\(\) => composerValueRef\.current\.trim\(\) !== ""\)/);
});

// ── Finding 7: Dynamics conversations keep their partner on every device ────

test("R3-7: merging keeps a partner reference only one copy has", () => {
  const cm = load("lib/chat-merge.js");
  const server = [{ id: "greeting", content: "hi", timestamp: "1" }];
  const local = [{ id: "greeting", content: "hi", timestamp: "1", soul: { saved_person_id: "p1" } }];
  const merged = cm.mergeMessages(server, local);
  assert.deepEqual(merged[0].soul, { saved_person_id: "p1" });
  assert.equal(cm.sameTranscript(server, local), false, "a new partner reference is a change to upload");
  assert.equal(cm.sameTranscript(local, merged), true);
});

test("R3-7: a conversation's local partner reference is written into its transcript", () => {
  const cs = load("lib/chat-soul.js");
  win.localStorage.clear();
  const msgs = [{ id: "greeting", role: "assistant", content: "x", timestamp: "1" }, { id: "2", role: "user", content: "y", timestamp: "2" }];
  assert.equal(cs.withSoulBackfill("s1", msgs), msgs, "nothing known: unchanged");
  cs.writeSoulCtx("s1", { name: "Ana", blueprint: null, connectionId: null, savedPersonId: "p1" });
  const out = cs.withSoulBackfill("s1", msgs);
  assert.deepEqual(out[0].soul, { name: "Ana", connection_id: null, saved_person_id: "p1" });
  assert.equal(out[1], msgs[1]);
  assert.equal(cs.withSoulBackfill("s1", out), out, "already there: unchanged");
  // Started before the person was confirmed: the local id resolves once the
  // saved person is confirmed by the server.
  cs.writeSoulCtx("s2", { name: "Bo", blueprint: { x: 1 }, connectionId: null, savedPersonId: null, localPersonId: "loc-9" });
  assert.equal(cs.withSoulBackfill("s2", msgs), msgs);
  win.localStorage.setItem("solray_saved_people", JSON.stringify([{ id: "loc-9", name: "Bo", _synced: true }]));
  assert.equal(cs.withSoulBackfill("s2", msgs)[0].soul.saved_person_id, "loc-9");
  assert.equal(cs.resolveSoulCtx(cs.readSoulCtx("s2")).savedPersonId, "loc-9");
});

test("R3-7: uploads and the startup sync carry backfilled partner references", async () => {
  const sync = load("lib/chat-sync.js");
  const cs = load("lib/chat-soul.js");
  win.localStorage.clear();
  win.localStorage.setItem("solray_chat_migrated_v1", "1");
  const store = new Map([["d1", { session_id: "d1", revision: 1, last_message_at: "2026-10-07T09:00:00Z",
    messages: [{ id: "greeting", role: "assistant", content: "x", timestamp: "1" }] }]]);
  const puts = [];
  global.fetch = async (url, init = {}) => {
    const method = (init.method || "GET").toUpperCase();
    const u = new URL(url);
    const json = (status, body) => ({ ok: status < 300, status, json: async () => body });
    if (u.pathname === "/chat/sessions") return json(200, { sessions: Array.from(store.values()).map((s) => ({ session_id: s.session_id, last_message_at: s.last_message_at })) });
    const id = decodeURIComponent(u.pathname.split("/").pop());
    if (method === "GET") return json(200, store.get(id));
    if (method === "PUT") {
      const body = JSON.parse(init.body);
      puts.push(body);
      const cur = store.get(id);
      const messages = cur.messages.map((m) => { const mine = body.messages.find((x) => x.id === m.id); return mine && mine.soul && !m.soul ? { ...m, soul: mine.soul } : m; });
      store.set(id, { ...cur, messages, revision: cur.revision + 1 });
      return json(200, { session_id: id, revision: cur.revision + 1, last_message_at: cur.last_message_at, messages });
    }
    return json(405, {});
  };
  // This device opened d1 as a Dynamics reading before round 2.
  sync.saveSession({ sessionId: "d1", date: "", messages: [{ id: "greeting", role: "assistant", content: "x", timestamp: "1" }] });
  sync.setSessionLocalMeta("d1", "2026-10-07T09:00:00Z", 1);
  sync.markServerConfirmed(["d1"]);
  cs.writeSoulCtx("d1", { name: "Ana", blueprint: null, connectionId: "c1", savedPersonId: null });
  await sync.syncSessionsFromServer("tok", session.getAuthGeneration());
  assert.equal(puts.length, 1, "the backfill is uploaded");
  assert.deepEqual(puts[0].messages[0].soul, { name: "Ana", connection_id: "c1", saved_person_id: null });
  assert.deepEqual(store.get("d1").messages[0].soul, { name: "Ana", connection_id: "c1", saved_person_id: null });
});

test("R3-7: Souls hands the confirmed saved-person id to every reading", () => {
  const src = read("app/souls/page.tsx");
  const added = src.slice(src.indexOf("const handlePersonAdded"), src.indexOf("const handlePersonRemove"));
  // Selected partners are replaced on every successful save, ids changed or not.
  assert.ok(!/if \(saved && saved\.id && saved\.id !== person\.id\) \{\n\s+setBondPartners/.test(added));
  assert.match(added, /confirmedPeopleRef\.current\.set\(person\.id, saved\);/);
  assert.match(added, /bp\.kind === "saved" && bp\.person\.id === person\.id\n?\s*\? \{ kind: "saved", person: saved \}/);
  const bond = src.slice(src.indexOf("const readTheBond"), src.indexOf("<ProtectedRoute>"));
  assert.match(bond, /hasQueuedWrites\(p\.person\.id\)/);
  assert.match(bond, /forPerson\(p\.person\.id, acct\.generation, async \(\) => null\)/);
  assert.match(bond, /const partners = bondPartners\.map\(confirmedPartner\);/);
  assert.ok(!/partnerSoulRef\(bondPartners\[0\]\)/.test(bond));
  assert.match(bond, /localPersonId:/);
  const chat = read("app/chat/page.tsx");
  assert.match(chat, /from "@\/lib\/chat-soul"/);
  assert.match(chat, /localPersonId: ctx\.localPersonId \?\? null/);
});

// ── C5 (out2-4): Souls asks which occurrence of a clock-change birth time ───

test("C5: the Souls add-person sheet asks for the occurrence and keeps it", () => {
  const src = read("app/souls/page.tsx");
  const sheet = src.slice(src.indexOf("function AddPersonSheet"));
  const submit = sheet.slice(sheet.indexOf("const submit = async"), sheet.indexOf("onAdded(person);"));
  assert.match(submit, /await sendBirthRequest\(/);
  assert.match(submit, /fold \? \{ \.\.\.body, birth_time_fold: fold \} : body/);
  assert.match(submit, /if \(outcome\.status === "nonexistent"\) \{\n\s+setError\(t\("birth_fold\.nonexistent"\)\);/);
  assert.match(submit, /if \(outcome\.status === "cancelled"\) return;/);
  assert.match(submit, /birth_time_fold: outcome\.fold \?\? undefined,/);
  assert.match(sheet, /<BirthTimeFoldSheet\n\s+options=\{foldAsk\.options\}/);
  // Kept in the person's data, and used when the chart is recomputed.
  assert.match(src, /birth_time_fold\?: "first" \| "second";/);
  const bond = src.slice(src.indexOf("const readTheBond"), src.indexOf("<ProtectedRoute>"));
  assert.match(bond, /birth_time_fold: savedFold\(saved\)/);
  // A late answer is still dropped after the chooser (account and sheet checks).
  assert.ok((submit.match(/!stillHere\(\)/g) || []).length >= 3);
});

test("C5: a saved person's occurrence is read from its field or its chart", () => {
  const src = read("app/souls/page.tsx");
  assert.match(src, /function savedFold\(p: SavedPerson\): "first" \| "second" \| undefined \{/);
});
