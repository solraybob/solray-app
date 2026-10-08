// Round eighteen (Codex out14-5): the update reload (components/VersionCheck)
// never destroys unfinished work no text field shows: a voice recording
// from microphone preparation through stopping until transcription has
// taken over (or it is cancelled), a photo being prepared, a store purchase
// or the card form, a sign-up whose earlier steps live in memory, a
// birth-time question open mid-save; picked dates, times and selects count
// as drafts.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { installBrowser, load } = require("./helpers.cjs");

installBrowser();
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const guard = load("lib/draft-guard.js");

test("holds: the reload waits while one is held; release is once only", () => {
  guard.resetDraftTracking();
  assert.equal(guard.hasUnfinishedWork(), false);
  const a = guard.beginUnfinishedWork();
  const b = guard.beginUnfinishedWork();
  assert.equal(guard.hasUnfinishedWork(), true);
  a(); a();
  assert.equal(guard.hasUnfinishedWork(), true, "a double release never frees another hold");
  b();
  assert.equal(guard.hasUnfinishedWork(), false);
});

test("registered checks: busy while true, gone on cleanup, unknown counts as busy", () => {
  guard.resetDraftTracking();
  let busy = true;
  const off = guard.registerUnfinishedWork(() => busy);
  assert.equal(guard.hasUnfinishedWork(), true);
  busy = false;
  assert.equal(guard.hasUnfinishedWork(), false);
  busy = true;
  off();
  assert.equal(guard.hasUnfinishedWork(), false);
  const off2 = guard.registerUnfinishedWork(() => { throw new Error("x"); });
  assert.equal(guard.hasUnfinishedWork(), true);
  off2();
});

test("picked dates, times and selects are drafts too", () => {
  guard.resetDraftTracking();
  const date = { tagName: "INPUT", type: "date", value: "1990-04-02", isConnected: true };
  const sel = { tagName: "SELECT", value: "second", isConnected: true };
  const box = { tagName: "INPUT", type: "checkbox", value: "on", isConnected: true };
  guard.noteTyping(date);
  assert.equal(guard.hasTypedDraft(), true);
  guard.resetDraftTracking();
  guard.noteTyping(sel);
  assert.equal(guard.hasTypedDraft(), true);
  guard.resetDraftTracking();
  guard.noteTyping(box);
  assert.equal(guard.hasTypedDraft(), false);
});

test("VersionCheck reloads only when no unfinished work is held", () => {
  const src = read("components/VersionCheck.tsx");
  assert.ok(src.includes("const safeToReload = () => !isUserTyping() && !hasDraft() && !busyElsewhere() && !apiBusy();"));
  assert.ok(src.includes("try { return hasUnfinishedWork(); } catch { return true; }"));
});

test("chat voice: held from mic preparation until transcription ends; released on every cancel or failure", () => {
  const src = read("app/chat/page.tsx");
  const tog = src.slice(src.indexOf("const toggleRecording = useCallback("), src.indexOf("// Auto-grow textarea"));
  const hold = tog.indexOf("holdVoice();");
  assert.ok(hold > 0);
  assert.ok(hold < tog.indexOf("startNativeRecording()"), "before the native microphone starts");
  assert.ok(hold < tog.indexOf("getUserMedia({ audio: true })"), "before the web microphone is asked for");
  // Every way out that is not a recording handed on releases it.
  const releases = (tog.match(/releaseVoice\(\);/g) || []).length;
  assert.ok(releases >= 7, `releases in toggleRecording: ${releases}`);
  assert.ok(tog.includes("recorder.onerror = () => {\n      releaseVoice();"));
  // The web stop hands over to transcribeBlob (which releases when done).
  assert.ok(tog.includes("transcribeBlob(blob, usedMime);"));
  const stop = src.slice(src.indexOf("const stopRecording = useCallback("), src.indexOf("const toggleRecording = useCallback("));
  assert.ok(stop.includes("releaseVoice();\n          setVoiceError(t(\"chat.voice_no_audio\"));"));
  assert.ok(stop.includes("} catch (err) {\n        releaseVoice();"));
  const tb = src.slice(src.indexOf("const transcribeBlob = useCallback("), src.indexOf("const nativeRecordingRef = useRef"));
  assert.ok(tb.includes("setTranscribing(false);\n      releaseVoice();\n      return;"));
  assert.ok(tb.slice(tb.lastIndexOf("} finally {")).includes("releaseVoice();"));
  // Leaving the chat ends the recording and the hold.
  assert.ok(src.includes("// Leaving the chat ends the recording: nothing left to protect.\n      releaseVoice();"));
  assert.ok(src.includes("if (!voiceHoldRef.current) voiceHoldRef.current = beginUnfinishedWork();"));
});

test("photos: held from selection until the upload ends, on both screens", () => {
  for (const [file, fnStart, fnEnd] of [
    ["app/profile/settings/page.tsx", "const onPhotoSelected = async", "// The \"which one was it\" question"],
    ["app/profile/page.tsx", "const handleAvatarChange = ", "try { reader.readAsDataURL(file); } catch { done(); }"],
  ]) {
    const src = read(file);
    const fn = src.slice(src.indexOf(fnStart), src.indexOf(fnEnd) + fnEnd.length);
    assert.ok(fn.indexOf("const done = beginUnfinishedWork();") < fn.indexOf("new FileReader()"), file);
    assert.ok((fn.match(/done\(\)/g) || []).length >= 5, file);
  }
});

test("payment, sign-up and the birth-time question register their unfinished work", () => {
  const sub = read("app/subscribe/page.tsx");
  assert.ok(sub.includes("paymentBusyRef.current = showCardForm || actionLoading;"));
  assert.ok(sub.includes("useEffect(() => registerUnfinishedWork(() => paymentBusyRef.current), []);"));
  assert.ok(sub.includes("storeBusyRef.current = loading || restoring;"));
  assert.ok(sub.includes("useEffect(() => registerUnfinishedWork(() => storeBusyRef.current), []);"));
  const onb = read("app/onboard/page.tsx");
  assert.ok(onb.includes("onboardingDirtyRef.current = !calculatingBlueprint && ("));
  assert.ok(onb.includes("step > 1 || foldAsk !== null || loading ||"));
  assert.ok(onb.includes("useEffect(() => registerUnfinishedWork(() => onboardingDirtyRef.current), []);"));
  const set = read("app/profile/settings/page.tsx");
  assert.ok(set.includes("foldOpenRef.current = foldAsk !== null;"));
  assert.ok(set.includes("useEffect(() => registerUnfinishedWork(() => foldOpenRef.current), []);"));
});
