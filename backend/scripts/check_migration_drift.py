#!/usr/bin/env python3
"""Fail when the models and the migrated database disagree.

`alembic check` (Alembic ≥ 1.9) already answers "are there upgrade operations nobody wrote a migration for", so this
script is about the *advice* rather than the comparison: which of the two reasons it failed, and what to do — because
the wrong instinct here is to edit a migration that has already been pushed.

Two failures look identical in Alembic's output and need opposite advice:

* the local database is behind the migrations → run `alembic upgrade head`;
* the database is up to date but the models moved → write a migration (and if the mismatch is in a migration that is
  already pushed, write a patch; never rewrite history).
"""
from __future__ import annotations

import subprocess
import sys

HEADING = "check-migration-drift"


def _alembic(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        capture_output=True,
        text=True,
    )


def _quiet_lines(text: str) -> str:
    return "\n".join(
        line for line in text.splitlines() if line.strip() and not line.startswith("INFO")
    )


def main() -> int:
    current = _alembic("current")
    if current.returncode != 0:
        print(
            f"{HEADING}: cannot read the schema (is the database reachable?)\n"
            f"{_quiet_lines(current.stderr or current.stdout)}",
            file=sys.stderr,
        )
        return 1

    heads = _alembic("heads")
    current_ids = {line.split()[0] for line in current.stdout.splitlines() if line.strip()}
    head_ids = {
        line.split()[0]
        for line in heads.stdout.splitlines()
        if line.strip() and not line.startswith("INFO")
    }
    if head_ids and not head_ids <= current_ids:
        print(
            f"{HEADING}: the database is behind the migrations "
            f"(current {', '.join(sorted(current_ids)) or 'none'}, head {', '.join(sorted(head_ids))}).\n"
            "  Run `alembic upgrade head`, then run this again.",
            file=sys.stderr,
        )
        return 1

    check = _alembic("check")
    if check.returncode == 0:
        return 0

    print(
        f"{HEADING}: the models and the database disagree — these operations have no migration:\n"
        f"{_quiet_lines(check.stdout + check.stderr)}\n"
        "\n"
        "  Write the migration:  alembic revision --autogenerate -m '<what changed>'\n"
        "  Then review every op: only the ones for your change belong there (see AGENTS.md, Alembic).\n"
        "  If the mismatch is in a migration that is already pushed, add a patch migration — do not\n"
        "  rewrite the pushed one.",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
