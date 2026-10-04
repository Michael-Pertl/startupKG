#!/usr/bin/env python3
"""Refresh validated investor data and report every pipeline step."""

import argparse
import json
import subprocess
import sys
import fcntl
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def refresh(args) -> int:
    steps = []
    discovery = ["fetch_market_events_feeds.py"] if args.discover else []
    if args.tavily:
        discovery.append("fetch_market_events_tavily.py")
    required = ["validate_raw_data.py", "validate_startup_profiles.py", "validate_market_events.py", "normalize_raw_data.py", "build_growth_metrics.py", "init_startup_profiles.py", "validate_startup_profiles.py", "build_app_graph.py", "build_market_events.py"]
    failed = False
    required.insert(1, "auto_ingest_funding.py")
    required.insert(2, "validate_raw_data.py")
    for script in discovery + required:
        try:
            result = subprocess.run([sys.executable, str(ROOT / "scripts" / script)], cwd=ROOT, capture_output=True, text=True, timeout=600)
            code, output, error = result.returncode, result.stdout, result.stderr
        except subprocess.TimeoutExpired:
            code, output, error = 124, "", "Step timed out after 600 seconds"
        optional = script in discovery
        steps.append({"script": script, "exit_code": code, "status": "ok" if code == 0 else "warning" if optional else "failed"})
        print(f"{script}: {steps[-1]['status']}", flush=True)
        if output:
            print(output.strip())
        if code:
            print(error.strip(), file=sys.stderr)
        if code and not optional:
            failed = True
            break
    report = {"completed_at": datetime.now(timezone.utc).isoformat(), "status": "failed" if failed else "degraded" if any(step["status"] == "warning" for step in steps) else "ok", "discovery_requested": args.discover, "tavily_requested": args.tavily, "steps": steps}
    path = ROOT / "data" / "app" / "pipeline_report.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)
    # Publish the failed attempt too, rather than leaving a stale successful status.
    try:
        health_failed = subprocess.run([sys.executable, str(ROOT / "scripts" / "build_data_health.py")], cwd=ROOT, timeout=60).returncode != 0
    except subprocess.TimeoutExpired:
        health_failed = True
    if health_failed:
        report["status"] = "failed"
        temporary.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        temporary.replace(path)
        previous = path.parent / "data_health.json"
        try:
            payload = json.loads(previous.read_text())
        except (OSError, ValueError):
            payload = {"scope_note": "Evidence status unavailable; no current accuracy or coverage claim can be made.",
                       "latest_funding_date": None, "unknown_investors": 0, "unreviewed_events": 0,
                       "regions": [], "tavily": {}, "rss": {}}
        payload.update(pipeline=report, evidence_error="Coverage report could not be rebuilt; counts may describe an older snapshot.",
                       assurance={"status": "limited_preview", "blockers": ["Evidence status unavailable after failed refresh"]})
        for folder in (path.parent, ROOT / "web/public/data"):
            folder.mkdir(parents=True, exist_ok=True)
            target = folder / "data_health.json"
            pending = target.with_suffix(".tmp")
            pending.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
            pending.replace(target)
    return 1 if failed or health_failed else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--discover", action="store_true", help="Poll RSS for evidence candidates.")
    parser.add_argument("--tavily", action="store_true", help="Explicitly opt into Tavily discovery; disabled by default.")
    args = parser.parse_args()
    lock_path = ROOT / "cache" / "refresh.lock"
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("Another refresh is already running; no data changed.", file=sys.stderr)
            return 2
        return refresh(args)


if __name__ == "__main__":
    raise SystemExit(main())
