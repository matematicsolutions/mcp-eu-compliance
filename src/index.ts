#!/usr/bin/env node
// MCP server - offline EU compliance corpus.
//
// Pelnotekstowy korpus regulacji UE (EUR-Lex) w lokalnym SQLite FTS5.
// Verbatim, zero-LLM w sciezce retrievalu - snippety sa zwracane bez zmian
// z bazy, kazdy z identyfikatorem CELEX i URL do EUR-Lex.
//
// Zakres v1 (ADR-0022 PATRON): 6 regulacji - GDPR, AI Act, DORA, NIS2,
// eIDAS 2.0, CRA. Korpus pochodzi z Ansvar-Systems/EU_compliance_MCP
// (Apache-2.0); tekst regulacji UE jest reuzywalny (EUR-Lex, Decyzja
// 2011/833/EU). Patrz THIRD_PARTY_INSPIRATIONS.md.
//
// Tooly:
//   - eu_search              - FTS5 po tresci artykulow (snippet verbatim)
//   - eu_article             - pelny tekst artykulu po regulacji + numerze
//   - eu_compare             - to samo zagadnienie w kilku regulacjach naraz
//   - eu_check_applicability - ktore regulacje dotycza danego sektora
//   - eu_evidence            - artefakty dowodowe (audit) per regulacja
//
// structuredContent.citations:
//   { regulation, full_name, celex_id, eur_lex_url, article_number?, snapshot }
//
// Komplementarny do mcp-eu-sparql (live SPARQL EUR-Lex/CJEU): tamten odkrywa
// akty na zywo, ten daje verbatim tekst + analize compliance offline.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { DatabaseSync } from "node:sqlite";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Konfiguracja / baza
// ---------------------------------------------------------------------------

// Zakres v1 - 6 regulacji pod ICP MateMatic (ADR-0022). Kazde zapytanie jest
// twardo filtrowane do tego zbioru, niezaleznie od tego co jest w bazie.
const SIX = ["GDPR", "AI_ACT", "DORA", "NIS2", "EIDAS2", "CRA"] as const;
type RegId = (typeof SIX)[number];
const SIX_SET = new Set<string>(SIX);

// Korpus EUR-Lex (~54 MB) NIE jest bundlowany w paczce npm (za duzy). Pobierany
// JEDNORAZOWO przy pierwszym uruchomieniu z naszego GitHub release (stabilny URL,
// kontrolowany przez nas), weryfikowany sha256, cache'owany w katalogu uzytkownika.
// To bootstrap korpusu, nie wywolanie per-query - sciezka ZAPYTAN pozostaje offline,
// verbatim, zero-LLM (zgodnie z AGENTS.md). Air-gap / pelny offline: ustaw
// EU_COMPLIANCE_DB na lokalna kopie regulations.db -> zero wywolan sieciowych.
const CORPUS_URL =
    "https://github.com/matematicsolutions/mcp-eu-compliance/releases/download/corpus-v1/regulations.db";
const CORPUS_SHA256 =
    "64e74af9e8f27cbe829bd61682ca739eec17ca10237ef526179277cc119bf1e4";
const BUNDLED_DB = path.join(__dirname, "..", "data", "regulations.db");
const CACHE_DB = path.join(
    os.homedir(),
    ".matematic",
    "cache",
    "eu-compliance",
    "regulations.db",
);

let DB_PATH = "";

