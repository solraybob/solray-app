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

// Review 2, finding 7: these two tests asserted the old behaviour (unknown
// eligibility ordered the free trial; no paid alternative fell back to it).
test("only a confirmed eligible member is offered the store's free trial", () => {
  assert.equal(iap.chooseOffer([trial, paid], trial, true), trial);
  // Unknown eligibility orders nothing until the server has answered.
  assert.equal(iap.chooseOffer([trial, paid], trial, undefined), undefined);
  assert.equal(iap.chooseOffer([trial, paid], null, undefined), undefined);
});

// Round 3 product decision: with no paid alternative (Apple lists only its
// free intro) a member whose trial was used can still buy; the store's own
// intro terms apply and the paywall promises no trial. Only the server's
// strict mode (strict_cross_channel_trial) refuses that offer.
test("with no paid alternative (Apple) a member whose trial was used still buys on the store's terms", () => {
  assert.equal(iap.chooseOffer([trial], trial, false), trial);
  assert.equal(iap.chooseOffer([trial], trial, false, false), trial);
  assert.equal(iap.chooseOffer([], trial, false), trial);
  assert.equal(iap.chooseOffer([], null, false), undefined);
});

test("strict mode never sends a member whose trial was used the free intro offer", () => {
  assert.equal(iap.chooseOffer([trial], trial, false, true), undefined);
  assert.equal(iap.chooseOffer([], trial, false, true), undefined);
  // A paid offer is still sold, and an eligible member still gets the trial.
  assert.equal(iap.chooseOffer([trial, paid], trial, false, true), paid);
  assert.equal(iap.chooseOffer([trial, paid], trial, true, true), trial);
});

test("planOffer says what the paywall can do for each plan", () => {
  assert.deepEqual(iap.planOffer([trial, paid], trial, undefined), { state: "checking" });
  assert.deepEqual(iap.planOffer([trial, paid], trial, true), { state: "trial", offer: trial });
  assert.deepEqual(iap.planOffer([paid], paid, true), { state: "paid", offer: paid });
  assert.deepEqual(iap.planOffer([trial, paid], trial, false), { state: "paid", offer: paid });
  assert.deepEqual(iap.planOffer([trial], trial, false), { state: "store_intro", offer: trial });
  assert.deepEqual(iap.planOffer([trial], trial, false, true), { state: "unavailable" });
  assert.deepEqual(iap.planOffer([trial, paid], trial, false, true), { state: "paid", offer: paid });
  assert.deepEqual(iap.planOffer([trial, paid], trial, undefined, true), { state: "checking" });
  assert.deepEqual(iap.planOffer([], null, true), { state: "unavailable" });
  assert.deepEqual(iap.planOffer([], null, false), { state: "unavailable" });
});

test("the store gate maps the server's refusal to what the member sees", () => {
  assert.equal(iap.storeGateErrorCode(409, "card_charge_pending"), "card_pending");
  assert.equal(iap.storeGateErrorCode(409, "web_billing_active"), "web_billing_active");
  assert.equal(iap.storeGateErrorCode(500, undefined), "check_failed");
  assert.equal(iap.storeGateErrorCode(undefined, "network"), "check_failed");
});

test("the store purchase is announced to the server and released when the sheet closes", async () => {
  const seen = [];
  global.fetch = async (url, init) => {
    seen.push({ url, method: (init && init.method) || "GET" });
    return { ok: true, status: 200, headers: { get: () => "application/json" },
             json: async () => ({ ok: true, trial_eligible: false }), text: async () => "" };
  };
  const out = await sub.announceStorePurchase("tok");
  assert.equal(out.trial_eligible, false);
  await sub.releaseStorePurchase("tok");
  assert.ok(seen[0].url.endsWith("/subscribe/store-intent") && seen[0].method === "POST");
  assert.ok(seen[1].url.endsWith("/subscribe/store-intent") && seen[1].method === "DELETE");
});

test("verification errors map to what actually happened", () => {
  assert.equal(iap.verifyErrorCode(409, "card_charge_pending"), "charge_pending");
  assert.equal(iap.verifyErrorCode(409, "store_state_changed"), "state_changed");
  assert.equal(iap.verifyErrorCode(409, "purchase_other_account"), "other_account");
  assert.equal(iap.verifyErrorCode(409, undefined), "other_account");
  assert.equal(iap.verifyErrorCode(502, undefined), "verify_failed");
});
