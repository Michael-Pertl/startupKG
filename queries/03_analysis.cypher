// Analysis queries for the research question.

// 1. Funding volume by region and year.
MATCH (s:Startup)-[:RAISED]->(f:FundingRound)
RETURN s.region AS region,
       f.year AS year,
       count(f) AS rounds,
       round(sum(f.amount_usd) / 1000000000.0, 2) AS amount_usd_bn
ORDER BY year, region;

// 2. Funding volume by AI domain.
MATCH (s:Startup)-[:RAISED]->(f:FundingRound)
MATCH (s)-[:OPERATES_IN {role: 'primary'}]->(d:AIDomain)
RETURN d.name AS ai_domain,
       count(f) AS rounds,
       round(sum(f.amount_usd) / 1000000000.0, 2) AS amount_usd_bn
ORDER BY amount_usd_bn DESC;

// 3. Funding volume by region and AI domain.
MATCH (s:Startup)-[:RAISED]->(f:FundingRound)
MATCH (s)-[:OPERATES_IN {role: 'primary'}]->(d:AIDomain)
RETURN s.region AS region,
       d.name AS ai_domain,
       count(f) AS rounds,
       round(sum(f.amount_usd) / 1000000000.0, 2) AS amount_usd_bn
ORDER BY region, amount_usd_bn DESC;

// 4. Most active investors by number of rounds.
MATCH (i:Investor)-[p:PARTICIPATED_IN]->(f:FundingRound)
RETURN i.name AS investor,
       i.investor_type AS investor_type,
       i.country AS investor_country,
       count(f) AS rounds,
       count { (i)-[:PARTICIPATED_IN {role: 'lead'}]->(:FundingRound) } AS lead_rounds
ORDER BY rounds DESC, lead_rounds DESC, investor
LIMIT 25;

// 5. Lead investor concentration.
MATCH (i:Investor)-[:PARTICIPATED_IN {role: 'lead'}]->(f:FundingRound)
RETURN i.name AS lead_investor,
       i.investor_type AS investor_type,
       count(f) AS lead_rounds,
       round(sum(f.amount_usd) / 1000000000.0, 2) AS led_amount_usd_bn
ORDER BY lead_rounds DESC, led_amount_usd_bn DESC
LIMIT 25;

// 6. Cross-region investor participation.
MATCH (i:Investor)-[:PARTICIPATED_IN]->(f:FundingRound)<-[:RAISED]-(s:Startup)
WITH i, collect(DISTINCT s.region) AS startup_regions, count(DISTINCT f) AS rounds
WHERE size(startup_regions) > 1
RETURN i.name AS investor,
       i.investor_type AS investor_type,
       i.country AS investor_country,
       startup_regions,
       rounds
ORDER BY rounds DESC, investor
LIMIT 30;

// 7. Investor co-investment network.
MATCH (i1:Investor)-[:PARTICIPATED_IN]->(f:FundingRound)<-[:PARTICIPATED_IN]-(i2:Investor)
WHERE i1.investor_id < i2.investor_id
RETURN i1.name AS investor_1,
       i2.name AS investor_2,
       count(f) AS shared_rounds,
       round(sum(f.amount_usd) / 1000000000.0, 2) AS shared_round_amount_usd_bn
ORDER BY shared_rounds DESC, shared_round_amount_usd_bn DESC
LIMIT 50;

// 8. Largest funding rounds.
MATCH (s:Startup)-[:RAISED]->(f:FundingRound)
MATCH (s)-[:OPERATES_IN {role: 'primary'}]->(d:AIDomain)
RETURN s.name AS startup,
       s.region AS region,
       d.name AS ai_domain,
       f.year AS year,
       f.round_type AS round_type,
       round(f.amount_usd / 1000000000.0, 2) AS amount_usd_bn,
       f.source_url AS source_url
ORDER BY f.amount_usd DESC
LIMIT 25;

// 9. Startups with repeated mega-rounds.
MATCH (s:Startup)-[:RAISED]->(f:FundingRound)
WITH s, count(f) AS rounds, sum(f.amount_usd) AS amount_usd
WHERE rounds > 1
RETURN s.name AS startup,
       s.region AS region,
       rounds,
       round(amount_usd / 1000000000.0, 2) AS amount_usd_bn
ORDER BY amount_usd_bn DESC;

// 10. Source and confidence distribution for methodology reporting.
MATCH (f:FundingRound)
RETURN f.source_type AS source_type,
       f.confidence AS confidence,
       count(*) AS rounds
ORDER BY source_type, confidence;
