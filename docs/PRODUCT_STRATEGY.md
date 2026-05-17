# Product Strategy

This project should evolve from a university knowledge-graph pipeline into a market intelligence product. The product must stay evidence-based while giving users a useful view of the global AI ecosystem.

## Product Positioning

Build an interactive AI market map that lets users compare companies, countries, investors, funding events, domains, and time.

The core user experience should be graph-first:

- An adaptive network view shows companies, investors, funding rounds, countries, domains, and years.
- Search selects entities and updates the local graph neighborhood.
- Year and source-confidence filters control the visible evidence layer.
- Clicking a company opens a clean inspector with compact facts, source links, visible-neighborhood context, and evidence events.
- Clicking an investor shows portfolio exposure, co-investment partners, regions, and domains.
- The Ask panel behaves like an IDE assistant pane and answers against the loaded graph context.
- A separate Analytics view summarizes funding momentum without crowding the graph surface.
- Timeline controls show how the landscape changed between 2024 and 2026.

## Key Product Correction

The current CSV-backed Streamlit dashboard is useful as an internal prototype, but it is not the right final product surface.

For a product people would want to use, the recommended stack is:

- Frontend: React + TypeScript
- Graph visualization: Cytoscape.js or Sigma.js
- Charts: ECharts or Plotly.js
- Backend API: FastAPI
- Graph database: Neo4j
- Data pipeline: existing Python CSV validation and Neo4j import scripts

Streamlit can remain as a research/admin console, but the user-facing app should be a custom graph interface.

## Data Product Lenses

The app must not collapse different market concepts into one number.

Use separate lenses:

1. Funding events: individual reported financing events with source URLs.
2. Company funding history: cumulative funding by company over time, including pre-2024 history when sourced.
3. Valuation history: reported valuation datapoints, separate from amount raised.
4. Ecosystem registry: important AI companies even when they do not have a USD100M+ round in the current window.
5. Investor network: participation and co-investment relationships.
6. Country and regional comparison: company count, funding events, cumulative capital, domain mix, investor participation, and frontier-model presence.
7. Market events: IPO filings, public listings, valuation step-ups, strategic investments, and new mega-rounds.
8. Notifications: user watchlists for companies, investors, countries, domains, event types, and valuation/funding thresholds.

## Coverage Policy

The final app should not be limited to the original university scope of US + Europe USD100M+ rounds.

Recommended product coverage:

- Global AI-native and AI-infrastructure companies.
- Funding events from 2020 onward where public evidence exists.
- Mandatory high-coverage path for 2024-2026 mega-rounds above USD100M.
- Optional smaller rounds for strategically important companies, clearly marked as partial coverage.
- Company-level profile records for important ecosystem players even when funding-event history is incomplete.

The product should expose coverage levels instead of pretending to be exhaustive:

- `verified_event`: source-confirmed funding event.
- `verified_company_profile`: source-confirmed company metadata.
- `watchlist`: important company that needs funding history enrichment.
- `partial_history`: company has known missing historical funding events.
- `excluded_or_uncertain`: reviewed but not included in quantitative claims.

## Immediate Next Build Step

The current product surface is the React graph UI in `web/`. Streamlit can remain
an internal research console, but product work should happen in the graph app.

Next implementation priorities:

1. Keep improving the React graph navigation, Analytics view, and entity inspector.
2. Expand the data model with company-level valuation and total-funding history.
3. Add a market-event layer for IPOs, public listings, valuation changes, and new mega-rounds.
4. Add watchlists and notifications for user-selected companies, investors, countries, domains, and event types.
5. Backfill important pre-2024 historical funding and valuation events for major AI companies.
6. Move from static JSON to a FastAPI backend when notification state and user watchlists are introduced.

For the detailed event-monitoring and alerting design, see
`docs/MARKET_EVENT_MONITORING.md`.

## Product Guardrail

The app can say it maps the global AI ecosystem only if it visibly distinguishes:

- complete enough segments, such as 2024-2026 public USD100M+ mega-rounds,
- partial segments, such as smaller historical rounds,
- watchlist companies awaiting source-backed enrichment.

This is not a weakness. It makes the product trustworthy.

## Notification Guardrail

Market alerts should help users notice public information faster, but they must
not be framed as personalized investment recommendations. The product should
show source evidence, graph context, and uncertainty, not “buy/sell” signals.
