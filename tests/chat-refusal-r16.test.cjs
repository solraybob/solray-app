// Round sixteen: on a care turn every refusal after the server's safety gate
// carries the support card, also those whose detail used to be a plain
// sentence (404 "Blueprint not found", 403 "Connection is not accepted"):
// they now arrive as {message, support, support_text}. Every path that sends
// to /chat reads them through one reader (readChatRefusal): the card is
// drawn, the note is a translated sentence (never "[object Object]", never
// blank, never the server's raw words), and such a 403 is not the paywall.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { installBrowser, load } = require("./helpers.cjs");

installBrowser();
const root = path.join(__dirname, "..");
const page = () => fs.readFileSync(path.join(root, "app/chat/page.tsx"), "utf8");
const { ApiError } = load("lib/api.js");
const { errorText, } = load("lib/errors.js");
const { readChatRefusal } = load("lib/chat-outcome.js");

const card = { variant: "support", intro: "You do not have to carry this alone.", steps: ["Talk to someone."] };
const wrapped = (message) => ({ message, support: card, support_text: "Here is someone to talk to." });
const apiErr = (status, detail) => new ApiError(errorText(detail, `HTTP ${status}`), status, undefined, detail);

test("an object detail reads as words, never [object Object]", () => {
  const e = apiErr(404, wrapped("Blueprint not found"));
  assert.equal(e.message, "Blueprint not found");
  assert.ok(!String(e.message).includes("[object"));
  assert.equal(apiErr(403, { support: card }).message, "HTTP 403");
});

test("a wrapped 404: support card first, the 'could not answer' note", () => {
  const r = readChatRefusal(apiErr(404, wrapped("Blueprint not found")), 1760000000000);
  assert.ok(r.support);
  assert.equal(r.support.crisis.variant, "support");
  assert.equal(r.support.content, "Here is someone to talk to.");
  assert.equal(r.noteKey, "chat.error_refused");
  assert.equal(r.paywall, false);
});

test("a wrapped 403 (connection not accepted) is never the paywall", () => {
  const r = readChatRefusal(apiErr(403, wrapped("Connection is not accepted")));
  assert.ok(r.support);
  assert.equal(r.paywall, false);
  assert.equal(r.noteKey, "chat.error_refused");
});

test("the bare subscription 403 is still the paywall; coded refusals keep their own words", () => {
  const sub = readChatRefusal(apiErr(403, "Premium subscription required. Start your free trial at /subscribe."));
  assert.equal(sub.paywall, true);
  assert.equal(sub.support, null);
  const tooLong = new ApiError("too long", 413, "message_too_long", { code: "message_too_long", message: "x", support: card });
  const r = readChatRefusal(tooLong);
  assert.equal(r.noteKey, "oracle_errors.message_too_long");
  assert.ok(r.support);
  assert.equal(r.paywall, false);
});

test("offline or a server error: could not be reached, no card", () => {
  assert.deepEqual(readChatRefusal(new TypeError("Failed to fetch")), { support: null, noteKey: "chat.error_unreachable", paywall: false });
  assert.equal(readChatRefusal(apiErr(502, "Bad gateway")).noteKey, "chat.error_unreachable");
});

test("the support card's id never collides with the note after it", () => {
  const r = readChatRefusal(apiErr(404, wrapped("x")), 1760000000000);
  assert.ok(!/^\d+$/.test(r.support.id));
});

test("chat page: the ordinary send, voice, Go deeper and Dynamics openings all read refusals through readChatRefusal", () => {
  const src = page();
  const send = src.slice(src.indexOf("const sendMessage = async"), src.indexOf("// Takes a message without an answer"));
  const c = send.slice(send.indexOf("} catch (err) {"));
  assert.ok(c.includes("const refusal = readChatRefusal(err);"));
  // Generic failures: card first, translated note, no raw detail.
  assert.ok(c.includes("content: t(refusal.noteKey)"));
  assert.ok(c.includes("setMessages((prev) => [...prev, ...(refusalSupport ? [refusalSupport] : []), errMsg])"));
  assert.ok(c.includes("if (refusal.paywall) {"));
  assert.ok(!/err\.status === 403\) \{\s*router\.replace\("\/subscribe"\)/.test(c));
  // Out of sight the card is kept with its conversation.
  assert.ok(c.includes("if (offscreen && (tooLong || refusalSupport)) {"));
  // Openings.
  const of = src.slice(src.indexOf("const openingFailed = "), src.indexOf("useEffect(() => {", src.indexOf("const openingFailed = ")));
  assert.ok(of.includes("const { support } = readChatRefusal(err, failedAt);"));
  assert.ok(src.includes("note: t(readChatRefusal(err).noteKey),"));
  // Voice sends go through sendMessage.
  assert.ok(src.includes("sendMessageRef.current(vm.text, { voiceTranscript: vm.voiceTranscript })"));
  // Nothing in the page reads detail.support by hand any more.
  assert.ok(!src.includes("?.support)"));
  assert.ok(!src.includes("detail?.support_text"));
});

test("copy: the new note exists in English and Spanish, without long dashes", () => {
  const en = JSON.parse(fs.readFileSync(path.join(root, "messages/en.json"), "utf8")).chat.error_refused;
  const es = JSON.parse(fs.readFileSync(path.join(root, "messages/es.json"), "utf8")).chat.error_refused;
  assert.ok(en && es && en !== es);
  assert.ok(!/—/.test(en + es));
});
