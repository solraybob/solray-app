// Batch I: the plain-language Now card experiment. The member Now card is
// unchanged while PLAIN_NOW_CARD_FOR_MEMBERS is off; the admin preview shows
// both cards in the one shared card component.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { load } = require("./helpers.cjs");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const nc = load("lib/now-card.js");

const forecast = {
  day_title: "Wait for the second answer",
  reading: "Your Virgo Sun wants every detail settled. Mars squares your Moon today.\n\nSecond paragraph.",
};
const plain = { status: "ok", date: "2026-10-07", language: "en",
  card_title: "Slow is the fast way", card_body: "You may feel pushed to answer. Take one breath first." };

test("flag is off: members keep today's title and the reading's opening", () => {
  assert.equal(nc.PLAIN_NOW_CARD_FOR_MEMBERS, false);
  const c = nc.nowCardContent(forecast, plain);
  assert.deepEqual(c, { title: forecast.day_title, body: nc.firstLines(forecast.reading), plain: false });
  assert.equal(c.body, "Your Virgo Sun wants every detail settled. Mars squares your Moon today.");
});

test("flag on: the plain words, only when the plain card is whole", () => {
  assert.deepEqual(nc.nowCardContent(forecast, plain, true),
    { title: plain.card_title, body: plain.card_body, plain: true });
  for (const p of [null, undefined, { ...plain, status: "rejected" }, { ...plain, card_body: "  " },
                   { ...plain, card_title: null }, { ...plain, status: "no_reading" }]) {
    assert.equal(nc.nowCardContent(forecast, p, true).plain, false);
    assert.equal(nc.nowCardContent(forecast, p, true).title, forecast.day_title);
  }
});

test("firstLines is unchanged by the move out of the Today page", () => {
  assert.equal(nc.firstLines(""), "");
  const long = "One clause, " + "and more words here ".repeat(20);
  const out = nc.firstLines(long);
  assert.ok(out.length <= 221);
});

test("Today renders the first card through nowCardContent and fetches the plain card only behind the flag", () => {
  const src = read("app/today/page.tsx");
  assert.match(src, /title=\{nowCardContent\(forecast, plainCard\)\.title\}/);
  assert.match(src, /body=\{nowCardContent\(forecast, plainCard\)\.body\}/);
  assert.match(src, /if \(!PLAIN_NOW_CARD_FOR_MEMBERS \|\| !token \|\| !plainReading\) return;/);
  assert.match(src, /apiFetch\("\/forecast\/today\/plain"/);
  // Go deeper still hands the Oracle the full reading.
  assert.match(src, /fill\(t\("prompts\.today_deeper"\), \{ title: forecast\.day_title, reading: forecast\.reading \}\)/);
  assert.match(src, /import DeckCard from "@\/components\/NowDeckCard"/);
  assert.doesNotMatch(src, /function DeckCard\(/);
});

test("the admin preview uses the shared card, the admin route, both languages and regenerate", () => {
  const src = read("app/admin/now-card/page.tsx");
  assert.match(src, /import DeckCard from "@\/components\/NowDeckCard"/);
  assert.match(src, /\/admin\/now-card\/plain\$\{q\}/);
  assert.match(src, /refresh=true/);
  assert.match(src, /\(\["en", "es"\] as Lang\[\]\)/);
  assert.match(src, /apiFetch\("\/forecast\/today", \{\}, token\)/);
  assert.match(src, /<ProtectedRoute>/);
  assert.match(read("app/admin/AdminNav.tsx"), /href: "\/admin\/now-card"/);
  assert.match(read("components/NowDeckCard.tsx"), /export default function DeckCard/);
  assert.match(read("lib/i18n.tsx"), /export function translateIn\(/);
});

test("no em dashes or emojis in the new copy", () => {
  for (const f of ["app/admin/now-card/page.tsx", "lib/now-card.ts", "components/NowDeckCard.tsx"]) {
    const src = read(f);
    assert.ok(!src.includes("—"), f);
    assert.doesNotMatch(src, /[\u{1F300}-\u{1FAFF}]/u, f);
  }
});