function sha256File(p: string): string {
    return createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

// Rozwiazuje sciezke korpusu i pobiera go raz, jesli trzeba. Kolejnosc:
//   1. EU_COMPLIANCE_DB (jawny override - air-gap, musi istniec)
//   2. data/regulations.db w repo (tryb dev po `npm run fetch-corpus`)
//   3. cache uzytkownika (pobierz raz z release, sprawdz sha256)
async function ensureCorpus(): Promise<void> {
    const override = process.env.EU_COMPLIANCE_DB;
    if (override) {
        if (!fs.existsSync(override)) {
            throw new Error(`EU_COMPLIANCE_DB wskazuje nieistniejacy plik: ${override}`);
        }
        DB_PATH = override;
        return;
    }
    if (fs.existsSync(BUNDLED_DB) && fs.statSync(BUNDLED_DB).size > 1_000_000) {
        DB_PATH = BUNDLED_DB;
        return;
    }
    if (fs.existsSync(CACHE_DB) && fs.statSync(CACHE_DB).size > 1_000_000) {
        DB_PATH = CACHE_DB;
        return;
    }
    fs.mkdirSync(path.dirname(CACHE_DB), { recursive: true });
    process.stderr.write(`Pobieram korpus EU (~54 MB) raz do ${CACHE_DB} ...\n`);
    const res = await fetch(CORPUS_URL);
    if (!res.ok) throw new Error(`Blad pobierania korpusu: HTTP ${res.status}`);
    const tmp = `${CACHE_DB}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
    const got = sha256File(tmp);
    if (got !== CORPUS_SHA256) {
        fs.rmSync(tmp, { force: true });
        throw new Error(`Niezgodny sha256 korpusu (oczekiwano ${CORPUS_SHA256}, jest ${got})`);
    }
    fs.renameSync(tmp, CACHE_DB);
    DB_PATH = CACHE_DB;
    process.stderr.write("Korpus gotowy (sha256 OK).\n");
}

let dbHandle: DatabaseSync | null = null;
function db(): DatabaseSync {
    if (!dbHandle) {
        dbHandle = new DatabaseSync(DB_PATH, { readOnly: true });
    }
    return dbHandle;
}

let snapshotInfo = "";
function snapshot(): string {
    if (snapshotInfo) return snapshotInfo;
    try {
        const row = db()
            .prepare("SELECT value FROM db_metadata WHERE key = 'built_at'")
            .get() as { value?: string } | undefined;
        snapshotInfo = row?.value ? row.value.slice(0, 10) : "nieznana";
    } catch {
        snapshotInfo = "nieznana";
    }
    return snapshotInfo;
}

// Disclaimer dolaczany do kazdej odpowiedzi (Art. 2 Konstytucji + ADR-0005):
// to snapshot, nie zrodlo autentyczne; weryfikacja w EUR-Lex.
function disclaimer(): string {
    return (
        `\n---\n` +
        `Zrodlo: korpus EUR-Lex, snapshot z ${snapshot()}. ` +
        `Tekst zwracany verbatim z bazy (bez przetwarzania modelem). ` +
        `Wersja autentyczna = Dziennik Urzedowy UE; sprawdz aktualnosc w EUR-Lex (CELEX). ` +
        `To material referencyjny, nie porada prawna.`
    );
}

// ---------------------------------------------------------------------------
// Pomocnicze
// ---------------------------------------------------------------------------

interface RegRow {
    id: string;
    full_name: string;
    celex_id: string | null;
    eur_lex_url: string | null;
}

// Pelne nazwy fallback (gdy korpus nie poda source_full_name). Korpus Ansvar
// trzyma nazwe per-provision w tabeli `content`, ale dla pewnosci cytowania
// mamy tu kanoniczne nazwy 6 regulacji ICP.
const FULL_NAMES: Record<string, string> = {
    GDPR: "General Data Protection Regulation",
    AI_ACT: "Artificial Intelligence Act",
    DORA: "Digital Operational Resilience Act",
    NIS2: "Directive (EU) 2022/2555 (NIS2)",
    EIDAS2: "European Digital Identity Framework (eIDAS 2.0)",
    CRA: "Cyber Resilience Act",
};

// Regulacja-poziom URL EUR-Lex: bierzemy ELI z probki source_url (obcinajac
// fragment #art_N), z fallbackiem na CELEX gdy brak.
function regUrl(sampleUrl: string | null, celex: string | null): string | null {
    if (sampleUrl) {
        const h = sampleUrl.indexOf("#");
        return h >= 0 ? sampleUrl.slice(0, h) : sampleUrl;
    }
    return celex
        ? `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:${celex}`
        : null;
}

// canonical_ref ma postac "<REGULACJA>:art_<numer>" (np. "GDPR:art_33").
// Kazda regulacja ma tez wpis "<REGULACJA>:meta" (wykluczany z wynikow).
function refToReg(ref: string): string {
    const i = ref.indexOf(":");
    return i >= 0 ? ref.slice(0, i) : ref;
}
function refToArticle(ref: string): string {
    const i = ref.indexOf(":art_");
    return i >= 0 ? ref.slice(i + 5) : ref;
}

// Metadane regulacji w nowym schemacie Ansvar (3-chassis): celex z
// source_registry, pelna nazwa + bazowy URL z tabeli content (przez art_1).
const regCache = new Map<string, RegRow | null>();
function getReg(id: string): RegRow | null {
    if (regCache.has(id)) return regCache.get(id) ?? null;
    const row = db()
        .prepare(
            `SELECT sr.regulation AS id, sr.celex_id AS celex_id,
                    c.source_full_name AS full_name, c.source_url AS sample_url
             FROM source_registry sr
             LEFT JOIN provisions p ON p.canonical_ref = sr.regulation || ':art_1'
             LEFT JOIN content c ON c.id = p.id
             WHERE sr.regulation = ?`,
        )
        .get(id) as
        | { id: string; celex_id: string | null; full_name: string | null; sample_url: string | null }
        | undefined;
    if (!row) {
        regCache.set(id, null);
        return null;
    }
    const reg: RegRow = {
        id: row.id,
        full_name: row.full_name ?? FULL_NAMES[id] ?? id,
        celex_id: row.celex_id,
        eur_lex_url: regUrl(row.sample_url, row.celex_id),
    };
    regCache.set(id, reg);
    return reg;
}

// articleUrl (opcjonalnie) nadpisuje URL regulacji precyzyjnym linkiem do
// artykulu (content.source_url z fragmentem #art_N).
function buildCitation(reg: RegRow, articleNumber?: string, articleUrl?: string | null) {
    return {
        regulation: reg.id,
        full_name: reg.full_name,
        celex_id: reg.celex_id,
        eur_lex_url: articleUrl ?? reg.eur_lex_url,
        ...(articleNumber ? { article_number: articleNumber } : {}),
        snapshot: snapshot(),
    };
}

// Ogranicza liste regulacji z wejscia do dozwolonego zbioru SIX.
// Brak/puste -> wszystkie 6.
function resolveRegulations(input: unknown): RegId[] {
    if (!Array.isArray(input) || input.length === 0) return [...SIX];
    const out = input
        .map((x) => String(x).toUpperCase().trim())
        .filter((x): x is RegId => SIX_SET.has(x));
    return out.length > 0 ? out : [...SIX];
}

// Zamienia zapytanie uzytkownika na bezpieczny MATCH FTS5: kazdy term jako
// fraza w cudzyslowie, laczone operatorem OR. OR daje recall (artykul nie musi
// zawierac wszystkich slow), a bm25 (ORDER BY rank) ustawia najlepsze trafienia
// na gorze. Cudzyslowy chronia przed bledami skladni FTS5 (nawiasy, myslniki).
function toFtsMatch(query: string): string {
    const terms = query.match(/[\p{L}\p{N}]+/gu);
    if (!terms || terms.length === 0) return "";
    return terms.map((t) => `"${t}"`).join(" OR ");
}

// ---------------------------------------------------------------------------
// Instructions (procedural orchestration) - wstrzykiwane przez Server
// do system promptu klienta MCP. LLM widzi to PRZED pierwszym tool call.
// Drift test (test/drift.mjs) failuje jesli tool wymieniony tutaj nie jest
// w TOOLS, albo errorCode tooli nie jest w description.
// Pattern z dograh-hq/dograh v1.31.0 (BSD-2), zaadaptowany na MateMatic.
// ---------------------------------------------------------------------------

function buildInstructions(): string {
    return `Ten serwer MCP zwraca verbatim tekst regulacji UE z lokalnego korpusu SQLite FTS5. Zakres: GDPR, AI Act, DORA, NIS2, eIDAS 2.0, CRA (6 regulacji ICP MateMatic, ADR-0022 PATRON). Snapshot offline, zero-LLM w sciezce retrievalu - tresc grounding, nie generowana przez model.

## Kolejnosc wywolan

### Szukanie / browsing
1. \`eu_search\` - keyword/fraza po artykulach 6 regulacji. Snippety FTS5 (bm25 ranking) z markerami [ ]. Pierwszy krok gdy uzytkownik pyta o pojecie ("breach notification", "high-risk AI", "ICT third party").
2. \`eu_article\` - pelny tekst konkretnego artykulu raz wybranego (regulation+article_number). Preferuj nad rozumowaniem ze snippetow gdy uzytkownik prosi o przepis doslownie.
3. \`eu_compare\` - to samo zagadnienie w kilku regulacjach naraz. Uzyj gdy uzytkownik porownuje (np. zgloszenie incydentu DORA vs NIS2 vs CRA, definicje "data" w GDPR vs AI Act).

### Analiza compliance
4. \`eu_check_applicability\` - ktore z 6 regulacji dotycza sektora (financial/healthcare/manufacturing/etc) i opcjonalnie podsektora. Zwraca poziom pewnosci i artykul-podstawe. **To wskazowka ekspercka, NIE wiazaca ocena prawna**.
5. \`eu_evidence\` - artefakty dowodowe (audit) wymagane przez konkretna regulacje/artykul. Co przygotowac dla audytora, retencja, pytania kontrolne.

## Twarde ograniczenia

- **Zakres twardy 6 regulacji** (GDPR, AI_ACT, DORA, NIS2, EIDAS2, CRA). Kazda inna nazwa = bledny argument. Baza (snapshot) zawiera ponad 100 regulacji (aktualnie 116, 2026-07-04; korpus rosnie), ale konektor wystawia tylko te 6.
- **Verbatim** - tekst zwracany bez przetwarzania modelem. NIE prosc o parafraze "lepszym jezykiem" - to grounding.
- **Snapshot, NIE zrodlo autentyczne**. Kazda odpowiedz konczy sie disclaimerem: wersja autentyczna = Dziennik Urzedowy UE. Sprawdz aktualnosc w EUR-Lex (CELEX). Swiezosc -> \`mcp-eu-sparql\` (live SPARQL).
- **structuredContent.citations** zawsze wypelnione - regulacja, CELEX, URL EUR-Lex, snapshot. Cytuj te citations w odpowiedzi koncowej.

## Iteracja po bledach

Tool zwraca \`isError: true\` + tekst opisujacy problem. Typowe kody bledow w tresci:
- \`out_of_scope\` - regulacja poza 6 ICP. Sprobuj inna z listy lub \`mcp-eu-sparql\` dla pelnego EUR-Lex.
- \`missing_arg\` - brakujacy wymagany parametr. Przeczytaj inputSchema tooli.
- \`empty_query\` - query po normalizacji nie zawiera szukanych slow. Zadaj uzytkownikowi doprecyzowanie.
- \`not_found\` - artykul/regulacja nie ma w snapshot. Uzyj \`eu_search\` zeby znalezc.
- \`corpus_error\` - blad dostepu do SQLite. Wewnetrzny, retry raz przed surface do uzytkownika.

## Styl odpowiedzi

- Cytuj artykuly w formacie "art. X RGOR" lub "[GDPR] art. 33" (krotka konwencja).
- Przy porownaniach (\`eu_compare\`) uzywaj tabel.
- Przy stosowalnosci (\`eu_check_applicability\`) ujawnij confidence (high/medium/low) i basis_article.
- Disclaimer snapshot zawsze pozostaje w odpowiedzi (nie wycinaj).`;
}

// ---------------------------------------------------------------------------
// Tooly
// ---------------------------------------------------------------------------

const READ_ONLY_ANNOTATIONS = {
    readOnlyHint: true,
    idempotentHint: true,
    destructiveHint: false,
    openWorldHint: false,
} as const;

const TOOLS = [
    {
        name: "eu_search",
        description:
            "Wyszukiwanie pelnotekstowe (FTS5) po tresci artykulow regulacji UE. Zwraca snippety verbatim z podswietleniem trafien. Zakres: GDPR, AI Act, DORA, NIS2, eIDAS 2.0, CRA. Bledy: `empty_query` (po normalizacji brak slow), `corpus_error` (blad SQLite).",
        annotations: READ_ONLY_ANNOTATIONS,
        inputSchema: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "Fraza w jezyku naturalnym, np. 'breach notification timeline'.",
                },
                regulations: {
                    type: "array",
                    items: { type: "string", enum: [...SIX] },
                    description: "Opcjonalny podzbior regulacji. Brak = wszystkie 6.",
                },
                limit: {
                    type: "number",
                    description: "Maks. liczba trafien (domyslnie 8, max 25).",
                },
            },
            required: ["query"],
        },
    },
    {
        name: "eu_article",
        description:
            "Pelny tekst artykulu (verbatim) po identyfikatorze regulacji i numerze artykulu, wraz z tytulem i rozdzialem. Bledy: `out_of_scope` (regulacja poza 6 ICP), `missing_arg` (brak article_number), `not_found` (artykul/regulacja nie ma w snapshot).",
        annotations: READ_ONLY_ANNOTATIONS,
        inputSchema: {
            type: "object",
            properties: {
                regulation: { type: "string", enum: [...SIX] },
                article_number: {
                    type: "string",
                    description: "Numer artykulu, np. '33' (GDPR), '6' (AI Act).",
                },
            },
            required: ["regulation", "article_number"],
        },
    },
    {
        name: "eu_compare",
        description:
            "Porownanie tego samego zagadnienia w kilku regulacjach naraz. Dla kazdej regulacji zwraca najlepiej pasujacy artykul (snippet verbatim). Np. obowiazek zgloszenia incydentu w DORA vs NIS2 vs CRA. Bledy: `empty_query`, `corpus_error`.",
        annotations: READ_ONLY_ANNOTATIONS,
        inputSchema: {
            type: "object",
            properties: {
                query: { type: "string", description: "Zagadnienie do porownania." },
                regulations: {
                    type: "array",
                    items: { type: "string", enum: [...SIX] },
                    description: "Regulacje do porownania (min. 2). Brak = wszystkie 6.",
                },
            },
            required: ["query"],
        },
    },
    {
        name: "eu_check_applicability",
        description:
            "Ktore z 6 regulacji UE dotycza danego sektora (i opcjonalnie podsektora). Zwraca reguly stosowalnosci z poziomem pewnosci i artykulem-podstawa. To wskazowka ekspercka, nie wiazaca ocena prawna. Bledy: `missing_arg` (brak sector), `corpus_error`.",
        annotations: READ_ONLY_ANNOTATIONS,
        inputSchema: {
            type: "object",
            properties: {
                sector: {
                    type: "string",
                    enum: [
                        "digital_infrastructure",
                        "energy",
                        "financial",
                        "healthcare",
                        "manufacturing",
                        "public_administration",
                        "transport",
                        "other",
                    ],
                },
                subsector: {
                    type: "string",
                    description: "Opcjonalny podsektor (np. 'bank', 'insurance').",
                },
            },
            required: ["sector"],
        },
    },
    {
        name: "eu_evidence",
        description:
            "Artefakty dowodowe (audit) wymagane przez regulacje - jaki dokument/log/certyfikat udowadnia zgodnosc, dla jakiego artykulu, z pytaniami audytora. Opcjonalnie zawezone do jednego artykulu. Bledy: `out_of_scope`, `corpus_error`.",
        annotations: READ_ONLY_ANNOTATIONS,
        inputSchema: {
            type: "object",
            properties: {
                regulation: { type: "string", enum: [...SIX] },
                article: {
                    type: "string",
                    description: "Opcjonalny numer artykulu do zawezenia.",
                },
            },
            required: ["regulation"],
        },
    },
];

