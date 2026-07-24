#!/usr/bin/env python3
"""Example external caller using the same Client as Function authors.

Usage:
  OPENKMS_API_URL=http://localhost:8102 OPENKMS_API_KEY=… \
    python scripts/example_ontology_sdk_caller.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ontology-function-service"))

from openkms_functions import Client  # noqa: E402


def main() -> int:
    base = os.environ.get("OPENKMS_API_URL", "http://localhost:8102")
    token = os.environ.get("OPENKMS_API_KEY") or os.environ.get("OPENKMS_TOKEN")
    if not token:
        print("Set OPENKMS_API_KEY", file=sys.stderr)
        return 1
    client = Client(base, token)
    try:
        from openkms_ontology_sdk import helloGreeting

        result = client(helloGreeting).execute_function({"name": "openKMS"})
    except Exception:
        result = client("helloGreeting").execute_function({"name": "openKMS"})
    print(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
