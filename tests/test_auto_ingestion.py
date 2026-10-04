import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from auto_ingest_funding import select_rows
from ingest_funding_events import read_rows
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
