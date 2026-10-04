#!/usr/bin/env python3
"""Export coverage and freshness separately from pipeline execution time."""

import csv
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def rows(relative: str) -> list[dict[str, str]]:
    with (ROOT / relative).open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def report(name: str) -> dict:
    path = ROOT / "data" / "app" / name
    return json.loads(path.read_text()) if path.exists() else {"status": "never_run"}


def build_health(funding: list[dict[str, str]], investors: list[dict[str, str]], events: list[dict[str, str]]) -> dict:
    dates = [row["round_date"] for row in funding if row["round_date"]]
    regional = Counter(row["region"] for row in funding)
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "coverage_status": "curated_incomplete",
        "scope_note": "Curated publicly reported AI mega-rounds of USD100M or more in 2024-2026; smaller rounds and undisclosed funding are outside core coverage. Regional samples are uneven.",
        "latest_funding_date": max(dates, default=None),
        "funding_events": len(funding),
        "companies": len({row["startup_name"] for row in funding}),
        "unknown_investors": sum(row["investor_type"] == "unknown" or not row["country"] for row in investors),
        "unreviewed_events": sum(row["status"] in {"needs_review", "auto_ingested", "staged"} for row in events),
        "undated_funding_events": sum(not row["round_date"] for row in funding),
        "low_confidence_events": sum(row["confidence"] == "low" for row in funding),
        "source_rechecked_events": sum(row.get("verification_status") == "core_fields_checked" for row in funding),
        "amount_basis_counts": dict(Counter(row.get("amount_basis", "reported_round") for row in funding)),
        "regions": [{"region": name, "events": count, "latest_date": max((row["round_date"] for row in funding if row["region"] == name), default=""), "small_sample": count < 10} for name, count in sorted(regional.items())],
    }


def assurance(payload, now=None):
    now = now or datetime.now(timezone.utc)
    blockers = []
    def recent(value, hours):
        try:
            recorded = datetime.fromisoformat(value.replace("Z", "+00:00"))
            age = (now - recorded).total_seconds() / 3600
            return recorded.tzinfo is not None and 0 <= age <= hours
        except (AttributeError, TypeError, ValueError):
            return False
    if payload.get("pipeline", {}).get("status") not in {"ok", "degraded"} or not recent(payload.get("pipeline", {}).get("completed_at"), 72):
        blockers.append("No successful refresh within 72 hours")
    rss = payload.get("rss", {})
    if not recent(rss.get("fetched_at"), 48):
        blockers.append("Public-source discovery has not succeeded within 48 hours")
    if not rss.get("active_feeds") or rss.get("successful_feeds", 0) < rss.get("active_feeds", 0):
        blockers.append("One or more configured public feeds are unavailable")
    if payload.get("source_rechecked_events", 0) < payload["funding_events"]:
        blockers.append("Historical funding evidence has not been fully rechecked")
    if payload["unknown_investors"]:
        blockers.append("Investor country/type metadata is incomplete")
    if payload["low_confidence_events"] or payload["undated_funding_events"] or not payload["funding_events"]:
        blockers.append("Core evidence is empty, uncertain or missing dates")
    if payload.get("evidence_error"):
        blockers.append("Sourced corrections or evidence metadata failed validation")
    if payload.get("snapshot_matches_evidence") is False:
        blockers.append("Published graph does not match current evidence")
    return {"status": "limited_preview" if blockers else "operational_checks_passed",
            "evaluated_at": now.isoformat(), "blockers": blockers,
            "note": "Operational checks are not certification of accuracy or complete market coverage."}


def main() -> int:
    try:
        from .funding_evidence import apply_evidence, evidence_digest
    except ImportError:
        from funding_evidence import apply_evidence, evidence_digest
    funding = rows("data/raw/funding_events_raw.csv")
    error = None
    try:
        funding = apply_evidence(funding)
    except ValueError:
        error = "Effective evidence validation failed; this report uses original raw counts, not corrected evidence."
    payload = build_health(funding, rows("data/processed/investors.csv"), rows("data/raw/market_events_raw.csv"))
    if error:
        payload["evidence_error"] = error
    graph_metadata = report("market_graph.json").get("metadata", {})
    payload["evidence_digest"] = evidence_digest(funding)
    payload["snapshot_id"] = graph_metadata.get("snapshot_id")
    payload["snapshot_matches_evidence"] = not error and payload["evidence_digest"] == graph_metadata.get("evidence_digest")
    payload.update(tavily=report("tavily_fetch_report.json"), rss=report("market_event_fetch_report.json"), pipeline=report("pipeline_report.json"))
    payload["tavily"]["enabled_for_last_refresh"] = payload["pipeline"].get("tavily_requested", False)
    payload["automatic_ingestion"] = report("automatic_ingestion_report.json")
    payload["assurance"] = assurance(payload)
    for folder in (ROOT / "data" / "app", ROOT / "web" / "public" / "data"):
        folder.mkdir(parents=True, exist_ok=True)
        target = folder / "data_health.json"
        temporary = target.with_suffix(".tmp")
        temporary.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        temporary.replace(target)
    print("Built coverage and pipeline health report.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
