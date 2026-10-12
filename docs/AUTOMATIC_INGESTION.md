# Automatic evidence ingestion

The refresh pipeline no longer requires an administrator's approval for complete
structured funding evidence. Place records with the raw funding schema in
`data/raw/new_funding_events.csv`; every refresh automatically validates and
appends qualifying records. The inbox is preserved. Repeat refreshes skip exact
duplicates; conflicts and incomplete records are quarantined in the audit report
`data/app/automatic_ingestion_report.json`, not silently discarded.

```bash
python3 scripts/refresh_platform.py --discover
```

Automatic acceptance currently requires high-confidence press-release or Reuters
evidence, a confirmed nonfuture financing date, USD amounts with matching original
amount, documented country/region, AI domain, and at least one investor. These are
structural gates, not proof that an arbitrary submitted URL supports the fields.
The inbox must come from a trusted structured source adapter, not public submissions.
RSS currently provides discovery snippets only; it does not extract all required
funding evidence and therefore does not populate this inbox automatically. A future
source adapter must supply these fields with evidence before end-to-end discovery
can become fully automatic. No single-admin approval is required by this ingestion path.

Tavily is **off by default**, including the startup refresh. Only explicitly use
`--tavily` after resuming the provider. A paused Render connection is not changed
by local code. No production schedule or deployment was enabled by this change.

Use one refresh writer at a time (for example a scheduler with `flock`); the CSV
append path is not a concurrent multiworker datastore. For production, move
transactional ingestion and unique event keys to the existing database before
enabling multiple workers. Source validation and structured extraction are the
next release priority, followed by investor watchlists and weekly change digests.

The graph represents curated publicly reported AI mega-rounds of USD100M or more,
not the full AI startup ecosystem. Automatic acceptance does not make coverage
complete or independently verify all historical evidence.

## Write reliability and diagnostics

Both funding ingestion entry points serialize writes with a shared lock, recheck event IDs under that lock, write to a temporary file, flush it, and atomically replace the destination. A malformed record, duplicate ID, or failed write leaves the previous evidence file intact. Existing evidence values are preserved; corrections continue to use the separate evidence reconciliation workflow.

Malformed CSV rows produce a line-numbered validation error rather than crashing on a missing field. Automatic selection quarantines incomplete records and records reasons. Equivalent USD number formatting is accepted, while foreign-currency conversions and uncertain financing bases still need sourced reconciliation. The ingestion report records candidate, ingested, already-ingested, and quarantined counts.

Run `python3 scripts/refresh_platform.py --discover` to poll public feeds and rebuild the app. RSS discoveries remain separate from structured funding ingestion and quantitative funding totals until their evidence is completed and validated.

The graph represents curated publicly reported AI mega-rounds above the selected funding threshold, not the full AI startup ecosystem.
