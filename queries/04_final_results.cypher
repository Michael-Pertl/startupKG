// Final result tables for the portfolio report.
// These queries are designed to be copied/exported from Neo4j Browser or cypher-shell.

// R1. Dataset overview.
CALL {
  MATCH (s:Startup) RETURN count(s) AS startups
}
CALL {
  MATCH (f:FundingRound) RETURN count(f) AS funding_rounds
}
CALL {
  MATCH (i:Investor) RETURN count(i) AS investors
}
CALL {
  MATCH (:Investor)-[p:PARTICIPATED_IN]->(:FundingRound) RETURN count(p) AS participations
}
CALL {
  MATCH (d:AIDomain) RETURN count(d) AS domains
}
CALL {
  MATCH (c:Country) RETURN count(c) AS countries
}
RETURN startups, funding_rounds, investors, participations, domains, countries;

// R2. Funding by region and year.
MATCH (s:Startup)-[:RAISED]->(f:FundingRound)
RETURN s.region AS region,
       f.year AS year,
       count(f) AS rounds,
       round(sum(f.amount_usd) / 1000000000.0, 2) AS amount_usd_bn,
       round(avg(f.amount_usd) / 1000000000.0, 2) AS avg_round_usd_bn
ORDER BY year, region;

// R3. Regional totals.
MATCH (s:Startup)-[:RAISED]->(f:FundingRound)
RETURN s.region AS region,
       count(DISTINCT s) AS startups,
       count(f) AS rounds,
       round(sum(f.amount_usd) / 1000000000.0, 2) AS amount_usd_bn
ORDER BY amount_usd_bn DESC;

// R4. Domain totals.
MATCH (s:Startup)-[:OPERATES_IN {role: 'primary'}]->(d:AIDomain)
MATCH (s)-[:RAISED]->(f:FundingRound)
RETURN d.name AS ai_domain,
       count(DISTINCT s) AS startups,
       count(f) AS rounds,
       round(sum(f.amount_usd) / 1000000000.0, 2) AS amount_usd_bn
ORDER BY amount_usd_bn DESC;

// R5. Region-domain comparison.
MATCH (s:Startup)-[:OPERATES_IN {role: 'primary'}]->(d:AIDomain)
MATCH (s)-[:RAISED]->(f:FundingRound)
RETURN s.region AS region,
       d.name AS ai_domain,
       count(DISTINCT s) AS startups,
       count(f) AS rounds,
       round(sum(f.amount_usd) / 1000000000.0, 2) AS amount_usd_bn
ORDER BY region, amount_usd_bn DESC;

// R6. Most active investors.
MATCH (i:Investor)-[:PARTICIPATED_IN]->(f:FundingRound)
RETURN i.name AS investor,
       i.investor_type AS investor_type,
       i.country AS investor_country,
       count(DISTINCT f) AS rounds,
       count { (i)-[:PARTICIPATED_IN {role: 'lead'}]->(:FundingRound) } AS lead_rounds,
       round(sum(f.amount_usd) / 1000000000.0, 2) AS participated_amount_usd_bn
ORDER BY rounds DESC, participated_amount_usd_bn DESC, investor
LIMIT 25;

// R7. Lead investor concentration.
MATCH (i:Investor)-[:PARTICIPATED_IN {role: 'lead'}]->(f:FundingRound)
RETURN i.name AS lead_investor,
       i.investor_type AS investor_type,
       i.country AS investor_country,
       count(DISTINCT f) AS lead_rounds,
       round(sum(f.amount_usd) / 1000000000.0, 2) AS led_amount_usd_bn
ORDER BY lead_rounds DESC, led_amount_usd_bn DESC, lead_investor
LIMIT 25;

// R8. Cross-region investors.
MATCH (i:Investor)-[:PARTICIPATED_IN]->(f:FundingRound)<-[:RAISED]-(s:Startup)
WITH i, collect(DISTINCT s.region) AS startup_regions, count(DISTINCT f) AS rounds
WHERE size(startup_regions) >= 2
RETURN i.name AS investor,
       i.investor_type AS investor_type,
       i.country AS investor_country,
       rounds,
       size(startup_regions) AS region_count,
       startup_regions
