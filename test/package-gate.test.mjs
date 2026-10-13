// Kontrola pozytywna bramki paczki: musi zatrzymac paczke bez pliku runtime.
// Run: npm run test:package-gate (wymaga npm run build)

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { wymagane, sprawdzPaczke } from "./package-gate.mjs";

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
