"""Automatic admission must reject invented facts and ambiguous financing."""
import copy
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from verify_market_evidence import verify

URL = "https://www.prnewswire.com/news-releases/example.html"
FACTS = {
    "company": "Example AI", "country": "Canada", "round_date": "2026-09-01",
    "round_type": "Series B", "amount_usd": 200000000,
    "investors": ["Example Ventures"], "ai_domain": "AI Infrastructure",
    "quotes": {
        "company": "Example AI builds inference infrastructure.",
        "country": "Example AI is headquartered in Canada.",
        "date": "On September 1, 2026, Example AI closed its Series B financing.",
        "funding": "Example AI raised US$200 million in a Series B round.",
        "ai": "Example AI develops artificial intelligence inference infrastructure.",
        "investors": "Example AI's Series B was led by Example Ventures.",
    },
}

class EvidenceTests(unittest.TestCase):
    def check(self, facts):
        return verify(facts, " ".join(facts["quotes"].values()), URL)

    def test_supported_record(self):
        row = self.check(copy.deepcopy(FACTS))
        self.assertEqual(row["amount_usd"], "200000000")
        self.assertEqual(row["region"], "Canada")
        self.assertEqual(row["participating_investors"], "Example Ventures")
        self.assertEqual(row["event_id"], self.check(copy.deepcopy(FACTS))["event_id"])

    def test_hallucinated_quote(self):
        with self.assertRaisesRegex(ValueError, "unsupported"):
            verify(FACTS, "No financing information is present.", URL)

    def test_unsupported_amount_investor_and_date(self):
        for key, value in [("amount_usd", 300000000), ("investors", ["Invented Capital"]),
                           ("round_date", "2026-09-02"), ("country", "France")]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                facts = copy.deepcopy(FACTS)
                facts[key] = value
                self.check(facts)

    def test_valuation_debt_plans_and_multiple_amounts(self):
        for suffix in [" at a valuation of $2 billion", " including debt", " with secondary shares",
                       " with commitments", " and $150 million"]:
            with self.subTest(suffix=suffix), self.assertRaises(ValueError):
                facts = copy.deepcopy(FACTS)
                facts["quotes"]["funding"] += suffix
                self.check(facts)

    def test_future_and_below_threshold(self):
        for key, value in [("round_date", "2027-09-01"), ("amount_usd", 50000000)]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                facts = copy.deepcopy(FACTS)
                facts[key] = value
                self.check(facts)

    def test_untrusted_and_private_urls(self):
        for url in ["http://www.prnewswire.com/a", "https://127.0.0.1/a",
                    "https://www.prnewswire.com.attacker.org/a", "https://www.prnewswire.com:8443/a"]:
            with self.subTest(url=url), self.assertRaises(ValueError):
                verify(FACTS, " ".join(FACTS["quotes"].values()), url)

    def test_local_currency_and_unrelated_company_evidence(self):
        for key, text in [("funding", "Example AI raised C$200 million in a Series B round."),
                          ("funding", "Example AI raised $200 million in a Series B round."),
                          ("country", "Another Company is headquartered in Canada.")]:
            with self.subTest(key=key, text=text), self.assertRaises(ValueError):
                facts = copy.deepcopy(FACTS)
                facts["quotes"][key] = text
                self.check(facts)

    def test_publication_date_is_insufficient(self):
        facts = copy.deepcopy(FACTS)
        facts["quotes"]["date"] = "Published September 1, 2026 by Example News."
        with self.assertRaisesRegex(ValueError, "completed financing"):
            self.check(facts)
