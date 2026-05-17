#!/usr/bin/env python3
"""Initialize app-facing startup profile rows from processed startup data.

The generated raw profile file is intentionally sparse. It gives the app and
curation workflow a stable place to add total funding, valuation, founders,
product summaries, and profile sources without changing the core funding-event
evidence table.
"""

from __future__ import annotations

import csv
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw"
PROCESSED_DIR = ROOT / "data" / "processed"

PROFILE_FILE = RAW_DIR / "startup_profiles.csv"
ENRICHMENT_FILE = RAW_DIR / "startup_profile_enrichment.csv"

FIELDNAMES = [
    "startup_id",
    "name",
    "region",
    "country",
    "city",
    "primary_domain",
    "website",
    "founded_year",
    "founders",
    "latest_valuation_usd",
    "total_funding_reported_usd",
    "employee_count_estimate",
    "notable_products",
    "profile_source_url",
    "profile_confidence",
    "notes",
]


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def write_csv(path: Path, rows: list[dict[str, str]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    startups = read_csv(PROCESSED_DIR / "startups.csv")
    enrichment = {}
    if ENRICHMENT_FILE.exists():
        enrichment = {
            row["startup_id"]: row
            for row in read_csv(ENRICHMENT_FILE)
        }

    existing: dict[str, dict[str, str]] = {}
    if PROFILE_FILE.exists():
        existing = {row["startup_id"]: row for row in read_csv(PROFILE_FILE)}

    rows: list[dict[str, str]] = []
    for startup in sorted(startups, key=lambda row: row["startup_id"]):
        current = existing.get(startup["startup_id"], {})
        row = {field: current.get(field, "") for field in FIELDNAMES}
        for field in ("startup_id", "name", "region", "country", "city", "primary_domain"):
            row[field] = startup[field]
        for field in FIELDNAMES:
            value = enrichment.get(startup["startup_id"], {}).get(field, "")
            if value:
                row[field] = value
        rows.append(row)

    write_csv(PROFILE_FILE, rows)
    print(f"Wrote {len(rows)} startup profile rows to {PROFILE_FILE.relative_to(ROOT)}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
