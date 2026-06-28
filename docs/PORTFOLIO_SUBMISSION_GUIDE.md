# Portfolio Submission Guide

## Recommended File Type

Submit the portfolio as a PDF. Prepare it in Word, Google Docs, LaTeX, or
Markdown, then export to PDF so the layout, screenshots, and tables are stable.

Keep the repository as supporting material. The PDF should be the readable
portfolio; the GitHub/project folder should prove reproducibility.

## Portfolio Contents

Recommended structure:

1. Title page with project title, name, course, and date.
2. Research question and motivation.
3. Dataset scope and limitations.
4. Knowledge graph model.
5. Data acquisition and cleaning pipeline.
6. Validation and Neo4j import.
7. Analysis queries and result tables.
8. Graph visualizations.
9. Interpretation of findings.
10. Conclusion and limitations.
11. Appendix with commands, schema, and selected source notes.

## Required Evidence To Include

Include these concrete artifacts:

- Current dataset size: 201 funding events, 160 startups, 520 investors, and
  1,156 investor participation relationships.
- A graph model diagram or text pattern showing `Startup`, `FundingRound`,
  `Investor`, `AIDomain`, `Country`, and `Region`.
- A short pipeline diagram from raw CSV to processed CSV to Neo4j import.
- A validation screenshot or table from `queries/02_validation.cypher`.
- At least three result tables from `queries/04_final_results.cypher`.
- At least three Neo4j Browser graph screenshots from
  `queries/05_visualization_views.cypher`.
- A clear caveat that the graph represents curated publicly reported AI
  mega-rounds above USD 100M, not the full AI startup ecosystem.

## Screenshot Checklist

Take screenshots of:

1. Neo4j validation node and relationship counts.
2. Dataset overview result table.
3. Funding by region and year.
4. Domain totals.
5. Most active investors or lead investor concentration.
6. AI infrastructure network visualization.
7. Foundation Models / LLM network visualization.
8. Cross-region investor network visualization.
9. One startup neighborhood, for example Mistral AI, ClickHouse, OpenAI, or xAI.

## Suggested Commands

```bash
python3 scripts/validate_raw_data.py
python3 scripts/normalize_raw_data.py
python3 scripts/build_growth_metrics.py
python3 scripts/report_data_quality.py
python3 -m unittest discover -s tests -v
docker compose up -d
docker exec -i startupkg-neo4j cypher-shell -u neo4j -p startupkg2026 < queries/00_schema.cypher
docker exec -i startupkg-neo4j cypher-shell -u neo4j -p startupkg2026 < queries/01_import.cypher
docker exec -i startupkg-neo4j cypher-shell -u neo4j -p startupkg2026 < queries/02_validation.cypher
```

## Wording Rule

Use cautious phrasing:

> Within this curated public AI mega-round dataset, the graph suggests...

Avoid phrasing that implies full market coverage.
