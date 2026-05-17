# Analysis Plan

## Research Question

How do major regional AI mega-round funding networks differ in terms of investor concentration, sector focus, co-investment structure, and temporal development from 2024 to 2026?

## Analysis 1: Dataset Overview

Questions:

- How many startups are included?
- How many funding rounds are included?
- How many investors are included?
- How many investor participation edges exist?
- How many AI domains and countries are represented?

Example Cypher:

```cypher
MATCH (s:Startup) RETURN count(s) AS startups;
MATCH (r:FundingRound) RETURN count(r) AS rounds;
MATCH (i:Investor) RETURN count(i) AS investors;
MATCH (:Investor)-[p:PARTICIPATED_IN]->(:FundingRound) RETURN count(p) AS participations;
```

## Analysis 2: Funding by Region and Year

Question:

Which region received more mega-round funding by year?

```cypher
MATCH (s:Startup)-[:RAISED]->(r:FundingRound)
RETURN s.region AS region, r.year AS year, count(r) AS rounds, sum(r.amount_usd) AS total_funding_usd
ORDER BY year, total_funding_usd DESC;
```

## Analysis 3: Funding by Domain

Question:

Which AI domains attracted the most capital?

```cypher
MATCH (s:Startup)-[:OPERATES_IN]->(d:AIDomain),
      (s)-[:RAISED]->(r:FundingRound)
RETURN d.name AS domain,
       count(DISTINCT s) AS startups,
       count(r) AS rounds,
       sum(r.amount_usd) AS total_funding_usd
ORDER BY total_funding_usd DESC;
```

## Analysis 4: Most Active Investors

Question:

Which investors participated in the most mega-rounds?

```cypher
MATCH (i:Investor)-[:PARTICIPATED_IN]->(r:FundingRound)
RETURN i.name AS investor, count(r) AS rounds
ORDER BY rounds DESC
LIMIT 20;
```

## Analysis 5: Lead Investor Concentration

Question:

Which investors most often led mega-rounds?

```cypher
MATCH (i:Investor)-[p:PARTICIPATED_IN {role: "lead"}]->(r:FundingRound)
RETURN i.name AS investor, count(r) AS led_rounds, sum(r.amount_usd) AS led_round_volume_usd
ORDER BY led_rounds DESC, led_round_volume_usd DESC
LIMIT 20;
```

## Analysis 6: Co-Investment Network

Question:

Which investors frequently co-invest?

```cypher
MATCH (i1:Investor)-[:PARTICIPATED_IN]->(r:FundingRound)<-[:PARTICIPATED_IN]-(i2:Investor)
WHERE i1.investor_id < i2.investor_id
RETURN i1.name AS investor_1,
       i2.name AS investor_2,
       count(r) AS co_investments
ORDER BY co_investments DESC
LIMIT 30;
```

## Analysis 7: Cross-Region Investors

Question:

Which investors participate across multiple regional AI mega-round markets?

```cypher
MATCH (i:Investor)-[:PARTICIPATED_IN]->(:FundingRound)<-[:RAISED]-(s:Startup)
WITH i, collect(DISTINCT s.region) AS regions
WHERE size(regions) >= 2
RETURN i.name AS investor, regions, size(regions) AS region_count
ORDER BY region_count DESC, investor;
```

## Analysis 8: Startup Centrality Proxy

Question:

Which startups connect many investors through one or more rounds?

```cypher
MATCH (i:Investor)-[:PARTICIPATED_IN]->(:FundingRound)<-[:RAISED]-(s:Startup)
RETURN s.name AS startup,
       s.region AS region,
       count(DISTINCT i) AS investor_count
ORDER BY investor_count DESC
LIMIT 20;
```

## Analysis 9: Domain Differences by Region

Question:

Are regional mega-rounds concentrated in different AI domains?

```cypher
MATCH (s:Startup)-[:OPERATES_IN]->(d:AIDomain),
      (s)-[:RAISED]->(r:FundingRound)
RETURN s.region AS region,
       d.name AS domain,
       count(r) AS rounds,
       sum(r.amount_usd) AS total_funding_usd
ORDER BY region, total_funding_usd DESC;
```

## Analysis 10: Time Development

Question:

How did AI mega-round activity develop over time?

```cypher
MATCH (s:Startup)-[:RAISED]->(r:FundingRound)
RETURN r.year AS year,
       r.month AS month,
       s.region AS region,
       count(r) AS rounds,
       sum(r.amount_usd) AS total_funding_usd
ORDER BY year, month, region;
```

## Analysis 11: Company Mega-Round Growth

Question:

Which startups show repeated or accelerating mega-round capital accumulation
inside the 2024-2026 evidence window?

Use `data/processed/startup_growth_metrics.csv` for app tables and
`data/processed/startup_funding_trajectory.csv` for line charts. These files
summarize mega-round evidence only; they are not complete lifetime funding
histories.

## Optional Graph Algorithm

Recommended first graph algorithm:

- Degree centrality on investor co-investment graph

Alternative:

- Betweenness centrality to identify bridge investors
- Louvain community detection to find co-investment clusters

## Interpretation Rules

Do not overclaim.

Correct wording:

> The graph suggests that, within publicly reported mega-rounds, certain investors appear more central.

Incorrect wording:

> These are the most important AI investors overall.

Correct wording:

> Funding volume in this curated dataset is concentrated in foundation models and AI infrastructure.

Incorrect wording:

> AI investment overall is concentrated only in foundation models and AI infrastructure.
