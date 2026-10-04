import argparse
import fcntl
import json
import subprocess
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from scripts.build_data_health import assurance
from scripts.funding_evidence import apply_evidence, infer_amount_basis, read_csv, ROOT
from scripts import refresh_platform
from scripts.check_deployed_data import compare
from scripts.normalize_raw_data import make_round_ids


class CustomerAssuranceTest(unittest.TestCase):
    def test_service_health_is_not_proof_of_current_deployment(self):
        expected = {"snapshot_id": "new", "funding_events": 212, "latest_funding_date": "2026-09-10"}
        self.assertTrue(compare(expected, {"metadata": {"round_count": 201}}, {}, {"ok": True}))
        graph = {"metadata": {"snapshot_id": "new", "round_count": 212, "latest_funding_date": "2026-09-10"}}
        self.assertFalse(compare(expected, graph, {"snapshot_id": "new", "snapshot_matches_evidence": True}, {"ok": True}))
    def test_raw_notes_preserve_bounds_and_primary_secondary_distinctions(self):
        self.assertEqual(infer_amount_basis({"round_type": "Series F", "notes": "Includes USD200M primary and USD400M secondary"}), "mixed_primary_secondary")
        self.assertEqual(infer_amount_basis({"round_type": "Series A", "notes": "Amount reported as up to USD105M"}), "upper_bound")
        self.assertEqual(infer_amount_basis({"round_type": "Series B", "notes": "More than USD100M"}), "lower_bound")
        self.assertEqual(infer_amount_basis({"round_type": "Series B first close", "notes": "USD234M actually raised; USD300M target must not be counted"}), "reported_round")
    def test_correction_preserves_raw_and_never_adds_a_second_round(self):
        raw = read_csv(ROOT / "data/raw/funding_events_raw.csv")
        original = next(row for row in raw if row["event_id"] == "evt_openai_2026_growth")
        effective = apply_evidence(raw)
        updated = next(row for row in effective if row["event_id"] == original["event_id"])
        self.assertEqual(original["amount_usd"], "110000000000")
        self.assertEqual(updated["amount_usd"], "122000000000")
        self.assertEqual(updated["round_date"], "2026-03-31")
        self.assertEqual(updated["amount_basis"], "committed_capital")
        self.assertEqual(len(effective), len(raw))
        published = read_csv(ROOT / "data/processed/funding_rounds.csv")
        row = next(row for row in published if row["event_id"] == original["event_id"])
        self.assertEqual(row["round_id"], make_round_ids(raw)[original["event_id"]])

    def test_duplicate_or_unsourced_corrections_fail(self):
        raw = read_csv(ROOT / "data/raw/funding_events_raw.csv")
        correction = read_csv(ROOT / "data/raw/funding_event_corrections.csv")[0]
        with self.assertRaises(ValueError):
            apply_evidence(raw, [correction, correction], [])
        with self.assertRaises(ValueError):
            apply_evidence(raw, [dict(correction, source_url="http://invalid.test")], [])

    def test_wrong_source_cannot_receive_a_recheck_label(self):
        raw = read_csv(ROOT / "data/raw/funding_events_raw.csv")
        item = read_csv(ROOT / "data/raw/funding_evidence_metadata.csv")[0]
        with self.assertRaises(ValueError):
            apply_evidence(raw, None, [dict(item, source_url="https://invalid.test")])

    def test_recent_export_does_not_hide_stale_discovery_or_failed_pipeline(self):
        now = datetime(2026, 10, 4, tzinfo=timezone.utc)
        payload = {"funding_events": 1, "source_rechecked_events": 1, "unknown_investors": 0,
                   "low_confidence_events": 0, "undated_funding_events": 0,
                   "pipeline": {"status": "failed", "completed_at": now.isoformat()},
                   "rss": {"fetched_at": "2026-09-01T00:00:00+00:00", "active_feeds": 1, "successful_feeds": 1}}
        result = assurance(payload, now)
        self.assertEqual(result["status"], "limited_preview")
        self.assertEqual(len(result["blockers"]), 2)
        payload["pipeline"]["status"] = "ok"
        payload["rss"]["fetched_at"] = now.isoformat()
        self.assertFalse(assurance(payload, now)["blockers"])
        payload["rss"]["fetched_at"] = "2026-10-05T00:00:00+00:00"
        self.assertTrue(assurance(payload, now)["blockers"])

    def test_failed_or_timed_out_refresh_still_exports_failed_health(self):
        for first in (SimpleNamespace(returncode=1, stdout="", stderr="validation failed"),
                      subprocess.TimeoutExpired("validation", 600)):
            with tempfile.TemporaryDirectory() as directory:
                def fake_run(*args, **kwargs):
                    if "validate_raw_data.py" in args[0][1]:
                        if isinstance(first, Exception):
                            raise first
                        return first
                    return SimpleNamespace(returncode=0, stdout="", stderr="")
                with patch.object(refresh_platform, "ROOT", Path(directory)), patch.object(refresh_platform.subprocess, "run", side_effect=fake_run) as run:
                    result = refresh_platform.refresh(argparse.Namespace(discover=False, tavily=False))
                self.assertEqual(result, 1)
                self.assertIn("build_data_health.py", run.call_args.args[0][1])
                report = json.loads((Path(directory) / "data/app/pipeline_report.json").read_text())
                self.assertEqual(report["status"], "failed")

    def test_overlapping_refresh_exits_without_running_steps(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "cache").mkdir()
            with (root / "cache/refresh.lock").open("a") as lock:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                with patch.object(refresh_platform, "ROOT", root), patch("sys.argv", ["refresh_platform.py"]), patch.object(refresh_platform, "refresh") as refresh:
                    self.assertEqual(refresh_platform.main(), 2)
                    refresh.assert_not_called()

    def test_health_export_failure_cannot_leave_a_successful_report(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(refresh_platform, "ROOT", Path(directory)), patch.object(refresh_platform.subprocess, "run", return_value=SimpleNamespace(returncode=1, stdout="", stderr="invalid data")):
                self.assertEqual(refresh_platform.refresh(argparse.Namespace(discover=False, tavily=False)), 1)
            health = json.loads((Path(directory) / "web/public/data/data_health.json").read_text())
            self.assertEqual(health["pipeline"]["status"], "failed")
            self.assertEqual(health["assurance"]["status"], "limited_preview")
            self.assertTrue(health["evidence_error"])
