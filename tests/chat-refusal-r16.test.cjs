// Round sixteen, simplified in round twenty-six: every path that sends to
// /chat reads a refusal through one reader (readChatRefusal). The note is a
// translated sentence (never "[object Object]", never blank, never the
// server's raw words), and a 403 whose detail is an object is not the
// paywall. The crisis and support cards are gone: an older server's
// `support` / `support_text` in a detail is ignored.
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

test("an object 404 (even an older one carrying a card): only the 'could not answer' note", () => {
  const r = readChatRefusal(apiErr(404, wrapped("Blueprint not found")));
  assert.deepEqual(r, { noteKey: "chat.error_refused", paywall: false });
});

test("a 403 with an object detail (connection not accepted) is never the paywall", () => {
  assert.deepEqual(readChatRefusal(apiErr(403, { message: "Connection is not accepted" })),
    { noteKey: "chat.error_refused", paywall: false });
  assert.equal(readChatRefusal(apiErr(403, wrapped("Connection is not accepted"))).paywall, false);
});

test("the bare subscription 403 is still the paywall; coded refusals keep their own words", () => {
  const sub = readChatRefusal(apiErr(403, "Premium subscription required. Start your free trial at /subscribe."));
  assert.equal(sub.paywall, true);
  const tooLong = new ApiError("too long", 413, "message_too_long", { code: "message_too_long", message: "x", support: card });
  assert.deepEqual(readChatRefusal(tooLong), { noteKey: "oracle_errors.message_too_long", paywall: false });
});

test("offline or a server error: could not be reached", () => {
  assert.deepEqual(readChatRefusal(new TypeError("Failed to fetch")), { noteKey: "chat.error_unreachable", paywall: false });
  assert.equal(readChatRefusal(apiErr(502, "Bad gateway")).noteKey, "chat.error_unreachable");
});

test("chat page: the ordinary send, Go deeper and Dynamics openings all read refusals through readChatRefusal", () => {
  const src = page();
  const send = src.slice(src.indexOf("const sendMessage = async"), src.indexOf("// Takes a message without an answer"));
  const c = send.slice(send.indexOf("} catch (err) {"));
  assert.ok(c.includes("const refusal = readChatRefusal(err);"));
  // Generic failures: a translated note, no raw detail.
  assert.ok(c.includes("content: t(refusal.noteKey)"));
  assert.ok(c.includes("setMessages((prev) => [...prev, errMsg])"));
  assert.ok(c.includes("if (refusal.paywall) {"));
  assert.ok(!/err\.status === 403\) \{\s*router\.replace\("\/subscribe"\)/.test(c));
  assert.ok(src.includes("note: t(readChatRefusal(err).noteKey),"));
  // No card is read from a refusal any more.
  for (const gone of ["refusalSupport", "supportFromRefusal", "support_card", "CrisisCard", "crisis_card"]) {
    assert.ok(!src.includes(gone), gone);
  }
  assert.ok(!src.includes("?.support)"));
  assert.ok(!src.includes("detail?.support_text"));
});

test("copy: the new note exists in English and Spanish, without long dashes", () => {
  const en = JSON.parse(fs.readFileSync(path.join(root, "messages/en.json"), "utf8")).chat.error_refused;
  const es = JSON.parse(fs.readFileSync(path.join(root, "messages/es.json"), "utf8")).chat.error_refused;
  assert.ok(en && es && en !== es);
  assert.ok(!/—/.test(en + es));
});
