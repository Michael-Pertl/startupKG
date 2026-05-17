# AI Investment Knowledge Graph

This project builds a Neo4j property graph for analysing AI startup mega-round investment activity globally, with US and Europe retained as major comparison regions.

The graph focuses on publicly reported funding rounds from 2024–2026 where AI startups or AI infrastructure companies raised at least USD 100M or equivalent.

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

Build the app graph export:

```bash
python3 scripts/build_app_graph.py
```

Run the React graph UI:

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

This project does not represent the entire AI investment landscape. It represents a curated dataset of publicly reported AI mega-rounds above the selected threshold. The results are therefore suitable for analysing major investor networks and capital concentration, but not for measuring the full population of AI startups.
