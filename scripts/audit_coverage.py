#!/usr/bin/env python3
"""Audit market-coverage readiness for the AI mega-round dataset.

This script cannot prove that a manually curated dataset is globally complete.
It checks whether the current raw table is internally usable and whether known
candidate queues still contain likely USD100M+ AI funding events that should be
reviewed before making broad market claims.
"""

from __future__ import annotations

import csv
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw"

FUNDING_EVENTS = RAW_DIR / "funding_events_raw.csv"
CANDIDATE_FILES = [
    RAW_DIR / "candidate_round_review.csv",
    RAW_DIR / "global_candidate_round_review.csv",
]
INVESTOR_MAPPING = RAW_DIR / "investor_name_mapping.csv"

MIN_REGION_ROUNDS_FOR_STRONG_COMPARISON = 5
MIN_YEAR_ROUNDS_FOR_TIMELINE = 20

# Conservative watch list of known important gaps. This is not a full global
# market list; it is a guardrail to keep obvious omissions visible.
BENCHMARK_COMPANIES = {
    "Fractile": {
        "year": "2026",
        "region": "Europe",
        "reason": "UK AI inference hardware startup reported a USD220M Series B in May 2026.",
    },
    "LiveKit": {
        "year": "2026",
        "region": "US",
        "reason": "Voice/video AI infrastructure startup reported a USD100M round in January 2026.",
    },
    "Higgsfield AI": {
        "year": "2026",
        "region": "US",
        "reason": "AI video startup reportedly crossed USD100M total Series A / extension in 2026; needs single-round review.",
    },
    "Codeium": {
        "year": "2024",
        "region": "US",
        "reason": "AI coding company appears in candidate review and remains unimported.",
    },
    "EvolutionaryScale": {
        "year": "2024",
        "region": "US",
        "reason": "Biology foundation-model startup appears in candidate review and remains unimported.",
    },
    "SandboxAQ": {
        "year": "2024",
        "region": "US",
        "reason": "Large applied AI / quantum-adjacent round appears in candidate review and remains unimported.",
    },
    "Insitro": {
        "year": "2024",
        "region": "US",
        "reason": "AI drug discovery round appears in candidate review and remains unimported.",
    },
    "Sarvam AI": {
        "year": "2026",
        "region": "India",
        "reason": "India foundation-model company is on watchlist pending closed-round evidence.",
    },
}


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def split_investors(value: str) -> list[str]:
    return [name.strip() for name in value.split(";") if name.strip()]


def money(value: str) -> int:
    return int(value.strip() or "0")


def print_section(title: str) -> None:
    print(f"\n## {title}")


def event_key(row: dict[str, str]) -> tuple[str, str]:
    return (row["startup_name"].strip().lower(), row["year"].strip())


