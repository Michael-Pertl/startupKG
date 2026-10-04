# AI Investment Knowledge Graph

This project builds a Neo4j property graph for analysing AI startup mega-round investment activity globally, with US and Europe retained as major comparison regions.

The graph focuses on publicly reported funding rounds from 2024–2026 where AI startups or AI infrastructure companies raised at least USD 100M or equivalent.

This threshold intentionally captures the AI mega-round ecosystem, not the
whole worldwide AI startup ecosystem. A USD 100M+ cutoff is useful for studying
where large pools of capital concentrate by domain, region, investor syndicate,
and year. It excludes most seed, Series A, and regional AI companies, so final
claims should be phrased as claims about publicly reported AI mega-rounds.

## Goal

The goal is to model and analyse relationships between:

- AI startups
- venture capital firms and other investors
- funding rounds
- AI application/technology domains
- countries and regions
- time

The project is designed for a university Knowledge Graphs mini-project portfolio.
It also includes a React graph UI for exploring the market landscape as a
product-style knowledge graph. Streamlit can remain as an internal research
prototype, but the React app is the current user-facing direction.

## Research Question

How do major regional AI mega-round funding networks differ in terms of investor concentration, sector focus, co-investment structure, and temporal development from 2024 to 2026?

## Core Graph Model

```text
(:Startup)-[:RAISED]->(:FundingRound)
(:Investor)-[:PARTICIPATED_IN {role}]->(:FundingRound)
(:Startup)-[:OPERATES_IN {role}]->(:AIDomain)
(:Startup)-[:HEADQUARTERED_IN]->(:Country)
(:Country)-[:PART_OF]->(:Region)
```

## Dataset Scope

Included funding events must satisfy all conditions:

1. AI-native or AI-infrastructure company.
2. Headquarters or primary operating identity can be assigned to a documented country and region.
3. Round date between 2024 and 2026.
4. Round amount of at least USD 100M or equivalent.
5. Public source confirms amount, date/year, and at least one investor.
6. Source URL is recorded.

## Main Analysis Dimensions

- Funding volume by region and year
- Funding volume by AI domain
- Most active investors
- Lead investor concentration
- Co-investment networks
- Cross-region investor participation
- Centrality of investors and startups
- Temporal development of funding rounds

## Project Structure

```text
docs/              Project documentation
data/raw/          Manually collected raw evidence tables
data/processed/    Cleaned normalized tables
data/neo4j_import/ CSV files ready for Neo4j import
scripts/           Python pipeline scripts
queries/           Cypher schema, import, and analysis queries
web/               React graph product prototype
app/               Optional Streamlit research/admin prototype
tests/             Data validation tests
```

## Recommended Workflow

For a complete validated refresh, run `python3 scripts/refresh_platform.py`.
Add `--discover` to poll RSS. Tavily is disabled unless explicitly requested with
`--tavily`. Complete structured funding evidence is ingested automatically;
incomplete or conflicting rows are quarantined. Analytics now includes
coverage/provider health, comparable-period funding, median rounds and
concentration sensitivity. See [investor product operations and priorities](docs/INVESTOR_PRODUCT_NEXT.md).

1. Collect raw funding events in `data/raw/funding_events_raw.csv`.
2. For new events, stage rows in `data/raw/new_funding_events.csv`.
3. Dry-run ingestion with `python3 scripts/ingest_funding_events.py`.
4. Append valid staged rows with `python3 scripts/ingest_funding_events.py --apply`.
5. Validate required fields with `python3 scripts/validate_raw_data.py`.
6. Normalize startups, investors, countries, domains, and rounds with `python3 scripts/normalize_raw_data.py`.
7. Build startup growth metrics with `python3 scripts/build_growth_metrics.py`.
8. Initialize app-facing startup profiles with `python3 scripts/init_startup_profiles.py`.
9. Validate profile enrichment with `python3 scripts/validate_startup_profiles.py`.
10. Review compact quality metrics with `python3 scripts/report_data_quality.py` and `python3 scripts/report_profile_quality.py`.
11. Audit candidate coverage gaps with `python3 scripts/audit_coverage.py`.
12. Rebuild the React graph export with `python3 scripts/build_app_graph.py`.
13. Load generated CSVs from `data/neo4j_import/` into Neo4j.
14. Run Cypher analysis queries.
15. Export tables/screenshots for the final portfolio.

## GitHub Workflow

Use pull requests, short-lived branches, source-backed data reviews, and local
validation before merging. See `GITHUB.md` for the repository workflow,
including branch names, commit conventions, review expectations, CI checks, and
secret-handling rules.

## Deployment

The production target is the Node server in `web/server/app-server.mjs`. It
serves the Vite build and handles Ask, credit usage, Stripe Checkout, and Stripe
webhooks server-side. See `docs/DEPLOYMENT.md` and
`docs/LAUNCH_CHECKLIST.md`.

Production env template:

