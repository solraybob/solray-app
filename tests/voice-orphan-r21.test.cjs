// Round twenty-one (Codex out17-5): a conversation evicted from this device
// and then deleted on another device, with voice words waiting for it.
// "Open it" reads it back; a confirmed "gone" turns the words into the
// keep-or-discard offer (even if the read-back was superseded); a failed
// read keeps the notice so it can be tried again.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "app/chat/page.tsx"), "utf8");

test("a gone read-back always turns parked words into the offer, before the superseded check", () => {
  const rb = src.slice(src.indexOf("const readBackEvicted = "), src.indexOf("// History closed by any means"));
  const gone = rb.indexOf('if (got.kind === "gone" && isMountedRef.current && isCurrentGeneration(gen)) {');
  assert.ok(gone > 0);
  const offer = rb.indexOf("parkedToOrphan(sid);");
  assert.ok(offer > gone);
  assert.ok(offer < rb.indexOf("if (!current()) return;"), "even when superseded");
});

test("Open it keeps the notice for an evicted conversation until it opens or is gone", () => {
  const i = src.indexOf("const to = chatNotice.target;");
  const h = src.slice(i, src.indexOf("loadPastSession(to);", i) + 30);
  assert.ok(h.indexOf("if (!conversationExists(to)) { parkedToOrphan(to); return; }") > 0);
  assert.ok(h.includes("if (loadSession(to)) setChatNotice(null);"), "cleared only when it opens at once");
  assert.ok(!/\n\s*setChatNotice\(null\);\n/.test(h), "never cleared unconditionally");
  // Opening it later clears the notice and fills its box.
  const r = src.slice(src.indexOf("// Back in the conversation the words were spoken in"), src.indexOf("}, [sessionId]);", src.indexOf("// Back in the conversation the words were spoken in")));
  assert.ok(r.includes('n?.kind === "voice_elsewhere" && n.target === sessionId ? null : n'));
});
