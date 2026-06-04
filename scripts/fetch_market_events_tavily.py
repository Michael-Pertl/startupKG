#!/usr/bin/env python3
"""Fetch fresh AI market-event candidates with Tavily.

The script is intentionally conservative: it discovers public articles, maps
them into a monitoring-event schema, deduplicates by source URL and
company/date/type, and writes rows for review. It does not modify the core
funding graph.
"""

from __future__ import annotations

import csv
import json
import os
import re
import sys
from datetime import date, datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw"
RAW_FILE = RAW_DIR / "market_events_raw.csv"
STARTUPS_FILE = ROOT / "data" / "processed" / "startups.csv"
TAVILY_URL = "https://api.tavily.com/search"
MIN_FUNDING_USD = 100_000_000

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

BASE_QUERIES = [
    "AI startup IPO filing OR files to go public",
    "AI company IPO pricing OR public listing",
    "AI startup raises $100 million OR $100M funding",
    "AI startup valuation funding round IPO",
    "AI chip startup IPO filing funding",
    "AI infrastructure company strategic investment Nvidia cloud",
    "AI data center startup funding artificial intelligence",
    "AI foundation model startup funding valuation",
    "AI agent startup funding valuation",
    "AI drug discovery startup funding valuation",
    "robotics AI startup funding valuation",
    "site:techcrunch.com AI startup raises $100M",
    "site:reuters.com AI startup IPO funding",
    "site:sec.gov S-1 artificial intelligence",
]
REGION_QUERIES = [
    "United States AI startup IPO funding valuation",
    "Europe AI startup IPO funding valuation",
    "China AI startup IPO funding valuation",
    "India AI startup IPO funding valuation",
    "Israel AI startup IPO funding valuation",
    "Canada AI startup IPO funding valuation",
    "Singapore AI startup IPO funding valuation",
    "UAE Gulf AI startup funding valuation",
]
DOMAIN_QUERIES = [
    "foundation model LLM startup funding IPO valuation",
    "AI infrastructure startup funding IPO valuation",
    "GPU inference AI startup funding valuation",
    "enterprise AI agents startup funding valuation",
    "healthcare AI drug discovery startup funding valuation",
    "defense security AI startup funding valuation",
    "AI search knowledge agent startup funding valuation",
    "autonomous robotics AI startup funding valuation",
]

SOURCE_TYPE_BY_DOMAIN = {
    "reuters.com": ("reuters", "high"),
    "sec.gov": ("official_filing", "high"),
    "prnewswire.com": ("press_release", "high"),
    "businesswire.com": ("press_release", "high"),
    "techcrunch.com": ("techcrunch", "medium"),
    "sifted.eu": ("sifted", "medium"),
    "eu-startups.com": ("eu_startups", "medium"),
    "venturebeat.com": ("other", "medium"),
    "cnbc.com": ("other", "medium"),
}

COMPANY_SUFFIX_PATTERN = re.compile(
    r"\b(raises?|raised|lands?|files?|filed|prices?|priced|lists?|listed|plans?|targets?|considers?|announces?|secures?|closes?)\b",
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
LOW_SIGNAL_TERMS = [
    "appoints",
    "appointment",
    "hires",
    "launches",
    "unveils",
    "webinar",
    "conference",
    "award",
]
AI_TERMS = [
    r"\bai\b",
    "artificial intelligence",
    "generative",
    r"\bllm\b",
    "foundation model",
    "machine learning",
    r"\bgpu\b",
    "inference",
    "agentic",
]
EVENT_TERMS = [
    "ipo",
    "s-1",
    "files to go public",
    "public listing",
    "raises",
    "raised",
    "funding",
    "series",
    "valuation",
    "strategic investment",
    "partnership",
    "acquires",
]


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
            "domain": row.get("primary_domain", ""),
        }
    return context


def build_queries(known_companies: dict[str, dict[str, str]], max_queries: int) -> list[str]:
    queries = BASE_QUERIES + REGION_QUERIES + DOMAIN_QUERIES
    company_queries = []
    for company, context in sorted(known_companies.items(), key=lambda item: (item[1].get("region", ""), item[0])):
        label = context.get("name", company.title())
        company_queries.append(f'"{label}" AI startup funding OR valuation OR IPO')
    deduped = []
    seen = set()
    for query in [*queries, *company_queries]:
        normalized = query.lower()
        if normalized in seen:
            continue
        deduped.append(query)
        seen.add(normalized)
        if len(deduped) >= max_queries:
            break
    return deduped


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


def text_matches(text: str) -> bool:
    lower = text.lower()
    has_ai_term = any(re.search(term, lower) for term in AI_TERMS)
    has_event_term = any(term in lower for term in EVENT_TERMS)
    return has_ai_term and has_event_term


def is_low_signal(text: str) -> bool:
    lower = text.lower()
    return any(term in lower for term in LOW_SIGNAL_TERMS)


def infer_status(event_type: str, amount: str, text: str) -> tuple[str, str]:
    if event_type == "funding_round":
        parsed_amount = int(amount) if amount else None
        if parsed_amount is not None and parsed_amount < MIN_FUNDING_USD:
            return ("staged", f" Hidden from News because detected amount is below USD{MIN_FUNDING_USD:,}.")
        if parsed_amount is None:
            return ("needs_review", " Amount not detected; manually verify whether this meets the mega-round threshold.")
    if is_low_signal(text):
        return ("staged", " Hidden from News because the item looks like a low-signal announcement.")
    return ("auto_ingested", "")


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
    raw = str(result.get("published_date") or result.get("publishedDate") or "").strip()
    if raw:
        date_match = re.search(r"\d{4}-\d{2}-\d{2}", raw)
        if date_match:
            return date_match.group(0)
        for date_format in ("%b %d, %Y", "%B %d, %Y", "%d %b %Y", "%d %B %Y", "%m/%d/%Y"):
            try:
                return datetime.strptime(raw, date_format).date().isoformat()
            except ValueError:
                continue
    return date.today().isoformat()


def tavily_search(api_key: str, query: str, max_results: int) -> list[dict[str, object]]:
    payload = {
        "query": query,
        "topic": "news",
        "search_depth": "basic",
        "max_results": max_results,
        "include_answer": False,
        "include_raw_content": False,
        "days": int(os.environ.get("TAVILY_DAYS", "14")),
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
    status, review_note = infer_status(event_type, amount, text)
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
        "status": status,
        "summary": title,
        "notes": f"Auto-ingested from Tavily query: {query}.{review_note}",
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
    max_queries = int(os.environ.get("TAVILY_MAX_QUERIES", "40"))
    existing = read_csv(RAW_FILE)
    known_companies = load_company_context()
    queries = build_queries(known_companies, max_queries)

    candidates: list[dict[str, str]] = []
    query_count = 0
    try:
        for query in queries:
            query_count += 1
            for result in tavily_search(api_key, query, max_results):
                title = str(result.get("title") or "")
                content = str(result.get("content") or "")
                if text_matches(f"{title} {content}"):
                    candidates.append(make_event(result, query, known_companies))
    except (HTTPError, URLError, TimeoutError) as error:
        print(f"Tavily fetch failed: {error}", file=sys.stderr)
        return 1

    rows, added = dedupe(existing, candidates)
    write_csv(RAW_FILE, rows)
    status_counts: dict[str, int] = {}
    for row in candidates:
        status_counts[row["status"]] = status_counts.get(row["status"], 0) + 1
    print(
        f"Tavily searched {query_count} queries, fetched {len(candidates)} matching candidates, "
        f"added {added} new market events. Status counts: {status_counts}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
