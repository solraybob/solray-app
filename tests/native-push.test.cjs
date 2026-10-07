// Native push logout safety (Codex push review findings 1 and 2):
// an in-flight bind cannot survive logout, and a logout release that
// fails (offline, 5xx) is kept, retried, and keeps the install silent.
const test = require("node:test");
const assert = require("node:assert/strict");
const { installBrowser, load, tick } = require("./helpers.cjs");

const win = installBrowser();
win.Capacitor = { isNativePlatform: () => true, getPlatform: () => "ios" };
const session = load("lib/account-session.js");
const api = load("lib/api.js");
const cache = load("lib/local-cache.js");
const np = load("lib/native-push.js");

const DEVICE = "d".repeat(64);
const PENDING_KEY = "solray_native_push_pending_release";

// ---- fakes

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function fakePlugin() {
  const listeners = {};
  const p = {
    calls: [],
    perm: "granted",
    permGate: null,      // deferred to hold checkPermissions
    registerGate: null,  // deferred to hold the registration event
    token: DEVICE,
    async checkPermissions() {
      if (p.permGate) await p.permGate.promise;
      return { receive: p.perm };
    },
    async requestPermissions() { p.calls.push("requestPermissions"); return { receive: "granted" }; },
    // The OS fires every registration listener that is attached when the
    // token arrives, so two overlapping sessions both hear it.
    async addListener(ev, cb) {
      (listeners[ev] = listeners[ev] || new Set()).add(cb);
      return { remove: async () => { listeners[ev] && listeners[ev].delete(cb); } };
    },
    async register() {
      p.calls.push("register");
      const fire = () => {
        for (const cb of [...(listeners.registration || [])]) cb({ value: p.token });
      };
      if (p.registerGate) p.registerGate.promise.then(fire);
      else setImmediate(fire);
    },
    async unregister() { p.calls.push("unregister"); },
    async removeAllDeliveredNotifications() { p.calls.push("removeAllDelivered"); },
  };
  return p;
}

// fetch that the test answers call by call; supports network failure.
const calls = [];
global.fetch = (url, init) => new Promise((resolve, reject) => {
  calls.push({
    url, init,
    body: init && init.body ? JSON.parse(init.body) : null,
    respond: (status, body) => resolve({ ok: status >= 200 && status < 300, status, json: async () => body }),
    fail: () => reject(new TypeError("Failed to fetch")),
  });
});

async function nextCall(pathPart) {
  for (let i = 0; i < 200; i++) {
    const c = calls.find((x) => !x.taken && x.url.includes(pathPart));
    if (c) { c.taken = true; return c; }
    await tick();
  }
  throw new Error(`no fetch to ${pathPart}`);
}

async function settle() { for (let i = 0; i < 20; i++) await tick(); }

function pendingCount() {
  const raw = win.localStorage.getItem(PENDING_KEY);
  return raw ? JSON.parse(raw).length : 0;
}

let plugin;
test.beforeEach(async () => {
  await settle();
  calls.length = 0;
  win.localStorage.clear();
  plugin = fakePlugin();
  np.__setPushPluginForTests(plugin);
});

async function signInAndBind(authToken) {
  const p = np.syncNativePush(authToken, true);
  const sub = await nextCall("/push/native-subscribe");
  sub.respond(200, { subscribed: true, platform: "ios" });
  assert.equal(await p, true);
  return sub;
}

// ---- finding 1: in-flight bind vs logout

