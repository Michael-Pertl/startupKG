#!/usr/bin/env python3
"""Build app-ready market event JSON from curated raw monitoring rows."""

from __future__ import annotations

import csv
import json
import subprocess
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
RAW_FILE = ROOT / "data" / "raw" / "market_events_raw.csv"
STARTUPS_FILE = ROOT / "data" / "processed" / "startups.csv"
APP_DATA_DIR = ROOT / "data" / "app"
WEB_DATA_DIR = ROOT / "web" / "public" / "data"
VISIBLE_STATUS = {"approved", "needs_review", "auto_ingested", "staged"}
CORE_EVENT_TYPES = {
    "funding_round",
    "strategic_investment",
    "compute_commitment",
    "ipo_filing",
    "ipo_pricing",
    "public_listing",
}
BROAD_EVENT_TYPES = {
    "ipo_watch",
    "valuation_update",
    "major_partnership",
    "acquisition_or_merger",
    "revenue_or_usage_milestone",
}
MIN_FUNDING_USD = 100_000_000
IPO_STAGE_BY_EVENT_TYPE = {
    "ipo_watch": "watch",
    "ipo_filing": "filing",
    "ipo_pricing": "pricing",
    "public_listing": "listed",
}


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def int_or_none(value: str) -> int | None:
    value = value.strip()
    return int(value) if value else None


def normalize_name(value: str) -> str:
    return "".join(character.lower() for character in value if character.isalnum())


def load_startup_links() -> dict[str, dict[str, str]]:
    links: dict[str, dict[str, str]] = {}
    for row in read_csv(STARTUPS_FILE):
        key = normalize_name(row["name"])
        if not key:
            continue
        links[key] = {
            "startup_id": row["startup_id"],
            "label": row["name"],
            "country": row["country"],
            "region": row["region"],
        }
    return links


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def signal_metadata(row: dict[str, str]) -> tuple[str, str]:
    event_type = row["event_type"]
    status = row["status"]
    amount_usd = int_or_none(row["amount_usd"])

    if status != "approved":
        return ("review_queue", "Unreviewed discovery item")

    if (
        status == "approved"
        and event_type in CORE_EVENT_TYPES
        and (event_type != "funding_round" or (amount_usd is not None and amount_usd >= MIN_FUNDING_USD))
    ):
        return ("core_signal", "Reviewed core signal")

    if event_type in BROAD_EVENT_TYPES:
        return ("watchlist_signal", "Broader investor watchlist signal")

    if event_type == "funding_round" and amount_usd is not None and amount_usd < MIN_FUNDING_USD:
        return ("watchlist_signal", "Below-threshold funding signal")

    if status in {"auto_ingested", "needs_review", "staged"}:
        return ("review_queue", "Unreviewed discovery item")

    return ("watchlist_signal", "Broader investor watchlist signal")


def main() -> int:
    validation = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "validate_market_events.py")],
        check=False,
    )
    if validation.returncode != 0:
        return validation.returncode

    rows = read_csv(RAW_FILE)
    startup_links = load_startup_links()
    events = []
    for row in rows:
        if row["status"] not in VISIBLE_STATUS:
            continue
        linked_startup = startup_links.get(normalize_name(row["company_name"]))
        signal_tier, signal_label = signal_metadata(row)
        events.append(
            {
                "event_id": row["event_id"],
                "company_name": row["company_name"],
                "event_type": row["event_type"],
                "ipo_stage": IPO_STAGE_BY_EVENT_TYPE.get(row["event_type"], ""),
                "event_date": row["event_date"],
                "year": row["year"],
                "country": row["country"] or linked_startup.get("country", "") if linked_startup else row["country"],
                "region": row["region"] or linked_startup.get("region", "") if linked_startup else row["region"],
                "amount_usd": int_or_none(row["amount_usd"]),
                "valuation_usd": int_or_none(row["valuation_usd"]),
                "source_url": row["source_url"],
                "source_type": row["source_type"],
                "confidence": row["confidence"],
                "status": row["status"],
                "signal_tier": signal_tier,
                "signal_label": signal_label,
                "linked_startup_id": linked_startup["startup_id"] if linked_startup else "",
                "linked_startup_label": linked_startup["label"] if linked_startup else "",
                "summary": row["summary"],
                "notes": row["notes"],
            }
        )

    events.sort(key=lambda event: (event["event_date"], event["event_id"]), reverse=True)
    # Curated funding evidence supplies the timeline independently of discovery health.
    startups = {row["startup_id"]: row for row in read_csv(STARTUPS_FILE)}
    existing_keys = {(event["company_name"].casefold(), event["event_date"], event["event_type"]) for event in events if event["status"] == "approved"}
    for funding in read_csv(ROOT / "data" / "processed" / "funding_rounds.csv"):
        if funding["confidence"] == "low" or not funding["round_date"]:
            continue
        company = startups[funding["startup_id"]]
        key = (company["name"].casefold(), funding["round_date"], "funding_round")
        if key in existing_keys or any(term in funding["round_type"].lower() for term in ("debt", "commitment", "secondary", "loan")):
            continue
        events = [event for event in events if (event["company_name"].casefold(), event["event_date"], event["event_type"]) != key]
        events.append({
            "event_id": "curated_" + funding["round_id"], "company_name": company["name"],
            "event_type": "funding_round", "ipo_stage": "", "event_date": funding["round_date"],
            "year": funding["year"], "country": company["country"], "region": company["region"],
            "amount_usd": int(funding["amount_usd"]), "valuation_usd": None,
            "source_url": funding["source_url"], "source_type": funding["source_type"],
            "confidence": funding["confidence"], "status": "approved", "signal_tier": "core_signal",
            "signal_label": "Curated funding evidence", "linked_startup_id": funding["startup_id"],
            "linked_startup_label": company["name"], "summary": company["name"] + " - " + funding["round_type"],
            "notes": funding.get("evidence_notes", "") + " Amount basis: " + funding.get("amount_basis", "reported_round"),
        })
        existing_keys.add(key)
    events.sort(key=lambda event: (event["event_date"], event["event_id"]), reverse=True)
    payload = {
        "metadata": {
            "title": "AI Market Event Monitor",
            "event_count": len(events),
            "scope_note": (
                "Curated public monitoring events for AI market intelligence. "
                "These are research alerts and not investment recommendations."
            ),
        },
        "facets": {
            "event_types": sorted({event["event_type"] for event in events if event["event_type"]}),
            "ipo_stages": sorted({event["ipo_stage"] for event in events if event["ipo_stage"]}),
            "regions": sorted({event["region"] for event in events if event["region"]}),
            "confidence": sorted({event["confidence"] for event in events if event["confidence"]}),
            "statuses": sorted({event["status"] for event in events if event["status"]}),
            "signal_tiers": sorted({event["signal_tier"] for event in events if event["signal_tier"]}),
        },
        "events": events,
    }

    for path in (APP_DATA_DIR / "market_events.json", WEB_DATA_DIR / "market_events.json"):
        write_json(path, payload)

    print(f"Built market event feed with {len(events)} events.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
