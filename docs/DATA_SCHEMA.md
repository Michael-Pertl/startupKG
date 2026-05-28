# Data Schema

## Raw Tables

### `data/raw/startup_seed_list.csv`

Candidate startup list before final inclusion.

```csv
startup_name,region,country,city,seed_source_url,candidate_domain,include_status,notes
```

Allowed `include_status` values:

- `include`
- `exclude`
- `uncertain`

### `data/raw/funding_events_raw.csv`

One row per funding event.

```csv
event_id,startup_name,region,country,city,round_date,year,month,round_type,amount_original,amount_currency,amount_usd,lead_investors,participating_investors,ai_domain,source_url,source_type,confidence,notes
```

Allowed `region` values:

- `US`
- `Europe`
- `Israel`
- `China`
- `UAE / Gulf`
- `Canada`
- `India`
- `Singapore`
- `Other Global`

### `data/raw/investor_name_mapping.csv`

Maps raw investor names to canonical names.

```csv
raw_name,normalized_name,investor_type,country,website,notes
```

Example:

```csv
a16z,Andreessen Horowitz,VC,USA,https://a16z.com,
Google Ventures,GV,Corporate VC,USA,https://www.gv.com,
```

### `data/raw/startup_profiles.csv`

App-facing startup profile enrichment. This table is not the core evidence
layer for graph analysis; it supports company profile pages.

```csv
startup_id,name,region,country,city,primary_domain,website,founded_year,founders,latest_valuation_usd,total_funding_reported_usd,employee_count_estimate,notable_products,profile_source_url,profile_confidence,notes
```

### `data/raw/startup_profile_enrichment.csv`

Curated overlay used by `scripts/init_startup_profiles.py` to preserve manual
profile enrichment when `startup_profiles.csv` is regenerated.

```csv
startup_id,website,founded_year,founders,latest_valuation_usd,total_funding_reported_usd,employee_count_estimate,notable_products,profile_source_url,profile_confidence,notes
```

### `data/raw/historical_funding_events_raw.csv`

Optional pre-scope or below-threshold funding history for company profile
timelines. These rows should not be mixed into the main mega-round network
unless explicitly filtered.

```csv
event_id,startup_name,round_date,year,round_type,amount_original,amount_currency,amount_usd,investors,source_url,source_type,confidence,is_pre_scope,notes
```

### `data/raw/market_events_raw.csv`

Future market-monitoring table for IPOs, public listings, valuation updates,
new mega-round candidates, strategic investments, and other public events that
may trigger user notifications.

```csv
event_id,company_name,event_type,event_date,year,country,region,amount_usd,valuation_usd,source_url,source_type,confidence,status,summary,notes
```

Recommended `event_type` values:

- `funding_round`
- `valuation_update`
- `ipo_filing`
- `ipo_pricing`
- `public_listing`
- `strategic_investment`
- `compute_commitment`
- `acquisition_or_merger`
- `major_partnership`
- `revenue_or_usage_milestone`

Recommended `status` values:

- `staged`
- `auto_ingested`
- `approved`
- `rejected`
- `needs_review`

### `data/raw/alert_rules.csv`

Future user watchlist and notification rules.

```csv
rule_id,user_id,rule_type,entity_type,entity_value,event_types,min_amount_usd,min_valuation_delta_usd,min_confidence,is_active,created_at
```

### `data/raw/notifications.csv`

Future generated notifications.

```csv
notification_id,rule_id,event_id,created_at,seen_at,severity,title,body,source_url
```

Notifications must link to public sources and should not be treated as
investment recommendations.

## Processed Tables

### `data/processed/startups.csv`

```csv
startup_id,name,region,country,city,primary_domain
```

### `data/processed/investors.csv`

```csv
investor_id,name,investor_type,country,website
```

### `data/processed/funding_rounds.csv`

```csv
round_id,startup_id,round_type,round_date,year,month,amount_usd,source_url,source_type,confidence
```

### `data/processed/participations.csv`

```csv
investor_id,round_id,role
```

Allowed `role` values:

- `lead`
- `participant`
- `unknown`

### `data/processed/domains.csv`

```csv
domain_id,name
```

### `data/processed/startup_domains.csv`

```csv
startup_id,domain_id,role
```

Allowed `role` values:

- `primary`
- `secondary`

### `data/processed/countries.csv`

```csv
country_id,name,region
```

### `data/processed/startup_growth_metrics.csv`

Derived company-level mega-round growth summary. This is generated from the
processed funding rounds and does not represent complete lifetime funding.

```csv
startup_id,name,region,country,primary_domain,first_mega_round_date,last_mega_round_date,first_mega_round_year,last_mega_round_year,mega_round_count,active_mega_round_years,total_mega_round_amount_usd,largest_round_usd,trajectory_label
```

### `data/processed/startup_funding_trajectory.csv`

Derived startup-year time series for app charts.

```csv
startup_id,name,region,country,primary_domain,year,mega_rounds,amount_usd,cumulative_amount_usd
```

## Neo4j Import Tables

The files in `data/neo4j_import/` may mirror the processed tables or use Neo4j-admin-compatible headers.

Recommended simple import files:

```text
startups.csv
investors.csv
funding_rounds.csv
participations.csv
domains.csv
startup_domains.csv
countries.csv
```

## ID Generation Rules

Use deterministic lowercase IDs.

Examples:

```text
Mistral AI              -> startup_mistral_ai
Andreessen Horowitz     -> investor_andreessen_horowitz
Foundation Models / LLMs -> domain_foundation_models_llms
France                  -> country_france
```

Funding round ID format:

```text
round_<startup_slug>_<year>_<round_type_slug>
```

If duplicate round types occur in the same year, append month or an index:

```text
round_anthropic_2025_series_f
round_anthropic_2025_strategic_01
```

## Controlled Vocabulary: AI Domains

Use the following primary domain names unless there is a strong reason to add another:

- Foundation Models / LLMs
- AI Infrastructure
- AI Chips / Semiconductors
- Coding Agents / Developer Tools
- Enterprise AI
- Healthcare AI / Drug Discovery
- Robotics / Physical AI
- Autonomous Vehicles
- Defense / Security AI
- Data / Analytics
- Creative / Generative Media
- Search / Knowledge Agents
- Fintech AI
- Climate / Energy AI

## Controlled Vocabulary: Regions

Use explicit region labels. Start with:

- `US`
- `Europe`
- `Israel`
- `China`
- `UAE / Gulf`
- `Canada`
- `India`
- `Singapore`
- `Other Global`

Add a new region only when several qualifying companies or a clearly distinct
investment geography justify it. Otherwise use `Other Global` and preserve the
specific country in `country`.

## Validation Rules

A funding event is invalid if:

- `event_id` is duplicated;
- `startup_name` is empty;
- `amount_usd` is below 100000000;
- `year` is outside 2024–2026;
- `source_url` is empty;
- both `lead_investors` and `participating_investors` are empty;
- `ai_domain` is empty;
- `region` is not in the controlled vocabulary.

Rows that fail validation should be reported with line number and reason.
