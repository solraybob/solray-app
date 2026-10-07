// Minimal browser globals for the lib tests: Storage, window events,
// location, and a controllable fetch.
const path = require("path");

class MemStorage {
  constructor() { this.m = new Map(); }
  get length() { return this.m.size; }
  key(i) { return Array.from(this.m.keys())[i] ?? null; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

function installBrowser() {
  const events = new EventTarget();
  const win = {
    localStorage: new MemStorage(),
    sessionStorage: new MemStorage(),
    location: { pathname: "/today", replaced: null, replace(u) { this.replaced = u; } },
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
    matchMedia: () => ({ matches: false }),
    navigator: {},
  };
  global.window = win;
  global.localStorage = win.localStorage;
  global.sessionStorage = win.sessionStorage;
  global.CustomEvent = global.CustomEvent || class CustomEvent extends Event {
    constructor(type, init) { super(type); this.detail = init?.detail; }
  };
  return win;
}

/** fetch that waits for the test to resolve each call. */
function deferredFetch() {
  const calls = [];
  global.fetch = (url, init) => new Promise((resolve) => {
    calls.push({ url, init, respond: (status, body) => resolve({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }) });
  });
  return calls;
}

function load(mod) {
  const root = process.env.SOLRAY_TEST_BUILD;
  if (!root) throw new Error("run through tests/run.sh");
  return require(path.join(root, mod));
}

const tick = () => new Promise((r) => setImmediate(r));

module.exports = { installBrowser, deferredFetch, load, tick, MemStorage };