type ToolResult = {
    content: { type: "text"; text: string }[];
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
};

// Strukturalne kody bledow widoczne dla LLM (drift test test/drift.mjs
// asercja: kazdy kod tu uzyty musi byc w description odpowiedniego tool +
// w sekcji "Iteracja po bledach" INSTRUCTIONS).
type ErrorCode =
    | "out_of_scope"
    | "missing_arg"
    | "empty_query"
    | "not_found"
    | "corpus_error";

function errorResult(text: string, code: ErrorCode): ToolResult {
    return {
        content: [{ type: "text", text: `[${code}] ${text}` }],
        structuredContent: { error_code: code },
        isError: true,
    };
}

// ----- eu_search -----------------------------------------------------------

function handleSearch(a: Record<string, unknown>): ToolResult {
    const query = String(a.query ?? "").trim();
    if (!query) return errorResult("Brak parametru 'query'.", "missing_arg");
    const match = toFtsMatch(query);
    if (!match) return errorResult("Zapytanie nie zawiera szukanych slow.", "empty_query");

    const regs = resolveRegulations(a.regulations);
    const limit = Math.min(Math.max(Number(a.limit) || 8, 1), 25);

    const regLikes = regs.map(() => "p.canonical_ref LIKE ?").join(" OR ");
    const rows = db()
        .prepare(
            `SELECT p.canonical_ref AS ref, p.title AS title,
                    snippet(content_fts, 0, '[', ']', ' ... ', 12) AS snip,
                    c.source_url AS url
             FROM content_fts f
             JOIN provisions p ON p.id = f.rowid
             JOIN content c ON c.id = p.id
             WHERE content_fts MATCH ?
               AND instr(p.canonical_ref, ':art_') > 0
               AND (${regLikes})
             ORDER BY rank
             LIMIT ?`,
        )
        .all(match, ...regs.map((r) => `${r}:%`), limit) as {
        ref: string;
        title: string | null;
        snip: string;
        url: string | null;
    }[];

    if (rows.length === 0) {
        return {
            content: [
                {
                    type: "text",
                    text: `Brak trafien dla "${query}" w zakresie: ${regs.join(", ")}.` + disclaimer(),
                },
            ],
            structuredContent: { citations: [] },
        };
    }

    const lines: string[] = [`Trafienia dla "${query}" (${rows.length}):`, ""];
    const citations: unknown[] = [];
    for (const r of rows) {
        const regId = refToReg(r.ref);
        const articleNumber = refToArticle(r.ref);
        const reg = getReg(regId);
        const ttl = r.title ? ` - ${r.title}` : "";
        lines.push(`[${regId}] art. ${articleNumber}${ttl}`);
        lines.push(`  ${r.snip.replace(/\s+/g, " ").trim()}`);
        lines.push("");
        if (reg) citations.push(buildCitation(reg, articleNumber, r.url));
    }
    return {
        content: [{ type: "text", text: lines.join("\n") + disclaimer() }],
        structuredContent: { citations },
    };
}

