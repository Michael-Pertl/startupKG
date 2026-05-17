// Neo4j schema for the AI startup funding knowledge graph.
// Run before 01_import.cypher.

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

CREATE INDEX startup_name_index IF NOT EXISTS
FOR (s:Startup) ON (s.name);

CREATE INDEX investor_name_index IF NOT EXISTS
FOR (i:Investor) ON (i.name);

CREATE INDEX funding_year_index IF NOT EXISTS
FOR (r:FundingRound) ON (r.year);

CREATE INDEX funding_amount_index IF NOT EXISTS
FOR (r:FundingRound) ON (r.amount_usd);

CREATE INDEX funding_source_type_index IF NOT EXISTS
FOR (r:FundingRound) ON (r.source_type);

CREATE INDEX investor_type_index IF NOT EXISTS
FOR (i:Investor) ON (i.investor_type);
