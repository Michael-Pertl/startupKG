"""Tests for Tavily market-event normalization helpers."""

from __future__ import annotations

import unittest
from unittest.mock import patch
import json

from scripts.fetch_market_events_tavily import published_date, funding_amount, make_event, dedupe, source_metadata, tavily_search


class TavilyFetcherTest(unittest.TestCase):
    def test_published_date_returns_strict_iso_date(self) -> None:
        samples = [
            {"published_date": "2026-06-04T08:35:06Z"},
            {"published_date": "Jun 4, 2026"},
            {"published_date": "June 4, 2026"},
            {"published_date": "04 Jun 2026"},
            {"published_date": "06/04/2026"},
        ]
        for sample in samples:
            with self.subTest(sample=sample):
                self.assertEqual(published_date(sample), "2026-06-04")

    def test_unknown_or_invalid_dates_are_not_fabricated(self) -> None:
        for raw in ("", "not a date", "2026-02-30"):
            self.assertEqual(published_date({"published_date": raw}), "")
        self.assertEqual(published_date({"published_date": "Tue, 11 Mar 2025 17:00:00 GMT"}), "2025-03-11")

    def test_amount_is_not_valuation_revenue_or_foreign_currency(self) -> None:
        self.assertEqual(funding_amount("AI startup raises $250M at a $3 billion valuation"), "250000000")
        for text in ("Valuation $3 billion; revenue $100 million", "Startup raises EUR300 million", "10 million users"):
            self.assertEqual(funding_amount(text), "")

    def test_unknown_dates_have_distinct_ids_and_remain_review_items(self) -> None:
        a = make_event({"title": "Example AI raises $200 million", "url": "https://example.com/a"}, "q", {})
        b = make_event({"title": "Example AI raises $200 million", "url": "https://example.com/b"}, "q", {})
        self.assertEqual(a["status"], "needs_review")
        self.assertEqual(a["event_date"], "")
        self.assertNotEqual(a["event_id"], b["event_id"])
        rows, added = dedupe([], [a, b, a])
        self.assertEqual((len(rows), added), (2, 2))

    def test_domain_suffix_spoof_does_not_get_high_confidence(self) -> None:
        self.assertEqual(source_metadata("https://notreuters.com/a"), ("other", "low"))
        self.assertEqual(source_metadata("https://www.reuters.com/a"), ("reuters", "high"))

    def test_search_uses_current_api_date_filters_and_auth(self) -> None:
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self): return b'{"results": []}'
        with patch("scripts.fetch_market_events_tavily.urlopen", return_value=Response()) as call:
            self.assertEqual(tavily_search("test-secret", "AI funding", 2), [])
            request = call.call_args.args[0]
            payload = json.loads(request.data)
            self.assertTrue(payload["include_published_date"])
            self.assertIn("start_date", payload)
            self.assertNotIn("days", payload)
            self.assertEqual(request.get_header("Authorization"), "Bearer test-secret")


if __name__ == "__main__":
    unittest.main()
