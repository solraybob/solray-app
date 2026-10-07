// Codex push review finding 5: the push ask is per member and needs a
// reading actually shown (or an Oracle reply), not a route visit.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { installBrowser, load } = require("./helpers.cjs");

const win = installBrowser();
const el = load("lib/push-eligibility.js");
const cache = load("lib/local-cache.js");

test.beforeEach(() => win.localStorage.clear());

test("value seen by one member never qualifies another on the same phone", () => {
  el.noteOracleReply("A");
  assert.equal(el.mayOfferPushAsk("A"), true);
  assert.equal(el.mayOfferPushAsk("B"), false);
  el.noteReadingShown("A", "2026-10-01");
  el.noteReadingShown("A", "2026-10-02");
  el.noteReadingShown("B", "2026-10-02");
  assert.equal(el.hasSeenValue("B"), false);
});

test("readings on one day are not enough; a reading on a later day is", () => {
  el.noteReadingShown("A", "2026-10-01");
  el.noteReadingShown("A", "2026-10-01");
  assert.equal(el.hasSeenValue("A"), false);
  el.noteReadingShown("A", "2026-10-02");
  assert.equal(el.hasSeenValue("A"), true);
});

test("the soft ask snoozes ten days and stops after three, per member", () => {
  el.noteOracleReply("A");
  el.noteOracleReply("B");
  const t0 = 1_800_000_000_000;
  el.recordSoftAsk("A", t0);
  assert.equal(el.mayOfferPushAsk("A", t0 + 1000), false);
  assert.equal(el.mayOfferPushAsk("B", t0 + 1000), true);
  assert.equal(el.mayOfferPushAsk("A", t0 + el.SOFT_ASK_SNOOZE_MS), true);
  el.recordSoftAsk("A", t0 + el.SOFT_ASK_SNOOZE_MS);
  el.recordSoftAsk("A", t0 + 2 * el.SOFT_ASK_SNOOZE_MS);
  assert.equal(el.mayOfferPushAsk("A", t0 + 10 * el.SOFT_ASK_SNOOZE_MS), false);
});

test("the old device-wide flags are swept, not inherited", () => {
  win.localStorage.setItem("solray_push_value_seen", "1");
  win.localStorage.setItem("solray_push_first_today", "2026-01-01");
  el.sweepLegacyEligibility();
  assert.equal(win.localStorage.getItem("solray_push_value_seen"), null);
  assert.equal(el.mayOfferPushAsk("anyone"), false);
});

test("an account switch keeps member-keyed eligibility and pending releases", () => {
  el.noteOracleReply("A");
  win.localStorage.setItem("solray_native_push_pending_release", "[]");
  win.localStorage.setItem("solray_forecast_x", "per-user");
  cache.clearUserScopedCaches();
  assert.equal(el.hasSeenValue("A"), true);
  assert.equal(win.localStorage.getItem("solray_native_push_pending_release"), "[]");
  assert.equal(win.localStorage.getItem("solray_forecast_x"), null);
});

test("Today signals only a complete reading; the bootstrap does not count route entry", () => {
  const root = path.join(__dirname, "..");
  const today = fs.readFileSync(path.join(root, "app/today/page.tsx"), "utf8");
  assert.match(today, /if \(!loading && forecast && forecast\._pending !== true\) signalReadingShown\(\);/);
  const boot = fs.readFileSync(path.join(root, "components/NativePushBootstrap.tsx"), "utf8");
  assert.ok(!/FIRST_TODAY_KEY|solray_push_first_today/.test(boot));
  assert.match(boot, /READING_SHOWN_EVENT/);
});
