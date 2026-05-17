"""Data loading helpers for the AI mega-round app."""

from __future__ import annotations

from pathlib import Path

import pandas as pd
import streamlit as st


ROOT = Path(__file__).resolve().parents[1]
PROCESSED_DIR = ROOT / "data" / "processed"
RAW_DIR = ROOT / "data" / "raw"


@st.cache_data(show_spinner=False)
def load_tables() -> dict[str, pd.DataFrame]:
    """Load all app-facing CSV tables and return normalized dataframes."""

    tables = {
        "rounds": pd.read_csv(PROCESSED_DIR / "funding_rounds.csv"),
        "startups": pd.read_csv(PROCESSED_DIR / "startups.csv"),
        "investors": pd.read_csv(PROCESSED_DIR / "investors.csv"),
        "participations": pd.read_csv(PROCESSED_DIR / "participations.csv"),
        "growth": pd.read_csv(PROCESSED_DIR / "startup_growth_metrics.csv"),
        "trajectory": pd.read_csv(PROCESSED_DIR / "startup_funding_trajectory.csv"),
        "profiles": pd.read_csv(RAW_DIR / "startup_profiles.csv"),
    }

    for key, frame in tables.items():
        tables[key] = frame.fillna("")

    rounds = tables["rounds"].copy()
    rounds["round_date"] = pd.to_datetime(rounds["round_date"], errors="coerce")
    rounds["amount_usd"] = pd.to_numeric(rounds["amount_usd"], errors="coerce").fillna(0)
    rounds["year"] = pd.to_numeric(rounds["year"], errors="coerce").astype("Int64")
    rounds["month"] = pd.to_numeric(rounds["month"], errors="coerce").astype("Int64")

    startups = tables["startups"].copy()
    rounds_enriched = rounds.merge(startups, on="startup_id", how="left", suffixes=("", "_startup"))
    rounds_enriched["name"] = rounds_enriched["name"].fillna("Unknown startup")
    rounds_enriched["region"] = rounds_enriched["region"].fillna("Unknown")
    rounds_enriched["country"] = rounds_enriched["country"].fillna("Unknown")
    rounds_enriched["primary_domain"] = rounds_enriched["primary_domain"].fillna("Unknown")

    participations = tables["participations"].copy()
    investor_names = tables["investors"][["investor_id", "name", "investor_type", "country"]]
    participations_enriched = (
        participations.merge(investor_names, on="investor_id", how="left")
        .merge(
            rounds_enriched[
                [
                    "round_id",
                    "startup_id",
                    "name",
                    "region",
                    "country",
                    "primary_domain",
                    "year",
                    "amount_usd",
                ]
            ].rename(columns={"name": "startup_name", "country": "startup_country"}),
            on="round_id",
            how="left",
        )
    )
    participations_enriched["name"] = participations_enriched["name"].fillna("Unknown investor")

    growth = tables["growth"].copy()
    for column in (
        "total_mega_round_amount_usd",
        "largest_round_usd",
        "mega_round_count",
        "active_mega_round_years",
    ):
        growth[column] = pd.to_numeric(growth[column], errors="coerce").fillna(0)

    trajectory = tables["trajectory"].copy()
    trajectory["year"] = pd.to_numeric(trajectory["year"], errors="coerce").astype("Int64")
    trajectory["amount_usd"] = pd.to_numeric(trajectory["amount_usd"], errors="coerce").fillna(0)
    trajectory["cumulative_amount_usd"] = pd.to_numeric(
        trajectory["cumulative_amount_usd"], errors="coerce"
    ).fillna(0)

    profiles = tables["profiles"].copy()
    profiles["is_enriched"] = profiles["profile_source_url"].astype(str).str.strip().ne("")

    return {
        **tables,
        "rounds": rounds,
        "rounds_enriched": rounds_enriched,
        "participations_enriched": participations_enriched,
        "growth": growth,
        "trajectory": trajectory,
        "profiles": profiles,
    }