```bash
cp .env.production.example .env
cd web
npm run check:deploy-env
```

## Streamlit App

Streamlit is no longer the recommended product surface. Keep it only as a
research/admin prototype if needed.

Install app dependencies:

```bash
python3 -m pip install -r requirements.txt
```

Run the dashboard:

```bash
streamlit run app/app.py
```

The app provides filtered views for market overview, company funding histories, investor activity, regional/domain shifts, and data-quality guardrails.

For product direction beyond the Streamlit prototype, see `docs/PRODUCT_STRATEGY.md` and `docs/DATA_MODEL_NEXT.md`.

## Graph Product Prototype

Start the product app from the project root:

```bash
./start.sh
```

Then open:

```text
http://127.0.0.1:5180/
```

The script installs web dependencies if needed, starts the React app, and starts
the Ask assistant proxy when `web/.env.local` exists.

Build the app graph export:

```bash
python3 scripts/build_app_graph.py
```

Build or refresh the News event feed:

```bash
python3 scripts/build_market_events.py
```

Free automated market-event discovery from configured RSS feeds:

```bash
python3 scripts/fetch_market_events_feeds.py
python3 scripts/build_market_events.py
```

`./start.sh` runs the RSS fetch automatically before starting the app. The RSS
fetch also writes `data/app/market_event_fetch_report.json` with per-feed
success/failure and candidate counts.

Optional paid market-event discovery with Tavily:

```bash
export TAVILY_API_KEY=tvly-your-key
python3 scripts/fetch_market_events_tavily.py
python3 scripts/build_market_events.py
```

Rows discovered this way are classified as `auto_ingested`, `needs_review`, or
`staged` using the same monitoring guardrails as RSS. They are not added to the
core funding graph.
Obvious below-threshold funding items and low-signal announcements are staged in
`data/raw/market_events_raw.csv` but hidden from the app until reviewed.
The News JSON adds investor-facing signal tiers: `core_signal`,
`watchlist_signal`, and `review_queue`. These help separate graph-grade evidence
from broader market intelligence.

Promote a reviewed News item into the staged funding-event workflow:

```bash
python3 scripts/promote_market_event.py <market_event_id> \
  --lead-investors "Investor A; Investor B" \
  --ai-domain "AI Infrastructure"
python3 scripts/promote_market_event.py <market_event_id> \
  --lead-investors "Investor A; Investor B" \
  --ai-domain "AI Infrastructure" \
  --apply
```

Then review `data/raw/new_funding_events.csv` and continue with
`python3 scripts/ingest_funding_events.py`.

Manual React graph UI startup:

```bash
cd web
npm install
npm run dev
```

The frontend reads `web/public/data/market_graph.json` and renders two product
views:

- `Graph`: adaptive network navigation across companies, investors, funding
  rounds, countries, domains, and years.
- `Analytics`: funding-momentum dashboard with filters for year, region, domain,
  and evidence confidence.

Optional graph assistant using Nebius Token Factory:

```bash
cd web
cp .env.example .env.local
# edit .env.local and set NEBIUS_API_KEY
npm run ask-server
```

The API key stays server-side in the local proxy. The React app calls `/api/ask` through the Vite proxy.

For a metered Ask beta, enable access tokens in `web/.env.local`:

```bash
ASK_REQUIRE_AUTH=true
ASK_CREDIT_USERS={"demo-token-1":{"user_id":"demo_user","credits":25,"plan":"starter"}}
ASK_CREDITS_PER_PROMPT=1
ASK_MAX_REQUESTS_PER_MINUTE=8
```

Users enter their Ask access token in the Ask panel. The proxy stores local
credit state in `.ask_ledger.json` and request usage in `.ask_usage_log.jsonl`.
These files are ignored by git. Stripe or another payment provider can later
create/top up these user credits server-side.

## Market Event Monitoring

The next product layer is public event monitoring:

- new large AI funding rounds;
- major reported valuation increases;
- IPO filings, IPO pricings, and public listings;
- strategic investments and compute/infrastructure commitments.

The proposed implementation uses a separate market-event layer, watchlist rules,
and generated notifications. Alerts should link to public source evidence and
provide graph context. They should not be framed as investment advice.

See `docs/MARKET_EVENT_MONITORING.md`.

## Dataset Limitation

The October 3, 2026 refresh adds seven verified events and rebuilds the platform
export. See [refresh research and next priorities](docs/REFRESH_RESEARCH_2026_10_03.md)
for source links, remaining coverage gaps, and trading-agent feasibility.

This project does not represent the entire AI investment landscape. It represents a curated dataset of publicly reported AI mega-rounds above the selected threshold. The results are therefore suitable for analysing major investor networks, sector focus, and capital concentration, but not for measuring the full population of AI startups.
# Automatic Ingestion

See [automatic evidence ingestion](docs/AUTOMATIC_INGESTION.md) for the no-admin
structured funding path and quarantine rules. Tavily discovery is opt-in and is
not called by the default refresh.
