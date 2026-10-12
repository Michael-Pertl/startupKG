# Investor research platform: implementation and launch priorities

## Implemented in this update

- Temporal funding comparison with equal month/day cutoffs across years, debt/secondary/commitment exclusions, a largest-round-per-year sensitivity switch, median round size, and top-five round concentration.
- Coverage and provider health in Analytics. Last funding evidence is separate from the pipeline run time. Regional sample sizes and unresolved investor metadata remain visible.
- News defaults to approved evidence, with an explicit option for unreviewed discoveries. The curated funding timeline is regenerated from graph evidence. Production merges this timeline with Supabase candidates instead of replacing it with a stale candidate feed.
- Tavily reads only its settings from local env files, uses documented start/end date filters, records health, and supports a one-query `--check` without changing evidence. Missing/invalid publication dates remain unknown. RSS follows the same date and funding-amount guardrails.
- Complete structured funding evidence now follows [automatic ingestion](AUTOMATIC_INGESTION.md), with no administrator approval gate. Incomplete discovery snippets remain outside the core graph. The legacy manual promotion command is still available for exceptions.
- A documented correction table preserves original raw rows while applying sourced numerical corrections to derived data. Original currency, amount and evidence notes now survive normalization and graph export.

## Operate the pipeline

From the project root:

```bash
python3 scripts/refresh_platform.py
python3 scripts/refresh_platform.py --discover
python3 scripts/fetch_market_events_tavily.py --check
```

The first command automatically ingests complete structured evidence, validates and rebuilds without external discovery. The second also polls public feeds; failures produce provider warnings while validation failures stop the rebuild. Tavily is paused and disabled by default; `--tavily` explicitly opts into its discovery. Reports are in `data/app/`, with the public coverage report mirrored into `web/public/data/`.

Configure `TAVILY_API_KEY` in root `.env`, not in frontend variables. Optional settings: `TAVILY_DAYS` (default 14), `TAVILY_MAX_QUERIES` (default 30), `TAVILY_MAX_RESULTS` (default 5), `TAVILY_START_DATE` and `TAVILY_END_DATE`. Explicit dates support internship-period backfills. A successful discovery does not imply source verification or core graph completeness. The integration follows [Tavily's official search reference](https://docs.tavily.com/documentation/api-reference/endpoint/search).

Run discovery on a daily server schedule with a single-run lock, then review candidates weekly. No production schedule or remote database writes were activated during this local update. RSS only exposes each feed's recent items; it cannot backfill four months. Tavily or manual date-bounded searches are needed for the historical gap.

## Current verification limits

Local live RSS test: five of six feeds succeeded, four candidates added; VentureBeat returned HTTP429. BusinessWire returned no items. Tavily key was absent from process, root `.env`, and `web/.env.local`, so live account validity/credits could not be tested. HTTP request construction is covered by mocked tests; this is not a live API success claim.

Core: 212 rounds, 164 companies. Sarvam's [company announcement](https://www.sarvam.ai/announcing-series-b) supports USD234M actually raised in the first close, rather than the USD300M target. Higgsfield's [August company release](https://www.prnewswire.com/news-releases/higgsfield-raises-400-million-series-b-financing-at-5-4-billion-valuation-with-annualized-revenue-reaching-700-million-302852430.html) supports a separate USD400M Series B. Its January USD80M extension remains below threshold; cumulative Series A funding is not a qualifying single financing event.

The final September review also adds [HiddenLayer's USD100M Series B](https://www.prnewswire.com/news-releases/hiddenlayer-raises-100m-series-b-to-advance-trustworthy-ai-302867783.html) and [Maven Robotics' USD100M Series A](https://www.globenewswire.com/news-release/2026/09/10/3359782/0/en/maven-robotics-raises-100m-series-a-for-the-world-s-first-general-purpose-robotics-system-for-industrial-work.html). Latest included funding evidence is September 10, 2026; searches performed October 3 do not prove complete coverage through October 3.

Further candidates: Brahma AI's September USD150M financing needs a documented country/HQ decision across its Los Angeles/London/Mumbai footprint; Delos Data's over-USD100M announcement needs confirmation that the amount describes a single funding event rather than cumulative funding; Cohere's September 2025 second close needs event/tranche linking before expanding financing-count comparisons. These are not silently included in quantitative claims.

Mistral's September EUR3B round is converted using EURUSD1.1614 from the [ECB reference rate published in the EU Official Journal](https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX%3AC%2F2026%2F04602), giving USD3,484,200,000. This is a reference-rate conversion, not the actual transaction's conversion rate.

The dataset remains curated publicly reported AI mega-rounds above the threshold, not the full AI startup ecosystem. Existing events have not all been independently reverified in this session. Regional coverage is uneven and newly observed investor metadata remains unresolved. Same-period totals reduce calendar bias; they do not correct collection bias. Amounts attached to investor participation are linked round volume, not that investor's deployed capital.

## Next release priorities

1. Evidence desk: authenticated reviewers need structured edits for amount basis, currency/FX, financing type, closing status, and source quotations; save reviewer/time and a history of decisions. Approval must verify those fields, not just change a status. Add source recheck dates and source availability monitoring.
2. Representative coverage: maintain a separate global company registry, independent of qualifying funding rounds. Include smaller/bootstrapped companies as partial profiles, with public evidence and coverage labels. Use regional benchmark lists and language-aware discovery to backfill China, India, Israel, Japan, Gulf and Canada. Measure benchmark recall per region/domain; do not use an unsupported completeness percentage.
3. Investor workflow: saved company/investor/domain watchlists, a weekly changes digest with evidence links, and CSV exports preserving filter settings, dates and caveats. Start with watchlists; avoid buy/sell recommendations.
4. Company histories: distinct sourced valuation, revenue and financing records with as-of dates. Preserve pre-money/post-money and annualized/realized revenue distinctions. Existing profile totals must never substitute for individual funding proceeds.
5. Research assurance: provider failure alerts, reviewed-source freshness targets, point-in-time snapshots, and independent manual audits of high-value events. Publish methodology and known gaps alongside evidence.

Before a public launch, close the unresolved metadata/source-review gaps and verify production discovery, deployed exports, authenticated review permissions, and provider health alerts. The current local update does not establish comprehensive global coverage or production operations.

## Checks completed

The validated pipeline and all 17 Python tests passed. JavaScript checks cover equal-period exclusions, concentration/median calculations, largest-round sensitivity and production feed merging. The production frontend build passed. Playwright checks at 1440px and 390px verified changing metrics, curated News, and no page-level horizontal overflow; comparison tables scroll within their own containers.
