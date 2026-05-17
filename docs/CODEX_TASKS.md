# Codex Task Backlog

## Milestone 1: Repository Skeleton

Create the following folders:

```text
docs/
data/raw/
data/processed/
data/neo4j_import/
scripts/
queries/
tests/
```

Create or update:

```text
README.md
AGENTS.md
docker-compose.yml
requirements.txt
```

## Milestone 2: Example Raw Data

Create example files with 5–10 manually entered sample rows:

```text
data/raw/startup_seed_list.csv
data/raw/funding_events_raw.csv
data/raw/investor_name_mapping.csv
```

The data may be illustrative at first, but every row should follow the real schema.

## Milestone 3: Validation Script

Implement:

```text
scripts/validate_data.py
```

Requirements:

- Read `data/raw/funding_events_raw.csv`.
- Check required columns.
- Check no duplicate `event_id`.
- Check `region` is in the controlled global region vocabulary.
- Check `year` is between 2024 and 2026.
- Check `amount_usd >= 100000000`.
- Check `source_url` is not empty.
- Check at least one investor exists.
- Check `ai_domain` is not empty.
- Print all validation errors.
- Exit with non-zero status if validation fails.

## Milestone 4: Cleaning Script

Implement:

```text
scripts/clean_data.py
```

Requirements:

- Read raw funding events.
- Read investor name mapping.
- Normalize investor names.
- Split semicolon-separated investor lists.
- Generate deterministic IDs.
- Output processed CSVs:
  - `startups.csv`
  - `investors.csv`
  - `funding_rounds.csv`
  - `participations.csv`
  - `domains.csv`
  - `startup_domains.csv`
  - `countries.csv`

## Milestone 5: Neo4j CSV Builder

Implement:

```text
scripts/build_neo4j_csvs.py
```

Requirements:

- Read processed CSVs.
- Write import-ready CSVs to `data/neo4j_import/`.
- Preserve deterministic IDs.
- Do not drop rows silently.
- Print summary counts.

## Milestone 6: Neo4j Setup

Create:

```text
docker-compose.yml
```

Requirements:

- Use a Neo4j 5.x image.
- Expose browser and bolt ports.
- Mount an import directory.
- Set a local development password through environment variables.

## Milestone 7: Cypher Constraints

Create:

```text
queries/00_constraints.cypher
```

Include uniqueness constraints and useful indexes for:

- Startup
- Investor
- FundingRound
- AIDomain
- Country
- Region

## Milestone 8: Neo4j Import Query

Create:

```text
scripts/load_neo4j.cypher
```

Requirements:

- Load all node CSVs.
- Load all relationship CSVs.
- Use `MERGE` for nodes.
- Use `MATCH` + `MERGE` for relationships.
- Convert numeric fields properly.
- Keep source URLs on funding rounds.

## Milestone 9: Analysis Queries

Create:

```text
queries/01_basic_analysis.cypher
queries/02_investor_network.cypher
queries/03_region_domain_time.cypher
```

Include queries for:

- dataset overview
- funding by year and region
- top investors
- top domains
- lead investors
- co-investment network
- cross-region investors
- region-domain comparison
- global region comparison
- monthly/annual development

## Milestone 10: Tests

Create:

```text
tests/test_data_validation.py
```

Test:

- missing source URL fails
- below-threshold amount fails
- invalid region fails
- duplicate event ID fails
- empty investor fields fail
- valid row passes

## Milestone 11: Documentation

Update README with:

- setup instructions
- data collection instructions
- validation command
- cleaning command
- Neo4j loading instructions
- analysis query overview

## Suggested Commands

```bash
python scripts/validate_data.py
python scripts/clean_data.py
python scripts/build_neo4j_csvs.py
```

## Definition of Done

The project is minimally complete when:

1. Raw data can be validated.
2. Processed CSVs can be generated.
3. Neo4j import CSVs can be generated.
4. Neo4j can load all nodes and relationships.
5. At least 10 Cypher analysis queries run successfully.
6. The README explains the project scope and limitations.
