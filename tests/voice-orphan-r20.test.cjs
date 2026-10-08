// Round twenty (Codex out16-5): voice words whose conversation is gone are
// never parked under a dead id. They are offered wherever the member is, to
// put in this box or discard (never sent on their own); words already
// waiting for a conversation that is then deleted, here or elsewhere, become
// the same offer. A crisis card for a gone conversation is still drawn here.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const src = read("app/chat/page.tsx");

test("a transcript for a deleted conversation is offered, never parked", () => {
  const tb = src.slice(src.indexOf("const transcribeBlob = useCallback("), src.indexOf("const nativeRecordingRef = useRef"));
  const el = tb.slice(tb.indexOf("if (spokenIn && activeSessionRef.current !== spokenIn) {"));
  const gone = el.indexOf("} else if (!conversationExists(spokenIn)) {");
  assert.ok(gone > 0);
  assert.ok(gone < el.indexOf("voiceDraftsRef.current.set(spokenIn,"), "checked before parking");
  const branch = el.slice(gone, el.indexOf("} else {", gone));
  assert.ok(branch.includes("offerOrphanVoice({ text: transcript, transcript });"));
  assert.ok(branch.includes("return;"), "no notice pointing at a dead conversation");
  assert.ok(!branch.includes("sendMessage"), "never sent on its own");
  // The crisis card for a gone conversation keeps the r19 behaviour.
  assert.ok(el.includes("if (!kept) {") && el.includes("setMessages((prev) => [...prev, turn.user as Message, turn.card as Message]);"));
  assert.ok(src.includes("const conversationExists = (sid: string) => !!loadSession(sid) || !!getEvictedSummary(sid);"));
});

test("recover puts the words in this box; discard drops them; both clear the offer", () => {
  const rec = src.slice(src.indexOf("const recoverOrphanVoice = () => {"), src.indexOf("const discardOrphanVoice"));
  assert.ok(rec.includes("setVoiceOrphan(null);"));
  assert.ok(rec.includes("setInput((prev) => composerWithUnsent(w.text, prev));"));
  assert.ok(rec.includes("lastTranscriptRef.current = w.transcript;"));
  assert.ok(!rec.includes("sendMessage"));
  assert.ok(src.includes("const discardOrphanVoice = () => setVoiceOrphan(null);"));
  assert.ok(src.includes("registerDraftSource(() => voiceOrphanRef.current !== null)"));
  // Shown wherever the member is (not tied to one conversation).
  assert.ok(src.includes("{voiceOrphan && ("));
  assert.ok(src.includes("onClick={recoverOrphanVoice}") && src.includes("onClick={discardOrphanVoice}"));
});

test("words waiting for a conversation that is deleted become the offer", () => {
  const p = src.slice(src.indexOf("const parkedToOrphan = (sid: string) => {"), src.indexOf("const recoverOrphanVoice"));
  assert.ok(p.includes("voiceDraftsRef.current.delete(sid);"));
  assert.ok(p.includes("offerOrphanVoice(parked);"));
  assert.ok(p.includes('n?.kind === "voice_elsewhere" && n.target === sid ? null : n'));
  const del = src.slice(src.indexOf("const deleteSession = useCallback("), src.indexOf("// ── Send message"));
  assert.ok(del.indexOf("parkedToOrphan(sid);") > del.indexOf("removeCachedSession(sid);"));
  // Deleted on another device: the "open it" action turns into the offer.
  assert.ok(src.includes("if (!conversationExists(to)) { parkedToOrphan(to); return; }"));
});

test("copy: the offer in English and Spanish, without long dashes", () => {
  const en = JSON.parse(read("messages/en.json")).chat;
  const es = JSON.parse(read("messages/es.json")).chat;
  for (const k of ["voice_orphan", "voice_orphan_use", "voice_orphan_discard"]) {
    assert.ok(en[k] && es[k] && en[k] !== es[k], k);
    assert.ok(!/—/.test(en[k] + es[k]), k);
  }
});
