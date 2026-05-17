#!/usr/bin/env python3
"""Validate and append staged funding events to the raw evidence table."""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

from validate_raw_data import REQUIRED_COLUMNS, RAW_FILE, validate_row


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_STAGED_FILE = ROOT / "data" / "raw" / "new_funding_events.csv"


def read_rows(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        return list(reader.fieldnames or []), list(reader)


def load_existing_event_ids(path: Path) -> set[str]:
    if not path.exists():
        return set()
    with path.open(newline="", encoding="utf-8") as handle:
        return {row["event_id"].strip() for row in csv.DictReader(handle) if row.get("event_id", "").strip()}


def append_rows(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    file_exists = path.exists() and path.stat().st_size > 0
    with path.open("a", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=REQUIRED_COLUMNS)
        if not file_exists:
            writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Validate staged AI funding events and optionally append them to "
            "data/raw/funding_events_raw.csv."
        )
    )
    parser.add_argument(
        "staged_csv",
        nargs="?",
        default=DEFAULT_STAGED_FILE,
        type=Path,
        help="CSV with the same columns as data/raw/funding_events_raw.csv.",
    )
    parser.add_argument("--apply", action="store_true", help="Append valid staged rows to the raw evidence table.")
    args = parser.parse_args()

    staged_csv = args.staged_csv
    if not staged_csv.exists():
        print(f"Missing staged CSV: {staged_csv}", file=sys.stderr)
        print("Create it with the same header as data/raw/funding_events_raw.csv.", file=sys.stderr)
        return 2

    header, staged_rows = read_rows(staged_csv)
    if header != REQUIRED_COLUMNS:
        print("Invalid staged CSV header.", file=sys.stderr)
        print(f"Expected: {','.join(REQUIRED_COLUMNS)}", file=sys.stderr)
        print(f"Actual:   {','.join(header)}", file=sys.stderr)
        return 2

    seen_event_ids = load_existing_event_ids(RAW_FILE)
    existing_ids = set(seen_event_ids)
    errors: list[str] = []
    for line_no, row in enumerate(staged_rows, start=2):
        event_id = row["event_id"].strip()
        errors.extend(validate_row(row, line_no, seen_event_ids))
        if event_id in existing_ids:
            errors.append(f"line {line_no}: event_id already exists in {RAW_FILE.name}: {event_id}")

    if errors:
        print("Staged funding event validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    if not staged_rows:
        print(f"No staged rows found in {staged_csv}.")
        return 0

    if not args.apply:
        print(f"Dry run passed for {len(staged_rows)} staged funding events.")
        print("Re-run with --apply to append them to data/raw/funding_events_raw.csv.")
        return 0

    append_rows(RAW_FILE, staged_rows)
    print(f"Appended {len(staged_rows)} funding events to {RAW_FILE}.")
    print("Next: run validate_raw_data.py, normalize_raw_data.py, build_growth_metrics.py, and build_app_graph.py.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
