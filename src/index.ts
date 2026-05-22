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

// ---------------------------------------------------------------------------
// Konfiguracja / baza
// ---------------------------------------------------------------------------

// Zakres v1 - 6 regulacji pod ICP MateMatic (ADR-0022). Kazde zapytanie jest
// twardo filtrowane do tego zbioru, niezaleznie od tego co jest w bazie.
const SIX = ["GDPR", "AI_ACT", "DORA", "NIS2", "EIDAS2", "CRA"] as const;
type RegId = (typeof SIX)[number];
const SIX_SET = new Set<string>(SIX);

const DB_PATH = path.join(__dirname, "..", "data", "regulations.db");

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

function getReg(id: string): RegRow | null {
    return (
        (db()
            .prepare(
                "SELECT id, full_name, celex_id, eur_lex_url FROM regulations WHERE id = ?",
            )
            .get(id) as RegRow | undefined) ?? null
    );
}

function buildCitation(reg: RegRow, articleNumber?: string) {
    return {
        regulation: reg.id,
        full_name: reg.full_name,
        celex_id: reg.celex_id,
        eur_lex_url: reg.eur_lex_url,
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
// Tooly
// ---------------------------------------------------------------------------

const TOOLS = [
    {
        name: "eu_search",
        description:
            "Wyszukiwanie pelnotekstowe (FTS5) po tresci artykulow regulacji UE. Zwraca snippety verbatim z podswietleniem trafien. Zakres: GDPR, AI Act, DORA, NIS2, eIDAS 2.0, CRA.",
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
            "Pelny tekst artykulu (verbatim) po identyfikatorze regulacji i numerze artykulu, wraz z tytulem i rozdzialem.",
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
            "Porownanie tego samego zagadnienia w kilku regulacjach naraz. Dla kazdej regulacji zwraca najlepiej pasujacy artykul (snippet verbatim). Np. obowiazek zgloszenia incydentu w DORA vs NIS2 vs CRA.",
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
            "Ktore z 6 regulacji UE dotycza danego sektora (i opcjonalnie podsektora). Zwraca reguly stosowalnosci z poziomem pewnosci i artykulem-podstawa. To wskazowka ekspercka, nie wiazaca ocena prawna.",
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
            "Artefakty dowodowe (audit) wymagane przez regulacje - jaki dokument/log/certyfikat udowadnia zgodnosc, dla jakiego artykulu, z pytaniami audytora. Opcjonalnie zawezone do jednego artykulu.",
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

function errorResult(text: string): ToolResult {
    return { content: [{ type: "text", text }], isError: true };
}

// ----- eu_search -----------------------------------------------------------

function handleSearch(a: Record<string, unknown>): ToolResult {
    const query = String(a.query ?? "").trim();
    if (!query) return errorResult("Brak parametru 'query'.");
    const match = toFtsMatch(query);
    if (!match) return errorResult("Zapytanie nie zawiera szukanych slow.");

    const regs = resolveRegulations(a.regulations);
    const limit = Math.min(Math.max(Number(a.limit) || 8, 1), 25);
    const ph = regs.map(() => "?").join(",");

    const rows = db()
        .prepare(
            `SELECT a.regulation, a.article_number, a.title,
                    snippet(articles_fts, 3, '[', ']', ' ... ', 12) AS snip
             FROM articles_fts f
             JOIN articles a ON a.rowid = f.rowid
             WHERE articles_fts MATCH ? AND a.regulation IN (${ph})
             ORDER BY rank
             LIMIT ?`,
        )
        .all(match, ...regs, limit) as {
        regulation: string;
        article_number: string;
        title: string | null;
        snip: string;
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
        const reg = getReg(r.regulation);
        const ttl = r.title ? ` - ${r.title}` : "";
        lines.push(`[${r.regulation}] art. ${r.article_number}${ttl}`);
        lines.push(`  ${r.snip.replace(/\s+/g, " ").trim()}`);
        lines.push("");
        if (reg) citations.push(buildCitation(reg, r.article_number));
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
        return errorResult(`Regulacja '${regulation}' poza zakresem v1 (${SIX.join(", ")}).`);
    }
    if (!articleNumber) return errorResult("Brak parametru 'article_number'.");

    const row = db()
        .prepare(
            `SELECT regulation, article_number, title, text, chapter
             FROM articles WHERE regulation = ? AND article_number = ?`,
        )
        .get(regulation, articleNumber) as
        | { regulation: string; article_number: string; title: string | null; text: string; chapter: string | null }
        | undefined;

    if (!row) {
        return errorResult(
            `Nie znaleziono art. ${articleNumber} w ${regulation}. Sprawdz numer (eu_search pomoze znalezc).`,
        );
    }

    const reg = getReg(regulation)!;
    const head = [
        `[${row.regulation}] Artykul ${row.article_number}`,
        row.title ? `Tytul: ${row.title}` : null,
        row.chapter ? `Rozdzial: ${row.chapter}` : null,
        `CELEX: ${reg.celex_id ?? "-"}`,
    ]
        .filter((x): x is string => Boolean(x))
        .join("\n");

    return {
        content: [{ type: "text", text: head + "\n\n" + row.text + disclaimer() }],
        structuredContent: { citations: [buildCitation(reg, row.article_number)] },
    };
}

// ----- eu_compare ----------------------------------------------------------

function handleCompare(a: Record<string, unknown>): ToolResult {
    const query = String(a.query ?? "").trim();
    if (!query) return errorResult("Brak parametru 'query'.");
    const match = toFtsMatch(query);
    if (!match) return errorResult("Zapytanie nie zawiera szukanych slow.");

    const regs = resolveRegulations(a.regulations);
    const lines: string[] = [`Porownanie "${query}" w regulacjach: ${regs.join(", ")}`, ""];
    const citations: unknown[] = [];

    const stmt = db().prepare(
        `SELECT a.article_number, a.title,
                snippet(articles_fts, 3, '[', ']', ' ... ', 14) AS snip
         FROM articles_fts f
         JOIN articles a ON a.rowid = f.rowid
         WHERE articles_fts MATCH ? AND a.regulation = ?
         ORDER BY rank
         LIMIT 1`,
    );

    for (const id of regs) {
        const row = stmt.get(match, id) as
            | { article_number: string; title: string | null; snip: string }
            | undefined;
        const reg = getReg(id)!;
        if (!row) {
            lines.push(`[${id}] brak trafienia.`);
            lines.push("");
            continue;
        }
        const ttl = row.title ? ` - ${row.title}` : "";
        lines.push(`[${id}] art. ${row.article_number}${ttl}`);
        lines.push(`  ${row.snip.replace(/\s+/g, " ").trim()}`);
        lines.push("");
        citations.push(buildCitation(reg, row.article_number));
    }

    return {
        content: [{ type: "text", text: lines.join("\n") + disclaimer() }],
        structuredContent: { citations },
    };
}

// ----- eu_check_applicability ----------------------------------------------

function handleApplicability(a: Record<string, unknown>): ToolResult {
    const sector = String(a.sector ?? "").trim();
    if (!sector) return errorResult("Brak parametru 'sector'.");
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
        return errorResult(`Regulacja '${regulation}' poza zakresem v1 (${SIX.join(", ")}).`);
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
    { name: "mcp-eu-compliance", version: "0.1.0" },
    { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
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
                return errorResult(`Nieznane narzedzie: ${name}`);
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResult(`Blad dostepu do korpusu EU: ${msg}`);
    }
});

async function main() {
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
