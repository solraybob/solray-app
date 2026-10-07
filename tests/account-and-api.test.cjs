// F1 / F3 / A1 / A18: account generation, late responses, consent 403.
const test = require("node:test");
const assert = require("node:assert/strict");
const { installBrowser, deferredFetch, load, tick } = require("./helpers.cjs");

const win = installBrowser();
const session = load("lib/account-session.js");
const api = load("lib/api.js");

test("a response that lands after the account changed is dropped", async () => {
  const calls = deferredFetch();
  const p = api.apiFetch("/users/me", {}, "token-A");
  await tick();
  session.bumpAuthGeneration(); // A signs out, B signs in
  calls[0].respond(200, { profile: { name: "A" } });
  await assert.rejects(p, (e) => session.isStaleAccountError(e));
});

test("a late 401 from the previous account does not sign the next one out", async () => {
  const calls = deferredFetch();
  win.localStorage.setItem("solray_token", "token-B");
  win.location.replaced = null;
  const p = api.apiFetch("/forecast/today", {}, "token-A");
  await tick();
  session.bumpAuthGeneration();
  calls[0].respond(401, { detail: "expired" });
  await assert.rejects(p, (e) => session.isStaleAccountError(e));
  assert.equal(win.localStorage.getItem("solray_token"), "token-B");
  assert.equal(win.location.replaced, null);
});

test("a 401 for the current account still ends the dead session", async () => {
  const calls = deferredFetch();
  win.localStorage.setItem("solray_token", "token-B");
  win.location.replaced = null;
  const p = api.apiFetch("/forecast/today", {}, "token-B");
  await tick();
  calls[0].respond(401, { detail: "expired" });
  await assert.rejects(p, (e) => e instanceof api.ApiError && e.status === 401);
  assert.equal(win.localStorage.getItem("solray_token"), null);
  assert.equal(win.location.replaced, "/login?expired=1");
});

test("keepSessionOn401 (password check on delete) keeps the session", async () => {
  const calls = deferredFetch();
  win.localStorage.setItem("solray_token", "token-C");
  win.location.replaced = null;
  const p = api.apiFetch("/users/me", { method: "DELETE" }, "token-C", { keepSessionOn401: true });
  await tick();
  calls[0].respond(401, { detail: "Wrong password" });
  await assert.rejects(p, (e) => e instanceof api.ApiError && e.status === 401);
  assert.equal(win.localStorage.getItem("solray_token"), "token-C");
  assert.equal(win.location.replaced, null);
});

test("403 ai_consent_required carries the code and opens the consent sheet", async () => {
  const calls = deferredFetch();
  let opened = 0;
  win.addEventListener("solray:ai-consent-required", () => { opened += 1; });
  const p = api.apiFetch("/chat", { method: "POST" }, "token-C");
  await tick();
  calls[0].respond(403, { detail: { code: "ai_consent_required" } });
  await assert.rejects(p, (e) => api.isAiConsentError(e) && e.code === "ai_consent_required");
  assert.equal(opened, 1);
});

test("a billing 403 is not mistaken for a consent 403", async () => {
  const calls = deferredFetch();
  const p = api.apiFetch("/forecast/today", {}, "token-C");
  await tick();
  calls[0].respond(403, { detail: "Subscription required" });
  await assert.rejects(p, (e) => e instanceof api.ApiError && e.status === 403 && !api.isAiConsentError(e));
});

test("apiBusy is true only while a request is in flight", async () => {
  const calls = deferredFetch();
  assert.equal(api.apiBusy(), false);
  const p = api.apiFetch("/x", {}, "token-C");
  assert.equal(api.apiBusy(), true);
  calls[0].respond(200, {});
  await p;
  assert.equal(api.apiBusy(), false);
});

test("account change sweeps per-account session handoffs", () => {
  const { clearUserScopedCaches } = load("lib/local-cache.js");
  win.sessionStorage.setItem("solray_chat_prompt", "{}");
  win.sessionStorage.setItem("solray_compat_context", "{}");
  win.sessionStorage.setItem("other_app_key", "1");
  win.localStorage.setItem("solray_language", "es");
  win.localStorage.setItem("solray_saved_people", "[]");
  clearUserScopedCaches();
  assert.equal(win.sessionStorage.getItem("solray_chat_prompt"), null);
  assert.equal(win.sessionStorage.getItem("solray_compat_context"), null);
  assert.equal(win.sessionStorage.getItem("other_app_key"), "1");
  assert.equal(win.localStorage.getItem("solray_language"), "es");
  assert.equal(win.localStorage.getItem("solray_saved_people"), null);
});

test("consent flags are read from /users/me at top level or under profile", () => {
  const { consentFromMe, AI_CONSENT_VERSION } = load("lib/ai-consent.js");
  assert.equal(AI_CONSENT_VERSION, "2026-10-07");
  assert.deepEqual(consentFromMe({ ai_consent_required: true, ai_consent_version: null }), { required: true, version: null, at: null });
  assert.deepEqual(
    consentFromMe({ profile: { ai_consent_required: false, ai_consent_version: "2026-10-06", ai_consent_at: "2026-10-07T10:00:00" } }),
    { required: false, version: "2026-10-06", at: "2026-10-07T10:00:00" },
  );
});

test("F1: captureAccount goes stale when the account changes, and check() throws", () => {
  const acct = session.captureAccount();
  assert.equal(acct.live, true);
  acct.check();
  session.bumpAuthGeneration();
  assert.equal(acct.live, false);
  assert.throws(() => acct.check(), (e) => session.isStaleAccountError(e));
  assert.equal(session.captureAccount().live, true);
});

