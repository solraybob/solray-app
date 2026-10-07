// Codex review round 3 (app), findings 1 and 2: chat reconciliation.
//  1. A conversation missing from the server's list is only dropped here once
//     the whole list has been read and a GET of it answers a real 404; until
//     then its unsent turns are kept.
//  2. The list carries each conversation's revision; a different revision
//     (a rename, a partner reference backfilled elsewhere) pulls it.
const test = require("node:test");
const assert = require("node:assert/strict");
const { installBrowser, load } = require("./helpers.cjs");

const win = installBrowser();
const session = load("lib/account-session.js");
const sync = load("lib/chat-sync.js");

const m = (id, minute, extra = {}) => ({ id, role: "user", content: `msg ${id}`,
  timestamp: `2026-10-07T10:${String(minute).padStart(2, "0")}:00Z`, ...extra });

/**
 * An in-memory server like the new backend: GET /chat/sessions pages with
 * `limit` / `cursor` (default 100, newest first) and reports revisions;
 * merging PUT. `opts.capped` behaves like the old backend (first 100, no
 * cursor, no revision). `opts.getStatus(id)` overrides a session GET.
 */
function pagedServer(opts = {}) {
  const sessions = new Map();
  const log = [];
  global.fetch = async (url, init = {}) => {
    const method = (init.method || "GET").toUpperCase();
    const u = new URL(url);
    log.push({ line: `${method} ${u.pathname}${u.search}`, body: init.body ? JSON.parse(init.body) : null });
    const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
    if (u.pathname === "/chat/sessions") {
      if (opts.failPage && opts.failPage(u)) return json(503, { detail: "down" });
      const all = Array.from(sessions.values())
        .sort((a, b) => (a.last_message_at < b.last_message_at ? 1 : a.last_message_at > b.last_message_at ? -1 : (a.session_id < b.session_id ? 1 : -1)));
      const entry = (s) => opts.capped
        ? { session_id: s.session_id, last_message_at: s.last_message_at }
        : { session_id: s.session_id, last_message_at: s.last_message_at, revision: s.revision };
      if (opts.capped) return json(200, { sessions: all.slice(0, 100).map(entry) });
      const limit = Number(u.searchParams.get("limit") || 100);
      const start = Number(u.searchParams.get("cursor") || 0);
      const page = all.slice(start, start + limit);
      const next = start + limit < all.length ? String(start + limit) : null;
      return json(200, { sessions: page.map(entry), next_cursor: next });
    }
    const id = decodeURIComponent(u.pathname.split("/").pop());
    if (method === "GET") {
      const forced = opts.getStatus && opts.getStatus(id);
      if (forced === "network") throw new TypeError("Failed to fetch");
      if (forced) return json(forced.status, forced.body);
      return sessions.has(id) ? json(200, sessions.get(id)) : json(404, { detail: "Session not found" });
    }
    if (method === "PUT") {
      const body = JSON.parse(init.body);
      const cur = sessions.get(id);
      if (!cur && body.expect_existing) return json(404, { detail: "Session not found" });
      const have = new Set((cur?.messages || []).map((x) => x.id));
      const messages = [...(cur?.messages || []), ...body.messages.filter((x) => !have.has(x.id))];
      const rev = (cur?.revision || 0) + 1;
      const at = cur && messages.length === cur.messages.length ? cur.last_message_at : `2026-10-07T23:${String(rev % 60).padStart(2, "0")}:00Z`;
      sessions.set(id, { session_id: id, messages, revision: rev, last_message_at: at, custom_name: body.custom_name ?? cur?.custom_name ?? null });
      return json(200, { session_id: id, last_message_at: at, revision: rev, messages });
    }
    if (method === "DELETE") return sessions.delete(id) ? json(200, { deleted: true }) : json(404, { detail: "Session not found" });
    return json(405, {});
  };
  return { sessions, log };
}

