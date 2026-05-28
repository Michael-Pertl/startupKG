#!/usr/bin/env python3
"""Fetch fresh AI market-event candidates with Tavily.

The script is intentionally conservative: it discovers public articles, maps
them into a monitoring-event schema, deduplicates by source URL and
company/date/type, and writes visible rows as ``auto_ingested``. It does not
modify the core funding graph.
"""

from __future__ import annotations

import csv
import json
import os
import re
import sys
from datetime import date
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw"
RAW_FILE = RAW_DIR / "market_events_raw.csv"
STARTUPS_FILE = ROOT / "data" / "processed" / "startups.csv"
TAVILY_URL = "https://api.tavily.com/search"

FIELDNAMES = [
    "event_id",
    "company_name",
    "event_type",
    "event_date",
    "year",
    "country",
    "region",
    "amount_usd",
    "valuation_usd",
    "source_url",
    "source_type",
    "confidence",
    "status",
    "summary",
    "notes",
]

QUERIES = [
    "AI startup IPO filing OR files to go public",
    "AI company IPO pricing OR public listing",
    "AI startup raises $100 million funding",
    "AI chip startup IPO filing funding",
    "AI infrastructure company strategic investment OpenAI Nvidia cloud",
    "site:techcrunch.com AI startup raises $100M",
    "site:reuters.com AI startup IPO funding",
    "site:sec.gov S-1 artificial intelligence",
]

SOURCE_TYPE_BY_DOMAIN = {
    "reuters.com": ("reuters", "high"),
    "sec.gov": ("official_filing", "high"),
    "prnewswire.com": ("press_release", "high"),
    "businesswire.com": ("press_release", "high"),
    "techcrunch.com": ("techcrunch", "medium"),
    "sifted.eu": ("sifted", "medium"),
    "eu-startups.com": ("eu_startups", "medium"),
}

COMPANY_SUFFIX_PATTERN = re.compile(
    r"\b(raises?|raised|lands?|files?|filed|prices?|priced|lists?|listed|plans?|targets?|considers?|announces?|secures?)\b",
    re.IGNORECASE,
)
MONEY_PATTERN = re.compile(
    r"\$?\s?([0-9]+(?:\.[0-9]+)?)\s?(billion|bn|million|m)\b",
    re.IGNORECASE,
)
VALUATION_PATTERN = re.compile(
    r"valuation(?:\s+of|\s+at|\s+up to)?\s+\$?\s?([0-9]+(?:\.[0-9]+)?)\s?(billion|bn|million|m)\b",
    re.IGNORECASE,
)


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_") or "unknown"


def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def write_csv(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)


def load_company_context() -> dict[str, dict[str, str]]:
    context = {}
    for row in read_csv(STARTUPS_FILE):
        context[row["name"].lower()] = {
            "name": row["name"],
            "country": row["country"],
            "region": row["region"],
        }
    return context


def money_to_int(match: re.Match[str] | None) -> str:
    if not match:
        return ""
    value = float(match.group(1))
    unit = match.group(2).lower()
    multiplier = 1_000_000_000 if unit in {"billion", "bn"} else 1_000_000
    return str(int(value * multiplier))


def source_metadata(url: str) -> tuple[str, str]:
    host = urlparse(url).netloc.lower().removeprefix("www.")
    for domain, metadata in SOURCE_TYPE_BY_DOMAIN.items():
        if host.endswith(domain):
            return metadata
    return ("other", "medium")


def infer_event_type(text: str) -> str:
    lower = text.lower()
    if "s-1" in lower or "files to go public" in lower or "ipo filing" in lower:
        return "ipo_filing"
    if "ipo price" in lower or "priced" in lower:
        return "ipo_pricing"
    if "public trading" in lower or "public listing" in lower or "listed" in lower:
        return "public_listing"
    if "ipo" in lower:
        return "ipo_watch"
    if "strategic investment" in lower or "joint venture" in lower:
        return "strategic_investment"
    if "partnership" in lower or "deal with" in lower:
        return "major_partnership"
    if "valuation" in lower and "raises" not in lower and "raised" not in lower:
        return "valuation_update"
    return "funding_round"


