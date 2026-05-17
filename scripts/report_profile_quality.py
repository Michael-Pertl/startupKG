#!/usr/bin/env python3
"""Report profile enrichment completeness for app-facing startup profiles."""

from __future__ import annotations

import csv
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PROFILE_FILE = ROOT / "data" / "raw" / "startup_profiles.csv"


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def main() -> int:
    rows = read_csv(PROFILE_FILE)
    enriched = [
        row for row in rows
        if row["profile_source_url"].strip() or row["profile_confidence"].strip()
    ]

    fields = [
        "website",
        "founded_year",
        "founders",
        "latest_valuation_usd",
        "total_funding_reported_usd",
        "employee_count_estimate",
        "notable_products",
    ]

    print(f"Startup profiles: {len(rows)}")
    print(f"Enriched profiles: {len(enriched)}")
    print(f"Confidence: {dict(Counter(row['profile_confidence'] or 'empty' for row in rows))}")
    for field in fields:
        present = sum(1 for row in rows if row[field].strip())
        print(f"{field}: {present}/{len(rows)}")

    missing_source = [
        row["name"] for row in rows
        if any(row[field].strip() for field in fields) and not row["profile_source_url"].strip()
    ]
    if missing_source:
        print("Profiles with claims but missing source:")
        for name in missing_source:
            print(f"- {name}")
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
