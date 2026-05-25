#!/usr/bin/env node
// Drift test - INSTRUCTIONS + descriptions tooli spojne z kodem.
//
// Cherry-pick wzorca z dograh v1.31.0 (BSD-2). Fail jesli:
//   1. INSTRUCTIONS wymienia tool name ktorego nie ma w TOOLS array
//   2. errorResult(..., "<code>") uzywa kodu ktorego nie ma w description
//      odpowiedniego handle*  (drift po dodaniu nowego ErrorCode)
//   3. ErrorCode w typie TS nie jest udokumentowany w INSTRUCTIONS sekcji
//      "Iteracja po bledach"
//
// Run: npm run drift  (dodaj do package.json scripts)
// Lub: node test/drift.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(__dirname, "..", "src", "index.ts"), "utf-8");

const failures = [];

// -----------------------------------------------------------------------------
// 1. Tool names w INSTRUCTIONS musza istniec w TOOLS array
// -----------------------------------------------------------------------------

const instructionsMatch = SRC.match(/const INSTRUCTIONS = `([\s\S]*?)`;/);
if (!instructionsMatch) {
    failures.push("Nie znaleziono const INSTRUCTIONS w src/index.ts");
} else {
    const instructions = instructionsMatch[1];

    const toolsMatches = [...SRC.matchAll(/name:\s*"(eu_\w+)"/g)];
    const registered = new Set(toolsMatches.map((m) => m[1]));

    // Tool names w INSTRUCTIONS - w backticks `eu_xxx`
    const referenced = new Set();
    for (const m of instructions.matchAll(/`(eu_\w+)`/g)) {
        referenced.add(m[1]);
    }

    for (const ref of referenced) {
        if (!registered.has(ref)) {
            failures.push(
                `INSTRUCTIONS referencuje tool '${ref}' ktorego nie ma w TOOLS. ` +
                    `Registered: ${[...registered].sort().join(", ")}`,
            );
        }
    }
}

// -----------------------------------------------------------------------------
// 2. ErrorCode w typie TS musi byc udokumentowany w INSTRUCTIONS
// -----------------------------------------------------------------------------

const typeMatch = SRC.match(/type ErrorCode\s*=\s*([^;]+);/);
if (!typeMatch) {
    failures.push("Nie znaleziono type ErrorCode w src/index.ts");
} else {
    const codesInType = new Set();
    for (const m of typeMatch[1].matchAll(/"(\w+)"/g)) {
        codesInType.add(m[1]);
    }

    const instructionsText = instructionsMatch ? instructionsMatch[1] : "";
    for (const code of codesInType) {
        // Code w INSTRUCTIONS - jako standalone word (z lub bez backtick,
        // bo TS template literal czesto eskapuje backticki przez `\\\``).
        const docPattern = new RegExp("\\b" + code + "\\b");
        if (!docPattern.test(instructionsText)) {
            failures.push(
                `ErrorCode '${code}' w typie TS nie jest udokumentowany w ` +
                    `INSTRUCTIONS sekcji "Iteracja po bledach". Dodaj wpis.`,
            );
        }
    }

    // 3. Sprawdz tez ze kazdy errorResult(..., "code") uzywa istniejacego ErrorCode
    for (const m of SRC.matchAll(/errorResult\([^,)]+,\s*"(\w+)"\)/g)) {
        if (!codesInType.has(m[1])) {
            failures.push(
                `errorResult uzywa kodu '${m[1]}' ktorego NIE ma w typie ErrorCode. ` +
                    `Dodaj do typu lub uzyj istniejacego.`,
            );
        }
    }
}

// -----------------------------------------------------------------------------
// Report
// -----------------------------------------------------------------------------

if (failures.length === 0) {
    console.log("OK drift - INSTRUCTIONS i ErrorCode spojne z TOOLS i kodem.");
    process.exit(0);
}

console.error("FAIL drift - znaleziono " + failures.length + " problemow:");
for (const f of failures) {
    console.error("  - " + f);
}
process.exit(1);
