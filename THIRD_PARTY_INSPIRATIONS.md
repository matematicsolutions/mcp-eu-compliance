# Third-party inspirations / dependencies

## Korpus danych: EUR-Lex (prawo UE)

- **Zrodlo:** EUR-Lex (https://eur-lex.europa.eu), Urzad Publikacji UE.
- **Reuse:** tekst legislacji UE reuzywalny komercyjnie z podaniem zrodla
  (Decyzja Komisji 2011/833/EU; legal notice EUR-Lex). Editorial/consolidated =
  CC BY 4.0 (atrybucja + wskazanie zmian). Metadane = CC0.
- **Zastrzezenie:** wersja autentyczna = Dziennik Urzedowy UE. Ten korpus to
  point-in-time snapshot, nie zrodlo autentyczne - kazda odpowiedz konektora
  zawiera disclaimer i odsylacz do EUR-Lex (CELEX).

## Korpus (plik bazy): Ansvar-Systems/EU_compliance_MCP

- **Repo:** https://github.com/Ansvar-Systems/EU_compliance_MCP
- **Licencja:** Apache-2.0 (c) Ansvar Systems
- **Snapshot:** 2026-05-22 (baza zbudowana 2026-05-16, schema_version 2, tier full)
- **Relacja:** ADAPTACJA WZORCA + adopcja artefaktu danych (ADR-0022 PATRON,
  sciezka A). Plik `data/regulations.db` (SQLite FTS5) jest artefaktem upstream -
  NIE jest trzymany w tym repo, pobierany skryptem `scripts/fetch-corpus.mjs`.
- **Co bierzemy:** (1) artefakt danych regulations.db (Apache-2.0 + EUR-Lex
  reusable); (2) WZORZEC architektoniczny (EUR-Lex -> SQLite FTS5 -> snippet
  verbatim -> MCP); (3) schemat tabel (articles/applicability_rules/
  evidence_requirements) jako baze zapytan.
- **Czego NIE bierzemy:** kodu serwera Ansvar (kod tego konektora napisany od
  zera), hostowanego Ansvar Gateway, wstrzyknietego CTA, mapowan ISO/NIST (poza
  zakresem v1).
- **Co zawężamy:** z 98 regulacji w bazie konektor wystawia twardo tylko 6
  (GDPR, AI Act, DORA, NIS2, eIDAS 2.0, CRA) - zakres v1 pod ICP MateMatic.

### Snapshot licencji (naglowek Apache-2.0)

```
Apache License, Version 2.0, January 2004
http://www.apache.org/licenses/
Copyright Ansvar Systems
```

Apache-2.0 pozwala na uzycie komercyjne, modyfikacje i redystrybucje przy
zachowaniu noty o prawach autorskich i NOTICE. Atrybucja w 3 miejscach
(ten plik + README.md + CHANGELOG.md).

## Wzorzec konektora

Struktura repo i kontrakt MCP (`structuredContent.citations`, stateless,
verbatim, AGENTS.md) - rodzina konektorow polskiego/UE prawa MateMatic:
mcp-saos, mcp-nsa, mcp-isap, mcp-krs, mcp-eu-sparql. Ten konektor
(mcp-eu-compliance) jest 6. czlonkiem, komplementarnym do mcp-eu-sparql.
