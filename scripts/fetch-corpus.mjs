// Pobiera korpus EUR-Lex (regulations.db) z repo Ansvar-Systems/EU_compliance_MCP
// (Apache-2.0). Korpus nie jest trzymany w tym repo - jest artefaktem upstream.
// Tekst regulacji UE jest reuzywalny (EUR-Lex, Decyzja 2011/833/EU).
//
// Uzycie: node scripts/fetch-corpus.mjs
import { mkdir, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import * as path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, "..", "data");
const dest = path.join(dataDir, "regulations.db");
const URL =
    "https://raw.githubusercontent.com/Ansvar-Systems/EU_compliance_MCP/HEAD/data/regulations.db";

await mkdir(dataDir, { recursive: true });

try {
    const s = await stat(dest);
    if (s.size > 1_000_000) {
        console.log(`Korpus juz istnieje (${(s.size / 1e6).toFixed(1)} MB): ${dest}`);
        console.log("Usun plik, by pobrac ponownie.");
        process.exit(0);
    }
} catch {
    // brak pliku - pobieramy
}

console.log("Pobieram korpus EUR-Lex z Ansvar (Apache-2.0)...");
const res = await fetch(URL);
if (!res.ok || !res.body) {
    console.error(`Blad pobierania: HTTP ${res.status}`);
    process.exit(1);
}
await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
const s = await stat(dest);
console.log(`Gotowe: ${dest} (${(s.size / 1e6).toFixed(1)} MB)`);
console.log("Atrybucja: korpus (c) Ansvar Systems, Apache-2.0; tresc EUR-Lex (UE).");
