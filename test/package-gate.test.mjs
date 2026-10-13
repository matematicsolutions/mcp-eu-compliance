// Kontrola pozytywna bramki paczki: musi zatrzymac paczke bez pliku runtime.
// Run: npm run test:package-gate (wymaga npm run build)

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { wymagane, sprawdzPaczke, plikiZPack } from "./package-gate.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));

test("wymagane: package.json + punkt wejscia z bin/main", () => {
  const w = wymagane(ROOT, pkg);
  assert.ok(w.has("package.json"));
  assert.ok([...w].some((p) => p.startsWith("dist/") && p.endsWith(".js")), [...w].join(", "));
});

test("paczka bez punktu wejscia -> BLOKADA z nazwa pliku", () => {
  const w = wymagane(ROOT, pkg);
  const wejscie = [...w].find((p) => p.startsWith("dist/"));
  const r = sprawdzPaczke([...w].filter((p) => p !== wejscie), w);
  assert.equal(r.status, "BLOKADA");
  assert.ok(r.powody.some((p) => p.includes(wejscie)));
});

test("pusta lista plikow paczki = BLOKADA, nie sukces", () => {
  assert.equal(sprawdzPaczke([], wymagane(ROOT, pkg)).status, "BLOKADA");
});

test("kompletna paczka = OK", () => {
  const w = wymagane(ROOT, pkg);
  assert.deepEqual(sprawdzPaczke([...w, "README.md"], w), { status: "OK", powody: [] });
});

// npm 12 zmienil format `npm pack --json` (obiekt zamiast tablicy) - 2026-10-13 bramka dostala
// pusta liste na runnerze z npm@latest i zablokowala wydanie. Oba ksztalty musza dzialac.
test("plikiZPack: format npm <= 11 (tablica)", () => {
  assert.deepEqual(plikiZPack([{ files: [{ path: "dist/index.js" }, { path: "package.json" }] }]), ["dist/index.js", "package.json"]);
});

test("plikiZPack: format npm 12 (obiekt kluczowany nazwa paczki)", () => {
  const npm12 = { "@matematicsolutions/x": { name: "@matematicsolutions/x", files: [{ path: "dist/index.js" }, { path: "package.json" }] } };
  assert.deepEqual(plikiZPack(npm12), ["dist/index.js", "package.json"]);
});

test("plikiZPack: nieznany ksztalt -> pusta lista (czyli BLOKADA w sprawdzPaczke)", () => {
  assert.deepEqual(plikiZPack(null), []);
  assert.deepEqual(plikiZPack("x"), []);
});
