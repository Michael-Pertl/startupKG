# Neo4j Queries

Run these files in order:

1. `00_schema.cypher`
2. `01_import.cypher`
3. `02_validation.cypher`
4. `03_analysis.cypher`
5. `04_final_results.cypher`
6. `05_visualization_views.cypher`

## Import Files

Copy the generated CSV files from `data/neo4j_import/` into Neo4j's configured import directory before running `01_import.cypher`.

Expected files:

- `countries.csv`
- `domains.csv`
- `funding_rounds.csv`
- `investors.csv`
- `participations.csv`
- `startup_domains.csv`
- `startups.csv`

## Notes

- The import script is idempotent and uses `MERGE`.
- Funding dates are imported as Neo4j `date` values.
- `amount_usd`, `year`, and `month` are imported as integers.
- Rounds without a disclosed lead investor remain represented through `PARTICIPATED_IN {role: 'participant'}` relationships.
- Use `04_final_results.cypher` for tables in the portfolio report.
- Use `05_visualization_views.cypher` for Neo4j Browser screenshots.
