# Changelog - mcp-eu-compliance

## v0.1.0 - 2026-05-22

Pierwsza wersja (ADR-0022 PATRON, sciezka A).

- 5 narzedzi MCP: `eu_search`, `eu_article`, `eu_compare`, `eu_check_applicability`, `eu_evidence`.
- Offline korpus EUR-Lex w SQLite FTS5 przez wbudowane `node:sqlite` (zero native deps).
- Verbatim zero-LLM: snippety `snippet()` zwracane bez zmian; kazda odpowiedz z `structuredContent.citations` (CELEX + URL EUR-Lex + snapshot) i disclaimerem.
- Zakres twardy 6 regulacji: GDPR, AI Act, DORA, NIS2, eIDAS 2.0, CRA (z 98 w bazie).
- Korpus pobierany skryptem `fetch-corpus` (artefakt upstream, poza repo).
- Smoke test 5 toolow przez klienta MCP - PASS (search/article/compare/applicability/evidence + odrzucenie regulacji poza zakresem + FTS injection-safe).

Atrybucja: korpus z [Ansvar-Systems/EU_compliance_MCP](https://github.com/Ansvar-Systems/EU_compliance_MCP) (Apache-2.0); tresc EUR-Lex (Decyzja 2011/833/EU). Kod konektora wlasny (MIT). Patrz THIRD_PARTY_INSPIRATIONS.md.
