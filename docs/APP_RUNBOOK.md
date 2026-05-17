# App Runbook

The React graph app in `web/` is the current product surface for exploring the
curated AI mega-round dataset. Streamlit can remain an internal research/admin
prototype, but product UX work should happen in the React graph interface.

## Refresh Data

```bash
python3 scripts/validate_raw_data.py
python3 scripts/normalize_raw_data.py
python3 scripts/build_growth_metrics.py
python3 scripts/init_startup_profiles.py
python3 scripts/build_app_graph.py
```

Install dependencies first if needed:

```bash
python3 -m pip install -r requirements.txt
```

## Run React Graph App

```bash
cd web
npm install
npm run dev
```

Optional graph assistant:

```bash
cd web
npm run ask-server
```

The assistant uses the local Nebius proxy and should answer from the supplied
graph context.

## Product Scope

The app is designed to answer:

- Which AI startups raised the largest USD 100M+ rounds from 2024 to 2026?
- How did funding concentration shift by year, region, and AI domain?
- Which investors appear most active in the visible mega-round network?
- Which companies show repeated mega-round momentum versus one-off large events?
- Where is profile enrichment still missing?
- Which new public market events should be reviewed, such as IPO filings, public
  listings, major valuation increases, and new mega-rounds?

## App Views

- `Graph`: entity-first exploration of companies, investors, rounds, countries,
  domains, and local evidence neighborhoods.
- `Analytics`: dashboard view for funding momentum, with filters for year,
  region, domain, and source confidence. The dashboard includes KPIs, funding by
  year/domain/region, and click-through rankings for companies and investors.

## Caveat

The app shows publicly reported AI mega-rounds above the selected threshold. It should not be presented as the full AI startup ecosystem or as a complete private-market database.

## Graph Product Prototype

The product-facing prototype lives in `web/` and reads
`web/public/data/market_graph.json`.

Refresh the graph data:

```bash
python3 scripts/build_app_graph.py
```

Run the frontend:

```bash
cd web
npm install
npm run dev
```

Use this graph UI, not Streamlit, as the base for a product people would use.

## Future Notifications

The planned notification layer should monitor public, source-backed events:

- new USD100M+ funding rounds;
- major valuation increases;
- IPO filings, IPO pricings, and public listings;
- major strategic investments or compute commitments.

See `docs/MARKET_EVENT_MONITORING.md` for the proposed tables, workflow, and
guardrails. Notifications should help users discover public information faster,
but they must not be presented as personalized investment advice.
