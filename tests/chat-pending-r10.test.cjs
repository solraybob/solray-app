// Round ten (review7 out7-7 #6, out7-5 #2): a message whose /chat outcome
// is not known yet is never uploaded to the transcript, and one the server
// refused (too long) never at all. (The voice crisis card tests of this
// round went with the crisis cards in round twenty-six.)
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { installBrowser, load } = require("./helpers.cjs");

installBrowser();
const root = path.join(__dirname, "..");
const page = () => fs.readFileSync(path.join(root, "app/chat/page.tsx"), "utf8");
const session = load("lib/account-session.js");
const sync = load("lib/chat-sync.js");

test("chat page: transcription sends the conversation it was spoken in", () => {
  assert.ok(page().includes('form.append("session_id", spokenIn)'));
});

/** A merging /chat/sessions server, recording what each PUT carried. */
function server() {
  const sessions = new Map();
  const puts = [];
  global.fetch = async (url, init = {}) => {
    const method = (init.method || "GET").toUpperCase();
    const u = new URL(url);
    const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
    const id = decodeURIComponent(u.pathname.split("/").pop());
    if (method === "GET") return sessions.has(id) ? json(200, sessions.get(id)) : json(404, {});
    if (method === "PUT") {
      const body = JSON.parse(init.body);
      puts.push(body.messages.map((x) => x.id));
      const cur = sessions.get(id);
      const known = new Set((cur?.messages || []).map((x) => x.id));
      const messages = [...(cur?.messages || []), ...body.messages.filter((x) => !known.has(x.id))];
      const rev = (cur?.revision || 0) + 1;
      sessions.set(id, { session_id: id, messages, revision: rev, last_message_at: "t" + rev });
      return json(200, { session_id: id, messages, revision: rev, last_message_at: "t" + rev });
    }
    return json(405, {});
  };
  return { sessions, puts };
}

const msg = (id, ts, content = `msg ${id}`) => ({ id, role: "user", content, timestamp: `2026-10-08T10:0${ts}:00Z` });

test("sync: a pending message is not uploaded until its outcome is known", async () => {
  const srv = server();
  sync.noteNewSession("p1");
  sync.saveSession({ sessionId: "p1", date: "", messages: [msg("1", 1), msg("2", 2)] });
  sync.markMessagePending("2");
  assert.equal(await sync.pushSessionToServer(sync.loadSession("p1"), "tok", session.getAuthGeneration()), true);
  assert.deepEqual(srv.puts.at(-1), ["1"]);
  assert.deepEqual(srv.sessions.get("p1").messages.map((x) => x.id), ["1"]);
  // Still local, and still owed to the server.
  assert.deepEqual(sync.loadSession("p1").messages.map((x) => x.id), ["1", "2"]);
  assert.equal(sync.getUnsent().has("p1"), true);
  // Answered: it goes up with the next upload.
  sync.settleMessage("2");
  assert.equal(await sync.pushSessionToServer(sync.loadSession("p1"), "tok", session.getAuthGeneration()), true);
  assert.deepEqual(srv.sessions.get("p1").messages.map((x) => x.id), ["1", "2"]);
  assert.equal(sync.getUnsent().has("p1"), false);
});

test("sync: a refused oversized message never reaches the server, so it can never come back", async () => {
  const srv = server();
  sync.noteNewSession("p2");
  const long = "word ".repeat(1200);
  sync.saveSession({ sessionId: "p2", date: "", messages: [msg("1", 1), msg("big", 2, long)] });
  sync.markMessagePending("big");
  // The persistence effect uploads while /chat is still reading it.
  assert.equal(await sync.pushSessionToServer(sync.loadSession("p2"), "tok", session.getAuthGeneration()), true);
  // 413: refused. The page removes it from the thread and puts the words
  // back in the composer; an upload of a stale copy still holding it, made
  // after that, leaves it out too.
  sync.settleMessage("big", true);
  sync.settleMessage("big");
  assert.equal(await sync.pushSessionToServer(sync.loadSession("p2"), "tok", session.getAuthGeneration()), true);
  sync.saveSession({ sessionId: "p2", date: "", messages: [msg("1", 1), msg("short", 3)] });
  assert.equal(await sync.pushSessionToServer(sync.loadSession("p2"), "tok", session.getAuthGeneration()), true);
  for (const ids of srv.puts) assert.ok(!ids.includes("big"));
  assert.deepEqual(srv.sessions.get("p2").messages.map((x) => x.id), ["1", "short"]);
  assert.deepEqual(sync.loadSession("p2").messages.map((x) => x.id), ["1", "short"]);
});

test("chat page: every sent message is pending until /chat settles; a too-long one is refused", () => {
  const src = page();
  const send = src.slice(src.indexOf("const sendMessage = async"), src.indexOf("// Takes a message without an answer"));
  // Round fifteen: the shared send lifecycle (lib/chat-sync beginSend).
  assert.ok(send.indexOf("const life = beginSend(userMsg.id)") < send.indexOf("setMessages(updatedMessages)"));
  const tooLong = send.slice(send.indexOf("err.code === MESSAGE_TOO_LONG_CODE"));
  assert.ok(tooLong.indexOf("life.refused()") < tooLong.indexOf("prev.filter((m) => m.id !== userMsg.id)"));
  const fin = send.slice(send.lastIndexOf("} finally {"));
  assert.ok(fin.includes("life.finish("));
});

test("chat page: a partner refusal in an ordinary conversation opens an empty fresh one", () => {
  const src = page();
  const i = src.indexOf("if (isPartnerConsentRefusal(err))");
  const block = src.slice(i, src.indexOf("const known = oracleErrorKey(err)", i));
  assert.ok(block.includes("persistSession({ sessionId: freshId, date: todayLabel(), messages: [] });"));
  assert.ok(block.includes("setMessages([]);"));
  assert.ok(block.includes("setInput((prev) => (prev.trim() ? `${text}\\n\\n${prev}` : text));"));
});
