#!/usr/bin/env python3
"""Print compact quality metrics for the curated funding dataset."""

from __future__ import annotations

import csv
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def main() -> int:
    rounds = read_csv(ROOT / "data" / "processed" / "funding_rounds.csv")
    startups = {
        row["startup_id"]: row
        for row in read_csv(ROOT / "data" / "processed" / "startups.csv")
    }
    investors = read_csv(ROOT / "data" / "processed" / "investors.csv")
    participations = read_csv(ROOT / "data" / "processed" / "participations.csv")

    by_region = Counter(startups[row["startup_id"]]["region"] for row in rounds)
    by_year = Counter(row["year"] for row in rounds)
    by_domain = Counter(startups[row["startup_id"]]["primary_domain"] for row in rounds)
    by_confidence = Counter(row["confidence"] for row in rounds)
    by_source_type = Counter(row["source_type"] for row in rounds)
    unknown_investors = [row["name"] for row in investors if row["investor_type"] == "unknown"]

    print(f"Funding events: {len(rounds)}")
    print(f"Startups: {len(startups)}")
    print(f"Investors: {len(investors)}")
    print(f"Participations: {len(participations)}")
    print(f"Regions: {dict(by_region)}")
    print(f"Years: {dict(by_year)}")
    print(f"Confidence: {dict(by_confidence)}")
    print(f"Source types: {dict(by_source_type)}")
    print(f"Domains: {dict(by_domain.most_common())}")
    print(f"Unknown investor metadata: {len(unknown_investors)}")
    if unknown_investors:
        print("Unknown investors:")
        for name in unknown_investors:
            print(f"- {name}")

    return 0 if not unknown_investors else 1


if __name__ == "__main__":
    raise SystemExit(main())
