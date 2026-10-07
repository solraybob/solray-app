// Round 3 merge: the Souls clock-change fold now reaches the server top
// level (backend saved_people.birth_time_fold), the server's per-person
// birth_time_check offers the chooser for people saved before, and the
// native paywall's strict cross-channel trial switch.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { installBrowser, load } = require("./helpers.cjs");

installBrowser();
const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const sp = load("lib/saved-people-sync.js");

test("the chosen occurrence is sent top level on POST /saved-people", () => {
  // Only in the chart's meta (saved before the field existed): lifted up.
  const fromMeta = sp.savedPersonForServer({ id: "a", blueprint: { meta: { birth_time_fold: "second" } }, _synced: true });
  assert.equal(fromMeta.birth_time_fold, "second");
  assert.ok(!("_synced" in fromMeta));
  // The field wins over the chart; the read-only check is never sent back.
  const both = sp.savedPersonForServer({ id: "b", birth_time_fold: "first", blueprint: { meta: { birth_time_fold: "second" } },
    birth_time_check: { status: "ambiguous", needs_confirmation: false } });
  assert.equal(both.birth_time_fold, "first");
  assert.ok(!("birth_time_check" in both));
  // No choice anywhere: nothing invented.
  const none = sp.savedPersonForServer({ id: "c", blueprint: { meta: {} } });
  assert.ok(!("birth_time_fold" in none));
  assert.equal(sp.savedPersonFold({ id: "d", birth_time_fold: "later" }), undefined);
});

test("a saved person flagged by the server asks which occurrence it was", () => {
  const opts = [{ fold: "first", utc_offset: 2 }, { fold: "second", utc_offset: 1 }];
  const ask = sp.savedPersonBirthCheck({ id: "a", birth_time_check: { status: "ambiguous", fold: null, options: opts, needs_confirmation: true } });
  assert.equal(ask.needsConfirmation, true);
  assert.equal(ask.status, "ambiguous");
  assert.deepEqual(ask.options.map((o) => o.fold), ["first", "second"]);
  const never = sp.savedPersonBirthCheck({ id: "b", birth_time_check: { status: "nonexistent", needs_confirmation: true } });
  assert.equal(never.needsConfirmation, true);
  assert.equal(never.status, "nonexistent");
  // Chosen already, or an older server without the check: nothing to ask.
  assert.equal(sp.savedPersonBirthCheck({ id: "c", birth_time_check: { status: "ambiguous", fold: "first", options: opts, needs_confirmation: false } }).needsConfirmation, false);
  assert.equal(sp.savedPersonBirthCheck({ id: "d" }).needsConfirmation, false);
});

test("Souls offers the chooser for existing saved people and saves the choice back", () => {
  const src = read("app/souls/page.tsx");
  const picker = src.slice(src.indexOf("function PartnerPicker"));
  assert.match(picker, /savedBirthCheck\(p\)\.needsConfirmation && \(/);
  assert.match(picker, /onConfirmSaved\(p\)/);
  const confirm = src.slice(src.indexOf("const confirmSavedBirthTime = async"), src.indexOf("const handlePersonRemove"));
  assert.match(confirm, /setSavedFoldAsk\(\{ options: check\.options, resolve \}\)/);
  assert.match(confirm, /birth_time_fold: fold,\n\s+\}\),/, "the chart is redrawn with the chosen occurrence");
  assert.match(confirm, /apiFetch\("\/saved-people", \{ method: "POST", body: JSON\.stringify\(forServer\(updated\)\) \}/);
  assert.match(confirm, /forPerson\(person\.id, gen,/, "queued with this person's writes, bound to the account");
  assert.match(confirm, /souls\.birth_check_nonexistent/);
  assert.match(src, /<BirthTimeFoldSheet\n\s+options=\{savedFoldAsk\.options\}/);
  const en = JSON.parse(read("messages/en.json")).souls;
  const es = JSON.parse(read("messages/es.json")).souls;
  for (const k of ["birth_check_button", "birth_check_body", "birth_check_hint", "birth_check_nonexistent", "birth_check_failed"]) {
    assert.ok(en[k] && es[k], k);
    assert.ok(!/—/.test(en[k] + es[k]), `${k} has no em dash`);
  }
});
