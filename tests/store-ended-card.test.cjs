// 409 store_ended_card_time_left from /subscribe/attach-card-token: a store
// membership ended while paid time is left. A calm notice in EN and ES with
// the date in the member's locale, never a generic error.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { installBrowser, load } = require("./helpers.cjs");

installBrowser();
const sub = load("lib/subscription.js");
const { ApiError } = load("lib/api.js");
const en = require("../messages/en.json");
const es = require("../messages/es.json");

const tFor = (m) => (key) => key.split(".").reduce((o, k) => (o ? o[k] : undefined), m) ?? key;
const refusal = (paid_until) => new ApiError("x", 409, "store_ended_card_time_left", {
  code: "store_ended_card_time_left", paid_until, message: "server text",
});

test("the refusal is recognised with its paid-until date", () => {
  assert.equal(sub.storeEndedCardTimeLeft(refusal("2026-11-20T12:00:00+00:00")), "2026-11-20T12:00:00+00:00");
  assert.equal(sub.storeEndedCardTimeLeft(refusal(undefined)), "");
  assert.equal(sub.storeEndedCardTimeLeft(refusal("not a date")), "");
  assert.equal(sub.storeEndedCardTimeLeft(new ApiError("x", 409, "charge_pending")), null);
  assert.equal(sub.storeEndedCardTimeLeft(new Error("boom")), null);
  assert.equal(sub.storeEndedCardTimeLeft(null), null);
});

test("English notice carries the date in the member's locale", () => {
  const text = sub.storeEndedCardNotice(refusal("2026-11-20T12:00:00Z"), tFor(en), "en");
  assert.equal(text, "Your App Store or Google Play membership has ended. You still have paid time until November 20, 2026. Nothing was charged. You can add a card here once that time ends.");
});

test("Spanish notice carries a Spanish date", () => {
  const text = sub.storeEndedCardNotice(refusal("2026-11-20T12:00:00Z"), tFor(es), "es");
  assert.match(text, /^Tu membresía de App Store o Google Play ha terminado\./);
  assert.match(text, /20 de noviembre de 2026/);
  assert.ok(!text.includes("{date}"));
});

test("without a readable date the notice still reads calmly", () => {
  assert.equal(sub.storeEndedCardNotice(refusal(undefined), tFor(en), "en"), en.subscribe.store_ended_card_time_left_nodate);
  assert.equal(sub.storeEndedCardNotice(refusal(undefined), tFor(es), "es"), es.subscribe.store_ended_card_time_left_nodate);
});

test("other errors are left to the usual handling", () => {
  assert.equal(sub.storeEndedCardNotice(new ApiError("x", 409, "store_managed"), tFor(en), "en"), null);
});

test("no long dashes in the new copy", () => {
  for (const m of [en, es]) {
    for (const k of ["store_ended_card_time_left", "store_ended_card_time_left_nodate"]) {
      assert.ok(m.subscribe[k] && !/[–—]/.test(m.subscribe[k]), k);
    }
  }
});

test("the card form closes with a notice and does not retry", () => {
  const src = fs.readFileSync(path.join(__dirname, "../components/CardForm.tsx"), "utf8");
  assert.match(src, /storeEndedCardNotice\(e, t, lang\)/);
  assert.match(src, /onNotice\(storeEnded\)/);
  const page = fs.readFileSync(path.join(__dirname, "../app/subscribe/page.tsx"), "utf8");
  assert.match(page, /onNotice=\{\(text: string\) => \{\s*setShowCardForm\(false\);/);
  assert.match(page, /const storeEnded = storeEndedCardNotice\(e, t, lang\);/);
  // One attach call only: the form has no retry loop around it.
  assert.equal((src.match(/\/subscribe\/attach-card-token/g) || []).length, 2); // doc comment + the call
});
