# AGENTS.md — Codex Instructions

## Project

Build a Neo4j-based knowledge graph for analysing the global AI mega-round investment landscape, with US and Europe retained as important comparison regions.

The graph models AI startups, investors, funding rounds, AI domains, countries, regions, and time. The unit of evidence is a publicly reported funding event.

## Core Scope

Implement a curated knowledge graph dataset and analysis pipeline for:

- Region: Global, with explicit region labels such as United States, Europe, Israel, China, UAE / Gulf, Canada, India, Singapore, and Other Global where evidence supports inclusion
- Time window: 2024–2026
- Funding threshold: funding rounds of USD 100M or more, or EUR/GBP equivalent converted to USD
- Company type: AI-native startups or AI infrastructure companies
- Graph system: Neo4j property graph
- Query language: Cypher
- Optional analysis: Neo4j Graph Data Science or Python network analysis

## Primary Research Question

How do major regional AI mega-round funding networks differ in terms of investor concentration, sector focus, co-investment structure, and temporal development from 2024 to 2026?

## What Codex Should Build

Codex should help implement the following:

1. A reproducible data acquisition and cleaning pipeline.
2. CSV schemas for raw and processed data.
3. Validation logic for required fields and data quality.
4. Neo4j import scripts.
5. Cypher constraints and indexes.
6. Cypher analysis queries.
7. Optional graph-analysis scripts.
8. A clean project structure suitable for a university portfolio/report.

## Non-Goals

Do not build a web scraper as the default approach.

Do not assume Crunchbase or Dealroom API access.

Do not claim the dataset represents the entire AI investment landscape.

Do not use private, paywalled, or unsourced data as primary evidence.

Do not over-engineer the system before a small clean dataset works.

## Inclusion Rule

A funding event may be included only if all of the following are true:

1. The company is primarily AI-native or AI-infrastructure-related.
2. The company headquarters or primary operating identity can be assigned to a documented country and region.
3. The funding event occurred between 2024 and 2026.
4. The round amount is at least USD 100M or equivalent.
5. A public source confirms the amount, date/year, and at least one investor.
6. The event has a source URL.

## Evidence Standard

Every funding round must have:

- `source_url`
- `source_type`
- `confidence`
- `amount_usd`
- `round_date` or at minimum `year`
- at least one investor

Use confidence values:

- `high`: company press release, Reuters, official filing, or highly reputable primary/financial news source
- `medium`: TechCrunch, Sifted, EU-Startups, reputable secondary startup/tech publication
- `low`: Kaggle-only, blog-only, unclear secondary source

Rows with `confidence = low` should not be used in final quantitative claims unless explicitly marked as uncertain.

## Technology Preferences

Use:

- Python 3.11+
- pandas for CSV processing
- pydantic or pandera for validation if useful
- Neo4j 5.x
- Cypher
- Docker Compose for local Neo4j setup if convenient
- pytest for validation tests

Avoid unnecessary frameworks.

## Coding Style

- Prefer simple scripts over complex abstractions.
- Use deterministic transformations.
- Keep raw data immutable.
- Write processed data to `data/processed/`.
- Write generated Neo4j import files to `data/neo4j_import/`.
- Make scripts runnable from the project root.
- Add meaningful error messages for failed validation.
- Do not silently drop rows.

## Expected Repository Structure

```text
.
├── AGENTS.md
├── README.md
├── docs/
│   ├── PROJECT_SCOPE.md
│   ├── DATA_ACQUISITION.md
│   ├── DATA_SCHEMA.md
│   ├── NEO4J_MODEL.md
│   ├── ANALYSIS_PLAN.md
│   └── CODEX_TASKS.md
├── data/
│   ├── raw/
│   ├── processed/
│   └── neo4j_import/
├── scripts/
│   ├── clean_data.py
│   ├── validate_data.py
│   ├── build_neo4j_csvs.py
│   └── load_neo4j.cypher
├── queries/
│   ├── 00_constraints.cypher
│   ├── 01_basic_analysis.cypher
│   ├── 02_investor_network.cypher
│   └── 03_region_domain_time.cypher
├── tests/
│   └── test_data_validation.py
└── docker-compose.yml
```

## Implementation Order

1. Create data schemas.
2. Create example raw CSV files with 5–10 rows.
3. Implement validation.
4. Implement processed CSV generation.
5. Implement Neo4j import CSV generation.
6. Add Neo4j constraints.
7. Add import Cypher.
8. Add analysis queries.
9. Add tests.
10. Add documentation for running the pipeline.

## Output Quality Bar

The repository should allow the user to run:

```bash
python scripts/validate_data.py
python scripts/clean_data.py
python scripts/build_neo4j_csvs.py
```

Then load the generated files into Neo4j and run the queries in `queries/`.

## Important Analytical Caveat

All generated documentation and results must state that the graph represents curated publicly reported AI mega-rounds above the selected funding threshold, not the full AI startup ecosystem.
