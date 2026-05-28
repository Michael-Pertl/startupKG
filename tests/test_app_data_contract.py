"""Standard-library tests for app-facing data contracts."""

from __future__ import annotations

import csv
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


class AppDataContractTest(unittest.TestCase):
    def test_app_files_exist(self) -> None:
        self.assertTrue((ROOT / "app" / "app.py").exists())
        self.assertTrue((ROOT / "app" / "analytics.py").exists())
        self.assertTrue((ROOT / "app" / "data_loader.py").exists())
        self.assertTrue((ROOT / "scripts" / "build_app_graph.py").exists())
        self.assertTrue((ROOT / "web" / "src" / "App.tsx").exists())

    def test_processed_data_contracts_exist(self) -> None:
        required = [
            ROOT / "data" / "processed" / "funding_rounds.csv",
            ROOT / "data" / "processed" / "startups.csv",
            ROOT / "data" / "processed" / "investors.csv",
            ROOT / "data" / "processed" / "participations.csv",
            ROOT / "data" / "processed" / "startup_growth_metrics.csv",
            ROOT / "data" / "processed" / "startup_funding_trajectory.csv",
            ROOT / "data" / "raw" / "startup_profiles.csv",
        ]
        for path in required:
            self.assertTrue(path.exists(), f"missing {path.relative_to(ROOT)}")

    def test_rounds_are_app_ready(self) -> None:
        rows = read_csv(ROOT / "data" / "processed" / "funding_rounds.csv")
        self.assertGreaterEqual(len(rows), 100)
        required_columns = {
            "round_id",
            "startup_id",
            "round_type",
            "round_date",
            "year",
            "amount_usd",
            "source_url",
            "source_type",
            "confidence",
        }
        self.assertTrue(required_columns.issubset(rows[0].keys()))
        self.assertTrue(all(int(row["amount_usd"]) >= 100_000_000 for row in rows))
        self.assertTrue(all(row["source_url"].strip() for row in rows))
        self.assertTrue(set(row["confidence"] for row in rows).issubset({"high", "medium", "low"}))

    def test_profiles_are_partially_enriched_for_product_use(self) -> None:
        profiles = read_csv(ROOT / "data" / "raw" / "startup_profiles.csv")
        enriched = [row for row in profiles if row["profile_source_url"].strip()]
        self.assertGreaterEqual(len(profiles), 100)
        self.assertGreaterEqual(len(enriched), 50)

    def test_growth_metrics_cover_all_startups(self) -> None:
        startups = read_csv(ROOT / "data" / "processed" / "startups.csv")
        growth = read_csv(ROOT / "data" / "processed" / "startup_growth_metrics.csv")
        startup_ids = {row["startup_id"] for row in startups}
        growth_ids = {row["startup_id"] for row in growth}
        self.assertEqual(startup_ids, growth_ids)

    def test_graph_export_exists_when_built(self) -> None:
        path = ROOT / "web" / "public" / "data" / "market_graph.json"
        if path.exists():
            self.assertGreater(path.stat().st_size, 10_000)

    def test_market_events_contract(self) -> None:
        rows = read_csv(ROOT / "data" / "raw" / "market_events_raw.csv")
        self.assertGreaterEqual(len(rows), 5)
        required_columns = {
            "event_id",
            "company_name",
            "event_type",
            "event_date",
            "year",
            "source_url",
            "source_type",
            "confidence",
            "status",
            "summary",
        }
        self.assertTrue(required_columns.issubset(rows[0].keys()))
        self.assertTrue(all(row["source_url"].startswith(("http://", "https://")) for row in rows))
        self.assertTrue(all(row["event_date"][:4] == row["year"] for row in rows))
        self.assertTrue(set(row["status"] for row in rows).issubset({
            "staged",
            "auto_ingested",
            "approved",
            "rejected",
            "needs_review",
        }))

    def test_market_event_export_exists_when_built(self) -> None:
        path = ROOT / "web" / "public" / "data" / "market_events.json"
        if not path.exists():
            return
        payload = json.loads(path.read_text(encoding="utf-8"))
        self.assertGreaterEqual(payload["metadata"]["event_count"], 5)
        self.assertTrue(payload["metadata"]["scope_note"])
        self.assertTrue(all(event["source_url"] for event in payload["events"]))


if __name__ == "__main__":
    unittest.main()
