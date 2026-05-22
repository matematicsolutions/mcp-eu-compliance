# AGENTS.md - mcp-eu-compliance

Plik standardu [agents.md](https://agents.md) (Linux Foundation / Agentic AI Foundation) - kanoniczne instrukcje dla agentow AI pracujacych z tym repozytorium.

## Cel projektu

Serwer **MCP (Model Context Protocol)** udostepniajacy **offline korpus prawa UE** (EUR-Lex, pelny tekst) w lokalnym **SQLite FTS5**, z narzedziami zorientowanymi na compliance. **Verbatim, zero-LLM** w sciezce retrievalu - snippety zwracane bez zmian z bazy, kazdy z CELEX i URL do EUR-Lex.

Zakres v1 (ADR-0022 PATRON): **6 regulacji** - GDPR, AI Act, DORA, NIS2, eIDAS 2.0, CRA.

6. konektor rodziny prawa MateMatic ([`mcp-saos`](https://github.com/matematicsolutions/mcp-saos), [`mcp-nsa`](https://github.com/matematicsolutions/mcp-nsa), [`mcp-isap`](https://github.com/matematicsolutions/mcp-isap), [`mcp-krs`](https://github.com/matematicsolutions/mcp-krs), [`mcp-eu-sparql`](https://github.com/matematicsolutions/mcp-eu-sparql), `mcp-eu-compliance` (ten)). **Komplementarny do mcp-eu-sparql**: tamten odkrywa akty na zywo (SPARQL Cellar), ten daje verbatim tekst + analize compliance offline.

## Kontekst MateMatic (TWARDE OGRANICZENIA)

- **Kazde wywolanie narzedzia MUSI zwracac `structuredContent.citations`** z: identyfikatorem regulacji, pelna nazwa, CELEX, URL EUR-Lex, (opcjonalnie) numerem artykulu, snapshotem korpusu.
- **Verbatim** - tekst zwracany bez przetwarzania modelem (zero-LLM). To zrodlo grounding (anti-halucynacja).
- **Snapshot, nie zrodlo autentyczne** - kazda odpowiedz ma disclaimer: wersja autentyczna = Dziennik Urzedowy UE; weryfikacja w EUR-Lex.
- **Zakres twardy 6 regulacji** - mimo ze baza ma 98, konektor wystawia tylko 6 (zakres v1). Filtr w `SIX`.
- **Offline** - zero wywolan sieciowych w runtime. Swiezosc deleguj do mcp-eu-sparql (live).
- **Reguly stosowalnosci to wskazowka, nie ocena prawna** (Art. 6 Konstytucji Patrona, human-in-the-loop).

## Narzedzia MCP (tools contract)

| Tool | Parametry kluczowe | Zwraca |
|---|---|---|
| `eu_search` | `query`, `regulations?`, `limit?` | snippety FTS5 verbatim + citations |
| `eu_article` | `regulation`, `article_number` | pelny tekst artykulu + citation |
| `eu_compare` | `query`, `regulations?` | najlepszy artykul per regulacja + citations |
| `eu_check_applicability` | `sector`, `subsector?` | reguly stosowalnosci 6 regulacji + citations |
| `eu_evidence` | `regulation`, `article?` | artefakty dowodowe (audit) + citation |

Pelny opis: `src/index.ts` + `README.md`.

## Build i test

```bash
npm install            # Node 22.5+ (node:sqlite wbudowane, FTS5)
npm run fetch-corpus   # pobiera regulations.db z Ansvar (Apache-2.0) do data/
npm run build          # tsc -> dist/
npm start              # node dist/index.js
npm run smoke          # smoke test 5 toolow przez klienta MCP
```

## Zasady kodu

- **TypeScript strict**. `@modelcontextprotocol/sdk` ^1.12.0.
- **`node:sqlite` wbudowane** (Node >=22.5) - zero native deps, spojne z zero-cloud. Baza otwierana read-only.
- **Korpus poza repo** - artefakt upstream (Ansvar, Apache-2.0), pobierany skryptem. NIE commituj `data/regulations.db`.
- **Bez polskich znakow w commit messages**.
- **CHANGELOG bump przy zmianie kontraktu lub zakresu regulacji**.

## Czego NIE robic (twarde reguly)

- **NIE rozszerzaj zakresu poza 6 regulacji** bez bumpu CHANGELOG i decyzji (zakres v1 z ADR-0022).
- **NIE przetwarzaj tekstu modelem** w sciezce retrievalu - verbatim to cala wartosc (grounding).
- **NIE pomijaj disclaimera snapshot** - cytowanie jako zrodlo autentyczne wprowadza w blad.
- **NIE dodawaj mapowan ISO/NIST** (tekst normy ISO chroniony; poza zakresem v1).
- **NIE redystrybuuj binarki korpusu w repo** - pobieranie skryptem.

## Zrodla prawdy

1. [README.md](./README.md)
2. [THIRD_PARTY_INSPIRATIONS.md](./THIRD_PARTY_INSPIRATIONS.md) - atrybucja EUR-Lex + Ansvar
3. `src/index.ts`
4. ADR-0022 w repo PATRON (governance/adr) - decyzja architektoniczna
5. [EUR-Lex](https://eur-lex.europa.eu) - zrodlo upstream

## Licencja

**MIT** (kod) - patrz [LICENSE](./LICENSE). Korpus: Apache-2.0 (Ansvar) + EUR-Lex reusable - patrz [THIRD_PARTY_INSPIRATIONS.md](./THIRD_PARTY_INSPIRATIONS.md).

Cytowanie: *MateMatic Solutions (2026), mcp-eu-compliance - offline MCP korpus prawa UE (EUR-Lex), https://github.com/matematicsolutions/mcp-eu-compliance, MIT.*