test("a bind that lands after logout is released with its secret (no auth token)", async () => {
  const p = np.syncNativePush("token-A", true);
  const sub = await nextCall("/push/native-subscribe");
  const secret = sub.body.release_secret;
  assert.match(secret, /^[A-Za-z0-9_-]{32,128}$/);

  // A logs out while the bind is on the wire.
  session.bumpAuthGeneration();
  np.releaseNativePush("token-A");
  await settle();
  assert.ok(plugin.calls.includes("unregister"), "OS delivery stopped at once");
  assert.equal(calls.filter((c) => !c.taken && c.url.includes("native-release")).length, 0,
    "the release waits for the bind so it cannot overtake it");

  sub.respond(200, { subscribed: true }); // backend committed A's bind
  assert.equal(await p, false);           // StaleAccountError did not skip cleanup
  const rel = await nextCall("/push/native-release");
  assert.deepEqual(rel.body, { device_token: DEVICE, release_secret: secret });
  assert.equal(rel.init.headers.Authorization, undefined);
  rel.respond(200, { released: true, removed: 1 });
  await settle();
  assert.equal(pendingCount(), 0);
});

test("a bind that fails on the network after logout is still released", async () => {
  const p = np.syncNativePush("token-A", true);
  const sub = await nextCall("/push/native-subscribe");
  session.bumpAuthGeneration();
  np.releaseNativePush("token-A");
  sub.fail(); // may or may not have reached the backend
  assert.equal(await p, false);
  const rel = await nextCall("/push/native-release");
  assert.equal(rel.body.release_secret, sub.body.release_secret);
  rel.respond(200, { released: true, removed: 0 });
  await settle();
  assert.equal(pendingCount(), 0);
});

test("logout during the permission check never starts a registration", async () => {
  plugin.permGate = deferred();
  const p = np.syncNativePush("token-A", true);
  await settle();
  np.releaseNativePush("token-A");
  plugin.permGate.resolve();
  assert.equal(await p, false);
  await settle();
  assert.ok(!plugin.calls.includes("register"));
  assert.equal(calls.filter((c) => c.url.includes("native-subscribe")).length, 0);
});

test("logout while the OS is registering undoes that registration and binds nothing", async () => {
  plugin.registerGate = deferred();
  const p = np.syncNativePush("token-A", true);
  for (let i = 0; i < 50 && !plugin.calls.includes("register"); i++) await tick();
  assert.ok(plugin.calls.includes("register"));
  np.releaseNativePush("token-A");
  plugin.registerGate.resolve();
  assert.equal(await p, false);
  await settle();
  assert.equal(plugin.calls.filter((c) => c === "unregister").length, 2); // logout + undo
  assert.equal(calls.filter((c) => c.url.includes("native-subscribe")).length, 0);
});

// ---- finding 2: failed logout release keeps its recovery info

test("an offline logout keeps the release, survives the next sign-in's cache wipe, and retries", async () => {
  const sub = await signInAndBind("token-A");
  np.releaseNativePush("token-A");
  (await nextCall("/push/native-release")).fail(); // offline
  await settle(); // the OS unregister runs through the serialised OS queue
  assert.ok(plugin.calls.includes("unregister"));
  assert.equal(pendingCount(), 1);

  cache.clearUserScopedCaches(); // B signs in on the same phone
  assert.equal(pendingCount(), 1);

  // While A's release is unconfirmed, B's sign-in does not re-register
  // with the OS (the phone stays silent) and binds nothing.
  plugin.calls.length = 0;
  const p = np.syncNativePush("token-B", true);
  (await nextCall("/push/native-release")).respond(503, { detail: "down" });
  assert.equal(await p, false);
  assert.ok(!plugin.calls.includes("register"));
  assert.equal(pendingCount(), 1);

  // Back online: the retry confirms, and B can bind.
  const flush = np.flushPendingReleases();
  const rel = await nextCall("/push/native-release");
  assert.deepEqual(rel.body, { device_token: DEVICE, release_secret: sub.body.release_secret });
  rel.respond(200, { released: true, removed: 1 });
  assert.equal(await flush, true);
  assert.equal(pendingCount(), 0);

  const sub2 = await signInAndBind("token-B");
  assert.notEqual(sub2.body.release_secret, sub.body.release_secret, "a new secret per sign-in");
  assert.ok(plugin.calls.includes("register"));
});

