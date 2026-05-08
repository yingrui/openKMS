"""Confirmation gating for write commands.

Every mutating CLI subcommand calls `confirm_or_abort(...)` before sending the
HTTP request. Behavior:

  --dry-run            print the planned [METHOD] path + body, exit 0, no HTTP call
  -y / --yes           skip the prompt, send the request
  (default, TTY)       print the planned call, ask "Proceed? [y/N]"; non-y aborts
  (default, non-TTY)   refuse and exit 2 — agents must pass --yes explicitly

Exit codes: 0 dry-run/success, 1 user declined, 2 non-TTY without --yes.
"""
from __future__ import annotations

import argparse
import json
import sys
from typing import Any


def add_write_flags(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("-y", "--yes", action="store_true", help="skip confirmation prompt")
    parser.add_argument("--dry-run", action="store_true", help="print payload, do not send")


def confirm_or_abort(
    action: str,
    method: str,
    path: str,
    body: Any,
    yes: bool,
    dry_run: bool,
) -> None:
    body_str = json.dumps(body, indent=2, ensure_ascii=False) if body is not None else "(no body)"
    summary = f"[{method}] {path}\n{body_str}"

    if dry_run:
        print(f"DRY-RUN — would {action}\n{summary}")
        sys.exit(0)
    if yes:
        return
    if not sys.stdin.isatty():
        print(
            f"refusing to {action}: stdin is not a TTY and --yes was not given",
            file=sys.stderr,
        )
        sys.exit(2)
    print(f"About to {action}:\n{summary}")
    answer = input("Proceed? [y/N] ").strip().lower()
    if answer not in ("y", "yes"):
        print("aborted", file=sys.stderr)
        sys.exit(1)
