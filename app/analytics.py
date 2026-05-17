"""Reusable analytics for the AI mega-round app."""

from __future__ import annotations

from itertools import combinations

import pandas as pd


def usd_short(value: float | int) -> str:
    """Format USD values for dense dashboard surfaces."""

    value = float(value or 0)
    if abs(value) >= 1_000_000_000:
        return f"${value / 1_000_000_000:.1f}B"
    return f"${value / 1_000_000:.0f}M"


def apply_round_filters(
    rounds: pd.DataFrame,
    years: list[int],
    regions: list[str],
    domains: list[str],
    confidence: list[str],
) -> pd.DataFrame:
    """Apply common sidebar filters to the enriched rounds table."""

    filtered = rounds.copy()
    if years:
        filtered = filtered[filtered["year"].isin(years)]
    if regions:
        filtered = filtered[filtered["region"].isin(regions)]
    if domains:
        filtered = filtered[filtered["primary_domain"].isin(domains)]
    if confidence:
        filtered = filtered[filtered["confidence"].isin(confidence)]
    return filtered


def metric_snapshot(rounds: pd.DataFrame, participations: pd.DataFrame) -> dict[str, str]:
    return {
        "Funding volume": usd_short(rounds["amount_usd"].sum()),
        "Mega-rounds": f"{len(rounds):,}",
        "Startups": f"{rounds['startup_id'].nunique():,}",
        "Investors": f"{participations[participations['round_id'].isin(rounds['round_id'])]['investor_id'].nunique():,}",
    }


def funding_by(frame: pd.DataFrame, columns: list[str]) -> pd.DataFrame:
    if frame.empty:
        return pd.DataFrame(columns=[*columns, "amount_usd", "rounds", "startups"])
    return (
        frame.groupby(columns, dropna=False)
        .agg(amount_usd=("amount_usd", "sum"), rounds=("round_id", "nunique"), startups=("startup_id", "nunique"))
        .reset_index()
        .sort_values("amount_usd", ascending=False)
    )


def top_startups(rounds: pd.DataFrame, growth: pd.DataFrame, limit: int = 25) -> pd.DataFrame:
    ids = set(rounds["startup_id"])
    frame = growth[growth["startup_id"].isin(ids)].copy()
    return frame.sort_values(
        ["total_mega_round_amount_usd", "mega_round_count", "largest_round_usd"],
        ascending=[False, False, False],
    ).head(limit)


def investor_activity(rounds: pd.DataFrame, participations: pd.DataFrame, limit: int = 30) -> pd.DataFrame:
    active_rounds = set(rounds["round_id"])
    frame = participations[participations["round_id"].isin(active_rounds)].copy()
    if frame.empty:
        return pd.DataFrame(columns=["Investor", "Type", "Country", "Rounds", "Lead rounds", "Linked funding"])
    out = (
        frame.groupby(["investor_id", "name", "investor_type", "country"], dropna=False)
        .agg(
            rounds=("round_id", "nunique"),
            lead_rounds=("role", lambda values: int((values == "lead").sum())),
            linked_funding=("amount_usd", "sum"),
        )
        .reset_index()
        .sort_values(["rounds", "lead_rounds", "linked_funding"], ascending=False)
        .head(limit)
    )
    return out.rename(
        columns={
            "name": "Investor",
            "investor_type": "Type",
            "country": "Country",
            "rounds": "Rounds",
            "lead_rounds": "Lead rounds",
            "linked_funding": "Linked funding",
        }
    )


def co_investment_pairs(rounds: pd.DataFrame, participations: pd.DataFrame, limit: int = 30) -> pd.DataFrame:
    active_rounds = set(rounds["round_id"])
    frame = participations[participations["round_id"].isin(active_rounds)].copy()
    pairs: dict[tuple[str, str], dict[str, float | int | str]] = {}
    for round_id, group in frame.groupby("round_id"):
        investors = sorted(set(group["name"].dropna()))
        amount = float(group["amount_usd"].max() or 0)
        for left, right in combinations(investors, 2):
            key = (left, right)
            current = pairs.setdefault(
                key,
                {"Investor A": left, "Investor B": right, "Shared rounds": 0, "Linked funding": 0.0},
            )
            current["Shared rounds"] = int(current["Shared rounds"]) + 1
            current["Linked funding"] = float(current["Linked funding"]) + amount

    if not pairs:
        return pd.DataFrame(columns=["Investor A", "Investor B", "Shared rounds", "Linked funding"])

    return (
        pd.DataFrame(pairs.values())
        .sort_values(["Shared rounds", "Linked funding"], ascending=False)
        .head(limit)
    )


def year_shift(rounds: pd.DataFrame) -> pd.DataFrame:
    by_year_domain = funding_by(rounds, ["year", "primary_domain"])
    if by_year_domain.empty:
        return by_year_domain
    by_year_domain["funding_bn"] = by_year_domain["amount_usd"] / 1_000_000_000
    return by_year_domain


def profile_completion(profiles: pd.DataFrame) -> pd.DataFrame:
    fields = {
        "Website": "website",
        "Founded year": "founded_year",
        "Founders": "founders",
        "Products": "notable_products",
        "Profile source": "profile_source_url",
    }
    rows = []
    total = len(profiles)
    for label, column in fields.items():
        filled = int(profiles[column].astype(str).str.strip().ne("").sum())
        rows.append({"Field": label, "Filled": filled, "Missing": total - filled, "Completion": filled / total})
    return pd.DataFrame(rows)