test("the same secret is reused for every bind within one sign-in", async () => {
  const s1 = await signInAndBind("token-A");
  const s2 = await signInAndBind("token-A");
  assert.equal(s1.body.release_secret, s2.body.release_secret);
});

test("a malformed-release 4xx is dropped instead of retried forever", async () => {
  await signInAndBind("token-A");
  np.releaseNativePush("token-A");
  (await nextCall("/push/native-release")).respond(422, { detail: "bad" });
  await settle();
  assert.equal(pendingCount(), 0);
});

test("a dead session (401) releases the binding like a logout", async () => {
  const sub = await signInAndBind("token-A");
  win.localStorage.setItem("solray_token", "token-A");
  const p = api.apiFetch("/forecast/today", {}, "token-A");
  (await nextCall("/forecast/today")).respond(401, { detail: "expired" });
  await assert.rejects(p);
  const rel = await nextCall("/push/native-release");
  assert.equal(rel.body.release_secret, sub.body.release_secret);
  assert.ok(plugin.calls.includes("unregister"));
  rel.respond(200, { released: true, removed: 1 });
  await settle();
  assert.equal(pendingCount(), 0);
});

test("a legacy binding (no secret) is released once with the leaving auth token", async () => {
  win.localStorage.setItem("solray_native_push_device", DEVICE); // older build's format
  np.releaseNativePush("token-A");
  const un = await nextCall("/push/native-unsubscribe");
  assert.equal(un.init.headers.Authorization, "Bearer token-A");
  assert.deepEqual(un.body, { device_token: DEVICE });
  un.respond(200, { unsubscribed: true, removed: 1 });
  await settle();
  assert.equal(pendingCount(), 0);
  assert.ok(plugin.calls.includes("unregister"));
});

// ---- round 3, finding 3: OS registration is serialised across sessions

test("a stale registration's cleanup finishes before the next account registers", async () => {
  plugin.registerGate = deferred();
  const pA = np.syncNativePush("token-A", true);
  for (let i = 0; i < 50 && !plugin.calls.includes("register"); i++) await tick();
  assert.ok(plugin.calls.includes("register"));

  // A signs out and B signs in at once, while A's OS callback is pending.
  np.releaseNativePush("token-A");
  const pB = np.syncNativePush("token-B", true);
  await settle();
  assert.equal(plugin.calls.filter((c) => c === "register").length, 1,
    "B waits for A's registration and its cleanup before registering");

  plugin.registerGate.resolve();
  assert.equal(await pA, false);
  const sub = await nextCall("/push/native-subscribe");
  sub.respond(200, { subscribed: true, platform: "ios" });
  assert.equal(await pB, true);
  await settle();

  const os = plugin.calls.filter((c) => c === "register" || c === "unregister");
  assert.equal(os[os.length - 1], "register",
    "nothing unregisters the OS after B's registration: " + os.join(","));
  assert.equal(os.filter((c) => c === "register").length, 2);
});

// ---- round 3, finding 2: delivered notes leave the phone with the member

test("logout clears the leaving member's delivered notifications", async () => {
  await signInAndBind("token-A");
  np.releaseNativePush("token-A");
  await settle();
  assert.ok(plugin.calls.includes("removeAllDelivered"));
  (await nextCall("/push/native-release")).respond(200, { released: true, removed: 1 });
  await settle();
});

test("a dead session (401) also clears delivered notifications", async () => {
  await signInAndBind("token-A");
  win.localStorage.setItem("solray_token", "token-A");
  const p = api.apiFetch("/forecast/today", {}, "token-A");
  (await nextCall("/forecast/today")).respond(401, { detail: "expired" });
  await assert.rejects(p);
  await settle();
  assert.ok(plugin.calls.includes("removeAllDelivered"));
  (await nextCall("/push/native-release")).respond(200, { released: true, removed: 1 });
  await settle();
});
