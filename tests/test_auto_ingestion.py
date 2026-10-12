import sys
import tempfile
from unittest.mock import patch
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from auto_ingest_funding import select_rows
from ingest_funding_events import read_rows, append_rows
import ingest_funding_events
from validate_raw_data import validate_row
from validate_raw_data import RAW_FILE


class AutomaticIngestionTest(unittest.TestCase):
    def setUp(self):
        self.row = next(row for row in read_rows(RAW_FILE)[1]
                        if row["confidence"] == "high" and row["source_type"] == "press_release"
                        and row["amount_currency"] == "USD" and row["amount_original"] == row["amount_usd"])
        self.row = dict(self.row, event_id="test_automatic")

    def test_no_approval_required_and_repeat_is_idempotent(self):
        accepted, decisions = select_rows([self.row], [])
        self.assertEqual(accepted, [self.row])
        self.assertEqual(decisions[0]["status"], "ingested")
        self.assertEqual(select_rows([self.row], accepted)[1][0]["status"], "already_ingested")

    def test_uncertain_evidence_is_quarantined(self):
        for change in ({"confidence": "low"}, {"round_date": ""},
                       {"lead_investors": "", "participating_investors": ""},
                       {"amount_currency": "EUR"}, {"round_date": "2026-12-31"}):
            accepted, decisions = select_rows([dict(self.row, **change)], [])
            self.assertFalse(accepted)
            self.assertEqual(decisions[0]["status"], "quarantined")

    def test_conflicting_ids_and_same_day_rounds_are_quarantined(self):
        for row in (dict(self.row, amount_usd="999000000"), dict(self.row, event_id="different")):
            self.assertFalse(select_rows([row], [self.row])[0])

    def test_missing_columns_are_quarantined(self):
        self.assertFalse(select_rows([{"event_id": "incomplete"}], [])[0])

    def test_commitments_and_targets_do_not_auto_enter_funding_totals(self):
        for notes in ("Includes prior commitments", "Up to USD300M planned", "Cumulative total funding"):
            self.assertFalse(select_rows([dict(self.row, notes=notes)], [])[0])

    def test_malformed_rows_report_errors_without_crashing(self):
        for row in ({"event_id": "broken"}, dict(self.row, notes=None), dict(self.row, extra="unexpected")):
            self.assertTrue(validate_row(row, 2, set()))
            self.assertEqual(select_rows([row], [])[1][0]["status"], "quarantined")

    def test_equivalent_usd_formatting_is_not_quarantined(self):
        row = dict(self.row, amount_original=self.row["amount_usd"] + ".00")
        self.assertEqual(select_rows([row], [])[0], [row])

    def test_atomic_append_preserves_prior_rows_and_rejects_duplicates(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(ingest_funding_events, "ROOT", Path(directory)):
            path = Path(directory) / "raw.csv"
            append_rows(path, [self.row])
            prior = path.read_bytes()
            with self.assertRaisesRegex(ValueError, "duplicate event_id"):
                append_rows(path, [self.row])
            self.assertEqual(path.read_bytes(), prior)
            append_rows(path, [dict(self.row, event_id="another")])
            self.assertEqual(len(read_rows(path)[1]), 2)

    def test_failed_write_keeps_existing_evidence_intact(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(ingest_funding_events, "ROOT", Path(directory)):
            path = Path(directory) / "raw.csv"
            append_rows(path, [self.row])
            prior = path.read_bytes()
            with patch.object(ingest_funding_events.csv.DictWriter, "writerows", side_effect=OSError("disk full")):
                with self.assertRaisesRegex(OSError, "disk full"):
                    append_rows(path, [dict(self.row, event_id="another")])
            self.assertEqual(path.read_bytes(), prior)
            self.assertEqual(list(Path(directory).glob("tmp*")), [])
