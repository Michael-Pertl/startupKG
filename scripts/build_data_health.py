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
        "regions": [{"region": name, "events": count, "latest_date": max((row["round_date"] for row in funding if row["region"] == name), default=""), "small_sample": count < 10} for name, count in sorted(regional.items())],
    }


def main() -> int:
    payload = build_health(rows("data/raw/funding_events_raw.csv"), rows("data/processed/investors.csv"), rows("data/raw/market_events_raw.csv"))
    payload.update(tavily=report("tavily_fetch_report.json"), rss=report("market_event_fetch_report.json"), pipeline=report("pipeline_report.json"))
    for folder in (ROOT / "data" / "app", ROOT / "web" / "public" / "data"):
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "data_health.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print("Built coverage and pipeline health report.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
