#!/usr/bin/env python3
"""Build API-ready graph JSON for the AI market map frontend."""

from __future__ import annotations

import csv
import json
import hashlib
from collections import Counter, defaultdict
from itertools import combinations
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PROCESSED_DIR = ROOT / "data" / "processed"
RAW_DIR = ROOT / "data" / "raw"
APP_DATA_DIR = ROOT / "data" / "app"
WEB_DATA_DIR = ROOT / "web" / "public" / "data"


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def money(value: str) -> int:
    return int(value.strip() or "0")


def add_node(
    nodes: dict[str, dict[str, Any]],
    node_id: str,
    label: str,
    kind: str,
    **properties: Any,
) -> None:
    nodes.setdefault(
        node_id,
        {
            "id": node_id,
            "label": label,
            "kind": kind,
            **properties,
        },
    )


def add_edge(
    edges: list[dict[str, Any]],
    edge_id: str,
    source: str,
    target: str,
    kind: str,
    **properties: Any,
) -> None:
    edges.append(
        {
            "id": edge_id,
            "source": source,
            "target": target,
            "kind": kind,
            **properties,
        }
    )


def main() -> int:
    from funding_evidence import apply_evidence, evidence_digest
    startups = {row["startup_id"]: row for row in read_csv(PROCESSED_DIR / "startups.csv")}
    investors = {row["investor_id"]: row for row in read_csv(PROCESSED_DIR / "investors.csv")}
    rounds = {row["round_id"]: row for row in read_csv(PROCESSED_DIR / "funding_rounds.csv")}
    effective = apply_evidence(read_csv(RAW_DIR / "funding_events_raw.csv"))
    evidence_by_id = {row["event_id"]: row for row in effective}
    fields = ("amount_usd", "round_date", "source_url", "round_type", "amount_basis", "verification_status", "source_checked_at")
    if len(rounds) != len(effective) or any(
        row.get("event_id") not in evidence_by_id or any(row.get(field) != evidence_by_id[row["event_id"]].get(field) for field in fields)
        for row in rounds.values()
    ):
        raise ValueError("Processed rounds do not match effective evidence; run the validated refresh before publishing.")
    participations = read_csv(PROCESSED_DIR / "participations.csv")
    profiles = {
        row["startup_id"]: row
        for row in read_csv(RAW_DIR / "startup_profiles.csv")
        if row.get("startup_id")
    }
    growth = {
        row["startup_id"]: row
        for row in read_csv(PROCESSED_DIR / "startup_growth_metrics.csv")
    }

    investor_rounds: defaultdict[str, set[str]] = defaultdict(set)
    round_investors: defaultdict[str, list[str]] = defaultdict(list)
    for row in participations:
        investor_rounds[row["investor_id"]].add(row["round_id"])
        round_investors[row["round_id"]].append(row["investor_id"])

    nodes: dict[str, dict[str, Any]] = {}
    edges: list[dict[str, Any]] = []

    amount_by_startup: defaultdict[str, int] = defaultdict(int)
    count_by_startup: Counter[str] = Counter()
    amount_by_investor: defaultdict[str, int] = defaultdict(int)
    count_by_investor: Counter[str] = Counter()
    lead_count_by_investor: Counter[str] = Counter()
    amount_by_country: defaultdict[str, int] = defaultdict(int)
    amount_by_region: defaultdict[str, int] = defaultdict(int)
    amount_by_domain: defaultdict[str, int] = defaultdict(int)
    amount_by_year: defaultdict[str, int] = defaultdict(int)

    for round_id, row in rounds.items():
        startup = startups[row["startup_id"]]
        amount = money(row["amount_usd"])
        amount_by_startup[row["startup_id"]] += amount
        count_by_startup[row["startup_id"]] += 1
        amount_by_country[startup["country"]] += amount
        amount_by_region[startup["region"]] += amount
        amount_by_domain[startup["primary_domain"]] += amount
        amount_by_year[row["year"]] += amount

        for investor_id in round_investors[round_id]:
            amount_by_investor[investor_id] += amount
            count_by_investor[investor_id] += 1

    for row in participations:
        if row["role"] == "lead":
            lead_count_by_investor[row["investor_id"]] += 1

    for startup_id, row in startups.items():
        profile = profiles.get(startup_id, {})
        growth_row = growth.get(startup_id, {})
        add_node(
            nodes,
            startup_id,
            row["name"],
            "startup",
            region=row["region"],
            country=row["country"],
            city=row["city"],
            domain=row["primary_domain"],
            website=profile.get("website", ""),
            founded_year=profile.get("founded_year", ""),
            founders=profile.get("founders", ""),
            notable_products=profile.get("notable_products", ""),
            profile_confidence=profile.get("profile_confidence", ""),
            profile_source_url=profile.get("profile_source_url", ""),
            profile_enriched=bool(profile.get("profile_source_url", "").strip()),
            mega_round_count=count_by_startup[startup_id],
            visible_mega_round_funding_usd=amount_by_startup[startup_id],
            largest_round_usd=money(growth_row.get("largest_round_usd", "0")),
            importance_score=amount_by_startup[startup_id] + count_by_startup[startup_id] * 600_000_000,
            trajectory_label=growth_row.get("trajectory_label", ""),
        )

    for investor_id, row in investors.items():
        funding_score = int(amount_by_investor[investor_id] ** 0.82)
        activity_score = count_by_investor[investor_id] * 900_000
        lead_score = lead_count_by_investor[investor_id] * 1_500_000
        add_node(
            nodes,
            investor_id,
            row["name"],
            "investor",
            investor_type=row["investor_type"],
            country=row["country"],
            website=row["website"],
            participated_rounds=count_by_investor[investor_id],
            lead_rounds=lead_count_by_investor[investor_id],
            linked_funding_usd=amount_by_investor[investor_id],
            importance_score=funding_score + activity_score + lead_score,
        )

    for round_id, row in rounds.items():
        startup = startups[row["startup_id"]]
        amount = money(row["amount_usd"])
        add_node(
            nodes,
            round_id,
            f"{startup['name']} {row['year']} {row['round_type']}",
            "round",
            startup_id=row["startup_id"],
            event_id=row["event_id"],
            startup_name=startup["name"],
            amount_usd=amount,
            round_type=row["round_type"],
            round_date=row["round_date"],
            year=row["year"],
            month=row["month"],
            region=startup["region"],
            country=startup["country"],
            domain=startup["primary_domain"],
            confidence=row["confidence"],
            source_type=row["source_type"],
            source_url=row["source_url"],
            amount_original=row.get("amount_original", ""),
            amount_currency=row.get("amount_currency", "USD"),
            evidence_notes=row.get("evidence_notes", ""),
            amount_basis=row.get("amount_basis", "reported_round"),
            verification_status=row.get("verification_status", "not_rechecked"),
            source_checked_at=row.get("source_checked_at", ""),
            importance_score=amount,
        )
        add_edge(
            edges,
            f"{row['startup_id']}__raised__{round_id}",
            row["startup_id"],
            round_id,
            "raised",
            amount_usd=amount,
            year=row["year"],
        )

    for row in participations:
        role = row["role"]
        round_row = rounds[row["round_id"]]
        amount = money(round_row["amount_usd"])
        role_multiplier = 1.45 if role == "lead" else 0.85
        add_edge(
            edges,
            f"{row['investor_id']}__{role}__{row['round_id']}",
            row["investor_id"],
            row["round_id"],
            "participated",
            role=role,
            amount_usd=amount,
            linked_round_usd=amount,
            participation_role=role,
            participation_weight=int(amount * role_multiplier),
            allocation_basis="role_proxy",
            year=round_row["year"],
        )

    for startup_id, row in startups.items():
        country_id = f"country::{row['country']}"
        region_id = f"region::{row['region']}"
        domain_id = f"domain::{row['primary_domain']}"
        add_node(nodes, country_id, row["country"], "country", region=row["region"], funding_usd=amount_by_country[row["country"]])
        add_node(nodes, region_id, row["region"], "region", funding_usd=amount_by_region[row["region"]])
        add_node(nodes, domain_id, row["primary_domain"], "domain", funding_usd=amount_by_domain[row["primary_domain"]])
        nodes[country_id]["importance_score"] = amount_by_country[row["country"]]
        nodes[region_id]["importance_score"] = amount_by_region[row["region"]]
        nodes[domain_id]["importance_score"] = amount_by_domain[row["primary_domain"]]
        add_edge(edges, f"{startup_id}__hq__{country_id}", startup_id, country_id, "headquartered_in")
        add_edge(edges, f"{country_id}__part_of__{region_id}", country_id, region_id, "part_of")
        add_edge(edges, f"{startup_id}__domain__{domain_id}", startup_id, domain_id, "operates_in")

    for row in rounds.values():
        year_id = f"year::{row['year']}"
        add_node(nodes, year_id, row["year"], "year", funding_usd=amount_by_year[row["year"]])
        nodes[year_id]["importance_score"] = amount_by_year[row["year"]]
        add_edge(edges, f"{row['round_id']}__year__{year_id}", row["round_id"], year_id, "occurred_in")

    co_investment_pairs: dict[tuple[str, str], dict[str, Any]] = {}
    for round_id, investor_ids in round_investors.items():
        amount = money(rounds[round_id]["amount_usd"])
        for left, right in combinations(sorted(set(investor_ids)), 2):
            pair = co_investment_pairs.setdefault(
                (left, right),
                {
                    "source": left,
                    "target": right,
                    "shared_rounds": 0,
                    "linked_funding_usd": 0,
                },
            )
            pair["shared_rounds"] += 1
            pair["linked_funding_usd"] += amount

    for index, pair in enumerate(co_investment_pairs.values(), start=1):
        if pair["shared_rounds"] < 2:
            continue
        add_edge(
            edges,
            f"coinvest::{index}",
            pair["source"],
            pair["target"],
            "co_invested",
            shared_rounds=pair["shared_rounds"],
            linked_funding_usd=pair["linked_funding_usd"],
        )

    node_values = list(nodes.values())
    payload = {
        "metadata": {
            "title": "Global AI Mega-Round Market Graph",
            "generated_from": "data/processed/*.csv",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "evidence_digest": evidence_digest(effective),
            "latest_funding_date": max((row["round_date"] for row in rounds.values() if row["round_date"]), default=""),
            "round_count": len(rounds),
            "startup_count": len(startups),
            "investor_count": len(investors),
            "edge_count": len(edges),
            "scope_note": (
                "Curated publicly reported AI mega-rounds of USD100M or more in 2024-2026. "
                "Coverage is incomplete and regionally uneven; this is not the full AI startup ecosystem. "
                "Graph totals are reported financing amounts, including mixed transactions and commitments, not cash disbursed."
            ),
        },
        "facets": {
            "years": sorted({row["year"] for row in rounds.values()}),
            "regions": sorted({row["region"] for row in startups.values()}),
            "countries": sorted({row["country"] for row in startups.values()}),
            "domains": sorted({row["primary_domain"] for row in startups.values()}),
            "confidence": sorted({row["confidence"] for row in rounds.values()}),
        },
        "nodes": sorted(node_values, key=lambda node: (node["kind"], node["label"])),
        "edges": edges,
    }
    payload["metadata"]["snapshot_id"] = hashlib.sha256(json.dumps({"nodes": payload["nodes"], "edges": edges}, sort_keys=True, separators=(",", ":")).encode()).hexdigest()

    for path in (APP_DATA_DIR / "market_graph.json", WEB_DATA_DIR / "market_graph.json"):
        write_json(path, payload)

    print(
        "Built app graph with "
        f"{len(payload['nodes'])} nodes and {len(payload['edges'])} edges."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
