// The crisis card (backend ai/crisis_lines.py, app components/CrisisCard.tsx):
// payload contract, safe links only, and how the chat thread shows it.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { installBrowser, load } = require("./helpers.cjs");

installBrowser();
const root = path.join(__dirname, "..");

// A real payload as the backend builds it: build_card("es", "ES", "urgent").
const URGENT_ES = {"variant": "urgent", "language": "es", "country": "ES", "intro": "Me alegra mucho que me lo hayas dicho. Ahora mismo lo más importante es que estés a salvo.", "emergency": {"number": "112", "text": "Por favor, llama ahora al 112 o ve a urgencias del hospital más cercano.", "href": "tel:112", "label": "Llamar al 112"}, "steps": ["Si puedes, aléjate de cualquier cosa con la que podrías hacerte daño y no te quedes a solas. Dile a alguien cercano lo que está pasando."], "primary_title": "También puedes hablar con alguien ahora mismo:", "primary": {"country": "ES", "name": "España", "service": "Línea 024", "emergency": "112", "lines": [{"type": "call", "value": "024", "href": "tel:024", "label": "Llamar al 024"}, {"type": "chat", "value": "https://www2.cruzroja.es/web/cruzroja/chat-linea024", "href": "https://www2.cruzroja.es/web/cruzroja/chat-linea024", "label": "Chat en línea"}]}, "others_title": "Si estás en otro lugar:", "others": [{"country": "IS", "name": "Islandia", "service": "Hjálparsími Rauða krossins 1717", "emergency": "112", "lines": [{"type": "call", "value": "1717", "href": "tel:1717", "label": "Llamar al 1717"}, {"type": "chat", "value": "https://www.1717.is", "href": "https://www.1717.is", "label": "Chat en línea"}]}, {"country": "US", "name": "Estados Unidos", "service": "988 Suicide & Crisis Lifeline", "emergency": "911", "lines": [{"type": "call", "value": "988", "href": "tel:988", "label": "Llamar al 988"}, {"type": "text", "value": "988", "href": "sms:988", "label": "Escribir al 988"}, {"type": "chat", "value": "https://chat.988lifeline.org/", "href": "https://chat.988lifeline.org/", "label": "Chat en línea"}]}, {"country": "GB", "name": "Reino Unido", "service": "Samaritans", "emergency": "999", "lines": [{"type": "call", "value": "116 123", "href": "tel:116123", "label": "Llamar al 116 123"}, {"type": "text", "value": "85258", "service": "Shout", "href": "sms:85258?&body=SHOUT", "label": "Escribe SHOUT al 85258", "keyword": "SHOUT"}]}, {"country": "IE", "name": "Irlanda", "service": "Samaritans", "emergency": "112", "lines": [{"type": "call", "value": "116 123", "href": "tel:116123", "label": "Llamar al 116 123"}, {"type": "text", "value": "50808", "service": "50808", "href": "sms:50808?&body=HELLO", "label": "Escribe HELLO al 50808", "keyword": "HELLO"}]}, {"country": "CA", "name": "Canadá", "service": "9-8-8 Suicide Crisis Helpline", "emergency": "911", "lines": [{"type": "call", "value": "988", "href": "tel:988", "label": "Llamar al 988"}, {"type": "text", "value": "988", "href": "sms:988", "label": "Escribir al 988"}]}, {"country": "AU", "name": "Australia", "service": "Lifeline", "emergency": "000", "lines": [{"type": "call", "value": "13 11 14", "href": "tel:131114", "label": "Llamar al 13 11 14"}, {"type": "text", "value": "0477 13 11 14", "href": "sms:0477131114", "label": "Escribir al 0477 13 11 14"}]}, {"country": "MX", "name": "México", "service": "Línea de la Vida", "emergency": "911", "lines": [{"type": "call", "value": "800 911 2000", "href": "tel:8009112000", "label": "Llamar al 800 911 2000"}]}], "findahelpline": {"text": "findahelpline.com reúne líneas de ayuda gratuitas de más de 175 países.", "href": "https://findahelpline.com", "label": "findahelpline.com"}, "closing": "Sigo aquí contigo."};

test("crisis card: a server payload is recognised, anything else is not", () => {
  const { asCrisisCard } = load("lib/crisis-card.js");
  const card = asCrisisCard(URGENT_ES);
  assert.ok(card);
  assert.equal(card.variant, "urgent");
  assert.equal(card.primary.country, "ES");
  assert.equal(card.emergency.href, "tel:112");
  assert.deepEqual(card.primary.lines[0], { type: "call", value: "024", href: "tel:024", label: "Llamar al 024" });
  for (const bad of [null, undefined, "text", 42, {}, { intro: "x" }, { intro: "x", variant: "loud" }]) {
    assert.equal(asCrisisCard(bad), null);
  }
  assert.ok(asCrisisCard({ intro: "x", variant: "support" }));
});

test("crisis card: only tel:, sms: and https: links are ever drawn", () => {
  const { SAFE_HREF } = load("lib/crisis-card.js");
  for (const ok of ["tel:024", "sms:85258?&body=SHOUT", "https://findahelpline.com"]) assert.ok(SAFE_HREF.test(ok), ok);
  for (const bad of ["javascript:alert(1)", "http://x.test", "data:text/html,hi", "//evil.test", "file:///etc"]) {
    assert.ok(!SAFE_HREF.test(bad), bad);
  }
  const src = fs.readFileSync(path.join(root, "components/CrisisCard.tsx"), "utf8");
  // Every anchor in the card is guarded by SAFE_HREF.
  assert.ok((src.match(/SAFE_HREF\.test\(/g) || []).length >= 3);
});

test("crisis card: the thread draws it as a card, never typed out or offered as 'this landed'", () => {
  const src = fs.readFileSync(path.join(root, "app/chat/page.tsx"), "utf8");
  assert.match(src, /asCrisisCard\(data\.crisis_card\) \|\| asCrisisCard\(data\.support_card\)/);
  // The card branch returns before the streaming effect starts.
  const i = src.indexOf("const card = asCrisisCard(data.crisis_card)");
  const j = src.indexOf("setStreamingId(reply.id)");
  assert.ok(i > 0 && j > i);
  assert.ok(src.slice(i, j).includes("return;"));
  assert.ok(!src.slice(i, src.indexOf("const reply: Message", i)).includes("setStreamingId"));
  assert.match(src, /if \(msg\.crisis\) \{\s*return <CrisisCard key=\{msg\.id\} card=\{msg\.crisis\} \/>;/);
  // The support card that comes with a consent refusal goes in the thread.
  // (Round sixteen: read for every refusal by lib/chat-outcome readChatRefusal.)
  assert.match(src, /if \(refusalSupport\) setMessages\(\(prev\) => \[\.\.\.prev, refusalSupport\]\)/);
});

test("crisis card: chrome strings exist in English and Spanish, plain copy", () => {
  for (const lang of ["en", "es"]) {
    const chat = JSON.parse(fs.readFileSync(path.join(root, `messages/${lang}.json`), "utf8")).chat;
    for (const k of ["crisis_label", "crisis_show", "crisis_hide"]) {
      assert.ok(chat[k], `${lang} chat.${k}`);
      assert.ok(!/[\u2014\u2013]/.test(chat[k]));
    }
  }
  const all = JSON.stringify(URGENT_ES);
  assert.ok(!/[\u2014\u2013]/.test(all));
  assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(all));
});
