# Sources ledger - European Union (EU) - offline corpus channel

Machine-diffable record of every Legal Data Hunter (`worldwidelaw/legal-sources`) source we have
checked for this repo, and what we did about it. Purpose: the next gap-audit (PLAYBOOK.md
section 8 in `eu-legal-mcp`) is a file diff against a fresh `manifest.yaml`, not a re-run of
hours of research.

Scope note: this repo is the OFFLINE channel for EU/EUR-Lex only - a verbatim SQLite FTS5
corpus of 14 digital/data/cyber regulations (GDPR, AI Act, DORA, NIS2, eIDAS 2.0, CRA, DSA,
DMA, Data Act, DGA, LED, ePrivacy, Cybersecurity Act, CER), zero network calls at runtime.
Everything LIVE (act discovery, CJEU case law, GDPRhub) belongs to the sibling repo
[`mcp-eu-sparql`](https://github.com/matematicsolutions/mcp-eu-sparql) and is ledgered THERE.
Hard rule (AGENTS.md): do not widen this repo beyond the 14 regulations without a WM decision.

Machine-read by `eu-legal-mcp/gap_scan.py`.

| LDH id | LDH name | LDH status @ check | Our status | Our tool(s) | Notes / rejection reason |
|---|---|---|---|---|---|
| EU/EUR-Lex | EUR-Lex Portal | complete | shipped | `eu_search`, `eu_article`, `eu_compare`, `eu_check_applicability`, `eu_evidence` | offline verbatim corpus channel: 14 digital regulations, full text, SQLite FTS5 (upstream db from Ansvar-Systems/EU_compliance_MCP, Apache-2.0; EUR-Lex content reusable per Decision 2011/833/EU). Live discovery channel of the same LDH source = sibling mcp-eu-sparql |

All other EU/* LDH sources (EU/CURIA, EU/ECJ-Tax, EU/GDPRhub, EU/EDPB, EU/TED, ...) are
deliberately absent here - they are live sources, out of this repo's offline scope. See the
ledger in `mcp-eu-sparql/SOURCES.md` for their statuses (checked 2026-07-08).
