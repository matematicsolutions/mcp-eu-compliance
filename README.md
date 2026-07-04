# mcp-eu-compliance

Serwer **MCP** udostepniajacy **offline korpus prawa UE** (EUR-Lex, pelny tekst) w lokalnym **SQLite FTS5**, z narzedziami compliance. Snippety zwracane **verbatim** z bazy (zero-LLM) - kazdy z identyfikatorem **CELEX** i URL do EUR-Lex. Anti-halucynacja przez mechanike, nie przez zaufanie do modelu.

**Zakres (14 regulacji, digital/data/cyber):** GDPR, AI Act, DORA, NIS2, eIDAS 2.0, CRA, DSA, DMA, Data Act, DGA, LED, ePrivacy, Cybersecurity Act, CER.

Komplementarny do [`mcp-eu-sparql`](https://github.com/matematicsolutions/mcp-eu-sparql): tamten odkrywa akty na zywo (SPARQL Cellar), ten daje verbatim tekst + analize compliance offline (bez sieci w runtime).

## Instalacja

```bash
npm install            # Node 22.5+ (node:sqlite wbudowane)
npm run fetch-corpus   # pobiera regulations.db (~36 MB) z Ansvar (Apache-2.0)
npm run build
npm start
```

Konfiguracja w kliencie MCP (np. `mcp-servers.json`):

```json
{
  "name": "eu-compliance",
  "command": "node",
  "args": ["/sciezka/do/mcp-eu-compliance/dist/index.js"]
}
```

## Narzedzia

| Tool | Opis |
|---|---|
| `eu_search(query, regulations?, limit?)` | Pelnotekstowo (FTS5) po artykulach, snippety verbatim. |
| `eu_article(regulation, article_number)` | Pelny tekst artykulu + tytul + rozdzial + CELEX. |
| `eu_compare(query, regulations?)` | To samo zagadnienie w kilku regulacjach naraz (np. zgloszenie incydentu DORA vs NIS2 vs CRA). |
| `eu_check_applicability(sector, subsector?)` | Ktore z 14 regulacji dotycza sektora, z poziomem pewnosci i artykulem-podstawa. |
| `eu_evidence(regulation, article?)` | Artefakty dowodowe (audit) - jaki dokument/log/certyfikat udowadnia zgodnosc. |

Kazde narzedzie zwraca `structuredContent.citations` (regulacja, CELEX, URL EUR-Lex, snapshot).

## Przyklady

- "Compare incident reporting timelines across DORA, NIS2, and CRA" -> `eu_compare`
- "What does GDPR Article 33 require?" -> `eu_article`
- "Which EU regulations apply to a bank?" -> `eu_check_applicability(sector=financial, subsector=bank)`
- "What audit evidence does DORA Article 17 require?" -> `eu_evidence`

## Zastrzezenia

- **Snapshot, nie zrodlo autentyczne.** Wersja autentyczna = Dziennik Urzedowy UE. Konektor zwraca point-in-time snapshot; weryfikuj aktualnosc w EUR-Lex (CELEX). Swiezosc -> `mcp-eu-sparql` (live).
- **Reguly stosowalnosci to wskazowka ekspercka**, nie wiazaca ocena prawna. Polskie realia sektorowe moga wymagac wlasnej analizy.
- **Material referencyjny, nie porada prawna.**

## Licencja i atrybucja

- **Kod:** MIT - patrz [LICENSE](./LICENSE).
- **Korpus:** tresc EUR-Lex (reuzywalna, Decyzja 2011/833/EU) + plik bazy z [Ansvar-Systems/EU_compliance_MCP](https://github.com/Ansvar-Systems/EU_compliance_MCP) (Apache-2.0). Szczegoly: [THIRD_PARTY_INSPIRATIONS.md](./THIRD_PARTY_INSPIRATIONS.md).

Cytowanie: *MateMatic Solutions (2026), mcp-eu-compliance, https://github.com/matematicsolutions/mcp-eu-compliance, MIT.*
