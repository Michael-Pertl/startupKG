#!/usr/bin/env python3
"""Automatically ingest complete structured evidence; quarantine uncertain records."""

import json
import re
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path

from ingest_funding_events import append_rows, read_rows
from validate_raw_data import RAW_FILE, REQUIRED_COLUMNS, validate_row

ROOT = Path(__file__).resolve().parents[1]
INBOX = ROOT / "data/raw/new_funding_events.csv"
REPORT = ROOT / "data/app/automatic_ingestion_report.json"


def select_rows(candidates, existing):
    accepted, decisions = [], []
    ids = {row["event_id"]: row for row in existing}
    keys = {(row["startup_name"].strip().casefold(), row["round_date"]) for row in existing}
    for number, row in enumerate(candidates, 2):
        event_id = row.get("event_id", "")
        if event_id in ids and row == ids[event_id]:
            decisions.append({"event_id": event_id, "status": "already_ingested"})
            continue
        errors = []
        if set(row) != set(REQUIRED_COLUMNS) or any(not isinstance(value, str) for value in row.values()):
            errors.append("Incomplete structured evidence record")
        else:
            errors.extend(validate_row(row, number, set(ids)))
            if row["confidence"] != "high" or row["source_type"] not in {"press_release", "reuters"}:
                errors.append("Automatic ingestion requires high-confidence primary/Reuters evidence")
            try:
                if date.fromisoformat(row["round_date"]) > date.today():
                    errors.append("Financing date cannot be in the future")
            except ValueError:
                errors.append("Confirmed financing date is required")
            try:
                matching_amounts = Decimal(row["amount_original"]) == Decimal(row["amount_usd"])
            except InvalidOperation:
                matching_amounts = False
            if row["amount_currency"].strip() != "USD" or not matching_amounts:
                errors.append("Foreign currency or amount-basis differences need sourced conversion")
            if not row["round_type"].strip():
                errors.append("Round type is required")
            if re.search(r"\b(commitments?|cumulative|target|anticipated|planned|debt|secondary|credit|loan)\b|\bup to\b", row["round_type"] + " " + row["notes"], re.I):
                errors.append("Ambiguous financing basis requires structured source reconciliation")
            key = (row["startup_name"].strip().casefold(), row["round_date"])
            if key in keys:
                errors.append("Existing company/date evidence; reconcile possible tranche or correction")
        if errors:
            decisions.append({"event_id": event_id, "status": "quarantined", "reasons": errors})
        else:
            accepted.append(row)
            ids[event_id] = row
            keys.add(key)
            decisions.append({"event_id": event_id, "status": "ingested"})
    return accepted, decisions


def main():
    existing = read_rows(RAW_FILE)[1]
    candidates = []
    if INBOX.exists():
        header, candidates = read_rows(INBOX)
        if header != REQUIRED_COLUMNS:
            raise ValueError(f"Invalid automatic inbox header: {INBOX}")
    accepted, decisions = select_rows(candidates, existing)
    if accepted:
        append_rows(RAW_FILE, accepted)
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    temporary = REPORT.with_suffix(".tmp")
    temporary.write_text(json.dumps({"completed_at": datetime.now(timezone.utc).isoformat(),
                                    "candidates": len(candidates), "ingested": len(accepted),
                                    "quarantined": sum(item["status"] == "quarantined" for item in decisions),
                                    "already_ingested": sum(item["status"] == "already_ingested" for item in decisions),
                                    "decisions": decisions}, indent=2) + "\n")
    temporary.replace(REPORT)
    print(f"Automatically ingested {len(accepted)} complete evidence records; see {REPORT.name}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
