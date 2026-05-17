// Import CSV files from Neo4j's import directory.
// Copy data/neo4j_import/*.csv into the Neo4j import directory first.
// This script is idempotent: it uses MERGE and can be rerun.

LOAD CSV WITH HEADERS FROM 'file:///countries.csv' AS row
MERGE (r:Region {name: row.region})
WITH r, row
MERGE (c:Country {country_id: row.country_id})
SET c.name = row.name,
    c.region = row.region
WITH c, row
MATCH (r:Region {name: row.region})
MERGE (c)-[:PART_OF]->(r);

LOAD CSV WITH HEADERS FROM 'file:///domains.csv' AS row
MERGE (d:AIDomain {domain_id: row.domain_id})
SET d.name = row.name;

LOAD CSV WITH HEADERS FROM 'file:///startups.csv' AS row
MERGE (s:Startup {startup_id: row.startup_id})
SET s.name = row.name,
    s.region = row.region,
    s.country = row.country,
    s.city = row.city,
    s.primary_domain = row.primary_domain
WITH s, row
MATCH (c:Country {name: row.country})
MERGE (s)-[:HEADQUARTERED_IN]->(c);

LOAD CSV WITH HEADERS FROM 'file:///investors.csv' AS row
MERGE (i:Investor {investor_id: row.investor_id})
SET i.name = row.name,
    i.investor_type = row.investor_type,
    i.country = row.country,
    i.website = row.website;

LOAD CSV WITH HEADERS FROM 'file:///funding_rounds.csv' AS row
MERGE (f:FundingRound {round_id: row.round_id})
SET f.round_type = row.round_type,
    f.round_date = CASE row.round_date WHEN '' THEN null ELSE date(row.round_date) END,
    f.year = toInteger(row.year),
    f.month = CASE row.month WHEN '' THEN null ELSE toInteger(row.month) END,
    f.amount_usd = toInteger(row.amount_usd),
    f.source_url = row.source_url,
    f.source_type = row.source_type,
    f.confidence = row.confidence
WITH f, row
MATCH (s:Startup {startup_id: row.startup_id})
MERGE (s)-[:RAISED]->(f);

LOAD CSV WITH HEADERS FROM 'file:///startup_domains.csv' AS row
MATCH (s:Startup {startup_id: row.startup_id})
MATCH (d:AIDomain {domain_id: row.domain_id})
MERGE (s)-[rel:OPERATES_IN]->(d)
SET rel.role = row.role;

LOAD CSV WITH HEADERS FROM 'file:///participations.csv' AS row
MATCH (i:Investor {investor_id: row.investor_id})
MATCH (f:FundingRound {round_id: row.round_id})
MERGE (i)-[rel:PARTICIPATED_IN]->(f)
SET rel.role = row.role;
