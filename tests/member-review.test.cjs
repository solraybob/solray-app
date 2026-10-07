// Member app review follow-ups (out-5): F8 voice, F5 chart revisions,
// F3/F4 saved people, B4 aspects and manifest, C5 birth time fold.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { installBrowser, load } = require("./helpers.cjs");

const win = installBrowser();
const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

test("F8: a late transcript never auto-sends into another conversation or account", () => {
  const { voiceResultAction: act } = load("lib/voice-result.js");
  const base = { sameAccount: true, mounted: true, sameConversation: true, crisis: true };
  assert.equal(act(base), "send");
  assert.equal(act({ ...base, sameConversation: false }), "fill");
  assert.equal(act({ ...base, sameAccount: false }), "drop");
  assert.equal(act({ ...base, mounted: false }), "drop");
  assert.equal(act({ ...base, crisis: false }), "fill");
  const src = read("app/chat/page.tsx");
  const tb = src.slice(src.indexOf("const transcribeBlob = useCallback"), src.indexOf("const nativeRecordingRef"));
  assert.match(tb, /const acct = captureAccount\(\);/);
  assert.match(tb, /const spokenIn = activeSessionRef\.current;/);
  assert.match(tb, /if \(landing\(false\) === "drop"\) return;/);
  assert.match(tb, /data\?\.crisis === true && landing\(true\) === "send"/);
  assert.match(tb, /trackRequest\(/);
});
