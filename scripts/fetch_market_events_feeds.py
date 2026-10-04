#!/usr/bin/env python3
"""Fetch AI market-event candidates from free RSS/Atom feeds.

This script avoids paid search APIs. It polls configured public feeds, filters
for AI/startup/IPO/funding keywords, deduplicates by URL and company/date/type,
and appends visible ``auto_ingested`` monitoring events.
"""

from __future__ import annotations

import csv
import hashlib
import email.utils
import json
import re
import sys
import xml.etree.ElementTree as ET
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

try:
    from .fetch_market_events_tavily import funding_amount, published_date, infer_status
except ImportError:
    from fetch_market_events_tavily import funding_amount, published_date, infer_status


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw"
APP_DATA_DIR = ROOT / "data" / "app"
FEEDS_FILE = RAW_DIR / "market_event_feeds.csv"
RAW_FILE = RAW_DIR / "market_events_raw.csv"
STARTUPS_FILE = ROOT / "data" / "processed" / "startups.csv"
FETCH_REPORT_FILE = APP_DATA_DIR / "market_event_fetch_report.json"
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

AI_TERMS = [
    r"\bai\b",
    "artificial intelligence",
    "generative",
    r"\bllm\b",
    "foundation model",
    "machine learning",
    r"\bgpu\b",
    "chip",
    "inference",
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
LOW_SIGNAL_TERMS = [
    "appoints",
    "appointment",
    "hires",
    "launches",
    "unveils",
    "product leadership",
    "webinar",
    "conference",
    "award",
]
COMPANY_SPLIT_PATTERN = re.compile(
    r"\b(raises?|raised|lands?|files?|filed|prices?|priced|lists?|listed|plans?|targets?|considers?|announces?|secures?|acquires?)\b",
    re.IGNORECASE,
)
MONEY_PATTERN = re.compile(r"\$?\s?([0-9]+(?:\.[0-9]+)?)\s?(billion|bn|million|m)\b", re.IGNORECASE)
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


def text_matches(text: str) -> bool:
    lower = text.lower()
    has_ai_term = any(re.search(term, lower) for term in AI_TERMS)
    has_event_term = any(term in lower for term in EVENT_TERMS)
    return has_ai_term and has_event_term


def is_low_signal(text: str) -> bool:
    lower = text.lower()
    return any(term in lower for term in LOW_SIGNAL_TERMS)


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
    if "partnership" in lower:
        return "major_partnership"
    if "valuation" in lower and "raises" not in lower and "raised" not in lower:
        return "valuation_update"
    if "acquires" in lower or "acquisition" in lower:
        return "acquisition_or_merger"
    return "funding_round"


def infer_company(title: str, known_companies: dict[str, dict[str, str]]) -> str:
    lower_title = title.lower()
    for company, context in sorted(known_companies.items(), key=lambda item: len(item[0]), reverse=True):
        if company in lower_title:
            return context["name"]

    cleaned = re.sub(r"^[^A-Za-z0-9]+", "", title).strip()
    cleaned = COMPANY_SPLIT_PATTERN.split(cleaned, maxsplit=1)[0].strip(" -:|")
    cleaned = re.sub(r"^(exclusive|update|breaking)\s*[:-]\s*", "", cleaned, flags=re.IGNORECASE)
    return cleaned[:80].strip() or "Unknown"


def parse_date(value: str) -> str:
    return published_date({"published_date": value})


def strip_html(value: str) -> str:
    return re.sub(r"<[^>]+>", " ", value or "").strip()


def child_text(element: ET.Element, tag: str) -> str:
    child = element.find(tag)
    return "" if child is None or child.text is None else child.text.strip()


def item_link(item: ET.Element) -> str:
    link = child_text(item, "link")
    if link:
        return link
    for child in item.findall("{http://www.w3.org/2005/Atom}link"):
        href = child.attrib.get("href", "").strip()
        if href:
            return href
    return ""


def fetch_feed(feed: dict[str, str]) -> list[dict[str, str]]:
    request = Request(
        feed["url"],
        headers={"User-Agent": "AI-KG-market-monitor/0.1 contact=local-research"},
    )
    with urlopen(request, timeout=30) as response:
        content = response.read()

    root = ET.fromstring(content)
    items = root.findall(".//item")
    if not items:
        items = root.findall("{http://www.w3.org/2005/Atom}entry")

    entries = []
    for item in items:
        title = child_text(item, "title") or child_text(item, "{http://www.w3.org/2005/Atom}title")
        summary = (
            child_text(item, "description")
            or child_text(item, "summary")
            or child_text(item, "{http://www.w3.org/2005/Atom}summary")
        )
        published = (
            child_text(item, "pubDate")
            or child_text(item, "published")
            or child_text(item, "{http://www.w3.org/2005/Atom}published")
            or child_text(item, "updated")
            or child_text(item, "{http://www.w3.org/2005/Atom}updated")
        )
        entries.append(
            {
                "title": strip_html(title),
                "summary": strip_html(summary),
                "url": item_link(item),
                "published": parse_date(published),
                "feed_name": feed["name"],
                "source_type": feed["source_type"],
                "confidence": feed["default_confidence"],
            }
        )
    return entries


def make_event(entry: dict[str, str], known_companies: dict[str, dict[str, str]]) -> dict[str, str]:
    text = f"{entry['title']}. {entry['summary']}"
    company = infer_company(entry["title"], known_companies)
    context = known_companies.get(company.lower(), {})
    event_type = infer_event_type(text)
    event_date = entry["published"]
    date_key = event_date.replace('-', '') or hashlib.sha256(entry["url"].encode()).hexdigest()[:12]
    event_id = f"rss_{slugify(company)}_{date_key}_{slugify(event_type)}"
    amount_usd = funding_amount(entry["title"]) or funding_amount(entry["summary"])
    status, review_note = infer_status(event_type, amount_usd, text)
    return {
        "event_id": event_id,
        "company_name": company,
        "event_type": event_type,
        "event_date": event_date,
        "year": event_date[:4],
        "country": context.get("country", ""),
        "region": context.get("region", ""),
        "amount_usd": amount_usd,
        "valuation_usd": money_to_int(VALUATION_PATTERN.search(text)),
        "source_url": entry["url"],
        "source_type": entry["source_type"],
        "confidence": entry["confidence"],
        "status": status,
        "summary": entry["title"],
        "notes": f"Discovered {date.today().isoformat()} from RSS feed: {entry['feed_name']}. Publication date is not a confirmed funding close date.{review_note}",
    }


def dedupe(existing: list[dict[str, str]], candidates: list[dict[str, str]]) -> tuple[list[dict[str, str]], int]:
    rows = list(existing)
    seen_urls = {row["source_url"].strip().lower() for row in rows if row.get("source_url", "").strip()}
    seen_keys = {
        (row["company_name"].strip().lower(), row["event_date"].strip(), row["event_type"].strip())
        for row in rows if row["event_date"]
    }
    added = 0
    for row in candidates:
        if not row["source_url"]:
            continue
        key = (row["company_name"].lower(), row["event_date"], row["event_type"])
        url = row["source_url"].lower()
        if url in seen_urls or (row["event_date"] and key in seen_keys):
            continue
        rows.append(row)
        seen_urls.add(url)
        seen_keys.add(key)
        added += 1
    return rows, added


def write_fetch_report(report: dict[str, object]) -> None:
    FETCH_REPORT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with FETCH_REPORT_FILE.open("w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def main() -> int:
    feeds = [row for row in read_csv(FEEDS_FILE) if row.get("is_active", "").lower() == "true"]
    if not feeds:
        print(f"No active feeds configured in {FEEDS_FILE.relative_to(ROOT)}", file=sys.stderr)
        return 2

    known_companies = load_company_context()
    candidates: list[dict[str, str]] = []
    feed_reports: list[dict[str, object]] = []
    failures = 0
    for feed in feeds:
        fetched = 0
        matched = 0
        try:
            entries = fetch_feed(feed)
            fetched = len(entries)
            for entry in entries:
                if text_matches(f"{entry['title']} {entry['summary']}"):
                    matched += 1
                    candidates.append(make_event(entry, known_companies))
        except (ET.ParseError, HTTPError, URLError, TimeoutError) as error:
            failures += 1
            print(f"Feed fetch failed for {feed['name']}: {error}", file=sys.stderr)
            feed_reports.append(
                {
                    "name": feed["name"],
                    "url": feed["url"],
                    "status": "failed",
                    "error": str(error),
                    "items_fetched": fetched,
                    "items_matched": matched,
                }
            )
            continue
        feed_reports.append(
            {
                "name": feed["name"],
                "url": feed["url"],
                "status": "ok",
                "items_fetched": fetched,
                "items_matched": matched,
            }
        )

    rows, added = dedupe(read_csv(RAW_FILE), candidates)
    write_csv(RAW_FILE, rows)
    status_counts: dict[str, int] = {}
    for row in candidates:
        status_counts[row["status"]] = status_counts.get(row["status"], 0) + 1
    write_fetch_report(
        {
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "active_feeds": len(feeds),
            "successful_feeds": len(feeds) - failures,
            "failed_feeds": failures,
            "matching_candidates": len(candidates),
            "added_events": added,
            "candidate_status_counts": status_counts,
            "feeds": feed_reports,
        }
    )
    print(
        f"RSS fetched {len(candidates)} matching candidates from {len(feeds) - failures}/{len(feeds)} feeds; "
        f"added {added} new market events."
    )
    print(f"Wrote fetch report to {FETCH_REPORT_FILE.relative_to(ROOT)}.")
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
