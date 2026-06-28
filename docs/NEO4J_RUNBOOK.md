# Neo4j Runbook

This runbook loads the curated AI startup funding dataset into Neo4j.

## Prerequisite

Docker Desktop must have WSL integration enabled for this distro.

In Docker Desktop:

1. Open Settings.
2. Go to Resources -> WSL integration.
3. Enable integration for the Ubuntu/WSL distro used by this project.
4. Apply and restart Docker Desktop if prompted.

Verify from the project directory:

```bash
docker ps
```

## Start Neo4j

```bash
docker compose up -d
```

If an earlier container is stuck in a restart loop, recreate it after updating
`docker-compose.yml`:

```bash
docker compose down
docker compose up -d
```

Neo4j Browser:

```text
http://localhost:7474
```

Credentials:

```text
username: neo4j
password: startupkg2026
```

## Load The Graph

Run the schema:

```bash
docker exec -i startupkg-neo4j cypher-shell -u neo4j -p startupkg2026 < queries/00_schema.cypher
```

Import the CSV files:

```bash
docker exec -i startupkg-neo4j cypher-shell -u neo4j -p startupkg2026 < queries/01_import.cypher
```

Validate the graph:

```bash
docker exec -i startupkg-neo4j cypher-shell -u neo4j -p startupkg2026 < queries/02_validation.cypher
```

Run analysis queries:

```bash
docker exec -i startupkg-neo4j cypher-shell -u neo4j -p startupkg2026 < queries/03_analysis.cypher
```

## Expected Imported Dataset

The current import should contain:

- 90 funding events
- 68 startups
- 275 investors
- 585 investor-round participations
- 19 AI infrastructure funding events
- 23 funding events from 2026

## Stop Neo4j

```bash
docker compose down
```

To delete the local database volume and start clean:

```bash
docker compose down -v
```
