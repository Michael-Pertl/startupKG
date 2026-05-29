#!/usr/bin/env python3
"""Sync file-backed market event candidates into Supabase for admin review."""

from __future__ import annotations

import csv
import json
import os
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
RAW_FILE = ROOT / "data" / "raw" / "market_events_raw.csv"


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


def row_to_candidate(row: dict[str, str]) -> dict[str, object]:
    return {
        "candidate_id": row["event_id"],
        "company_name": row["company_name"],
        "event_type": row["event_type"],
        "event_date": row["event_date"] or None,
        "year": nullable_int(row["year"]),
        "country": row["country"] or None,
        "region": row["region"] or None,
        "amount_usd": nullable_int(row["amount_usd"]),
        "valuation_usd": nullable_int(row["valuation_usd"]),
        "source_url": row["source_url"],
        "source_type": row["source_type"],
        "confidence": row["confidence"],
        "status": row["status"] or "needs_review",
        "summary": row["summary"] or None,
        "notes": row["notes"] or None,
        "raw_payload": row,
    }


def main() -> int:
    load_env_file(ROOT / ".env")
    load_env_file(ROOT / ".env.local")
    load_env_file(ROOT / "web" / ".env.local")

    supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not service_role_key:
        print("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.", file=sys.stderr)
        return 2

    with RAW_FILE.open(newline="", encoding="utf-8") as handle:
        rows = [row_to_candidate(row) for row in csv.DictReader(handle)]

    if not rows:
        print(f"No market events found in {RAW_FILE}.")
        return 0

    request = Request(
        f"{supabase_url}/rest/v1/market_event_candidates?on_conflict=candidate_id",
        method="POST",
        headers={
            "apikey": service_role_key,
            "authorization": f"Bearer {service_role_key}",
            "content-type": "application/json",
            "prefer": "resolution=merge-duplicates",
        },
        data=json.dumps(rows).encode("utf-8"),
    )
    try:
        with urlopen(request, timeout=30) as response:
            response.read()
    except HTTPError as error:
        print(error.read().decode("utf-8", errors="replace"), file=sys.stderr)
        return 1
    except URLError as error:
        print(f"Could not reach Supabase: {error}", file=sys.stderr)
        return 1

    print(f"Synced {len(rows)} market event candidates to Supabase.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