// ----- eu_article ----------------------------------------------------------

function handleArticle(a: Record<string, unknown>): ToolResult {
    const regulation = String(a.regulation ?? "").toUpperCase().trim();
    const articleNumber = String(a.article_number ?? "").trim();
    if (!SIX_SET.has(regulation)) {
        return errorResult(`Regulacja '${regulation}' poza zakresem v1 (${SIX.join(", ")}).`, "out_of_scope");
    }
    if (!articleNumber) return errorResult("Brak parametru 'article_number'.", "missing_arg");

    const row = db()
        .prepare(
            `SELECT p.canonical_ref AS ref, p.title AS title, p.body AS body,
                    c.source_url AS url
             FROM provisions p
             JOIN content c ON c.id = p.id
             WHERE p.canonical_ref = ?`,
        )
        .get(`${regulation}:art_${articleNumber}`) as
        | { ref: string; title: string | null; body: string; url: string | null }
        | undefined;

    if (!row) {
        return errorResult(
            `Nie znaleziono art. ${articleNumber} w ${regulation}. Sprawdz numer (eu_search pomoze znalezc).`,
            "not_found",
        );
    }

    const reg = getReg(regulation)!;
    const head = [
        `[${regulation}] Artykul ${articleNumber}`,
        row.title ? `Tytul: ${row.title}` : null,
        `CELEX: ${reg.celex_id ?? "-"}`,
    ]
        .filter((x): x is string => Boolean(x))
        .join("\n");

    return {
        content: [{ type: "text", text: head + "\n\n" + row.body + disclaimer() }],
        structuredContent: { citations: [buildCitation(reg, articleNumber, row.url)] },
    };
}

