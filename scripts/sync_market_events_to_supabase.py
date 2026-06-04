#!/usr/bin/env python3
"""Sync file-backed market event candidates into Supabase for admin review."""

from __future__ import annotations

import csv
import json
import os
import re
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
RAW_FILE = ROOT / "data" / "raw" / "market_events_raw.csv"
STARTUPS_FILE = ROOT / "data" / "processed" / "startups.csv"
OPTIONAL_SUPABASE_COLUMNS = {
    "ipo_stage",
    "linked_startup_id",
    "linked_startup_label",
    "raw_payload",
}


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


def nullable_int(value: str) -> int | None:
    value = (value or "").strip()
    return int(value) if value else None


def normalize_name(value: str) -> str:
    return "".join(character.lower() for character in value if character.isalnum())


def load_startup_links() -> dict[str, dict[str, str]]:
    with STARTUPS_FILE.open(newline="", encoding="utf-8") as handle:
        return {
            normalize_name(row["name"]): {
                "startup_id": row["startup_id"],
                "label": row["name"],
                "country": row["country"],
                "region": row["region"],
            }
            for row in csv.DictReader(handle)
            if normalize_name(row["name"])
        }


def ipo_stage(event_type: str) -> str | None:
    return {
        "ipo_watch": "watch",
        "ipo_filing": "filing",
        "ipo_pricing": "pricing",
        "public_listing": "listed",
    }.get(event_type)


def row_to_candidate(row: dict[str, str], startup_links: dict[str, dict[str, str]]) -> dict[str, object]:
    linked_startup = startup_links.get(normalize_name(row["company_name"]))
    return {
        "candidate_id": row["event_id"],
        "company_name": row["company_name"],
        "event_type": row["event_type"],
        "ipo_stage": ipo_stage(row["event_type"]),
        "event_date": row["event_date"] or None,
        "year": nullable_int(row["year"]),
        "country": row["country"] or linked_startup.get("country") if linked_startup else row["country"] or None,
        "region": row["region"] or linked_startup.get("region") if linked_startup else row["region"] or None,
        "amount_usd": nullable_int(row["amount_usd"]),
        "valuation_usd": nullable_int(row["valuation_usd"]),
        "source_url": row["source_url"],
        "source_type": row["source_type"],
        "confidence": row["confidence"],
        "status": row["status"] or "needs_review",
        "linked_startup_id": linked_startup["startup_id"] if linked_startup else None,
        "linked_startup_label": linked_startup["label"] if linked_startup else None,
        "summary": row["summary"] or None,
        "notes": row["notes"] or None,
        "raw_payload": row,
    }


def missing_schema_column(error_body: str) -> str | None:
    try:
        payload = json.loads(error_body)
    except json.JSONDecodeError:
        return None
    if payload.get("code") != "PGRST204":
        return None
    message = payload.get("message", "")
    match = re.search(r"Could not find the '([^']+)' column", message)
    if not match:
        return None
    column = match.group(1)
    return column if column in OPTIONAL_SUPABASE_COLUMNS else None


def is_legacy_status_constraint(error_body: str) -> bool:
    try:
        payload = json.loads(error_body)
    except json.JSONDecodeError:
        return False
    return (
        payload.get("code") == "23514"
        and "market_event_candidates_status_check" in str(payload.get("message", ""))
    )


def hide_staged_for_legacy_schema(rows: list[dict[str, object]]) -> tuple[list[dict[str, object]], bool]:
    changed = False
    normalized_rows: list[dict[str, object]] = []
    for row in rows:
        if row.get("status") != "staged":
            normalized_rows.append(row)
            continue
        changed = True
        notes = str(row.get("notes") or "").strip()
        legacy_note = "Legacy Supabase schema did not support staged; stored as rejected to keep it hidden from public News."
        normalized_rows.append({
            **row,
            "status": "rejected",
            "notes": f"{notes} {legacy_note}".strip(),
        })
    return normalized_rows, changed


def sync_rows(supabase_url: str, service_role_key: str, rows: list[dict[str, object]]) -> tuple[bool, str]:
    omitted_columns: list[str] = []
    used_legacy_status_fallback = False
    payload_rows = rows
    while True:
        request = Request(
            f"{supabase_url}/rest/v1/market_event_candidates?on_conflict=candidate_id",
            method="POST",
            headers={
                "apikey": service_role_key,
                "authorization": f"Bearer {service_role_key}",
                "content-type": "application/json",
                "prefer": "resolution=merge-duplicates",
            },
            data=json.dumps(payload_rows).encode("utf-8"),
        )
        try:
            with urlopen(request, timeout=30) as response:
                response.read()
            messages = []
            if omitted_columns:
                messages.append(f"Omitted optional columns missing in Supabase: {', '.join(omitted_columns)}.")
            if used_legacy_status_fallback:
                messages.append("Stored staged rows as rejected because Supabase status constraint is outdated.")
            suffix = f" {' '.join(messages)}" if messages else ""
            return True, suffix
        except HTTPError as error:
            body = error.read().decode("utf-8", errors="replace")
            missing_column = missing_schema_column(body)
            if missing_column:
                omitted_columns.append(missing_column)
                payload_rows = [{key: value for key, value in row.items() if key != missing_column} for row in payload_rows]
                continue
            if not used_legacy_status_fallback and is_legacy_status_constraint(body):
                normalized_rows, changed = hide_staged_for_legacy_schema(payload_rows)
                if changed:
                    used_legacy_status_fallback = True
                    payload_rows = normalized_rows
                    continue
            return False, body
        except URLError as error:
            return False, f"Could not reach Supabase: {error}"


def main() -> int:
    load_env_file(ROOT / ".env")
    load_env_file(ROOT / ".env.local")
    load_env_file(ROOT / "web" / ".env.local")

    supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not service_role_key:
        print("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.", file=sys.stderr)
        return 2

    startup_links = load_startup_links()
    with RAW_FILE.open(newline="", encoding="utf-8") as handle:
        rows = [row_to_candidate(row, startup_links) for row in csv.DictReader(handle)]

    if not rows:
        print(f"No market events found in {RAW_FILE}.")
        return 0

    success, message = sync_rows(supabase_url, service_role_key, rows)
    if not success:
        print(message, file=sys.stderr)
        return 1

    print(f"Synced {len(rows)} market event candidates to Supabase.{message}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