def infer_company(title: str, known_companies: dict[str, dict[str, str]]) -> str:
    lower_title = title.lower()
    for company in sorted(known_companies, key=len, reverse=True):
        if company in lower_title:
            return known_companies[company].get("name", "") or company.title()

    cleaned = re.sub(r"^[^A-Za-z0-9]+", "", title).strip()
    cleaned = COMPANY_SUFFIX_PATTERN.split(cleaned, maxsplit=1)[0].strip(" -:|")
    cleaned = re.sub(r"^(exclusive|update|breaking)\s*[:-]\s*", "", cleaned, flags=re.IGNORECASE)
    return cleaned[:80].strip() or "Unknown"


def published_date(result: dict[str, object]) -> str:
    raw = str(result.get("published_date") or result.get("publishedDate") or "")
    if raw:
        return raw[:10]
    return date.today().isoformat()


def tavily_search(api_key: str, query: str, max_results: int) -> list[dict[str, object]]:
    payload = {
        "query": query,
        "topic": "news",
        "search_depth": "basic",
        "max_results": max_results,
        "include_answer": False,
        "include_raw_content": False,
    }
    request = Request(
        TAVILY_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urlopen(request, timeout=30) as response:
        body = json.loads(response.read().decode("utf-8"))
    return list(body.get("results", []))


def make_event(result: dict[str, object], query: str, known_companies: dict[str, dict[str, str]]) -> dict[str, str]:
    title = str(result.get("title") or "").strip()
    url = str(result.get("url") or "").strip()
    content = str(result.get("content") or "").strip()
    text = f"{title}. {content}"
    company = infer_company(title, known_companies)
    context = known_companies.get(company.lower(), {})
    event_date = published_date(result)
    event_type = infer_event_type(text)
    source_type, confidence = source_metadata(url)
    amount = money_to_int(MONEY_PATTERN.search(text))
    valuation = money_to_int(VALUATION_PATTERN.search(text))
    event_id = f"auto_{slugify(company)}_{event_date.replace('-', '')}_{slugify(event_type)}"

    return {
        "event_id": event_id,
        "company_name": company,
        "event_type": event_type,
        "event_date": event_date,
        "year": event_date[:4],
        "country": context.get("country", ""),
        "region": context.get("region", ""),
        "amount_usd": amount,
        "valuation_usd": valuation,
        "source_url": url,
        "source_type": source_type,
        "confidence": confidence,
        "status": "auto_ingested",
        "summary": title,
        "notes": f"Auto-ingested from Tavily query: {query}",
    }


def dedupe(existing: list[dict[str, str]], candidates: list[dict[str, str]]) -> tuple[list[dict[str, str]], int]:
    rows = list(existing)
    seen_urls = {row["source_url"].strip().lower() for row in rows if row.get("source_url", "").strip()}
    seen_keys = {
        (
            row["company_name"].strip().lower(),
            row["event_date"].strip(),
            row["event_type"].strip(),
        )
        for row in rows
    }
    added = 0
    for row in candidates:
        if not row["source_url"]:
            continue
        key = (row["company_name"].lower(), row["event_date"], row["event_type"])
        url = row["source_url"].lower()
        if url in seen_urls or key in seen_keys:
            continue
        rows.append(row)
        seen_urls.add(url)
        seen_keys.add(key)
        added += 1
    return rows, added


def main() -> int:
    api_key = os.environ.get("TAVILY_API_KEY", "").strip()
    if not api_key:
        print("Missing TAVILY_API_KEY. Skipping Tavily market-event fetch.", file=sys.stderr)
        return 2

    max_results = int(os.environ.get("TAVILY_MAX_RESULTS", "5"))
    existing = read_csv(RAW_FILE)
    known_companies = load_company_context()

    candidates: list[dict[str, str]] = []
    try:
        for query in QUERIES:
            for result in tavily_search(api_key, query, max_results):
                candidates.append(make_event(result, query, known_companies))
    except (HTTPError, URLError, TimeoutError) as error:
        print(f"Tavily fetch failed: {error}", file=sys.stderr)
        return 1

    rows, added = dedupe(existing, candidates)
    write_csv(RAW_FILE, rows)
    print(f"Tavily fetched {len(candidates)} candidates; added {added} new market events.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
