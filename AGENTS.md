# AGENTS.md - mcp-eu-compliance

An [agents.md](https://agents.md) standard file (Linux Foundation / Agentic AI Foundation) - canonical instructions for AI agents working with this repository.

## Project purpose

An **MCP (Model Context Protocol)** server exposing an **offline corpus of EU law** (EUR-Lex, full text) in local **SQLite FTS5**, with compliance-oriented tools. **Verbatim, zero-LLM** in the retrieval path - snippets returned unchanged from the database, each with a CELEX id and EUR-Lex URL.

Scope (ADR-0022 + extension per WM decision 2026-07-04): **14 digital/data/cyber regulations** - GDPR, AI Act, DORA, NIS2, eIDAS 2.0, CRA, DSA, DMA, Data Act, DGA, LED, ePrivacy, Cybersecurity Act, CER. All 14 have full text + applicability rules + evidence artifacts in the corpus (the complete set of 5 tools works).

The 6th connector in the MateMatic law family ([`mcp-saos`](https://github.com/matematicsolutions/mcp-saos), [`mcp-nsa`](https://github.com/matematicsolutions/mcp-nsa), [`mcp-isap`](https://github.com/matematicsolutions/mcp-isap), [`mcp-krs`](https://github.com/matematicsolutions/mcp-krs), [`mcp-eu-sparql`](https://github.com/matematicsolutions/mcp-eu-sparql), `mcp-eu-compliance` (this one)). **Complementary to mcp-eu-sparql**: that one discovers acts live (SPARQL Cellar), this one provides verbatim text + offline compliance analysis.

## MateMatic context (HARD CONSTRAINTS)

- **Every tool call MUST return `structuredContent.citations`** with: regulation id, full name, CELEX, EUR-Lex URL, (optionally) article number, corpus snapshot.
- **Verbatim** - text returned without model processing (zero-LLM). This is the grounding source (anti-hallucination).
- **Snapshot, not the authentic source** - every response carries a disclaimer: the authentic version = Official Journal of the EU; verify in EUR-Lex.
- **Hard scope of 14 regulations** - even though the database has 116 (snapshot 2026-07-04; the corpus grows, see `db_metadata.regulations_count`), the connector exposes only 14 (v1 scope). Filter in `SCOPE`.
- **Offline** - zero network calls at runtime. Delegate freshness to mcp-eu-sparql (live).
- **Applicability rules are guidance, not a legal assessment** (Art. 6 of the Patron Constitution, human-in-the-loop).

## MCP tools (tools contract)

| Tool | Key parameters | Returns |
|---|---|---|
| `eu_search` | `query`, `regulations?`, `limit?` | verbatim FTS5 snippets + citations |
| `eu_article` | `regulation`, `article_number` | full article text + citation |
| `eu_compare` | `query`, `regulations?` | best article per regulation + citations |
| `eu_check_applicability` | `sector`, `subsector?` | applicability rules for 14 regulations + citations |
| `eu_evidence` | `regulation`, `article?` | evidence artifacts (audit) + citation |

Full description: `src/index.ts` + `README.md`.

## Build and test

```bash
npm install            # Node 22.5+ (node:sqlite built-in, FTS5)
npm run fetch-corpus   # downloads regulations.db from Ansvar (Apache-2.0) into data/
npm run build          # tsc -> dist/
npm start              # node dist/index.js
npm run smoke          # smoke test of 5 tools via an MCP client
```

## Code rules

- **TypeScript strict**. `@modelcontextprotocol/sdk` ^1.12.0.
- **`node:sqlite` built-in** (Node >=22.5) - zero native deps, consistent with zero-cloud. Database opened read-only.
- **Corpus outside the repo** - an upstream artifact (Ansvar, Apache-2.0), fetched by a script. Do NOT commit `data/regulations.db`.
- **No Polish characters in commit messages.**
- **CHANGELOG bump on any change to the contract or the regulation scope.**

## What NOT to do (hard rules)

- **Do NOT extend the scope beyond the current 14 regulations** without a CHANGELOG bump and a WM decision (scope extended 6->14 per WM decision 2026-07-04 relative to ADR-0022; edit `SCOPE` + enums + FULL_NAMES).
- **Do NOT process the text with a model** in the retrieval path - verbatim is the entire value (grounding).
- **Do NOT omit the snapshot disclaimer** - citing it as the authentic source is misleading.
- **Do NOT add ISO/NIST mappings** (ISO standard text is protected; out of v1 scope).
- **Do NOT redistribute the corpus binary in the repo** - fetched by a script.

## Sources of truth

1. [README.md](./README.md)
2. [THIRD_PARTY_INSPIRATIONS.md](./THIRD_PARTY_INSPIRATIONS.md) - EUR-Lex + Ansvar attribution
3. `src/index.ts`
4. ADR-0022 in the PATRON repo (governance/adr) - architectural decision
5. [EUR-Lex](https://eur-lex.europa.eu) - upstream source

## License

**MIT** (code) - see [LICENSE](./LICENSE). Corpus: Apache-2.0 (Ansvar) + EUR-Lex reusable - see [THIRD_PARTY_INSPIRATIONS.md](./THIRD_PARTY_INSPIRATIONS.md).

Citation: *MateMatic Solutions (2026), mcp-eu-compliance - offline MCP corpus of EU law (EUR-Lex), https://github.com/matematicsolutions/mcp-eu-compliance, MIT.*
