// Round nineteen (Codex out15-5):
// #1 a voice message belongs to the conversation, account and token it was
//    started in: captured when the microphone is asked for, carried through
//    recording, stopping and transcription, sent as session_id; if the
//    member moved on, its words wait for that conversation's box, with a
//    notice offering to open it;
// #2 a store purchase holds the update reload until it is cancelled,
//    failed or verified; the 60 s timeout only shows the pending note.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

test("voice: origin captured with the hold, before either microphone starts", () => {
  const src = read("app/chat/page.tsx");
  const tog = src.slice(src.indexOf("const toggleRecording = useCallback("), src.indexOf("// Auto-grow textarea"));
  const cap = tog.indexOf("voiceOriginRef.current = {");
  assert.ok(cap > tog.indexOf("holdVoice();"));
  assert.ok(cap < tog.indexOf("startNativeRecording()") && cap < tog.indexOf("getUserMedia({ audio: true })"));
  const o = tog.slice(cap, cap + 200);
  for (const k of ["session: activeSessionRef.current", "acct: captureAccount()", "token: tokenRef.current || token"]) assert.ok(o.includes(k), k);
  // Cleared with the hold.
  assert.ok(src.includes("voiceHoldRef.current = null;\n    voiceOriginRef.current = null;"));
});

test("voice: transcription uses the origin for session_id, account and token", () => {
  const src = read("app/chat/page.tsx");
  const tb = src.slice(src.indexOf("const transcribeBlob = useCallback("), src.indexOf("const nativeRecordingRef = useRef"));
  assert.ok(tb.includes("const origin = voiceOriginRef.current;"));
  assert.ok(tb.includes("const acct = origin?.acct ?? captureAccount();"));
  assert.ok(tb.includes("const spokenIn = origin ? origin.session : activeSessionRef.current;"));
  assert.ok(tb.includes('if (spokenIn) form.append("session_id", spokenIn);'));
  assert.ok(tb.includes("const authToken = origin ? origin.token : (tokenRef.current || token);"));
});

test("voice: landing elsewhere keeps the words with the original conversation", () => {
  const src = read("app/chat/page.tsx");
  const tb = src.slice(src.indexOf("const transcribeBlob = useCallback("), src.indexOf("const nativeRecordingRef = useRef"));
  const el = tb.indexOf("if (spokenIn && activeSessionRef.current !== spokenIn) {");
  assert.ok(el > 0);
  // Before the composer fill.
  assert.ok(el < tb.indexOf("lastTranscriptRef.current = transcript;"));
  const block = tb.slice(el, tb.indexOf("lastTranscriptRef.current = transcript;"));
  assert.ok(block.includes("voiceDraftsRef.current.set(spokenIn,"));
  assert.ok(block.includes('setChatNotice({ kind: "voice_elsewhere", sessionId: activeSessionRef.current, target: spokenIn });'));
  assert.ok(!block.includes("setInput("), "never into this conversation's box");
  // Restored into that conversation's box when it is opened.
  const r = src.slice(src.indexOf("// Back in the conversation the words were spoken in"), src.indexOf("}, [sessionId]);", src.indexOf("// Back in the conversation the words were spoken in")));
  assert.ok(r.includes("voiceDraftsRef.current.get(sessionId)"));
  assert.ok(r.includes("setInput((prev) => composerWithUnsent(d.text, prev));"));
  assert.ok(r.includes("lastTranscriptRef.current = d.transcript;"));
  assert.ok(src.includes("registerDraftSource(() => voiceDraftsRef.current.size > 0)"));
  // The notice opens it.
  assert.ok(src.includes("loadPastSession(to);"));
  const en = JSON.parse(read("messages/en.json")).chat;
  const es = JSON.parse(read("messages/es.json")).chat;
  for (const k of ["voice_elsewhere", "voice_open_conversation"]) {
    assert.ok(en[k] && es[k] && en[k] !== es[k], k);
    assert.ok(!/—/.test(en[k] + es[k]), k);
  }
});

test("purchase: held until cancelled, failed or verified; the timeout keeps the hold", () => {
  const src = read("app/subscribe/page.tsx");
  const hs = src.slice(src.indexOf("const handleSubscribe = async"), src.indexOf("  return (", src.indexOf("const handleSubscribe = async")));
  assert.ok(hs.indexOf("holdPurchase();") < hs.indexOf("announceStorePurchase(token)"));
  const timer = hs.slice(hs.indexOf("purchaseTimer.current = setTimeout("), hs.indexOf("NATIVE_PURCHASE_TIMEOUT_MS);"));
  assert.ok(!timer.includes("endPurchaseHold"), "the timeout never releases it");
  // Released on gate failure, unavailable plan, cancel and launch failure.
  assert.ok((hs.match(/endPurchaseHold\(\);/g) || []).length >= 4);
  // And when the store reports the outcome (verified or failed).
  const lis = src.slice(src.indexOf("setPurchaseListener((outcome) => {"), src.indexOf("return () => setPurchaseListener(null);"));
  assert.ok(lis.includes("endPurchaseHold();"));
  assert.ok(src.includes("if (!purchaseHoldRef.current) purchaseHoldRef.current = beginUnfinishedWork();"));
  assert.ok(src.includes("useEffect(() => () => endPurchaseHold(), []);"));
});
