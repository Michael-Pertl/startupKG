// Validation queries to run after importing the graph.

// Basic node counts.
MATCH (n)
RETURN labels(n) AS labels, count(*) AS count
ORDER BY labels;

// Basic relationship counts.
MATCH ()-[r]->()
RETURN type(r) AS relationship_type, count(*) AS count
ORDER BY relationship_type;

// Funding rounds without a startup.
MATCH (f:FundingRound)
WHERE NOT EXISTS { MATCH (:Startup)-[:RAISED]->(f) }
RETURN f.round_id AS round_id, f.round_type AS round_type
ORDER BY round_id;

// Funding rounds without any investor participation.
MATCH (f:FundingRound)
WHERE NOT EXISTS { MATCH (:Investor)-[:PARTICIPATED_IN]->(f) }
RETURN f.round_id AS round_id, f.round_type AS round_type
ORDER BY round_id;

// Startups without country relationship.
MATCH (s:Startup)
WHERE NOT EXISTS { MATCH (s)-[:HEADQUARTERED_IN]->(:Country) }
RETURN s.startup_id AS startup_id, s.name AS startup
ORDER BY startup;

// Startups without AI domain relationship.
MATCH (s:Startup)
WHERE NOT EXISTS { MATCH (s)-[:OPERATES_IN]->(:AIDomain) }
RETURN s.startup_id AS startup_id, s.name AS startup
ORDER BY startup;

// Countries without region relationship.
MATCH (c:Country)
WHERE NOT EXISTS { MATCH (c)-[:PART_OF]->(:Region) }
RETURN c.country_id AS country_id, c.name AS country
ORDER BY country;

// Rounds with no explicit lead investor.
MATCH (s:Startup)-[:RAISED]->(f:FundingRound)
WHERE NOT EXISTS {
  MATCH (:Investor)-[:PARTICIPATED_IN {role: 'lead'}]->(f)
}
RETURN s.name AS startup,
       f.year AS year,
       f.round_type AS round_type,
       f.amount_usd AS amount_usd,
       f.source_url AS source_url
ORDER BY year, startup;

// Sanity check: all rounds should be >= USD 100M.
MATCH (s:Startup)-[:RAISED]->(f:FundingRound)
WHERE f.amount_usd < 100000000
RETURN s.name AS startup, f.round_id AS round_id, f.amount_usd AS amount_usd;

// Count imported rounds by region and year.
MATCH (s:Startup)-[:RAISED]->(f:FundingRound)
RETURN s.region AS region, f.year AS year, count(*) AS rounds, sum(f.amount_usd) AS amount_usd
ORDER BY year, region;
