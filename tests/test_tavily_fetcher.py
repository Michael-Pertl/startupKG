"""Tests for Tavily market-event normalization helpers."""

from __future__ import annotations

import unittest

from scripts.fetch_market_events_tavily import published_date


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

    def test_published_date_falls_back_to_today(self) -> None:
        self.assertRegex(published_date({}), r"^\d{4}-\d{2}-\d{2}$")
        self.assertRegex(published_date({"published_date": "not a date"}), r"^\d{4}-\d{2}-\d{2}$")


if __name__ == "__main__":
    unittest.main()
