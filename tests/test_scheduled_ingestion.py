import csv
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import scheduled_ingestion as job
from test_market_evidence import FACTS, URL
from verify_market_evidence import verify
from validate_raw_data import REQUIRED_COLUMNS

class ScheduledIngestionTests(unittest.TestCase):
    def test_persist_restore_and_retry_without_human_approval(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            raw = root / "data/raw/funding_events_raw.csv"
            raw.parent.mkdir(parents=True)
            raw.write_text(",".join(REQUIRED_COLUMNS) + "\n")
            candidates = root / "data/raw/market_events_raw.csv"
            candidates.write_text("source_url,event_type,status,event_date\n" + URL + ",funding_round,staged,2026-09-01\n")
            state = []
            def database(method="GET", payload=None):
                if method == "GET":
                    return [{"payload": state[-1]["payload"]}] if state else []
                state.append(payload)
            def append(path, rows):
                with path.open("a", newline="") as handle:
                    csv.DictWriter(handle, fieldnames=REQUIRED_COLUMNS).writerows(rows)
            def run(script, *args):
                if script == "refresh_platform.py":
                    folder = root / "data/app"
                    folder.mkdir(parents=True, exist_ok=True)
                    for name in job.SNAPSHOT_FILES:
                        (folder / name).write_text(json.dumps({"metadata": {"snapshot_id": "new"}}))
            with patch.multiple(job, ROOT=root, RAW_FILE=raw), patch.object(job, "database", side_effect=database), \
                 patch.object(job, "append_rows", side_effect=append), patch.object(job, "run", side_effect=run), \
                 patch.object(job, "article_text", return_value=" ".join(FACTS["quotes"].values())), \
                 patch.object(job, "extract", return_value=FACTS) as extraction, \
                 patch.dict(os.environ, {name: "test" for name in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NEBIUS_API_KEY")}), \
                 patch.object(sys, "argv", ["scheduled_ingestion.py"]):
                job.main()
                self.assertEqual(len(state[0]["payload"]["automatic_records"]), 1)
                self.assertEqual(state[0]["payload"]["attempts"][URL]["status"], "published")
                self.assertIn("quotes", next(iter(state[0]["payload"]["evidence"].values())))
                # Simulate a fresh ephemeral cron filesystem and missing RSS item.
                raw.write_text(",".join(REQUIRED_COLUMNS) + "\n")
                candidates.write_text("source_url,event_type,status,event_date\n")
                job.main()
                self.assertEqual(extraction.call_count, 1)
                self.assertEqual(len(job.read_rows(raw)[1]), 1)
                self.assertEqual(len(state[-1]["payload"]["automatic_records"]), 1)
                candidates.write_text("source_url,event_type,status,event_date\nhttps://127.0.0.1/private,funding_round,staged,2026-09-02\n")
                job.main()
                pending = state[-1]["payload"]["attempts"]["https://127.0.0.1/private"]
                self.assertEqual(pending["status"], "retry_pending")
                self.assertIn("retry_after", pending)
                calls = extraction.call_count
                job.main()
                self.assertEqual(extraction.call_count, calls, "Retry backoff should prevent repeated model calls")
                with patch.object(job, "run", side_effect=RuntimeError("rebuild failed")):
                    with self.assertRaises(RuntimeError):
                        job.main()
                self.assertEqual(len(state), 4, "A failed rebuild must not replace published state")

    def test_aliases_and_reannouncements_cannot_duplicate_totals(self):
        row = verify(FACTS, " ".join(FACTS["quotes"].values()), URL)
        previous = dict(row, startup_name="Example AI, Inc.", source_url="https://www.reuters.com/example")
        self.assertEqual(job.duplicate_status(row, [previous]), "duplicate")
        previous["round_date"] = "2026-08-30"
        with self.assertRaisesRegex(ValueError, "re-announcement"):
            job.duplicate_status(row, [previous])
        previous["country"] = "France"
        with self.assertRaisesRegex(ValueError, "headquarters conflicts"):
            job.duplicate_status(row, [previous])

    def test_missing_credentials_stops_before_network(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(sys, "argv", ["scheduled_ingestion.py"]), \
             patch.object(job, "database") as database:
            with self.assertRaises(SystemExit):
                job.main()
            database.assert_not_called()
