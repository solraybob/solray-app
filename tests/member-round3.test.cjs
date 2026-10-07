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
