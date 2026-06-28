# AI Investment Knowledge Graph

This repository contains a university Knowledge Graphs mini-project for
analysing publicly reported AI mega-round funding networks.

The graph focuses on funding rounds from 2024-2026 where AI-native startups or
AI infrastructure companies raised at least USD 100M or equivalent. The project
uses a curated public evidence dataset and Neo4j property graph analysis.

Important caveat: this is not a complete AI startup database. It represents a
curated subset of public AI mega-rounds above the selected threshold.

## Research Question

How do major regional AI mega-round funding networks differ in terms of
investor concentration, sector focus, co-investment structure, and temporal
development from 2024 to 2026?

## Core Graph Model

```text
(:Startup)-[:RAISED]->(:FundingRound)
(:Investor)-[:PARTICIPATED_IN {role}]->(:FundingRound)
(:Startup)-[:OPERATES_IN {role}]->(:AIDomain)
(:Startup)-[:HEADQUARTERED_IN]->(:Country)
(:Country)-[:PART_OF]->(:Region)
```

Funding rounds are modelled as nodes because each event has its own amount,
date, round type, evidence source, confidence level, and investor list.

## Current Dataset

Current validated graph size:

- 201 funding events
- 160 startups
- 520 investors
- 1,156 investor participation relationships
- 14 AI domains
- 15 countries
- 9 regions

## Repository Structure

```text
docs/              Project documentation and portfolio guidance
data/raw/          Curated raw evidence CSV files
data/processed/    Normalized processed CSV files
data/neo4j_import/ CSV files loaded by Neo4j
scripts/           Validation, normalization, and export scripts
queries/           Cypher schema, import, validation, analysis, visualization
tests/             Data-contract and helper tests
web/               Neutral React graph explorer for portfolio screenshots
portfolio/         LaTeX portfolio template
app/               Optional Streamlit research prototype
```

## Reproducible Pipeline

Run from the repository root:

```bash
python3 scripts/validate_raw_data.py
python3 scripts/normalize_raw_data.py
python3 scripts/build_growth_metrics.py
python3 scripts/build_app_graph.py
python3 scripts/report_data_quality.py
python3 -m unittest discover -s tests -v
```

## Neo4j Workflow

Start Neo4j:

```bash
docker compose up -d
```

Open Neo4j Browser:

```text
http://localhost:7474
username: neo4j
password: startupkg2026
```

Load and validate the graph:

```bash
docker exec -i startupkg-neo4j cypher-shell -u neo4j -p startupkg2026 < queries/00_schema.cypher
docker exec -i startupkg-neo4j cypher-shell -u neo4j -p startupkg2026 < queries/01_import.cypher
docker exec -i startupkg-neo4j cypher-shell -u neo4j -p startupkg2026 < queries/02_validation.cypher
```

Use these files for the final portfolio:

- `queries/04_final_results.cypher` for result tables.
- `queries/05_visualization_views.cypher` for Neo4j Browser graph screenshots.

## Web Graph Explorer

The React app is an optional portfolio aid for inspecting the generated graph
export. It is a local academic demonstrator, not the analytical source of truth.
The source of truth remains the curated CSV data and Neo4j graph.

Build the graph export:

```bash
python3 scripts/build_app_graph.py
```

Run the web explorer:

```bash
cd web
npm install
npm run dev
```

Then open the local URL printed by Vite, usually:

```text
http://127.0.0.1:5173/
```

## Portfolio

The LaTeX portfolio template is:

```text
portfolio/ai_mega_round_kg_portfolio_template.tex
```

Recommended screenshots:

- Neo4j validation counts
- funding by region/year table
- domain totals table
- top investor table
- AI Infrastructure graph
- Foundation Models / LLM graph
- cross-region investor graph
- one startup neighborhood, for example Mistral AI
- one or two web explorer screenshots

## Limitations

All results should be phrased carefully:

> Within this curated public AI mega-round dataset, the graph suggests...

Avoid claims that imply full market coverage.
