#!/usr/bin/env python3
"""openKMS skill CLI — thin wrappers over the public REST API (Bearer personal API key).

This file is a small dispatcher; every subcommand lives under `openkms/commands/`.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Make the sibling `openkms` package importable when invoked as a plain script
# (e.g. `python scripts/cli.py ...` per SKILL.md).
sys.path.insert(0, str(Path(__file__).resolve().parent))

import httpx  # noqa: E402

from openkms.commands import register  # noqa: E402


def main() -> None:
    p = argparse.ArgumentParser(prog="openkms-skill")
    sub = p.add_subparsers(dest="cmd", required=True)
    register(sub)

    ns = p.parse_args()
    try:
        ns.fn(ns)
    except httpx.HTTPStatusError as e:
        detail = e.response.text
        try:
            detail = json.dumps(e.response.json(), indent=2, ensure_ascii=False)
        except Exception:
            pass
        print(f"HTTP {e.response.status_code}\n{detail}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
