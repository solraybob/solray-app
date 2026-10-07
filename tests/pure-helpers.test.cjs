// A4, B3, B4, B9, F2, F5, F7 pure logic.
const test = require("node:test");
const assert = require("node:assert/strict");
const { installBrowser, load } = require("./helpers.cjs");

const win = installBrowser();

test("A4: under 16 is refused, 16 on the day is allowed", () => {
  const { isUnderMinimumAge, ageFromBirthDate } = load("lib/age.js");
  const now = new Date(2026, 9, 7); // 7 Oct 2026
  assert.equal(isUnderMinimumAge("2010-10-08", now), true);   // turns 16 tomorrow
  assert.equal(isUnderMinimumAge("2010-10-07", now), false);  // 16 today
  assert.equal(isUnderMinimumAge("1989-09-05", now), false);
  assert.equal(ageFromBirthDate("not-a-date", now), null);
});

test("B3: the lit dot follows the card nearest the centre at any width", () => {
  const { activeCardIndex } = load("lib/deck.js");
  for (const W of [320, 390, 430]) {
    // Track as on Now: 40px padding each side, card = content width, 16px gap.
    const client = W + 40;
    const card = client - 80;
    const cards = Array.from({ length: 5 }, (_, i) => ({ left: 40 + i * (card + 16), width: card }));
    const scrollWidth = 40 + 5 * card + 4 * 16 + 40;
    for (let i = 0; i < 5; i++) {
      const centred = cards[i].left + card / 2 - client / 2;
      const scrollLeft = Math.min(centred, scrollWidth - client);
      assert.equal(activeCardIndex(scrollLeft, client, scrollWidth, cards, 5), i, `width ${W}, card ${i}`);
    }
    // The card is centred: equal space either side at rest.
    assert.equal(cards[0].left, client - (cards[0].left + card));
  }
});

test("F2: merging keeps the server's newer messages and this device's unsent ones", () => {
  const { mergeMessages, sameTranscript } = load("lib/chat-merge.js");
  const m = (id, ts, content = id) => ({ id, timestamp: ts, content, role: "user" });
  const server = [m("1", "2026-10-07T10:00"), m("2", "2026-10-07T10:01"), m("3", "2026-10-07T10:02")];
  const staleLocal = [m("1", "2026-10-07T10:00")];
  assert.ok(sameTranscript(mergeMessages(server, staleLocal), server)); // never shrinks
  const withNew = [...staleLocal, m("9", "2026-10-07T10:05")];
  assert.deepEqual(mergeMessages(server, withNew).map((x) => x.id), ["1", "2", "3", "9"]);
});

test("F5: a confirmed person missing from the server is not uploaded again", () => {
  const { peopleToUpload, mergeSavedPeople } = load("lib/saved-people-sync.js");
  const local = [
    { id: "deleted-elsewhere", _synced: true },
    { id: "new-here" },
    { id: "deleted-here-offline" },
  ];
  const serverIds = new Set(["kept"]);
  const tomb = new Set(["deleted-here-offline"]);
  assert.deepEqual(peopleToUpload(local, serverIds, tomb).map((p) => p.id), ["new-here"]);
  const confirmed = [{ id: "kept", _synced: true }, { id: "deleted-here-offline", _synced: true }];
  const current = [...local, { id: "added-during-sync" }];
  const final = mergeSavedPeople(current, confirmed, new Set(), tomb).map((p) => p.id);
  assert.deepEqual(final, ["new-here", "added-during-sync", "kept"]);
});

test("F7: a birth detail change drops every chart-derived cache", () => {
  const { syncBirthRevision } = load("lib/chart-revision.js");
  const ls = win.localStorage;
  ls.clear();
  const me = { profile: { birth_date: "1989-09-05", birth_time: "12:00", birth_city: "Reykjavik", birth_lat: 64.1, birth_lon: -21.9 } };
  syncBirthRevision(me);
  ls.setItem("solray_blueprint", "{}");
  ls.setItem("solray_astrocarto", "{}");
  ls.setItem("solray_cycles_v2_2026-10_en", "{}");
  ls.setItem("solray_forecast_2026-10-07", "{}");
  ls.setItem("solray_compat_x_y", "{}");
  ls.setItem("solray_language", "es");
  assert.equal(syncBirthRevision(me), false); // unchanged: caches stay
  assert.equal(ls.getItem("solray_blueprint"), "{}");
  const edited = { profile: { ...me.profile, birth_time: "13:30" } };
  assert.equal(syncBirthRevision(edited), true);
  for (const k of ["solray_blueprint", "solray_astrocarto", "solray_cycles_v2_2026-10_en", "solray_forecast_2026-10-07", "solray_compat_x_y"]) {
    assert.equal(ls.getItem(k), null, k);
  }
  assert.equal(ls.getItem("solray_language"), "es");
});

test("B9: Terms link is Apple's EULA on iOS only", () => {
  const { termsOfUseUrl, APPLE_EULA_URL, SOLRAY_TERMS_URL } = load("lib/legal-links.js");
  win.Capacitor = { getPlatform: () => "android" };
  assert.equal(termsOfUseUrl(), SOLRAY_TERMS_URL);
  win.Capacitor = { getPlatform: () => "ios" };
  assert.equal(termsOfUseUrl(), APPLE_EULA_URL);
  delete win.Capacitor;
  assert.equal(termsOfUseUrl(), SOLRAY_TERMS_URL);
});

test("B6: share is hidden in the native shell when there is no share sheet", () => {
  const { cardShareAvailable } = load("lib/share-available.js");
  const setNav = (v) => Object.defineProperty(globalThis, "navigator", { value: v, configurable: true, writable: true });
  setNav({});
  assert.equal(cardShareAvailable(), true); // web: download fallback works
  win.Capacitor = { isNativePlatform: () => true, getPlatform: () => "android" };
  assert.equal(cardShareAvailable(), false);
  setNav({ share: () => Promise.resolve() });
  assert.equal(cardShareAvailable(), true);
  delete win.Capacitor;
});

test("B4: chat suggestions from today's forecast follow the language", () => {
  const { buildTodayPrompts } = load("lib/today-prompts.js");
  const en = require(process.env.SOLRAY_TEST_BUILD + "/messages/en.json");
  const es = require(process.env.SOLRAY_TEST_BUILD + "/messages/es.json");
  const tr = (bundle) => (key) => key.split(".").reduce((o, k) => (o ? o[k] : undefined), bundle) ?? key;
  const f = { dominant_transit: "Saturn square natal Sun", energy: { mental: 3, emotional: 7 }, day_title: "Let the wave pass" };
  const esPrompts = buildTodayPrompts(f, tr(es), "es");
  assert.equal(esPrompts.length, 3);
  for (const p of esPrompts) assert.ok(!/\bWhat\b|\btoday\b|\bMy\b/.test(p.question), p.question);
  assert.match(esPrompts[1].question, /claridad mental/);
  const enPrompts = buildTodayPrompts(f, tr(en), "en");
  assert.match(enPrompts[0].question, /^What is Saturn in square to my Sun actually doing to me today\?$/);
});

test("B4: fill and ordinal", () => {
  const { fill, ordinal } = load("lib/i18n.js");
  assert.equal(fill("Hola {name}, {n}", { name: "Ana", n: 3 }), "Hola Ana, 3");
  assert.equal(ordinal(1, "en"), "1st");
  assert.equal(ordinal(12, "en"), "12th");
  assert.equal(ordinal(3, "es"), "3");
});
