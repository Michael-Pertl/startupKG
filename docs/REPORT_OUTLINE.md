# Report Outline

## 1. Title

Analysing Global AI Mega-Round Investment Networks with a Knowledge Graph

## 2. Research Question

How do major regional AI mega-round funding networks differ in terms of investor concentration, sector focus, co-investment structure, and temporal development from 2024 to May 2026?

## 3. Dataset Scope

Use the curated dataset in `data/raw/funding_events_raw.csv` as the core graph
evidence layer. Use `data/raw/startup_profiles.csv`,
`data/raw/historical_funding_events_raw.csv`,
`data/processed/startup_growth_metrics.csv`, and
`data/processed/startup_funding_trajectory.csv` as app/profile enrichment.

Scope:

- AI-native or AI-infrastructure companies.
- Headquarters / primary company identity can be assigned to a documented country and region.
- Publicly reported funding rounds from 2024 to May 2026.
- Round amount at least USD 100M or equivalent.
- Public source confirms amount, timing, and at least one investor.

Limitations:

- Not a complete AI startup database.
- Excludes smaller rounds below USD 100M.
- Excludes most acquisitions, IPOs, debt facilities, and public-market offerings.
- 2026 is partial-year data.
- Some rounds do not disclose a lead investor.
- Profile fields and historical funding rows are enrichment data and should not
  be mixed into the core graph results unless explicitly labelled.

## 4. Graph Model

Core pattern:

```text
(:Startup)-[:RAISED]->(:FundingRound)
(:Investor)-[:PARTICIPATED_IN {role}]->(:FundingRound)
(:Startup)-[:OPERATES_IN {role}]->(:AIDomain)
(:Startup)-[:HEADQUARTERED_IN]->(:Country)
(:Country)-[:PART_OF]->(:Region)
```

Explain why `FundingRound` is modelled as a node: it has amount, date, source, round type, confidence, and many investors.

## 5. Data Pipeline

Describe:

- raw evidence table;
- startup profile enrichment table;
- optional historical funding table;
- validation script;
- normalization script;
- growth metrics script;
- generated processed tables;
- Neo4j import CSVs;
- Cypher import.

Mention:

```text
python3 scripts/validate_raw_data.py
python3 scripts/normalize_raw_data.py
python3 scripts/build_growth_metrics.py
python3 scripts/init_startup_profiles.py
python3 scripts/report_data_quality.py
```

## 6. Import Validation

Expected graph size:

- Current import size should be generated with `python3 scripts/report_data_quality.py` because the dataset is expected to grow during global curation.

Use `queries/02_validation.cypher` and include a screenshot/table of the counts.

## 7. Analysis Results

Use `queries/04_final_results.cypher`.

Recommended findings:

- Funding by region and year.
- Funding by AI domain.
- AI infrastructure vs foundation model concentration.
- Most active investors.
- Lead investor concentration.
- Cross-region investors.
- Co-investor pairs.
- Largest funding rounds.
- Repeated mega-round startups.
- Mega-round growth trajectories and cumulative funding by startup.
- Profile-layer context for selected companies, clearly separated from graph evidence.

## 8. Graph Visualizations

Use `queries/05_visualization_views.cypher`.

Recommended screenshots:

- AI infrastructure network.
- Foundation model / LLM network.
- Region-specific network, for example Europe, Israel, China, or UAE / Gulf after enough rows exist.
- Cross-region investor network.
- Mistral AI or ClickHouse neighborhood.

## 9. Interpretation

Use careful language:

- "Within this curated mega-round dataset..."
- "The graph suggests..."
- "Publicly disclosed investor participation indicates..."

Avoid:

- claiming full-market coverage;
- treating missing lead investors as non-lead investors;
- treating funding volume as total AI market size.

## 10. Conclusion

Summarize how the KG structure helped answer the research question:

- It connects investors, rounds, startups, regions, and domains.
- It supports co-investment and cross-region network analysis.
- It makes dataset limitations explicit through source and confidence properties.
