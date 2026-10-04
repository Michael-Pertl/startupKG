#!/usr/bin/env python3
"""Refresh validated investor data and report every pipeline step."""

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--discover", action="store_true", help="Poll RSS for evidence candidates.")
    parser.add_argument("--tavily", action="store_true", help="Explicitly opt into Tavily discovery; disabled by default.")
    args = parser.parse_args()
    steps = []
    discovery = ["fetch_market_events_feeds.py"] if args.discover else []
    if args.tavily:
        discovery.append("fetch_market_events_tavily.py")
    required = ["validate_raw_data.py", "validate_startup_profiles.py", "validate_market_events.py", "normalize_raw_data.py", "build_growth_metrics.py", "init_startup_profiles.py", "validate_startup_profiles.py", "build_app_graph.py", "build_market_events.py"]
    failed = False
    # Validate existing evidence before appending any automatically accepted rows.
    required.insert(1, "auto_ingest_funding.py")
    required.insert(2, "validate_raw_data.py")
    for script in discovery + required:
        result = subprocess.run([sys.executable, str(ROOT / "scripts" / script)], cwd=ROOT, capture_output=True, text=True)
        optional = script in discovery
        steps.append({"script": script, "exit_code": result.returncode, "status": "ok" if result.returncode == 0 else "warning" if optional else "failed"})
        print(f"{script}: {steps[-1]['status']}")
        if result.stdout:
            print(result.stdout.strip())
        if result.returncode and not optional:
            failed = True
            print(result.stderr.strip(), file=sys.stderr)
            break
    report = {"completed_at": datetime.now(timezone.utc).isoformat(), "status": "failed" if failed else "degraded" if any(step["status"] == "warning" for step in steps) else "ok", "discovery_requested": args.discover, "steps": steps}
    path = ROOT / "data" / "app" / "pipeline_report.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    if not failed:
        subprocess.run([sys.executable, str(ROOT / "scripts" / "build_data_health.py")], cwd=ROOT, check=True)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
