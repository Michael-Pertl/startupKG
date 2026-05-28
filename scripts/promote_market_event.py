#!/usr/bin/env python3
"""Promote a reviewed market-event row into staged funding-event CSV form."""

from __future__ import annotations

import argparse
import csv
import re
import sys
from pathlib import Path

from validate_raw_data import RAW_FILE, REQUIRED_COLUMNS, validate_row


ROOT = Path(__file__).resolve().parents[1]
MARKET_EVENTS_FILE = ROOT / "data" / "raw" / "market_events_raw.csv"
STARTUPS_FILE = ROOT / "data" / "processed" / "startups.csv"
STAGED_FUNDING_FILE = ROOT / "data" / "raw" / "new_funding_events.csv"


def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def append_rows(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    file_exists = path.exists() and path.stat().st_size > 0
    with path.open("a", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=REQUIRED_COLUMNS)
        if not file_exists:
            writer.writeheader()
        writer.writerows(rows)


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_") or "unknown"


def load_startup_context() -> dict[str, dict[str, str]]:
    return {row["name"].lower(): row for row in read_csv(STARTUPS_FILE)}


def load_existing_ids(paths: list[Path]) -> set[str]:
    event_ids: set[str] = set()
    for path in paths:
        for row in read_csv(path):
            if row.get("event_id", "").strip():
                event_ids.add(row["event_id"].strip())
    return event_ids


def find_market_event(event_id: str) -> dict[str, str] | None:
    for row in read_csv(MARKET_EVENTS_FILE):
        if row.get("event_id") == event_id:
            return row
    return None


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Create a staged funding-event row from a market monitor event. "
            "Investor and domain fields still require manual curation."
        )
    )
    parser.add_argument("event_id", help="event_id from data/raw/market_events_raw.csv")
    parser.add_argument("--apply", action="store_true", help="Append the valid row to data/raw/new_funding_events.csv.")
    parser.add_argument("--event-id", dest="funding_event_id", help="Override the generated funding event_id.")
    parser.add_argument("--startup-name", help="Override company/startup name.")
    parser.add_argument("--region", help="Override region.")
    parser.add_argument("--country", help="Override country.")
    parser.add_argument("--city", default="", help="Startup city if not known from processed startups.")
    parser.add_argument("--round-date", help="Override round date. Defaults to the market event date.")
    parser.add_argument("--round-type", default="Funding round", help="Funding round label for the graph dataset.")
    parser.add_argument("--amount-usd", type=int, help="Override amount_usd. Required if the market event has no amount.")
    parser.add_argument("--amount-original", type=int, help="Original reported amount. Defaults to amount_usd.")
    parser.add_argument("--amount-currency", default="USD", help="Original amount currency. Defaults to USD.")
    parser.add_argument("--lead-investors", default="", help="Semicolon-separated lead investors.")
    parser.add_argument("--participating-investors", default="", help="Semicolon-separated participating investors.")
    parser.add_argument("--ai-domain", help="Override AI domain. Inferred only for known processed startups.")
    parser.add_argument("--confidence", help="Override confidence.")
    parser.add_argument("--source-type", help="Override source_type.")
    args = parser.parse_args()

    event = find_market_event(args.event_id)
    if not event:
        print(f"Market event not found: {args.event_id}", file=sys.stderr)
        return 2

    startup_name = args.startup_name or event["company_name"]
    startup_context = load_startup_context().get(startup_name.lower(), {})
    round_date = args.round_date or event["event_date"]
    amount_usd = args.amount_usd if args.amount_usd is not None else int(event["amount_usd"] or "0")
    amount_original = args.amount_original if args.amount_original is not None else amount_usd
    funding_event_id = (
        args.funding_event_id
        or f"evt_{slugify(startup_name)}_{round_date[:4]}_{slugify(args.round_type)}_{round_date[5:7]}"
    )

    row = {
        "event_id": funding_event_id,
        "startup_name": startup_name,
        "region": args.region or event["region"] or startup_context.get("region", ""),
        "country": args.country or event["country"] or startup_context.get("country", ""),
        "city": args.city or startup_context.get("city", ""),
        "round_date": round_date,
        "year": round_date[:4],
        "month": round_date[5:7],
        "round_type": args.round_type,
        "amount_original": str(amount_original),
        "amount_currency": args.amount_currency,
        "amount_usd": str(amount_usd),
        "lead_investors": args.lead_investors,
        "participating_investors": args.participating_investors,
        "ai_domain": args.ai_domain or startup_context.get("primary_domain", ""),
        "source_url": event["source_url"],
        "source_type": args.source_type or event["source_type"],
        "confidence": args.confidence or event["confidence"],
        "notes": f"Promoted from market event {args.event_id}: {event['summary']} {event['notes']}".strip(),
    }

    seen_ids = load_existing_ids([RAW_FILE, STAGED_FUNDING_FILE])
    errors = validate_row(row, 2, seen_ids)
    if not (row["lead_investors"].strip() or row["participating_investors"].strip()):
        errors.append("line 2: add --lead-investors or --participating-investors before promotion")
    if errors:
        print("Promotion row validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    if not args.apply:
        writer = csv.DictWriter(sys.stdout, fieldnames=REQUIRED_COLUMNS)
        writer.writeheader()
        writer.writerow(row)
        print("\nDry run passed. Re-run with --apply to append this row to data/raw/new_funding_events.csv.")
        return 0

    append_rows(STAGED_FUNDING_FILE, [row])
    print(f"Appended staged funding row to {STAGED_FUNDING_FILE.relative_to(ROOT)}.")
    print("Next: run scripts/ingest_funding_events.py, then scripts/ingest_funding_events.py --apply after review.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