/** A fresh, already-migrated device for the current account. */
function freshDevice() {
  win.localStorage.clear();
  win.localStorage.setItem("solray_chat_migrated_v1", "1");
  sync.bindChatSyncToAccount(session.getAuthGeneration());
}

/** n server conversations, newest last (s000 is the oldest). */
function fill(srv, n) {
  for (let i = 0; i < n; i++) {
    const id = `s${String(i).padStart(3, "0")}`;
    srv.sessions.set(id, { session_id: id, messages: [m("1", 1)], revision: 1,
      last_message_at: new Date(Date.UTC(2026, 9, 1) + i * 60000).toISOString() });
  }
}

/** This device holds `id` as a confirmed, synced conversation plus an offline turn. */
function offlineTurnOn(srv, id) {
  const s = srv.sessions.get(id);
  sync.saveSession({ sessionId: id, date: "", messages: [...s.messages, m("offline", 30)] });
  sync.markServerConfirmed([id]);
  sync.setSessionLocalMeta(id, s.last_message_at, s.revision);
  sync.markUnsent(id);
}

test("F1: an older conversation beyond the first page keeps its offline turn and uploads it", async () => {
  freshDevice();
  const srv = pagedServer();
  fill(srv, 450);
  offlineTurnOn(srv, "s000");   // the oldest: not in the newest 100
  const ids = await sync.syncSessionsFromServer("tok", session.getAuthGeneration());
  assert.ok(sync.loadSession("s000"), "the transcript is kept");
  assert.deepEqual(srv.sessions.get("s000").messages.map((x) => x.id), ["1", "offline"], "the offline turn reached the server");
  assert.equal(sync.getUnsent().has("s000"), false);
  assert.ok(ids.includes("s000"));
  assert.equal(new Set(ids).size, 450);
  // The whole inventory was read page by page.
  assert.ok(srv.log.some((l) => /^GET \/chat\/sessions\?.*cursor=/.test(l.line)));
});

test("F1: with an old capped server, a missing confirmed conversation that still exists is kept and uploaded", async () => {
  freshDevice();
  const srv = pagedServer({ capped: true });
  fill(srv, 150);
  offlineTurnOn(srv, "s010");
  const ids = await sync.syncSessionsFromServer("tok", session.getAuthGeneration());
  assert.ok(srv.log.some((l) => l.line === "GET /chat/sessions/s010"), "checked one by one");
  assert.deepEqual(srv.sessions.get("s010").messages.map((x) => x.id), ["1", "offline"]);
  assert.equal(sync.getUnsent().has("s010"), false);
  assert.ok(ids.includes("s010"));
});

test("F1: a missing conversation is kept with its unsent turn when its GET fails or is not a real 404", async () => {
  for (const forced of ["network", { status: 500, body: { detail: "boom" } }, { status: 404, body: { detail: "Not Found" } }, { status: 404, body: "<html>" }]) {
    freshDevice();
    const srv = pagedServer({ capped: true, getStatus: (id) => (id === "s005" ? forced : null) });
    fill(srv, 150);
    offlineTurnOn(srv, "s005");
    const ids = await sync.syncSessionsFromServer("tok", session.getAuthGeneration());
    const label = JSON.stringify(forced);
    assert.deepEqual(sync.loadSession("s005")?.messages.map((x) => x.id), ["1", "offline"], `kept after ${label}`);
    assert.equal(sync.getUnsent().has("s005"), true, `still unsent after ${label}`);
    assert.ok(sync.getServerConfirmed().has("s005"));
    assert.ok(ids.includes("s005"));
  }
});

test("F1: a conversation the server answers a real 404 for is dropped here", async () => {
  freshDevice();
  const srv = pagedServer();
  fill(srv, 3);
  sync.saveSession({ sessionId: "gone", date: "", messages: [m("1", 1)] });
  sync.markServerConfirmed(["gone"]);
  sync.setSessionLocalMeta("gone", "2026-10-01T00:00:00Z", 2);
  const ids = await sync.syncSessionsFromServer("tok", session.getAuthGeneration());
  assert.ok(srv.log.some((l) => l.line === "GET /chat/sessions/gone"));
  assert.equal(sync.loadSession("gone"), null);
  assert.ok(!ids.includes("gone"));
  assert.equal(sync.getServerConfirmed().has("gone"), false);
});

