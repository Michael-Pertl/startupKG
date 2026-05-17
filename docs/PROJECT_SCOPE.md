# Project Scope

## Working Title

Analysing the Global AI Mega-Round Investment Landscape Using Knowledge Graphs

## Motivation

AI startup funding is highly relational. Startups are connected to investors, funding rounds, AI domains, locations, and time. A tabular dataset can store this information, but it is less suitable for analysing network effects such as co-investment, investor centrality, and cross-region participation.

A knowledge graph is appropriate because the project focuses on relationships rather than isolated rows.

## Research Question

How do major regional AI mega-round funding networks differ in terms of investor concentration, sector focus, co-investment structure, and temporal development from 2024 to 2026?

## Dataset Definition

The project uses a two-layer dataset:

1. A core graph evidence layer of public mega-round funding events.
2. An app-facing company profile layer for startup background, reported lifetime
   funding, valuation, products, founders, and optional historical funding
   timeline context.

The graph evidence layer contains public funding events for AI startups and AI
infrastructure companies.

A funding event is included if:

- the company is AI-native or AI-infrastructure-related;
- the headquarters or primary operating identity can be assigned to a documented country and region;
- the round happened from 2024 to 2026;
- the round amount is at least USD 100M or equivalent;
- at least one public source confirms the amount, date/year, and investor information.

## Geographic Scope

Use explicit region labels so the graph can support both global analysis and regional sub-comparisons:

- `US`
- `Europe`
- `Israel`
- `China`
- `UAE / Gulf`
- `Canada`
- `India`
- `Singapore`
- `Other Global`

Countries are modelled separately and connected to one of those regions.

Use `Other Global` only when a country has qualifying evidence but does not yet
justify its own analytical region. Do not use it when a clearer region is known.

## Time Scope

Use:

- full year 2024
- full year 2025
- partial year 2026, explicitly marked as incomplete if the current collection date is before year-end

## Analytical Scope

The project should support:

1. Sector concentration analysis.
2. Investor activity analysis.
3. Co-investment network analysis.
4. Regional comparison.
5. Time comparison.
6. Centrality analysis.
7. Company-level mega-round growth trajectories.
8. App profile pages that distinguish sourced mega-round evidence from broader
   company background claims.

## Out of Scope

- Small seed rounds
- Undisclosed rounds
- Fully automated scraping
- Prediction of future investment trends
- Machine learning model training
- KG embeddings unless explicitly added later

Small or pre-2024 rounds may be stored in
`data/raw/historical_funding_events_raw.csv` for app profile timelines, but they
are out of scope for the core mega-round graph unless explicitly filtered into a
separate analysis.

## Key Limitation Statement

The graph is biased toward highly visible, late-stage, and capital-intensive AI companies. Smaller early-stage startups are underrepresented. Global coverage also depends on English-language and publicly accessible sources, so regional comparisons should be framed as comparisons within curated public mega-round evidence rather than a complete census. App profile fields must be treated as enrichment metadata unless they have their own source URL and confidence value.
