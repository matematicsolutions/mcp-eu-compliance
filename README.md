# mcp-eu-compliance

**MCP** server exposing an **offline corpus of EU law** (EUR-Lex, full text) in local **SQLite FTS5**, with compliance tools. Snippets returned **verbatim** from the database (zero-LLM) - each with a **CELEX** id and EUR-Lex URL. Anti-hallucination by mechanism, not by trust in the model.

**Scope (14 regulations, digital/data/cyber):** GDPR, AI Act, DORA, NIS2, eIDAS 2.0, CRA, DSA, DMA, Data Act, DGA, LED, ePrivacy, Cybersecurity Act, CER.

Complementary to [`mcp-eu-sparql`](https://github.com/matematicsolutions/mcp-eu-sparql): that one discovers acts live (SPARQL Cellar), this one provides verbatim text + offline compliance analysis (no network at runtime).

## Installation

```bash
npm install            # Node 22.5+ (node:sqlite built-in)
npm run fetch-corpus   # downloads regulations.db (~36 MB) from Ansvar (Apache-2.0)
npm run build
npm start
```

Configuration in the MCP client (e.g. `mcp-servers.json`):

```json
{
  "name": "eu-compliance",
  "command": "node",
  "args": ["/path/to/mcp-eu-compliance/dist/index.js"]
}
```

## Tools

| Tool | Description |
|---|---|
| `eu_search(query, regulations?, limit?)` | Full-text (FTS5) across articles, verbatim snippets. |
| `eu_article(regulation, article_number)` | Full article text + title + chapter + CELEX. |
| `eu_compare(query, regulations?)` | The same topic across several regulations at once (e.g. incident reporting DORA vs NIS2 vs CRA). |
| `eu_check_applicability(sector, subsector?)` | Which of the 14 regulations apply to a sector, with confidence level and basis article. |
| `eu_evidence(regulation, article?)` | Evidence artifacts (audit) - which document/log/certificate proves compliance. |

Each tool returns `structuredContent.citations` (regulation, CELEX, EUR-Lex URL, snapshot).

## Examples

- "Compare incident reporting timelines across DORA, NIS2, and CRA" -> `eu_compare`
- "What does GDPR Article 33 require?" -> `eu_article`
- "Which EU regulations apply to a bank?" -> `eu_check_applicability(sector=financial, subsector=bank)`
- "What audit evidence does DORA Article 17 require?" -> `eu_evidence`

## Disclaimers

- **Snapshot, not the authentic source.** The authentic version = Official Journal of the EU. The connector returns a point-in-time snapshot; verify currency in EUR-Lex (CELEX). Freshness -> `mcp-eu-sparql` (live).
- **Applicability rules are expert guidance**, not a binding legal assessment. Sector-specific realities may require your own analysis.
- **Reference material, not legal advice.**

## License and attribution

- **Code:** MIT - see [LICENSE](./LICENSE).
- **Corpus:** EUR-Lex content (reusable, Decision 2011/833/EU) + database file from [Ansvar-Systems/EU_compliance_MCP](https://github.com/Ansvar-Systems/EU_compliance_MCP) (Apache-2.0). Details: [THIRD_PARTY_INSPIRATIONS.md](./THIRD_PARTY_INSPIRATIONS.md).

Citation: *MateMatic Solutions (2026), mcp-eu-compliance, https://github.com/matematicsolutions/mcp-eu-compliance, MIT.*