def main() -> int:
    events = read_csv(FUNDING_EVENTS)
    mappings = read_csv(INVESTOR_MAPPING)
    mapping_names = {row["raw_name"].strip().lower() for row in mappings}

    candidate_rows: list[dict[str, str]] = []
    for path in CANDIDATE_FILES:
        for row in read_csv(path):
            row["_file"] = path.name
            candidate_rows.append(row)

    startup_names = {row["startup_name"].strip().lower() for row in events}
    candidate_status_by_company = {
        row["company"].strip().lower(): row["status"].strip()
        for row in candidate_rows
        if row.get("company", "").strip()
    }

    errors: list[str] = []
    warnings: list[str] = []

    duplicate_events = [
        event_id
        for event_id, count in Counter(row["event_id"] for row in events).items()
        if count > 1
    ]
    if duplicate_events:
        errors.append(f"duplicate event IDs: {', '.join(sorted(duplicate_events))}")

    below_threshold = [
        row["event_id"] for row in events if money(row["amount_usd"]) < 100_000_000
    ]
    if below_threshold:
        errors.append(f"events below USD100M threshold: {', '.join(below_threshold)}")

    missing_sources = [row["event_id"] for row in events if not row["source_url"].strip()]
    if missing_sources:
        errors.append(f"events missing source_url: {', '.join(missing_sources)}")

    missing_investors = [
        row["event_id"]
        for row in events
        if not (row["lead_investors"].strip() or row["participating_investors"].strip())
    ]
    if missing_investors:
        errors.append(f"events missing all investor fields: {', '.join(missing_investors)}")

    unknown_investors = set()
    for row in events:
        for field in ("lead_investors", "participating_investors"):
            for investor in split_investors(row[field]):
                if investor.lower() not in mapping_names:
                    unknown_investors.add(investor)
    if unknown_investors:
        warnings.append(
            "investors missing canonical metadata: " + ", ".join(sorted(unknown_investors))
        )

    low_confidence = [row["event_id"] for row in events if row["confidence"] == "low"]
    if low_confidence:
        warnings.append(f"low-confidence imported rows: {', '.join(low_confidence)}")

    by_year = Counter(row["year"] for row in events)
    for year in ("2024", "2025", "2026"):
        if by_year[year] < MIN_YEAR_ROUNDS_FOR_TIMELINE:
            warnings.append(
                f"{year} has only {by_year[year]} rounds; timeline comparison may be thin"
            )

    by_region = Counter(row["region"] for row in events)
    for region in ("Israel", "China", "Canada", "UAE / Gulf", "India", "Singapore"):
        if by_region[region] and by_region[region] < MIN_REGION_ROUNDS_FOR_STRONG_COMPARISON:
            warnings.append(
                f"{region} has {by_region[region]} imported rounds; compare as a small sample"
            )
        if not by_region[region]:
            warnings.append(f"{region} has no imported rounds")

    unresolved_candidates = []
    for row in candidate_rows:
        status = row["status"].strip()
        if status in {"include", "exclude"}:
            continue
        amount = money(row.get("round_amount", "0") or "0")
        if amount >= 100_000_000 or status in {"watchlist", "strategic_candidate"}:
            unresolved_candidates.append(row)

    benchmark_gaps = []
    for company, meta in BENCHMARK_COMPANIES.items():
        company_key = company.lower()
        if candidate_status_by_company.get(company_key) == "exclude":
            continue
        if company_key not in startup_names:
            benchmark_gaps.append((company, meta))

    print_section("Dataset Snapshot")
    print(f"Funding events: {len(events)}")
    print(f"Startups: {len(startup_names)}")
    print(f"Years: {dict(sorted(by_year.items()))}")
    print(f"Regions: {dict(by_region.most_common())}")
    print(f"Confidence: {dict(Counter(row['confidence'] for row in events))}")

    amount_by_region: defaultdict[str, int] = defaultdict(int)
    for row in events:
        amount_by_region[row["region"]] += money(row["amount_usd"])
    print("Funding by region (USD bn):")
    for region, amount in sorted(amount_by_region.items(), key=lambda item: item[1], reverse=True):
        print(f"- {region}: {amount / 1_000_000_000:.2f}")

    print_section("Open Candidate Queue")
    if unresolved_candidates:
        for row in unresolved_candidates:
            print(
                "- {company} ({year}, {region}, {amount}, {status}) [{file}]".format(
                    company=row["company"],
                    year=row["year"],
                    region=row["region"],
                    amount=row.get("round_amount", ""),
                    status=row["status"],
                    file=row["_file"],
                )
            )
    else:
        print("No unresolved USD100M+ candidates in local review files.")

    print_section("External Benchmark Gaps")
    if benchmark_gaps:
        for company, meta in benchmark_gaps:
            print(f"- {company} ({meta['year']}, {meta['region']}): {meta['reason']}")
    else:
        print("No benchmark gaps from the script's current watch list.")

    print_section("Quality Findings")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
    if warnings:
        for warning in warnings:
            print(f"WARN: {warning}")
    if not errors and not warnings:
        print("No structural warnings.")

    print_section("Coverage Verdict")
    if errors:
        print("BLOCKED: fix structural data errors before analysis.")
        return 1
    if unresolved_candidates or benchmark_gaps:
        print(
            "CURATED BUT INCOMPLETE: usable for analysis with caveats, but it does "
            "not fully represent the global AI startup mega-round landscape."
        )
        return 2
    if warnings:
        print(
            "USABLE WITH CAVEATS: no known local candidate gaps, but small-region "
            "samples and source caveats remain."
        )
        return 0

    print("READY: no known local or benchmark coverage gaps detected.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
