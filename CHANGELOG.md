# Changelog - mcp-eu-compliance

## [Unreleased]

Bramki przed publikacja (2026-10-13). Bez zmian w kodzie serwera i w kontrakcie narzedzi.

### Added

- `release.yml`: krok "Run gates before publishing" (drift, conformance, descriptor lock, bramka paczki) - do tej pory wydanie szlo `npm ci -> build -> publish` bez zadnego testu.
- `ci.yml`: bramka paczki.
- Bramka paczki `npm run test:package` (`npm pack --dry-run --json`; wymagane pliki wyprowadzone z `bin`/`main` + przechodnich `require`/`import` w `dist/`, pusta lista = BLOKADA; wzorzec soba-labs/krs-mcp #7) + kontrola pozytywna `npm run test:package-gate`. Mutant (usuniety `dist/index.js`) -> BLOKADA, exit 1.

## [0.4.0] - 2026-07-28

### Added

- **Argument type validation against the declared `inputSchema`.** The SDK's
  `setRequestHandler(CallToolRequestSchema, ...)` validates only the request envelope, never
  the `arguments` payload, so a tool declaring ``regulations` as an array` happily accepted the wrong type and
  forwarded the garbage downstream. A gate now runs before dispatch and rejects type
  mismatches with the new `invalid_args` error code. Union types (`type: ["string","number"]`)
  are normalised, so such properties are validated instead of silently skipped.
- New error code **`invalid_args`** (wrong argument *type*). A *missing* required argument
  still returns `missing_arg`, exactly as before - the two cases are deliberately kept apart
  so this change does not silently rename an existing error.
- `test/invalid-args.mjs` - generic conformance test. It reads `tools/list` from the built
  server over real MCP stdio and derives the cases from the declared schema, so a new tool is
  covered automatically. 21 checks: wrong type per property, missing required, plus a
  positive control proving well-typed calls still reach the upstream.

### Notes

- Found by an external audit: `Ahmad-Faraj/mcp-conformance`, check `tools-call-invalid-args`.
- `enum` values are intentionally **not** enforced - out-of-enum values currently reach the
  upstream and sometimes work, so tightening that is a behaviour change wider than the defect
  being fixed.
- Released as 0.4.0: `package.json`, `server.json` and the `serverInfo` literal in
  `src/index.ts` bumped together. `serverInfo` had drifted behind the published version,
  so the handshake reported an older release than npm actually served.

## v0.3.0 - 2026-07-04

**Poszerzenie zakresu 6 -> 14 regulacji** (decyzja WM 2026-07-04 wzgledem zakresu v1 ADR-0022).
Kontrakt narzedzi bez zmian; rozszerzony enum `regulation`/`regulations`.

- **Nowe regulacje (klaster digital/data/cyber):** DSA, DMA, Data Act (DATA_ACT), Data Governance Act
  (DGA), Law Enforcement Directive (LED), ePrivacy (EPRIVACY), Cybersecurity Act (CYBERSECURITY_ACT),
  Critical Entities Resilience (CER). Dochodza do dotychczasowych GDPR, AI_ACT, DORA, NIS2, EIDAS2, CRA.
- **Komplet 5 narzedzi dziala dla wszystkich 14** - zweryfikowane w korpusie: kazda z 8 nowych ma pelny
  tekst (provisions), reguly stosowalnosci (applicability_rules) i artefakty dowodowe (evidence_requirements).
  Zadne narzedzie nie zwraca pustki dla nowego zakresu.
- **`SIX` -> `SCOPE`** (stala + typ `RegId` + `SCOPE_SET`); enumy `inputSchema` i INSTRUCTIONS zaktualizowane.
- Dane byly juz w korpusie Ansvar (116 regulacji) - to poszerzenie filtra, nie nowy ingest.
- Build + drift + smoke green (smoke rozszerzony o DSA).

## v0.2.2 - 2026-07-04 (working, niepublikowana - publikacja = decyzja WM)

Korekta faktu o wielkosci korpusu. Backward-compatible, kontrakt 6 regulacji bez zmian.

- **Sprostowanie liczby regulacji w INSTRUCTIONS**: „98" -> „ponad 100 (aktualnie 116, 2026-07-04;
  korpus rosnie)". Powod: korpus Ansvar rosnie (snapshot 05-22 = 98, snapshot 2026-07-04 = **116** /
  5 791 przepisow) - twarda liczba zastygala i wprowadzala w blad. Trzymamy sformulowanie odporne na
  wzrost, bez odczytu przy konstrukcji serwera (INSTRUCTIONS budowane zanim `ensureCorpus()` rozwiaze
  sciezke DB - odczyt z bazy w tym punkcie zatruwalby wspoldzielony uchwyt).
