// Release review 2 (billing): finding 11 (a stalled status refresh must not
// keep Restore busy), finding 8 (paid offer when the trial was used) and
// finding 4 (a card charge in flight is not "another account").
const test = require("node:test");
const assert = require("node:assert/strict");
const { installBrowser, load } = require("./helpers.cjs");

installBrowser();
const sub = load("lib/subscription.js");
const iap = load("lib/native-iap-helpers.js");

/** A transport that never answers and ignores the abort signal. */
function stalledFetch() {
  const calls = [];
  global.fetch = (url, init) => { calls.push({ url, init }); return new Promise(() => {}); };
  return calls;
}

test("subscription status settles with DeadlineError when the server stalls", { timeout: 3000 }, async () => {
  const calls = stalledFetch();
  await assert.rejects(sub.getSubscriptionStatus("tok", 50), (e) => e instanceof sub.DeadlineError);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith("/subscribe/status"));
  assert.ok(calls[0].init.signal, "the request carries an abort signal");
  assert.equal(calls[0].init.signal.aborted, true);
});

test("status has a default deadline well under a minute", () => {
  assert.ok(sub.STATUS_DEADLINE_MS > 0 && sub.STATUS_DEADLINE_MS <= 30000);
});

test("billing calls settle at the deadline even if the transport ignores abort", { timeout: 3000 }, async () => {
  stalledFetch();
  await assert.rejects(sub.billingFetch("/subscribe/cancel", { method: "POST" }, "tok", 50),
    (e) => e instanceof sub.DeadlineError);
});

const trial = { id: "monthly@trial", pricingPhases: [{ paymentMode: "FreeTrial", priceMicros: 0 }, { priceMicros: 23000000 }] };
const paid = { id: "monthly", pricingPhases: [{ paymentMode: "PayAsYouGo", priceMicros: 23000000 }] };

test("a member whose email had its trial is sold the paid offer", () => {
  assert.equal(iap.chooseOffer([trial, paid], trial, false), paid);
  assert.equal(iap.offerStartsFree(iap.chooseOffer([trial, paid], trial, false)), false);
});

test("an eligible or unknown member keeps the store's default offer", () => {
  assert.equal(iap.chooseOffer([trial, paid], trial, true), trial);
  assert.equal(iap.chooseOffer([trial, paid], trial, undefined), trial);
  assert.equal(iap.chooseOffer([trial, paid], null, undefined), trial);
});

test("with no paid alternative (Apple) the default offer stays, and says so", () => {
  assert.equal(iap.chooseOffer([trial], trial, false), trial);
  assert.equal(iap.offerStartsFree(iap.chooseOffer([trial], trial, false)), true);
});

test("verification errors map to what actually happened", () => {
  assert.equal(iap.verifyErrorCode(409, "card_charge_pending"), "charge_pending");
  assert.equal(iap.verifyErrorCode(409, "store_state_changed"), "state_changed");
  assert.equal(iap.verifyErrorCode(409, "purchase_other_account"), "other_account");
  assert.equal(iap.verifyErrorCode(409, undefined), "other_account");
  assert.equal(iap.verifyErrorCode(502, undefined), "verify_failed");
});
