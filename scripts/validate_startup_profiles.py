#!/usr/bin/env python3
"""Validate app-facing startup profile enrichment."""

from __future__ import annotations

import csv
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw"
PROCESSED_DIR = ROOT / "data" / "processed"
PROFILE_FILE = RAW_DIR / "startup_profiles.csv"
ENRICHMENT_FILE = RAW_DIR / "startup_profile_enrichment.csv"

REQUIRED_COLUMNS = [
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

ENRICHMENT_COLUMNS = [
    "startup_id",
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

ALLOWED_CONFIDENCE = {"", "high", "medium", "low"}


def read_csv(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        return reader.fieldnames or [], list(reader)


def parse_int(value: str, field: str, label: str, errors: list[str]) -> None:
    if not value.strip():
        return
    try:
        int(value)
    except ValueError:
        errors.append(f"{label}: {field} must be an integer when present")


def validate_rows(path: Path, expected_columns: list[str], valid_ids: set[str]) -> list[str]:
    header, rows = read_csv(path)
    errors: list[str] = []

    if header != expected_columns:
        errors.append(
            f"{path.relative_to(ROOT)}: invalid header. "
            f"Expected {','.join(expected_columns)}"
        )
        return errors

    seen_ids: set[str] = set()
    for line_no, row in enumerate(rows, start=2):
        label = f"{path.relative_to(ROOT)} line {line_no} ({row.get('startup_id', '')})"
        startup_id = row["startup_id"].strip()
        if not startup_id:
            errors.append(f"{label}: startup_id is empty")
            continue
        if startup_id in seen_ids:
            errors.append(f"{label}: duplicate startup_id")
        seen_ids.add(startup_id)
        if startup_id not in valid_ids:
            errors.append(f"{label}: startup_id not found in processed startups")

        confidence = row.get("profile_confidence", "").strip()
        if confidence not in ALLOWED_CONFIDENCE:
            errors.append(f"{label}: profile_confidence must be high, medium, low, or empty")

        has_profile_claim = any(
            row.get(field, "").strip()
            for field in (
                "website",
                "founded_year",
                "founders",
                "latest_valuation_usd",
                "total_funding_reported_usd",
                "employee_count_estimate",
                "notable_products",
            )
        )
        if has_profile_claim and not row.get("profile_source_url", "").strip():
            errors.append(f"{label}: enriched profile rows need profile_source_url")
        if has_profile_claim and not confidence:
            errors.append(f"{label}: enriched profile rows need profile_confidence")

        for field in ("founded_year", "latest_valuation_usd", "total_funding_reported_usd"):
            parse_int(row.get(field, ""), field, label, errors)

    return errors


def main() -> int:
    _, startups = read_csv(PROCESSED_DIR / "startups.csv")
    valid_ids = {row["startup_id"] for row in startups}

    errors = validate_rows(PROFILE_FILE, REQUIRED_COLUMNS, valid_ids)
    if ENRICHMENT_FILE.exists():
        errors.extend(validate_rows(ENRICHMENT_FILE, ENRICHMENT_COLUMNS, valid_ids))

    if errors:
        print("Startup profile validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Startup profile validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