ORDER BY region_count DESC, rounds DESC, investor
LIMIT 30;

// R9. Strongest co-investor pairs.
MATCH (i1:Investor)-[:PARTICIPATED_IN]->(f:FundingRound)<-[:PARTICIPATED_IN]-(i2:Investor)
WHERE i1.investor_id < i2.investor_id
RETURN i1.name AS investor_1,
       i2.name AS investor_2,
       count(DISTINCT f) AS shared_rounds,
       round(sum(f.amount_usd) / 1000000000.0, 2) AS shared_round_amount_usd_bn
ORDER BY shared_rounds DESC, shared_round_amount_usd_bn DESC
LIMIT 30;

// R10. Largest rounds.
MATCH (s:Startup)-[:RAISED]->(f:FundingRound)
MATCH (s)-[:OPERATES_IN {role: 'primary'}]->(d:AIDomain)
RETURN s.name AS startup,
       s.region AS region,
       d.name AS ai_domain,
       f.year AS year,
       f.round_type AS round_type,
       round(f.amount_usd / 1000000000.0, 2) AS amount_usd_bn,
       f.source_type AS source_type,
       f.confidence AS confidence
ORDER BY f.amount_usd DESC
LIMIT 25;

// R11. Repeated mega-round startups.
MATCH (s:Startup)-[:RAISED]->(f:FundingRound)
WITH s, count(f) AS rounds, sum(f.amount_usd) AS amount_usd
WHERE rounds > 1
RETURN s.name AS startup,
       s.region AS region,
       rounds,
       round(amount_usd / 1000000000.0, 2) AS amount_usd_bn
ORDER BY amount_usd_bn DESC, rounds DESC;

// R12. Monthly development, useful for a timeline chart.
MATCH (s:Startup)-[:RAISED]->(f:FundingRound)
RETURN f.year AS year,
       f.month AS month,
       s.region AS region,
       count(f) AS rounds,
       round(sum(f.amount_usd) / 1000000000.0, 2) AS amount_usd_bn
ORDER BY year, month, region;

// R13. Source quality summary.
MATCH (f:FundingRound)
RETURN f.source_type AS source_type,
       f.confidence AS confidence,
       count(*) AS rounds
ORDER BY source_type, confidence;

// R14. Company-level mega-round accumulation.
MATCH (s:Startup)-[:RAISED]->(f:FundingRound)
WITH s,
     count(f) AS mega_rounds,
     count(DISTINCT f.year) AS active_years,
     min(f.round_date) AS first_mega_round,
     max(f.round_date) AS last_mega_round,
     sum(f.amount_usd) AS total_amount_usd,
     max(f.amount_usd) AS largest_round_usd
RETURN s.name AS startup,
       s.region AS region,
       s.primary_domain AS primary_domain,
       mega_rounds,
       active_years,
       first_mega_round,
       last_mega_round,
       round(total_amount_usd / 1000000000.0, 2) AS total_amount_usd_bn,
       round(largest_round_usd / 1000000000.0, 2) AS largest_round_usd_bn
ORDER BY total_amount_usd DESC
LIMIT 30;

// R15. Startup-year cumulative mega-round trajectory.
MATCH (s:Startup)-[:RAISED]->(f:FundingRound)
WITH s, f.year AS year, count(f) AS rounds, sum(f.amount_usd) AS yearly_amount
ORDER BY s.name, year
WITH s, collect({year: year, rounds: rounds, amount: yearly_amount}) AS yearly
UNWIND range(0, size(yearly) - 1) AS idx
WITH s,
     yearly[idx] AS current,
     reduce(total = 0, item IN yearly[0..idx + 1] | total + item.amount) AS cumulative_amount
RETURN s.name AS startup,
       s.region AS region,
       s.primary_domain AS primary_domain,
       current.year AS year,
       current.rounds AS mega_rounds,
       round(current.amount / 1000000000.0, 2) AS amount_usd_bn,
       round(cumulative_amount / 1000000000.0, 2) AS cumulative_amount_usd_bn
ORDER BY startup, year;
