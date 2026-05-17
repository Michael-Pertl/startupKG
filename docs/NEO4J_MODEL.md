# Neo4j Property Graph Model

## Design Principle

The funding round is modelled as a node because it is an event with its own properties: date, amount, round type, source, and confidence. Investors participate in funding rounds; startups raise funding rounds.

This is better than a direct `(:Investor)-[:INVESTED_IN]->(:Startup)` edge because multiple investors can participate in the same round and because the same investor can participate in multiple rounds for the same startup.

The Neo4j graph is the core mega-round evidence layer. App-facing company
background such as founders, product summaries, reported total funding, latest
valuation, and optional smaller/pre-2024 funding events lives in CSV profile
tables unless the project later decides to model that enrichment in Neo4j.

## Nodes

### `Startup`

Properties:

```text
startup_id
name
region
country
city
primary_domain
```

### `Investor`

Properties:

```text
investor_id
name
investor_type
country
website
```

### `FundingRound`

Properties:

```text
round_id
round_type
round_date
year
month
amount_usd
source_url
source_type
confidence
```

### `AIDomain`

Properties:

```text
domain_id
name
```

### `Country`

Properties:

```text
country_id
name
region
```

### `Region`

Properties:

```text
name
```

Use region nodes such as:

```text
US
Europe
Israel
China
UAE / Gulf
Canada
India
Singapore
Other Global
```

## Relationships

### Startup raised funding round

```cypher
(:Startup)-[:RAISED]->(:FundingRound)
```

### Investor participated in funding round

```cypher
(:Investor)-[:PARTICIPATED_IN {role: "lead"|"participant"|"unknown"}]->(:FundingRound)
```

### Startup operates in AI domain

```cypher
(:Startup)-[:OPERATES_IN {role: "primary"|"secondary"}]->(:AIDomain)
```

### Startup headquartered in country

```cypher
(:Startup)-[:HEADQUARTERED_IN]->(:Country)
```

### Country belongs to region

```cypher
(:Country)-[:PART_OF]->(:Region)
```

## Constraints

Create uniqueness constraints:

```cypher
CREATE CONSTRAINT startup_id_unique IF NOT EXISTS
FOR (s:Startup) REQUIRE s.startup_id IS UNIQUE;

CREATE CONSTRAINT investor_id_unique IF NOT EXISTS
FOR (i:Investor) REQUIRE i.investor_id IS UNIQUE;

CREATE CONSTRAINT round_id_unique IF NOT EXISTS
FOR (r:FundingRound) REQUIRE r.round_id IS UNIQUE;

CREATE CONSTRAINT domain_id_unique IF NOT EXISTS
FOR (d:AIDomain) REQUIRE d.domain_id IS UNIQUE;

CREATE CONSTRAINT country_id_unique IF NOT EXISTS
FOR (c:Country) REQUIRE c.country_id IS UNIQUE;

CREATE CONSTRAINT region_name_unique IF NOT EXISTS
FOR (r:Region) REQUIRE r.name IS UNIQUE;
```

## Recommended Indexes

```cypher
CREATE INDEX startup_name_index IF NOT EXISTS
FOR (s:Startup) ON (s.name);

CREATE INDEX investor_name_index IF NOT EXISTS
FOR (i:Investor) ON (i.name);

CREATE INDEX funding_year_index IF NOT EXISTS
FOR (r:FundingRound) ON (r.year);

CREATE INDEX funding_amount_index IF NOT EXISTS
FOR (r:FundingRound) ON (r.amount_usd);
```

## Import Order

1. Constraints and indexes
2. Regions
3. Countries
4. Domains
5. Startups
6. Investors
7. Funding rounds
8. Startup-country relationships
9. Country-region relationships
10. Startup-domain relationships
11. Startup-round relationships
12. Investor-round relationships

## App Profile Layer

Use these files outside the core graph import for profile pages and timelines:

```text
data/raw/startup_profiles.csv
data/raw/historical_funding_events_raw.csv
data/processed/startup_growth_metrics.csv
data/processed/startup_funding_trajectory.csv
```

`startup_growth_metrics.csv` and `startup_funding_trajectory.csv` are derived
from mega-round evidence. They do not represent complete lifetime funding.
