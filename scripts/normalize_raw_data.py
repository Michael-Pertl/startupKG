#!/usr/bin/env python3
"""Normalize raw funding evidence into graph import tables."""

from __future__ import annotations

import csv
import re
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw"
PROCESSED_DIR = ROOT / "data" / "processed"
NEO4J_DIR = ROOT / "data" / "neo4j_import"


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")
    return slug or "unknown"


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def split_investors(value: str) -> list[str]:
    return [name.strip() for name in value.split(";") if name.strip()]


def load_investor_mapping() -> dict[str, dict[str, str]]:
    mappings = {}
    for row in read_csv(RAW_DIR / "investor_name_mapping.csv"):
        mappings[row["raw_name"].strip().lower()] = row
    return mappings


def normalize_investor(raw_name: str, mappings: dict[str, dict[str, str]]) -> dict[str, str]:
    mapped = mappings.get(raw_name.strip().lower())
    if mapped:
        name = mapped["normalized_name"].strip()
        return {
            "investor_id": f"investor_{slugify(name)}",
            "name": name,
            "investor_type": mapped["investor_type"].strip(),
            "country": mapped["country"].strip(),
            "website": mapped["website"].strip(),
        }

    return {
        "investor_id": f"investor_{slugify(raw_name)}",
        "name": raw_name.strip(),
        "investor_type": "unknown",
        "country": "",
        "website": "",
    }


def make_round_ids(events: list[dict[str, str]]) -> dict[str, str]:
    base_counts: defaultdict[str, int] = defaultdict(int)
    ids = {}
    for event in events:
        base = "round_{startup}_{year}_{round_type}".format(
            startup=slugify(event["startup_name"]),
            year=event["year"],
            round_type=slugify(event["round_type"]),
        )
        month = event["month"].strip()
        if month:
            base = f"{base}_{int(month):02d}"
        base_counts[base] += 1
        ids[event["event_id"]] = base if base_counts[base] == 1 else f"{base}_{base_counts[base]:02d}"
    return ids


def main() -> int:
    events = read_csv(RAW_DIR / "funding_events_raw.csv")
    mappings = load_investor_mapping()
    round_ids = make_round_ids(events)

    startups: dict[str, dict[str, str]] = {}
    countries: dict[str, dict[str, str]] = {}
    domains: dict[str, dict[str, str]] = {}
    investors: dict[str, dict[str, str]] = {}
    rounds: list[dict[str, str]] = []
    participations: dict[tuple[str, str], dict[str, str]] = {}
    startup_domains: dict[tuple[str, str], dict[str, str]] = {}

    for event in events:
        startup_id = f"startup_{slugify(event['startup_name'])}"
        country_id = f"country_{slugify(event['country'])}"
        domain_id = f"domain_{slugify(event['ai_domain'])}"
        round_id = round_ids[event["event_id"]]

        startups.setdefault(
            startup_id,
            {
                "startup_id": startup_id,
                "name": event["startup_name"],
                "region": event["region"],
                "country": event["country"],
                "city": event["city"],
                "primary_domain": event["ai_domain"],
            },
        )
        countries.setdefault(
            country_id,
            {
                "country_id": country_id,
                "name": event["country"],
                "region": event["region"],
            },
        )
        domains.setdefault(domain_id, {"domain_id": domain_id, "name": event["ai_domain"]})
        startup_domains.setdefault(
            (startup_id, domain_id),
            {"startup_id": startup_id, "domain_id": domain_id, "role": "primary"},
        )

        rounds.append(
            {
                "round_id": round_id,
                "startup_id": startup_id,
                "round_type": event["round_type"],
                "round_date": event["round_date"],
                "year": event["year"],
                "month": event["month"],
                "amount_usd": event["amount_usd"],
                "source_url": event["source_url"],
                "source_type": event["source_type"],
                "confidence": event["confidence"],
            }
        )

        for raw_name in split_investors(event["lead_investors"]):
            investor = normalize_investor(raw_name, mappings)
            investors.setdefault(investor["investor_id"], investor)
            participations[(investor["investor_id"], round_id)] = {
                "investor_id": investor["investor_id"],
                "round_id": round_id,
                "role": "lead",
            }

        for raw_name in split_investors(event["participating_investors"]):
            investor = normalize_investor(raw_name, mappings)
            investors.setdefault(investor["investor_id"], investor)
            participations.setdefault(
                (investor["investor_id"], round_id),
                {
                    "investor_id": investor["investor_id"],
                    "round_id": round_id,
                    "role": "participant",
                },
            )

    outputs = {
        "startups.csv": (
            ["startup_id", "name", "region", "country", "city", "primary_domain"],
            sorted(startups.values(), key=lambda row: row["startup_id"]),
        ),
        "investors.csv": (
            ["investor_id", "name", "investor_type", "country", "website"],
            sorted(investors.values(), key=lambda row: row["investor_id"]),
        ),
        "funding_rounds.csv": (
            [
                "round_id",
                "startup_id",
                "round_type",
                "round_date",
                "year",
                "month",
                "amount_usd",
                "source_url",
                "source_type",
                "confidence",
            ],
            sorted(rounds, key=lambda row: (row["year"], row["month"], row["startup_id"], row["round_id"])),
        ),
        "participations.csv": (
            ["investor_id", "round_id", "role"],
            sorted(participations.values(), key=lambda row: (row["round_id"], row["investor_id"])),
        ),
        "domains.csv": (
            ["domain_id", "name"],
            sorted(domains.values(), key=lambda row: row["domain_id"]),
        ),
        "startup_domains.csv": (
            ["startup_id", "domain_id", "role"],
            sorted(startup_domains.values(), key=lambda row: (row["startup_id"], row["domain_id"])),
        ),
        "countries.csv": (
            ["country_id", "name", "region"],
            sorted(countries.values(), key=lambda row: row["country_id"]),
        ),
    }

    for filename, (fieldnames, rows) in outputs.items():
        write_csv(PROCESSED_DIR / filename, fieldnames, rows)
        write_csv(NEO4J_DIR / filename, fieldnames, rows)

    print(
        "Normalized "
        f"{len(events)} funding events, {len(startups)} startups, "
        f"{len(investors)} investors, and {len(participations)} participations."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
