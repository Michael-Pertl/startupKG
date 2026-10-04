import unittest

from scripts.build_data_health import build_health
from scripts.build_market_events import signal_metadata
from scripts.fetch_market_events_feeds import parse_date, make_event
from scripts.validate_market_events import validate_row


class EvidencePipelineTest(unittest.TestCase):
    def test_unreviewed_partnership_is_review_queue(self):
        self.assertEqual(signal_metadata({"status": "auto_ingested", "event_type": "major_partnership", "amount_usd": ""})[0], "review_queue")

    def test_rss_missing_date_and_non_usd_amount_are_unknown(self):
        self.assertEqual(parse_date(""), "")
        row = make_event({"title": "Example AI raises EUR300 million", "summary": "", "published": "", "url": "https://example.com/a", "source_type": "other", "confidence": "medium", "feed_name": "example"}, {})
        self.assertEqual(row["amount_usd"], "")
        self.assertEqual(row["status"], "needs_review")
        self.assertEqual(validate_row(row, 2, set(), set(), set()), [])
        row["status"] = "approved"
        self.assertTrue(validate_row(row, 2, set(), set(), set()))

    def test_coverage_does_not_claim_regeneration_is_recent_evidence(self):
        payload = build_health([{"round_date": "2024-01-01", "region": "India", "startup_name": "Example", "confidence": "high"}], [{"investor_type": "unknown", "country": ""}], [])
        self.assertEqual(payload["latest_funding_date"], "2024-01-01")
        self.assertEqual(payload["unknown_investors"], 1)
        self.assertEqual(payload["coverage_status"], "curated_incomplete")
        self.assertTrue(payload["regions"][0]["small_sample"])
