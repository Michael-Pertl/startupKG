// Neo4j Browser visualization queries.
// Run one query at a time and switch the result view to Graph.

// V1. Full domain -> startup -> round pattern, capped by largest rounds.
MATCH (d:AIDomain)<-[:OPERATES_IN]-(s:Startup)-[:RAISED]->(f:FundingRound)
WITH d, s, f
ORDER BY f.amount_usd DESC
LIMIT 80
RETURN d, s, f;

// V2. Investor participation network around the largest funding rounds.
MATCH (i:Investor)-[p:PARTICIPATED_IN]->(f:FundingRound)<-[:RAISED]-(s:Startup)
WITH i, p, f, s
ORDER BY f.amount_usd DESC
LIMIT 180
RETURN i, p, f, s;

// V3. AI infrastructure subgraph.
MATCH (d:AIDomain {name: 'AI Infrastructure'})<-[:OPERATES_IN]-(s:Startup)-[:RAISED]->(f:FundingRound)
OPTIONAL MATCH (i:Investor)-[p:PARTICIPATED_IN]->(f)
RETURN d, s, f, i, p
LIMIT 220;

// V4. Foundation model / LLM subgraph.
MATCH (d:AIDomain {name: 'Foundation Models / LLMs'})<-[:OPERATES_IN]-(s:Startup)-[:RAISED]->(f:FundingRound)
OPTIONAL MATCH (i:Investor)-[p:PARTICIPATED_IN]->(f)
RETURN d, s, f, i, p
LIMIT 220;

// V5. Region-specific funding network.
// Change the region name as needed, for example Europe, Israel, China, or UAE / Gulf.
MATCH (s:Startup {region: 'Europe'})-[:RAISED]->(f:FundingRound)
OPTIONAL MATCH (i:Investor)-[p:PARTICIPATED_IN]->(f)
OPTIONAL MATCH (s)-[:OPERATES_IN]->(d:AIDomain)
RETURN s, f, i, p, d
LIMIT 220;

// V6. Cross-region investors and their connected startups.
MATCH (i:Investor)-[:PARTICIPATED_IN]->(:FundingRound)<-[:RAISED]-(s:Startup)
WITH i, collect(DISTINCT s.region) AS regions
WHERE size(regions) >= 2
MATCH (i)-[p:PARTICIPATED_IN]->(f:FundingRound)<-[:RAISED]-(s2:Startup)
RETURN i, p, f, s2
LIMIT 220;

// V7. Co-investment graph among frequently recurring investors.
MATCH (i:Investor)-[:PARTICIPATED_IN]->(f:FundingRound)
WITH i, count(DISTINCT f) AS rounds
WHERE rounds >= 3
MATCH (i)-[:PARTICIPATED_IN]->(shared:FundingRound)<-[:PARTICIPATED_IN]-(j:Investor)
WHERE i.investor_id < j.investor_id
WITH i, j, count(DISTINCT shared) AS shared_rounds
WHERE shared_rounds >= 2
RETURN i, j;

// V8. One startup neighborhood template.
// Change the startup name as needed.
MATCH (s:Startup {name: 'Mistral AI'})-[:RAISED]->(f:FundingRound)
OPTIONAL MATCH (i:Investor)-[p:PARTICIPATED_IN]->(f)
OPTIONAL MATCH (s)-[:OPERATES_IN]->(d:AIDomain)
OPTIONAL MATCH (s)-[:HEADQUARTERED_IN]->(c:Country)-[:PART_OF]->(r:Region)
RETURN s, f, i, p, d, c, r;