- Sprostowanie w AGENTS.md + THIRD_PARTY_INSPIRATIONS.md (98 -> 116, z nota o rosnacym snapshocie).
- **Filtr `SIX` bez zmian** - poszerzenie zakresu poza 6 regulacji pozostaje osobna decyzja governance
  (ADR-0022 + bump CHANGELOG). Dane MICA/DORA-RTS/verticali finansowych sa juz w korpusie, ale
  konektor ich nie wystawia do czasu decyzji WM.

## v0.2.0 - 2026-05-25

Retrofit do kanonu MCP MateMatic (pattern z dograh-hq/dograh v1.31.0, BSD-2). Backward-compatible - istniejaci klienci dzialaja bez zmian.

- **`instructions`** w konstruktorze Server - procedural orchestration (call order, twarde ograniczenia, iteracja po bledach, styl odpowiedzi) wstrzykiwana do system promptu klienta MCP. LLM widzi PRZED pierwszym tool call.
- **`ToolAnnotations`** per tool - wszystkie 5 toolow oznaczone `readOnlyHint=true`, `idempotentHint=true`, `destructiveHint=false`, `openWorldHint=false`. Klient MCP moze auto-approve wywolania bez monitu.
- **Strukturalne `ErrorCode`** w odpowiedziach bledu - `out_of_scope`, `missing_arg`, `empty_query`, `not_found`, `corpus_error`. Format `[code] tekst` w `content` + `structuredContent.error_code`. LLM moze iterowac po bledzie, nie tylko widziec tekst.
- **Drift test** (`npm run drift`) - asercja ze kazdy `ErrorCode` w typie TS jest udokumentowany w `INSTRUCTIONS`, kazdy tool wymieniony w `INSTRUCTIONS` jest w `TOOLS` array, kazdy kod w `errorResult()` jest w typie. Zapobiega odplywaniu instructions od kodu.
- Smoke test PASS dla wszystkich 5 toolow + scenariusz negatywny (kod `[out_of_scope]` widoczny w response).

## v0.1.0 - 2026-05-22

Pierwsza wersja (ADR-0022 PATRON, sciezka A).

- 5 narzedzi MCP: `eu_search`, `eu_article`, `eu_compare`, `eu_check_applicability`, `eu_evidence`.
- Offline korpus EUR-Lex w SQLite FTS5 przez wbudowane `node:sqlite` (zero native deps).
- Verbatim zero-LLM: snippety `snippet()` zwracane bez zmian; kazda odpowiedz z `structuredContent.citations` (CELEX + URL EUR-Lex + snapshot) i disclaimerem.
- Zakres twardy 6 regulacji: GDPR, AI Act, DORA, NIS2, eIDAS 2.0, CRA (z 98 w bazie).
- Korpus pobierany skryptem `fetch-corpus` (artefakt upstream, poza repo).
- Smoke test 5 toolow przez klienta MCP - PASS (search/article/compare/applicability/evidence + odrzucenie regulacji poza zakresem + FTS injection-safe).

Atrybucja: korpus z [Ansvar-Systems/EU_compliance_MCP](https://github.com/Ansvar-Systems/EU_compliance_MCP) (Apache-2.0); tresc EUR-Lex (Decyzja 2011/833/EU). Kod konektora wlasny (MIT). Patrz THIRD_PARTY_INSPIRATIONS.md.
