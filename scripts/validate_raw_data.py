#!/usr/bin/env python3
"""Validate raw funding event rows before normalization."""

from __future__ import annotations

import csv
import sys
from pathlib import Path
from datetime import date
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]
RAW_FILE = ROOT / "data" / "raw" / "funding_events_raw.csv"

REQUIRED_COLUMNS = [
    "event_id",
    "startup_name",
    "region",
    "country",
    "city",
    "round_date",
    "year",
    "month",
    "round_type",
    "amount_original",
    "amount_currency",
    "amount_usd",
    "lead_investors",
    "participating_investors",
    "ai_domain",
    "source_url",
    "source_type",
    "confidence",
    "notes",
]

ALLOWED_REGIONS = {
    "US",
    "Europe",
    "Israel",
    "China",
    "UAE / Gulf",
    "Canada",
    "India",
    "Singapore",
    "Other Global",
}
ALLOWED_SOURCE_TYPES = {
    "press_release",
    "reuters",
    "techcrunch",
    "sifted",
    "eu_startups",
    "crunchbase_public",
    "dealroom_public",
    "kaggle",
    "other",
}
ALLOWED_CONFIDENCE = {"high", "medium", "low"}
ALLOWED_DOMAINS = {
    "Foundation Models / LLMs",
    "AI Infrastructure",
    "AI Chips / Semiconductors",
    "Coding Agents / Developer Tools",
    "Enterprise AI",
    "Healthcare AI / Drug Discovery",
    "Robotics / Physical AI",
    "Autonomous Vehicles",
    "Defense / Security AI",
    "Data / Analytics",
    "Creative / Generative Media",
    "Search / Knowledge Agents",
    "Fintech AI",
    "Climate / Energy AI",
}


def parse_int(value: str, field: str, line_no: int, errors: list[str]) -> int | None:
    try:
        return int(value)
    except ValueError:
        errors.append(f"line {line_no}: {field} must be an integer")
        return None


def validate_row(row: dict[str, str], line_no: int, seen_event_ids: set[str]) -> list[str]:
    errors: list[str] = []

    event_id = row["event_id"].strip()
    if not event_id:
        errors.append(f"line {line_no}: event_id is empty")
    elif event_id in seen_event_ids:
        errors.append(f"line {line_no}: duplicate event_id {event_id}")
    seen_event_ids.add(event_id)

    if not row["startup_name"].strip():
        errors.append(f"line {line_no}: startup_name is empty")
    if not row["country"].strip():
        errors.append(f"line {line_no}: country is empty")

    if row["region"].strip() not in ALLOWED_REGIONS:
        errors.append(f"line {line_no}: region must be one of {sorted(ALLOWED_REGIONS)}")

    year = parse_int(row["year"].strip(), "year", line_no, errors)
    if year is not None and year not in {2024, 2025, 2026}:
        errors.append(f"line {line_no}: year must be between 2024 and 2026")

    month_raw = row["month"].strip()
    if month_raw:
        month = parse_int(month_raw, "month", line_no, errors)
        if month is not None and not 1 <= month <= 12:
            errors.append(f"line {line_no}: month must be between 1 and 12")
    if row["round_date"].strip():
        try:
            parsed_date = date.fromisoformat(row["round_date"])
            if parsed_date.year != year or (month_raw and parsed_date.month != int(month_raw)):
                errors.append(f"line {line_no}: round_date does not match year/month")
        except ValueError:
            errors.append(f"line {line_no}: round_date must be a valid ISO date")

    amount_usd = parse_int(row["amount_usd"].strip(), "amount_usd", line_no, errors)
    if amount_usd is not None and amount_usd < 100_000_000:
        errors.append(f"line {line_no}: amount_usd is below 100000000")

    url = urlparse(row["source_url"].strip())
    if url.scheme not in {"http", "https"} or not url.hostname:
        errors.append(f"line {line_no}: source_url must be an absolute HTTP(S) URL")

    if not (row["lead_investors"].strip() or row["participating_investors"].strip()):
        errors.append(f"line {line_no}: at least one investor field must be present")

    if row["ai_domain"].strip() not in ALLOWED_DOMAINS:
        errors.append(f"line {line_no}: ai_domain is not in the controlled vocabulary")

    if row["source_type"].strip() not in ALLOWED_SOURCE_TYPES:
        errors.append(f"line {line_no}: source_type is not allowed")

    if row["confidence"].strip() not in ALLOWED_CONFIDENCE:
        errors.append(f"line {line_no}: confidence must be high, medium, or low")

    return errors


def main() -> int:
    if not RAW_FILE.exists():
        print(f"Missing raw file: {RAW_FILE}", file=sys.stderr)
        return 2

    with RAW_FILE.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != REQUIRED_COLUMNS:
            print("Invalid header.", file=sys.stderr)
            print(f"Expected: {','.join(REQUIRED_COLUMNS)}", file=sys.stderr)
            print(f"Actual:   {','.join(reader.fieldnames or [])}", file=sys.stderr)
            return 2

        errors: list[str] = []
        seen_event_ids: set[str] = set()
        rows = 0
        for rows, row in enumerate(reader, start=2):
            errors.extend(validate_row(row, rows, seen_event_ids))

    if errors:
        print("Raw data validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(f"Raw data validation passed for {max(rows - 1, 0)} funding events.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