// ----- eu_compare ----------------------------------------------------------

function handleCompare(a: Record<string, unknown>): ToolResult {
    const query = String(a.query ?? "").trim();
    if (!query) return errorResult("Brak parametru 'query'.", "missing_arg");
    const match = toFtsMatch(query);
    if (!match) return errorResult("Zapytanie nie zawiera szukanych slow.", "empty_query");

    const regs = resolveRegulations(a.regulations);
    const lines: string[] = [`Porownanie "${query}" w regulacjach: ${regs.join(", ")}`, ""];
    const citations: unknown[] = [];

    const stmt = db().prepare(
        `SELECT p.canonical_ref AS ref, p.title AS title,
                snippet(content_fts, 0, '[', ']', ' ... ', 14) AS snip,
                c.source_url AS url
         FROM content_fts f
         JOIN provisions p ON p.id = f.rowid
         JOIN content c ON c.id = p.id
         WHERE content_fts MATCH ?
           AND instr(p.canonical_ref, ':art_') > 0
           AND p.canonical_ref LIKE ?
         ORDER BY rank
         LIMIT 1`,
    );

    for (const id of regs) {
        const row = stmt.get(match, `${id}:%`) as
            | { ref: string; title: string | null; snip: string; url: string | null }
            | undefined;
        const reg = getReg(id)!;
        if (!row) {
            lines.push(`[${id}] brak trafienia.`);
            lines.push("");
            continue;
        }
        const articleNumber = refToArticle(row.ref);
        const ttl = row.title ? ` - ${row.title}` : "";
        lines.push(`[${id}] art. ${articleNumber}${ttl}`);
        lines.push(`  ${row.snip.replace(/\s+/g, " ").trim()}`);
        lines.push("");
        citations.push(buildCitation(reg, articleNumber, row.url));
    }

    return {
        content: [{ type: "text", text: lines.join("\n") + disclaimer() }],
        structuredContent: { citations },
    };
}

