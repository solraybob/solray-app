// Round fifteen (Codex out12-5 #3): work that calls the server after a gap
// (FileReader and image decoding, a debounce timer, permission prompts and
// OS registration) captures the account when it starts, checks it in every
// callback, sends the request under that generation, and writes no cache
// for another account.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { installBrowser, deferredFetch, load } = require("./helpers.cjs");

installBrowser();
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const session = load("lib/account-session.js");
const { apiFetch } = load("lib/api.js");

test("apiFetch: a request decided under an earlier account is never sent", async () => {
  const calls = deferredFetch();
  const g = session.getAuthGeneration();
  session.bumpAuthGeneration();
  await assert.rejects(apiFetch("/users/photo", { method: "PATCH", body: "{}" }, "tok-a", { generation: g }),
    (e) => session.isStaleAccountError(e));
  assert.equal(calls.length, 0);
});

test("settings photo: guard captured at selection, checked in both callbacks, sent and cached under it", () => {
  const src = read("app/profile/settings/page.tsx");
  const fn = src.slice(src.indexOf("const onPhotoSelected = async"), src.indexOf("// The \"which one was it\" question"));
  const cap = fn.indexOf("const acct = captureAccount();");
  assert.ok(cap > 0 && cap < fn.indexOf("new FileReader()"));
  assert.ok(fn.includes("reader.onload = () => {\n      if (!acct.live) { done(); return; }"));
  assert.ok(fn.includes("img.onload = async () => {\n        if (!acct.live) { done(); return; }"));
  assert.ok(fn.includes("}, token, { generation: acct.generation });"));
  const after = fn.slice(fn.indexOf("{ generation: acct.generation }"));
  assert.ok(after.indexOf("if (!acct.live) { done(); return; }") < after.indexOf('localStorage.setItem(accountKey("solray_avatar")'));
  assert.ok(fn.includes("if (isStaleAccountError(err) || !acct.live) return;"));
  assert.ok(fn.includes("const failPhoto = () => {\n      done();\n      if (!acct.live) return;"));
});

test("profile avatar: the same guard around FileReader, decoding, cache writes and the upload", () => {
  const src = read("app/profile/page.tsx");
  const fn = src.slice(src.indexOf("const handleAvatarChange = "), src.indexOf("reader.readAsDataURL(file);"));
  assert.ok(fn.indexOf("const acct = captureAccount();") < fn.indexOf("new FileReader()"));
  assert.ok(fn.includes("reader.onload = (ev) => {\n      if (!acct.live) { done(); return; }"));
  assert.ok(fn.includes("img.onload = () => {\n        if (!acct.live) { done(); return; }"));
  assert.ok(fn.indexOf("if (!acct.live) { done(); return; }\n        const MAX") < fn.indexOf('localStorage.setItem(accountKey("solray_avatar")'));
  assert.ok(fn.includes("{ generation: acct.generation }"));
  assert.ok(fn.includes("if (isStaleAccountError(err) || !acct.live) return;"));
});

test("souls search, web push and native push send under the generation captured before their gap", () => {
  const souls = read("app/souls/page.tsx");
  const s = souls.slice(souls.indexOf("const handleSearch = useCallback("), souls.indexOf("}, [token]);", souls.indexOf("const handleSearch = useCallback(")));
  assert.ok(s.indexOf("const searchGen = getAuthGeneration();") < s.indexOf("setTimeout(async"));
  assert.ok(s.includes("{ generation: searchGen }"));
  const web = read("lib/push-notifications.ts");
  assert.ok(web.indexOf("const acct = captureAccount();") < web.indexOf("Notification.requestPermission()"));
  assert.ok(web.includes("{ generation: acct.generation }"));
  assert.ok(web.indexOf("if (!acct.live) return false;") < web.indexOf("localStorage.setItem(accountKey(PUSH_ENABLED_KEY)"));
  const native = read("lib/native-push.ts");
  for (const fn of ["export async function syncNativePush", "export async function requestNativePushPermission"]) {
    const body = native.slice(native.indexOf(fn), native.indexOf("return runRegistration(", native.indexOf(fn)) + 60);
    assert.ok(body.indexOf("const gen = getAuthGeneration();") < body.indexOf("await "), fn);
    assert.ok(body.includes("runRegistration(authToken, epoch, gen)"), fn);
  }
  assert.ok(native.includes("{ generation: gen },"));
});