test("F1: a page that fails stops the sync before anything is dropped or uploaded", async () => {
  freshDevice();
  const srv = pagedServer({ failPage: (u) => u.searchParams.has("cursor") });
  fill(srv, 450);
  offlineTurnOn(srv, "s000");
  await assert.rejects(sync.syncSessionsFromServer("tok", session.getAuthGeneration()), (e) => e instanceof sync.ChatSyncUnavailable);
  assert.ok(sync.loadSession("s000"));
  assert.equal(sync.getUnsent().has("s000"), true);
  assert.ok(!srv.log.some((l) => l.line.startsWith("PUT")));
});

test("F2: a different revision in the list pulls a metadata-only change (partner reference, rename)", async () => {
  freshDevice();
  const srv = pagedServer();
  const greeting = { id: "g", role: "assistant", content: "hello", timestamp: "2026-10-07T09:00:00Z" };
  srv.sessions.set("dyn", { session_id: "dyn", messages: [greeting], revision: 1, last_message_at: "2026-10-07T09:00:00Z", custom_name: null });
  sync.saveSession({ sessionId: "dyn", date: "", messages: [greeting] });
  sync.markServerConfirmed(["dyn"]);
  sync.setSessionLocalMeta("dyn", "2026-10-07T09:00:00Z", 1);
  // Unchanged: no transcript GET.
  await sync.syncSessionsFromServer("tok", session.getAuthGeneration());
  assert.ok(!srv.log.some((l) => l.line === "GET /chat/sessions/dyn"));
  // Device A backfills the partner and renames; last_message_at stays.
  const soul = { name: "Ana", connection_id: null, saved_person_id: "p1" };
  srv.sessions.set("dyn", { ...srv.sessions.get("dyn"), messages: [{ ...greeting, soul }], revision: 3, custom_name: "With Ana" });
  await sync.syncSessionsFromServer("tok", session.getAuthGeneration());
  assert.ok(srv.log.some((l) => l.line === "GET /chat/sessions/dyn"));
  const here = sync.loadSession("dyn");
  assert.deepEqual(here.messages[0].soul, soul);
  assert.equal(here.customName, "With Ana");
  assert.equal(sync.getLocalMeta().dyn.revision, 3);
});

// ─── Finding 3: a failed saved-person birth-time update is retried ─────────

const sp = load("lib/saved-people-sync.js");
const fs = require("fs");
const path = require("path");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

test("F3: a pending saved-person update survives a reload and wins over the server's older copy", () => {
  win.localStorage.clear();
  const updated = { id: "p1", name: "Ana", birth_time_fold: "second", blueprint: { meta: { birth_time_fold: "second" } }, _synced: true };
  const stamp = sp.recordPendingUpdate(updated);
  // Stored on the device, not in memory: a reload still has it.
  assert.ok(win.localStorage.getItem(session.accountKey("solray_saved_people_pending")));
  assert.equal(sp.pendingUpdateFor("p1").person.birth_time_fold, "second");
  // The next sync's server list still has the old copy: the pending one is shown.
  const server = [{ id: "p1", name: "Ana", blueprint: { meta: {} }, _synced: true }, { id: "p2", name: "Bo", _synced: true }];
  const shown = sp.overlayPendingUpdates(server);
  assert.equal(shown[0].birth_time_fold, "second");
  assert.equal(shown[0]._synced, true);
  assert.equal(shown[1], server[1]);
  // Only the confirmation of this very update clears it.
  sp.settlePendingUpdate("p1", stamp - 1);
  assert.ok(sp.pendingUpdateFor("p1"));
  sp.settlePendingUpdate("p1", stamp);
  assert.equal(sp.pendingUpdateFor("p1"), null);
});

