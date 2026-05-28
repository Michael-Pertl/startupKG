#!/usr/bin/env python3
"""Validate raw market monitoring events before app export."""

from __future__ import annotations

import csv
import re
import sys
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]
RAW_FILE = ROOT / "data" / "raw" / "market_events_raw.csv"

REQUIRED_COLUMNS = [
    "event_id",
    "company_name",
    "event_type",
    "event_date",
    "year",
    "country",
    "region",
    "amount_usd",
    "valuation_usd",
    "source_url",
    "source_type",
    "confidence",
    "status",
    "summary",
    "notes",
]

ALLOWED_EVENT_TYPES = {
    "funding_round",
    "valuation_update",
    "ipo_watch",
    "ipo_filing",
    "ipo_pricing",
    "public_listing",
    "strategic_investment",
    "compute_commitment",
    "acquisition_or_merger",
    "major_partnership",
    "revenue_or_usage_milestone",
}
ALLOWED_SOURCE_TYPES = {
    "press_release",
    "reuters",
    "techcrunch",
    "sifted",
    "eu_startups",
    "official_filing",
    "other",
}
ALLOWED_CONFIDENCE = {"high", "medium", "low"}
ALLOWED_STATUS = {"staged", "auto_ingested", "approved", "rejected", "needs_review"}
VISIBLE_STATUS = {"auto_ingested", "approved", "needs_review"}
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def parse_optional_int(value: str, field: str, line_no: int, errors: list[str]) -> None:
    if not value.strip():
        return
    try:
        parsed = int(value)
    except ValueError:
        errors.append(f"line {line_no}: {field} must be empty or an integer")
        return
    if parsed < 0:
        errors.append(f"line {line_no}: {field} cannot be negative")


def has_valid_url(value: str) -> bool:
    parsed = urlparse(value.strip())
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def validate_row(
    row: dict[str, str],
    line_no: int,
    seen_ids: set[str],
    seen_urls: set[str],
    seen_keys: set[tuple[str, str, str]],
) -> list[str]:
    errors: list[str] = []
    event_id = row["event_id"].strip()
    if not event_id:
        errors.append(f"line {line_no}: event_id is empty")
    elif event_id in seen_ids:
        errors.append(f"line {line_no}: duplicate event_id {event_id}")
    seen_ids.add(event_id)

    company = row["company_name"].strip()
    if not company:
        errors.append(f"line {line_no}: company_name is empty")

    event_type = row["event_type"].strip()
    if event_type not in ALLOWED_EVENT_TYPES:
        errors.append(f"line {line_no}: event_type is not allowed")

    event_date = row["event_date"].strip()
    if not DATE_RE.match(event_date):
        errors.append(f"line {line_no}: event_date must be YYYY-MM-DD")

    year = row["year"].strip()
    if year != event_date[:4]:
        errors.append(f"line {line_no}: year must match event_date year")

    parse_optional_int(row["amount_usd"], "amount_usd", line_no, errors)
    parse_optional_int(row["valuation_usd"], "valuation_usd", line_no, errors)

    source_url = row["source_url"].strip()
    if not has_valid_url(source_url):
        errors.append(f"line {line_no}: source_url must be an absolute HTTP(S) URL")
    elif source_url.lower() in seen_urls:
        errors.append(f"line {line_no}: duplicate source_url {source_url}")
    seen_urls.add(source_url.lower())

    if row["source_type"].strip() not in ALLOWED_SOURCE_TYPES:
        errors.append(f"line {line_no}: source_type is not allowed")

    if row["confidence"].strip() not in ALLOWED_CONFIDENCE:
        errors.append(f"line {line_no}: confidence must be high, medium, or low")

    status = row["status"].strip()
    if status not in ALLOWED_STATUS:
        errors.append(f"line {line_no}: status is not allowed")

    if status in VISIBLE_STATUS and not row["summary"].strip():
        errors.append(f"line {line_no}: visible events require a summary")

    key = (company.lower(), event_date, event_type)
    if key in seen_keys:
        errors.append(f"line {line_no}: duplicate company/date/type event {company} {event_date} {event_type}")
    seen_keys.add(key)

    return errors


def main() -> int:
    if not RAW_FILE.exists():
        print(f"Missing market events file: {RAW_FILE}", file=sys.stderr)
        return 2

    with RAW_FILE.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != REQUIRED_COLUMNS:
            print("Invalid market events header.", file=sys.stderr)
            print(f"Expected: {','.join(REQUIRED_COLUMNS)}", file=sys.stderr)
            print(f"Actual:   {','.join(reader.fieldnames or [])}", file=sys.stderr)
            return 2

        errors: list[str] = []
        seen_ids: set[str] = set()
        seen_urls: set[str] = set()
        seen_keys: set[tuple[str, str, str]] = set()
        rows = 0
        visible = 0
        for rows, row in enumerate(reader, start=2):
            if row["status"].strip() in VISIBLE_STATUS:
                visible += 1
            errors.extend(validate_row(row, rows, seen_ids, seen_urls, seen_keys))

    if errors:
        print("Market event validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(f"Market event validation passed for {max(rows - 1, 0)} events ({visible} visible).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
