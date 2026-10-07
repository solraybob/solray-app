// Static checks on source and copy: B8 body graph map, B4/A5 copy parity,
// house rules (no em dash, no emoji in the new copy).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

test("B8: every gate sits on its canonical centre (backend human_design.CENTRES)", () => {
  const src = fs.readFileSync(path.join(root, "components/BodyGraph.tsx"), "utf8");
  const body = src.match(/const GATE_TO_CENTER[^{]*\{([\s\S]*?)\n\};/)[1];
  const map = {};
  for (const m of body.matchAll(/(\d+):\s*"(\w+)"/g)) map[m[1]] = m[2];
  const CENTRES = {
    Head: [63, 64, 61], Ajna: [47, 24, 4, 11, 17, 43],
    Throat: [16, 20, 31, 33, 35, 45, 12, 8, 23, 56, 62],
    G: [1, 2, 7, 10, 13, 15, 25, 46], Heart: [51, 21, 40, 26],
    Sacral: [34, 5, 14, 29, 59, 9, 3, 42, 27], SolarPlexus: [36, 22, 37, 49, 55, 30, 6],
    Spleen: [48, 57, 44, 50, 32, 28, 18], Root: [53, 60, 52, 19, 39, 41, 58, 38, 54],
  };
  let n = 0;
  for (const [c, gates] of Object.entries(CENTRES)) for (const g of gates) { assert.equal(map[g], c, `gate ${g}`); n++; }
  assert.equal(n, 64);
  for (const [a, b] of [[1, 8], [7, 31], [13, 33]]) assert.notEqual(map[a], map[b]);
});

function flat(o, p = "") {
  return Object.entries(o).reduce((acc, [k, v]) => (typeof v === "object" ? { ...acc, ...flat(v, p + k + ".") } : { ...acc, [p + k]: v }), {});
}

test("B4: English and Spanish have the same keys", () => {
  const en = flat(JSON.parse(fs.readFileSync(path.join(root, "messages/en.json"), "utf8")));
  const es = flat(JSON.parse(fs.readFileSync(path.join(root, "messages/es.json"), "utf8")));
  assert.deepEqual(Object.keys(en).filter((k) => !(k in es)), []);
  assert.deepEqual(Object.keys(es).filter((k) => !(k in en)), []);
});

test("A5: no copy says another person's birth data stays on the device", () => {
  for (const lang of ["en", "es"]) {
    const all = JSON.stringify(JSON.parse(fs.readFileSync(path.join(root, `messages/${lang}.json`), "utf8")));
    assert.ok(!/stays on your device|quedan en tu dispositivo/i.test(all), lang);
  }
});

test("house rules: no em dash in translations", () => {
  for (const lang of ["en", "es"]) {
    const all = fs.readFileSync(path.join(root, `messages/${lang}.json`), "utf8");
    assert.ok(!all.includes("—"), `${lang} has an em dash`);
  }
});

test("B6: the root redirect replaces history (no Android Back loop)", () => {
  const src = fs.readFileSync(path.join(root, "app/page.tsx"), "utf8");
  assert.ok(!/router\.push\(/.test(src));
  assert.ok(/router\.replace\("\/today"\)/.test(src));
});

test("A1: signup sends ai_consent and its version; A9: Collective starts unchecked", () => {
  const src = fs.readFileSync(path.join(root, "app/onboard/page.tsx"), "utf8");
  assert.match(src, /ai_consent: aiConsent,/);
  assert.match(src, /ai_consent_version: AI_CONSENT_VERSION,/);
  assert.match(src, /const \[hiveConsent, setHiveConsent\] = useState\(false\)/);
});

test("A18: account deletion sends the password", () => {
  const src = fs.readFileSync(path.join(root, "app/profile/settings/page.tsx"), "utf8");
  assert.match(src, /JSON\.stringify\(\{ confirm: "DELETE", password: deletePassword \}\)/);
});
