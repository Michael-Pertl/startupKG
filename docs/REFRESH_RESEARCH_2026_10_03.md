# Return-to-project review: 2026-10-03

## Repository and refresh

Repository remote: `git@github.com:Michael-Pertl/startupKG.git`.
Latest local commit before refresh: `2ff9b85` (2026-06-29).
The Python pipeline, Neo4j queries, React platform, and portfolio materials are present.
The shell's logical working directory is `/home/pertl/uni/Knowledge Graphs/project`; its physical path resolves to `/mnt/c/Users/pertl/Documents/SS26/Knowledge Graphs/project`.
This confirms the project identity, but not whether another checkout or remote branch has newer work.

The baseline contained 201 events, 160 startups, and 520 investors, with event dates through May 2026.
The dated refresh batch adds seven public company-announced rounds: five July-September events and two older missing events.
Existing evidence rows are preserved. The batch is retained for provenance; rerunning its ingestion after applying will reject duplicate IDs.
Coverage remains curated publicly reported AI mega-rounds above USD100M, not the full AI startup ecosystem.
Search review on October 3 does not imply complete coverage through that date.

## Sources added

| Company | Date | Funding amount | Evidence |
| --- | --- | --- | --- |
| Lovable | 2025-12-18 | USD330M | [Series B announcement](https://lovable.dev/blog/series-b) |
| Harvey | 2026-03-25 | USD200M | [Company announcement](https://www.harvey.ai/blog/harvey-raises-at-dollar11-billion-valuation-to-scale-agents-across-law-firms-and-enterprises) |
| Fireworks AI | 2026-07-15 | USD1.505B | [Series D announcement](https://fireworks.ai/blog/series-d-announcement) |
| Lovable | 2026-08-12 | USD400M | [Series C announcement](https://lovable.dev/blog/series-c) |
| Mistral AI | 2026-09-08 | EUR3B | [Series D announcement](https://mistral.ai/news/mistral-makes-sovereign-open-weight-ai-to-frontier/) |
| Cognition | 2026-09-08 | More than USD2B | [Series E announcement](https://cognition.com/blog/series-e) |
| Harvey | 2026-09-09 | USD550M | [Company announcement](https://www.harvey.ai/blog/harvey-raises-dollar550m-at-a-dollar155b-valuation-to-help-legal-teams-own-their-intelligence) |

Cognition is stored at the disclosed lower bound. Mistral's USD conversion is approximate (EURUSD 1.17), not a verified historical daily rate. Investor lists reflect named participants and may be incomplete. New investor metadata can be unknown; do not infer headquarters from investment geography.

## Candidates requiring review

- [Crusoe September 17 Series F](https://www.crusoe.ai/resources/newsroom/crusoe-announces-series-f-funding): announcement describes an initial close of an anticipated USD3.9B round. Confirm amount actually closed before adding the full headline amount. Announcement dateline Denver also differs from the existing San Francisco profile; check headquarters independently.
- [Temporal September 14 Series E](https://temporal.io/news/temporal-raises-550m-at-a-12-55b-valuation): USD550M and investors confirmed, but the general-purpose durable execution platform needs a documented decision about AI-infrastructure eligibility before core inclusion.
- [Databricks July 16 announcement](https://www.databricks.com/company/newsroom/press-releases/databricks-raising-strategic-round-funding-188-billion-valuation): a signed term sheet and valuation do not establish a completed round amount. Find final closing evidence.
- [Harvey July 28 strategic investment](https://www.harvey.ai/blog/harvey-announces-strategic-investment-from-goldman-sachs-and-jp-morgan): investors confirmed but amount undisclosed; cannot establish the threshold or whether it overlaps another round.

## Recommended next work

1. Evidence operations: weekly RSS discovery into the existing review queue, reviewed promotion, semantic duplicate detection by company/date/amount, and a visible last-reviewed date. Store announcement, closing, discovery, and review times separately. Measure stale sources and unresolved candidates.
2. Financing semantics: explicit equity/debt/secondary/commitment classifications, exact versus lower-bound amounts, FX rate/date/source, and committed-versus-closed amounts. Existing Mistral debt financing must be excluded from equity-only comparisons. Preserve these fields in graph exports instead of leaving caveats only in raw notes.
3. Explainable watchlists: show new rounds and changing investor/domain exposure with source links. Implement against the existing Node server and event feed; no new backend framework is necessary just for this feature.
4. Temporal research: comparable year-to-date windows, top-one/top-five funding shares, concentration measures, repeated funding and co-investor communities. Show results with and without the largest rounds. Track source coverage by region so US-heavy collection is not mistaken for market dominance.
5. Public-market exposure graph: separate issuer and security nodes with ticker, exchange, currency, identifiers and listing validity dates. Add sourced ownership, supplier, compute-contract and partnership edges with dates and economic magnitude where disclosed. Participation alone does not quantify equity exposure.

Inference from the new company announcements: coding tools, specialised inference, legal agents and sovereign AI are useful research themes. Seven selected rounds cannot establish market-wide sector trends or predictive returns.

## Trading-agent feasibility

Recommendation: implement a cited research agent and event-study sandbox first, then consider paper trading if a testable signal survives evaluation.
The current event graph has no historical price/volume series, corporate-action adjustments, validated tradable universe, broker integration, or point-in-time evidence history. A startup funding round is not a public security price. A named investor's participation does not provide its stake size or the direction of a supplier's stock return.

Research question: does a public funding announcement predict abnormal returns for documented public suppliers or investors beyond sector and broad-market effects?
Use publication-time availability, predeclared event windows and issuer links, and exclude unavailable historical information. Compare a simple event rule with benchmark exposure and a no-graph model. Split evaluation chronologically, account for overlapping events, spreads, fees and slippage, and report drawdown, turnover and uncertainty alongside returns. Do not train and test on the same curated discoveries.

Architecture: reviewed evidence -> time-valid exposure graph -> deterministic features -> research/backtest -> paper execution through a separate risk engine. An LLM can explain evidence and propose hypotheses; position sizing and order validation should be deterministic. Require position and loss limits, stale-data rejection, idempotent orders, audit logs and an emergency stop before any live execution design.

[Alpaca paper-trading documentation](https://docs.alpaca.markets/us/v1.4.2/docs/paper-trading) provides a possible simulation integration, but explicitly omits market impact and latency slippage among other effects. Paper success is not proof of live profitability.
[ESMA guidance](https://www.esma.europa.eu/press-news/esma-news/esma-provides-guidance-firms-using-artificial-intelligence-investment-services) describes MiFID II responsibilities when firms use AI in investment services. A customer-facing advice or execution product needs jurisdiction-specific professional review; attaching a disclaimer does not resolve its regulatory classification.

No trading agent or live execution was introduced during this data refresh.

## Verification and remaining gaps

- Raw funding and startup-profile validation passed.
- Normalization and growth metrics rebuilt: 208 events, 160 startups, 556 investors, 1,274 participations.
- Both platform graph exports rebuilt: 965 nodes and 2,670 edges.
- All 10 existing tests passed with `python3 -m unittest discover -s tests -v`; pytest is not installed in the existing virtual environment.
- Data-quality reporting exits nonzero because 36 new investors lack verified canonical metadata. These fields are left unknown rather than guessed. Resolve aliases and source investor headquarters/type before geographic investor analysis.
- Coverage audit reports incomplete coverage and open candidates, including Higgsfield, Sarvam AI, Amity and the Reliance-Meta JV. This refresh does not clear those existing review items.
- Generated CSVs follow the existing CSV writer's CRLF convention; diff whitespace checking passes with `core.whitespace=cr-at-eol`.
- Neo4j import files were regenerated; a running Neo4j database was not reloaded.
