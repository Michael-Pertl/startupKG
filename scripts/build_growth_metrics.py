#!/usr/bin/env python3
"""Build company-level funding growth metrics from processed mega-round data."""

from __future__ import annotations

import csv
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PROCESSED_DIR = ROOT / "data" / "processed"


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, object]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def trajectory_label(year_amounts: dict[int, int]) -> str:
    if len(year_amounts) == 1:
        return "single_year"

    ordered = [amount for _, amount in sorted(year_amounts.items())]
    if all(later > earlier for earlier, later in zip(ordered, ordered[1:])):
        return "accelerating"
    if all(later < earlier for earlier, later in zip(ordered, ordered[1:])):
        return "decelerating"
    return "multi_year_mixed"


def main() -> int:
    startups = {
        row["startup_id"]: row
        for row in read_csv(PROCESSED_DIR / "startups.csv")
    }
    rounds = read_csv(PROCESSED_DIR / "funding_rounds.csv")

    rounds_by_startup: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in rounds:
        rounds_by_startup[row["startup_id"]].append(row)

    metrics_rows: list[dict[str, object]] = []
    trajectory_rows: list[dict[str, object]] = []

    for startup_id, startup_rounds in sorted(rounds_by_startup.items()):
        startup = startups[startup_id]
        sorted_rounds = sorted(
            startup_rounds,
            key=lambda row: (
                int(row["year"]),
                int(row["month"] or 0),
                row["round_id"],
            ),
        )

        total_amount = sum(int(row["amount_usd"]) for row in sorted_rounds)
        largest_round = max(int(row["amount_usd"]) for row in sorted_rounds)
        first = sorted_rounds[0]
        last = sorted_rounds[-1]

        amounts_by_year: dict[int, int] = defaultdict(int)
        rounds_by_year: dict[int, int] = defaultdict(int)
        for row in sorted_rounds:
            year = int(row["year"])
            amounts_by_year[year] += int(row["amount_usd"])
            rounds_by_year[year] += 1

        cumulative = 0
        for year in sorted(amounts_by_year):
            yearly_amount = amounts_by_year[year]
            cumulative += yearly_amount
            trajectory_rows.append(
                {
                    "startup_id": startup_id,
                    "name": startup["name"],
                    "region": startup["region"],
                    "country": startup["country"],
                    "primary_domain": startup["primary_domain"],
                    "year": year,
                    "mega_rounds": rounds_by_year[year],
                    "amount_usd": yearly_amount,
                    "cumulative_amount_usd": cumulative,
                }
            )

        metrics_rows.append(
            {
                "startup_id": startup_id,
                "name": startup["name"],
                "region": startup["region"],
                "country": startup["country"],
                "primary_domain": startup["primary_domain"],
                "first_mega_round_date": first["round_date"],
                "last_mega_round_date": last["round_date"],
                "first_mega_round_year": first["year"],
                "last_mega_round_year": last["year"],
                "mega_round_count": len(sorted_rounds),
                "active_mega_round_years": len(amounts_by_year),
                "total_mega_round_amount_usd": total_amount,
                "largest_round_usd": largest_round,
                "trajectory_label": trajectory_label(amounts_by_year),
            }
        )

    write_csv(
        PROCESSED_DIR / "startup_growth_metrics.csv",
        [
            "startup_id",
            "name",
            "region",
            "country",
            "primary_domain",
            "first_mega_round_date",
            "last_mega_round_date",
            "first_mega_round_year",
            "last_mega_round_year",
            "mega_round_count",
            "active_mega_round_years",
            "total_mega_round_amount_usd",
            "largest_round_usd",
            "trajectory_label",
        ],
        sorted(
            metrics_rows,
            key=lambda row: (
                -int(row["total_mega_round_amount_usd"]),
                row["name"],
            ),
        ),
    )
    write_csv(
        PROCESSED_DIR / "startup_funding_trajectory.csv",
        [
            "startup_id",
            "name",
            "region",
            "country",
            "primary_domain",
            "year",
            "mega_rounds",
            "amount_usd",
            "cumulative_amount_usd",
        ],
        sorted(
            trajectory_rows,
            key=lambda row: (row["name"], int(row["year"])),
        ),
    )

    print(
        "Built growth metrics for "
        f"{len(metrics_rows)} startups and {len(trajectory_rows)} startup-year rows."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
