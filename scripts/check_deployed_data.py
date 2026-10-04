#!/usr/bin/env python3
"""Check the live bundle against the local evidence snapshot; never print secrets."""

import argparse
import json
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


def compare(expected, graph, health, service):
    problems = []
    metadata = graph.get("metadata", {})
    if not service.get("ok"):
        problems.append("Service health is not OK")
    if not expected.get("snapshot_id") or metadata.get("snapshot_id") != expected.get("snapshot_id"):
        problems.append("Deployed graph is not the expected snapshot")
    if health.get("snapshot_id") != metadata.get("snapshot_id") or not health.get("snapshot_matches_evidence"):
        problems.append("Deployed evidence report does not match the graph")
    if metadata.get("round_count") != expected.get("funding_events"):
        problems.append("Deployed round count differs from the expected evidence")
    if metadata.get("latest_funding_date") != expected.get("latest_funding_date"):
        problems.append("Deployed latest funding date differs from the expected evidence")
    return problems


def fetch_json(url):
    request = Request(url, headers={"User-Agent": "AI-Market-Graph-deployment-check/1.0", "Cache-Control": "no-cache"})
    with urlopen(request, timeout=20) as response:
        content = response.read(8_000_001)
    if len(content) > 8_000_000:
        raise ValueError("Response exceeds deployment-check size limit")
    payload = json.loads(content)
    if not isinstance(payload, dict):
        raise ValueError("Expected JSON object")
    return payload


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="https://aimarketgraph.com")
    args = parser.parse_args()
    parsed = urlparse(args.url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in {"", "/"}:
        parser.error("Provide an HTTPS origin without credentials, path, query or fragment")
    base = args.url.rstrip("/")
    expected = json.loads((Path(__file__).resolve().parents[1] / "data/app/data_health.json").read_text())
    payloads, errors = {}, []
    for name, path in (("service", "/api/health"), ("graph", "/data/market_graph.json"), ("health", "/data/data_health.json")):
        try:
            payloads[name] = fetch_json(base + path)
        except (HTTPError, URLError, TimeoutError, ValueError):
            payloads[name] = {}
            errors.append(f"{path}: unavailable or invalid JSON")
    errors.extend(compare(expected, payloads["graph"], payloads["health"], payloads["service"]))
    print(json.dumps({"url": base, "status": "failed" if errors else "snapshot_verified", "problems": errors,
                      "deployed_rounds": payloads["graph"].get("metadata", {}).get("round_count"),
                      "expected_rounds": expected["funding_events"]}, indent=2))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
