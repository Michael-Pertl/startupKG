#!/usr/bin/env python3
"""Daily RSS discovery, automatic verification and atomic shared snapshot publication."""
import argparse
import csv
import json
import os
import re
import subprocess
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.request import Request, urlopen

from auto_ingest_funding import select_rows
from ingest_funding_events import append_rows, read_rows
from validate_raw_data import RAW_FILE
from verify_market_evidence import article_text, extract, verify

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT_FILES = ("market_graph.json", "market_events.json", "data_health.json")


def database(method="GET", payload=None):
    base = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    path = "/rest/v1/platform_snapshots"
    path += "?id=eq.current&select=payload" if method == "GET" else "?on_conflict=id"
    request = Request(base + path, method=method,
                      data=None if payload is None else json.dumps(payload).encode(),
                      headers={"apikey": key, "Authorization": "Bearer " + key,
                               "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates"})
    with urlopen(request, timeout=60) as response:
        body = response.read()
    return json.loads(body) if body else None


def company_key(value):
    # Conservative alias matching prevents punctuation/legal suffix changes from duplicating rounds.
    value = re.sub(r"\b(incorporated|inc|limited|ltd|corporation|corp|gmbh)\b", "", value.casefold())
    return re.sub(r"[^a-z0-9]", "", value)


def duplicate_status(row, existing):
    for previous in existing:
        if previous["source_url"].split("?")[0].rstrip("/") == row["source_url"].split("?")[0].rstrip("/"):
            return "duplicate"
        if company_key(previous["startup_name"]) != company_key(row["startup_name"]):
            continue
        if previous["country"] != row["country"] and {previous["country"], row["country"]} != {"USA", "United States"}:
            raise ValueError("Company headquarters conflicts with existing evidence")
        if previous["round_date"] == row["round_date"]:
            if int(previous["amount_usd"]) != int(row["amount_usd"]):
                raise ValueError("Company/date amount conflicts with existing evidence")
            return "duplicate"
        if previous["amount_usd"] == row["amount_usd"]:
            if not previous["round_date"] or abs((date.fromisoformat(previous["round_date"]) - date.fromisoformat(row["round_date"])).days) <= 30:
                raise ValueError("Possible re-announcement of existing financing; automatic reconciliation unresolved")
    return None


def run(script, *args):
    subprocess.run([sys.executable, str(ROOT / "scripts" / script), *args], cwd=ROOT, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tavily", action="store_true", help="Also run paid Tavily search (off by default)")
    args = parser.parse_args()
    for name in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NEBIUS_API_KEY"):
        if not os.environ.get(name):
            parser.error(f"{name} is required")
    # One shared job must own this state. Render serializes instances of a single cron service.
    stored = database()
    state = stored[0]["payload"] if stored else {}
    previous = state.get("automatic_records", [])
    existing = read_rows(RAW_FILE)[1]
    restored, decisions = select_rows(previous, existing)
    conflicts = [item for item in decisions if item["status"] == "quarantined"]
    if conflicts:
        raise ValueError("Persisted records conflict with checked-in evidence; keeping last published snapshot")
    if restored:
        append_rows(RAW_FILE, restored)
    run("fetch_market_events_feeds.py")
    if args.tavily:
        run("fetch_market_events_tavily.py")
    with (ROOT / "data/raw/market_events_raw.csv").open(newline="") as handle:
        candidates = list(csv.DictReader(handle))
    # Persist discovered candidates so unresolved articles survive ephemeral cron instances.
    pending = {item["source_url"]: item for item in state.get("candidates", [])}
    for item in candidates:
        if item["event_type"] == "funding_round" and item["status"] != "rejected":
            pending[item["source_url"]] = item
    attempts = state.get("attempts", {})
    records = {row["event_id"]: row for row in previous}
    evidence = state.get("evidence", {})
    now = datetime.now(timezone.utc)
    budget = int(os.environ.get("INGEST_MAX_ARTICLES", "20"))
    if not 1 <= budget <= 100:
        raise ValueError("INGEST_MAX_ARTICLES must be between 1 and 100")
    checked = 0
    for url, candidate in sorted(pending.items(), key=lambda pair: pair[1].get("event_date", ""), reverse=True):
        attempt = attempts.get(url, {})
        if attempt.get("status") in {"published", "duplicate"}:
            continue
        if attempt.get("retry_after") and now < datetime.fromisoformat(attempt["retry_after"]):
            continue
        if checked >= budget:
            break
        checked += 1
        count = attempt.get("count", 0) + 1
        try:
            text = article_text(url)
            facts = extract(text)
            row = verify(facts, text, url)
            existing_rows = read_rows(RAW_FILE)[1]
            if duplicate_status(row, existing_rows):
                attempts[url] = {"status": "duplicate", "count": count, "checked_at": now.isoformat()}
                continue
            accepted, result = select_rows([row], existing_rows)
            if not accepted:
                reason = result[0]
                if reason["status"] == "already_ingested":
                    status = "duplicate"
                else:
                    raise ValueError("; ".join(reason["reasons"]))
            else:
                append_rows(RAW_FILE, accepted)
                records[row["event_id"]] = row
                evidence[row["event_id"]] = {"source_url": url, "quotes": facts["quotes"], "checked_at": now.isoformat()}
                status = "published"
            attempts[url] = {"status": status, "count": count, "checked_at": now.isoformat()}
        except Exception as error:
            # No review queue: retain a reason and retry with capped exponential backoff.
            # Never persist provider error bodies, which can contain credentials/request content.
            reason = str(error) if isinstance(error, (ValueError, KeyError, TypeError)) else type(error).__name__
            attempts[url] = {"status": "retry_pending", "count": count, "reason": reason[:400],
                             "checked_at": now.isoformat(), "retry_after": (now + timedelta(days=min(2 ** min(count - 1, 5), 30))).isoformat()}
    # Preserve the distinction between checked automatic sources and untouched legacy evidence.
    metadata_path = ROOT / "data/raw/funding_evidence_metadata.csv"
    if metadata_path.exists():
        with metadata_path.open(newline="") as handle:
            reader = csv.DictReader(handle)
            columns, metadata = reader.fieldnames, list(reader)
        known = {item["event_id"] for item in metadata}
        additions = []
        for event_id, record in records.items():
            if event_id not in known and event_id in evidence:
                additions.append({"event_id": event_id, "amount_basis": "reported_round",
                                  "verification_status": "core_fields_checked",
                                  "source_checked_at": evidence[event_id]["checked_at"][:10],
                                  "source_url": record["source_url"],
                                  "notes": "Automatic source-text and quoted-field checks; not independently corroborated."})
        if additions:
            with metadata_path.open("a", newline="") as handle:
                csv.DictWriter(handle, fieldnames=columns).writerows(additions)
    run("refresh_platform.py")
    assets = {name: json.loads((ROOT / "data/app" / name).read_text()) for name in SNAPSHOT_FILES}
    payload = {"published_at": now.isoformat(), "assets": assets, "automatic_records": list(records.values()),
               "candidates": list(pending.values()), "evidence": evidence, "attempts": attempts}
    # A single database row update makes graph, health, News and ingestion state visible together.
    database("POST", {"id": "current", "payload": payload, "updated_at": now.isoformat()})
    print(json.dumps({"articles_checked": checked, "automatic_records": len(records),
                      "retry_pending": sum(item["status"] == "retry_pending" for item in attempts.values()),
                      "snapshot_id": assets["market_graph.json"]["metadata"]["snapshot_id"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