// ----- eu_check_applicability ----------------------------------------------

function handleApplicability(a: Record<string, unknown>): ToolResult {
    const sector = String(a.sector ?? "").trim();
    if (!sector) return errorResult("Brak parametru 'sector'.", "missing_arg");
    const subsector = a.subsector ? String(a.subsector).trim() : null;
    const ph = SIX.map(() => "?").join(",");

    let sql =
        `SELECT regulation, sector, subsector, applies, confidence, basis_article, notes
         FROM applicability_rules
         WHERE regulation IN (${ph}) AND sector = ?`;
    const params: (string | number | null)[] = [...SIX, sector];
    if (subsector) {
        sql += " AND (subsector = ? OR subsector IS NULL)";
        params.push(subsector);
    }
    sql += " ORDER BY regulation, subsector";

    const rows = db().prepare(sql).all(...params) as {
        regulation: string;
        sector: string;
        subsector: string | null;
        applies: number;
        confidence: string | null;
        basis_article: string | null;
        notes: string | null;
    }[];

    if (rows.length === 0) {
        return {
            content: [
                {
                    type: "text",
                    text: `Brak regul stosowalnosci dla sektora '${sector}'${subsector ? ` / '${subsector}'` : ""} w zakresie 6 regulacji.` + disclaimer(),
                },
            ],
            structuredContent: { citations: [] },
        };
    }

    const lines: string[] = [
        `Stosowalnosc dla sektora '${sector}'${subsector ? ` / '${subsector}'` : ""}:`,
        "",
    ];
    const citations: unknown[] = [];
    const seen = new Set<string>();
    for (const r of rows) {
        const verdict = r.applies ? "DOTYCZY" : "nie dotyczy";
        const sub = r.subsector ? ` (${r.subsector})` : "";
        lines.push(`[${r.regulation}]${sub}: ${verdict} - pewnosc: ${r.confidence ?? "?"}` + (r.basis_article ? `, podstawa art. ${r.basis_article}` : ""));
        if (r.notes) lines.push(`  ${r.notes}`);
        lines.push("");
        if (!seen.has(r.regulation)) {
            const reg = getReg(r.regulation);
            if (reg) citations.push(buildCitation(reg, r.basis_article ?? undefined));
            seen.add(r.regulation);
        }
    }
    lines.push("Uwaga: reguly stosowalnosci to wskazowka ekspercka (pole pewnosci), nie wiazaca ocena prawna. Polskie realia sektorowe moga wymagac wlasnej analizy.");

    return {
        content: [{ type: "text", text: lines.join("\n") + disclaimer() }],
        structuredContent: { citations },
    };
}