test("F3: a newer update replaces an older pending one; people gone from the server drop theirs", () => {
  win.localStorage.clear();
  const a = sp.recordPendingUpdate({ id: "p1", birth_time_fold: "first" });
  const b = sp.recordPendingUpdate({ id: "p1", birth_time_fold: "second" });
  assert.ok(b > a);
  sp.settlePendingUpdate("p1", a);   // the older save's late confirmation
  assert.equal(sp.pendingUpdateFor("p1").person.birth_time_fold, "second");
  sp.recordPendingUpdate({ id: "p9", birth_time_fold: "first" });
  sp.prunePendingUpdates(new Set(["p1"]));
  assert.ok(sp.pendingUpdateFor("p1"));
  assert.equal(sp.pendingUpdateFor("p9"), null);
  assert.deepEqual(sp.pendingUpdateIds(), ["p1"]);
});

test("F3: Souls records the update before sending, clears it only on confirmation, and retries it before merging", () => {
  const src = read("app/souls/page.tsx");
  const confirm = src.slice(src.indexOf("const confirmSavedBirthTime = async"), src.indexOf("const handlePersonRemove"));
  const rec = confirm.indexOf("recordPendingUpdate(updated)");
  const post = confirm.indexOf('apiFetch("/saved-people", { method: "POST"');
  assert.ok(rec > 0 && rec < post, "recorded before the POST");
  assert.match(confirm, /settlePendingUpdate\(person\.id, stamp\)/);
  assert.ok(confirm.indexOf("settlePendingUpdate(person.id, stamp)") > post);
  const syncSrc = src.slice(src.indexOf("// 1. Finish deletions made offline"), src.indexOf("// Debounced search"));
  const retry = syncSrc.indexOf("pendingUpdateIds()");
  const merge = syncSrc.indexOf("mergeSavedPeople(prev, confirmed");
  assert.ok(retry > 0 && retry < merge, "pending updates retried before the merge");
  assert.match(syncSrc, /overlayPendingUpdates\(/);
  assert.match(syncSrc, /prunePendingUpdates\(/);
});

// ─── Finding 4: a displayed Today reading follows a chart change ───────────

test("F4: Today subscribes to chart changes, clears the shown reading and fetches under the new chart", () => {
  const src = read("app/today/page.tsx");
  assert.match(src, /import \{ useChartRevision \} from "@\/lib\/use-chart-revision";/);
  assert.match(src, /const chartRev = useChartRevision\(\);/);
  const effStart = src.indexOf("const cacheKey = accountKey(`solray_forecast_${dayKey}`);");
  const effEnd = src.indexOf("}, [token, dayKey, reloadNonce, chartRev]);");
  assert.ok(effStart > 0 && effEnd > effStart, "the forecast effect reruns on a chart change");
  const head = src.slice(src.lastIndexOf("useEffect(() => {", effStart), effStart);
  const change = head.indexOf("if (seenChartRev.current !== chartRev) {");
  assert.ok(change > 0, "a chart change is noticed before the cache is read");
  const block = head.slice(change);
  assert.match(block, /seenChartRev\.current = chartRev;/);
  assert.match(block, /backgroundFetchDone\.current = false;/);
  assert.match(block, /setForecast\(null\);/);
});

// ─── Finding 5: the weekly summary follows the language ────────────────────

test("F5: the weekly summary is cached per language and fetched again when it changes", () => {
  const src = read("components/WeekSummaryCard.tsx");
  assert.match(src, /const \{ t, lang \} = useT\(\);/);
  assert.match(src, /const key = accountKey\(`solray_week_\$\{lang\}_\$\{new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\]\}`\);/);
  assert.match(src, /\}, \[token, chartRev, lang\]\);/);
  // Still a chart-derived key, so a birth change drops it.
  const cr = load("lib/chart-revision.js");
  win.localStorage.setItem("solray_week_es_2026-10-07", "{}");
  cr.clearChartDerivedCaches();
  assert.equal(win.localStorage.getItem("solray_week_es_2026-10-07"), null);
});
