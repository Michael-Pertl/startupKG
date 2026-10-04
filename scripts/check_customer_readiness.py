#!/usr/bin/env python3
"""Fail a paid-launch gate when the current evidence/operations report has gaps."""

import argparse
import json
from pathlib import Path

from build_data_health import assurance


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--require-ready", action="store_true", help="Return nonzero for unmet assurance checks.")
    args = parser.parse_args()
    path = Path(__file__).resolve().parents[1] / "data/app/data_health.json"
    result = assurance(json.loads(path.read_text()))
    print(json.dumps(result, indent=2))
    return 1 if args.require_ready and result["blockers"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