test("F1: raw callbacks check the account before writing caches or calling back", () => {
  const fs = require("fs");
  const path = require("path");
  const root = path.join(__dirname, "..");
  const souls = fs.readFileSync(path.join(root, "app/souls/page.tsx"), "utf8");
  // Add-person sheet: the chart is only added for the same account, sheet open.
  const sheet = souls.slice(souls.indexOf("function AddPersonSheet"));
  const submit = sheet.slice(sheet.indexOf("const submit = async"), sheet.indexOf("onAdded(person);"));
  assert.match(submit, /const acct = captureAccount\(\);/);
  assert.ok((submit.match(/!stillHere\(\)/g) || []).length >= 2, "checked after fetch and after decoding");
  // Bond reading: legacy recalculation and the chat handoff are guarded.
  const bond = souls.slice(souls.indexOf("const readTheBond"), souls.indexOf("<ProtectedRoute>"));
  assert.match(bond, /const acct = captureAccount\(\);/);
  const pushes = bond.split('router.push("/chat?compat=1")').length - 1;
  const guards = (bond.match(/if \(!stillHere\(\)\) return abandon\(\);/g) || []).length;
  assert.ok(guards >= pushes + 2, "every handoff and the cache write are guarded");
  const i18n = fs.readFileSync(path.join(root, "lib/i18n.tsx"), "utf8");
  assert.match(i18n, /if \(!acct\.live\) return true;/);
});

test("F7: apiBusy covers reading the answer, not just the headers", async () => {
  let release;
  global.fetch = async () => ({
    ok: true, status: 200,
    json: () => new Promise((r) => { release = () => r({ done: true }); }),
  });
  const p = api.apiFetch("/x", {}, "token-C");
  await tick(); await tick();
  assert.equal(api.apiBusy(), true, "still decoding");
  release();
  await p;
  assert.equal(api.apiBusy(), false);
});

test("F7: raw requests counted through trackRequest", async () => {
  let done;
  const p = api.trackRequest(() => new Promise((r) => { done = r; }));
  assert.equal(api.apiBusy(), true);
  done(1);
  assert.equal(await p, 1);
  assert.equal(api.apiBusy(), false);
  await assert.rejects(api.trackRequest(async () => { throw new Error("x"); }));
  assert.equal(api.apiBusy(), false);
});

test("F7: a typed controlled field is a draft even when defaultValue follows value", () => {
  const dg = load("lib/draft-guard.js");
  dg.resetDraftTracking();
  // React keeps defaultValue === value on a controlled input.
  const box = { tagName: "TEXTAREA", value: "half a message", defaultValue: "half a message", isConnected: true };
  assert.equal(dg.hasTypedDraft(), false, "untouched page");
  const target = new EventTarget();
  const stop = dg.installDraftTracking(target);
  const ev = new Event("input");
  Object.defineProperty(ev, "target", { value: box });
  target.dispatchEvent(ev);
  assert.equal(dg.hasTypedDraft(), true);
  box.value = "";            // sent: the box is cleared
  assert.equal(dg.hasTypedDraft(), false);
  box.value = "again";
  box.isConnected = false;   // left the page
  assert.equal(dg.hasTypedDraft(), false);
  // Buttons and checkboxes are not drafts.
  dg.noteTyping({ tagName: "INPUT", type: "checkbox", value: "on", isConnected: true });
  assert.equal(dg.hasTypedDraft(), false);
  stop();
});

test("F1: the birthday question is not handed to the next account's chat", () => {
  const fs = require("fs");
  const src = fs.readFileSync(require("path").join(__dirname, "..", "app/today/page.tsx"), "utf8");
  const fn = src.slice(src.indexOf("const goDeeperBirthday"), src.indexOf("const laterBirthday"));
  assert.match(fn, /const acct = captureAccount\(\);/);
  assert.ok(fn.indexOf("if (!acct.live) return;") < fn.indexOf('sessionStorage.setItem("solray_chat_prompt"'));
});

test("R3-9: an error body decoded after the account changed is dropped, and opens no consent sheet", async () => {
  let release;
  global.fetch = async () => ({
    ok: false, status: 403,
    json: () => new Promise((r) => { release = () => r({ detail: { code: "ai_consent_required" } }); }),
  });
  let opened = 0;
  const onOpen = () => { opened += 1; };
  win.addEventListener("solray:ai-consent-required", onOpen);
  const p = api.apiFetch("/chat", { method: "POST" }, "token-A");
  while (!release) await tick();
  session.bumpAuthGeneration(); // A signs out, B signs in while the body decodes
  release();
  await assert.rejects(p, (e) => session.isStaleAccountError(e));
  win.removeEventListener("solray:ai-consent-required", onOpen);
  assert.equal(opened, 0);
});

test("R3-9: the handled 401 sign-out still reaches its caller as an ApiError", async () => {
  let release;
  win.localStorage.setItem("solray_token", "token-D");
  win.location.replaced = null;
  global.fetch = async () => ({
    ok: false, status: 401,
    json: () => new Promise((r) => { release = () => r({ detail: "expired" }); }),
  });
  const p = api.apiFetch("/forecast/today", {}, "token-D");
  while (!release) await tick();
  release();
  await assert.rejects(p, (e) => e instanceof api.ApiError && e.status === 401);
  assert.equal(win.location.replaced, "/login?expired=1");
});