// ----- eu_evidence ---------------------------------------------------------

function handleEvidence(a: Record<string, unknown>): ToolResult {
    const regulation = String(a.regulation ?? "").toUpperCase().trim();
    if (!SIX_SET.has(regulation)) {
        return errorResult(`Regulacja '${regulation}' poza zakresem v1 (${SIX.join(", ")}).`, "out_of_scope");
    }
    const article = a.article ? String(a.article).trim() : null;

    let sql =
        `SELECT article, requirement_summary, evidence_type, artifact_name,
                description, retention_period, auditor_questions
         FROM evidence_requirements WHERE regulation = ?`;
    const params: (string | number | null)[] = [regulation];
    if (article) {
        sql += " AND article = ?";
        params.push(article);
    }
    sql += " ORDER BY CAST(article AS INTEGER), article LIMIT 50";

    const rows = db().prepare(sql).all(...params) as {
        article: string;
        requirement_summary: string;
        evidence_type: string;
        artifact_name: string;
        description: string | null;
        retention_period: string | null;
        auditor_questions: string | null;
    }[];

    if (rows.length === 0) {
        return {
            content: [
                {
                    type: "text",
                    text: `Brak artefaktow dowodowych dla ${regulation}${article ? ` art. ${article}` : ""}.` + disclaimer(),
                },
            ],
            structuredContent: { citations: [] },
        };
    }

    const reg = getReg(regulation)!;
    const lines: string[] = [`Artefakty dowodowe - ${regulation}${article ? ` art. ${article}` : ""} (${rows.length}):`, ""];
    for (const r of rows) {
        lines.push(`art. ${r.article} [${r.evidence_type}] ${r.artifact_name}`);
        lines.push(`  Wymog: ${r.requirement_summary}`);
        if (r.description) lines.push(`  Opis: ${r.description}`);
        if (r.retention_period) lines.push(`  Retencja: ${r.retention_period}`);
        if (r.auditor_questions) lines.push(`  Pytania audytora: ${r.auditor_questions}`);
        lines.push("");
    }

    return {
        content: [{ type: "text", text: lines.join("\n") + disclaimer() }],
        structuredContent: { citations: [buildCitation(reg, article ?? undefined)] },
    };
}

// ---------------------------------------------------------------------------
// Serwer
// ---------------------------------------------------------------------------

const server = new Server(
    { name: "mcp-eu-compliance", version: "0.2.1" },
    { capabilities: { tools: {} }, instructions: buildInstructions() },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        annotations: t.annotations,
    })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const a = (args ?? {}) as Record<string, unknown>;
    try {
        switch (name) {
            case "eu_search":
                return handleSearch(a);
            case "eu_article":
                return handleArticle(a);
            case "eu_compare":
                return handleCompare(a);
            case "eu_check_applicability":
                return handleApplicability(a);
            case "eu_evidence":
                return handleEvidence(a);
            default:
                return errorResult(`Nieznane narzedzie: ${name}`, "missing_arg");
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResult(`Blad dostepu do korpusu EU: ${msg}`, "corpus_error");
    }
});

async function main() {
    await ensureCorpus();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    process.stderr.write(
        `mcp-eu-compliance server started (stdio). Korpus snapshot ${snapshot()}, zakres: ${SIX.join(", ")}\n`,
    );
}

main().catch((err) => {
    process.stderr.write(`Fatal error: ${err}\n`);
    process.exit(1);
});
