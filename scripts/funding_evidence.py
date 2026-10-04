"""Sourced corrections and explicit amount semantics without mutating raw evidence."""

import csv
import re
import hashlib
import json
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
BASES = {"reported_round", "committed_capital", "includes_prior_commitments", "mixed_primary_secondary", "upper_bound", "lower_bound", "debt", "secondary"}


def evidence_digest(events):
    canonical = json.dumps(sorted(events, key=lambda row: row["event_id"]), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def infer_amount_basis(row):
    financing, notes = row["round_type"].lower(), row["notes"].lower()
    if "debt" in financing:
        return "debt"
    if "secondary" in financing:
        return "secondary"
    if "primary" in notes and "secondary" in notes:
        return "mixed_primary_secondary"
    if "commitment" in financing:
        return "committed_capital"
    if "previously committed" in notes or "prior commitments" in notes:
        return "includes_prior_commitments"
    if "amount reported as up to" in notes:
        return "upper_bound"
    if re.search(r"lower bound|conservative .*floor|(?:more than|over) usd[0-9]", notes):
        return "lower_bound"
    return "reported_round"


def read_csv(path):
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def apply_evidence(events, corrections=None, metadata=None):
    events = [dict(row) for row in events]
    by_id = {row["event_id"]: row for row in events}
    seen = set()
    corrections = corrections if corrections is not None else read_csv(ROOT / "data/raw/funding_event_corrections.csv")
    metadata = metadata if metadata is not None else read_csv(ROOT / "data/raw/funding_evidence_metadata.csv")
    allowed = {"amount_usd", "amount_original", "round_date", "month", "source_url"}
    for correction in corrections:
        key = (correction["event_id"], correction["field"])
        if key in seen or key[0] not in by_id or key[1] not in allowed:
            raise ValueError(f"Invalid or duplicate funding correction: {key}")
        checked = date.fromisoformat(correction["reviewed_at"])
        source = urlparse(correction["source_url"])
        if checked > date.today() or source.scheme != "https" or not source.hostname or not correction["reason"]:
            raise ValueError(f"Unsourced funding correction: {key}")
        value = correction["value"]
        if key[1] in {"amount_usd", "amount_original"} and int(value) < 100_000_000:
            raise ValueError(f"Correction below inclusion threshold: {key}")
        if key[1] == "source_url" and not value.startswith("https://"):
            raise ValueError(f"Invalid source URL correction: {key}")
        by_id[key[0]][key[1]] = value
        by_id[key[0]]["notes"] += f" Correction checked {checked}: {correction['reason']}. Source: {correction['source_url']}"
        seen.add(key)
    for row in events:
        row.update(amount_basis=infer_amount_basis(row),
                   verification_status="not_rechecked", source_checked_at="")
    seen = set()
    for item in metadata:
        event_id = item["event_id"]
        if event_id not in by_id or event_id in seen or item["amount_basis"] not in BASES:
            raise ValueError(f"Invalid evidence metadata: {event_id}")
        row = by_id[event_id]
        if item["source_url"] != row["source_url"] or item["verification_status"] not in {"core_fields_checked", "not_rechecked"}:
            raise ValueError(f"Evidence metadata does not match effective source: {event_id}")
        if date.fromisoformat(item["source_checked_at"]) > date.today() or not item["notes"]:
            raise ValueError(f"Invalid evidence check date/notes: {event_id}")
        row.update({field: item[field] for field in ("amount_basis", "verification_status", "source_checked_at")})
        row["notes"] += " Evidence assessment: " + item["notes"]
        seen.add(event_id)
    return events
