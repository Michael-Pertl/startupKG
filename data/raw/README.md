# Raw Data

This directory contains the manually curated evidence layer for the AI mega-round knowledge graph.

## Files

- `startup_seed_list.csv` contains candidate companies and inclusion decisions.
- `funding_events_raw.csv` contains one row per public funding event.
- `investor_name_mapping.csv` maps raw investor names to canonical investor names.
- `startup_profiles.csv` contains app-facing company profile enrichment.
- `historical_funding_events_raw.csv` can store optional older or below-threshold funding events for profile timelines.

## Curation Notes

- The first pass emphasizes coverage over perfect completeness.
- Rows with `confidence=low` should be resolved before final Neo4j import.
- `2026` is a partial year as of the collection date, so analysis should label it as incomplete.
- Non-USD original amounts keep their original currency and use approximate USD conversion in `amount_usd`.
- Profile and historical funding rows are not part of the core mega-round graph unless a script explicitly imports them.
