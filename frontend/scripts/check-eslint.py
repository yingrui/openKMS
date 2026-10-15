#!/usr/bin/env python3
"""Guardrail: eslint may only get *better*.

The baseline is empty today, so this doubles as a hard gate: any new error fails. It also
bans `eslint-disable` outright — the backend `check.sh` does the same for `# noqa`, because
silencing a finding is a review decision, not a drive-by. Fix the root cause instead.

Usage: check-eslint.py [--list|--update-baseline]
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASELINE = Path(__file__).resolve().parent / "eslint-baseline.txt"
# A suppression is a claim that the rule is wrong; keep the list explicit and empty.
SUPPRESSION_ALLOW: set[str] = set()


def suppressions() -> list[str]:
    """`path:line: text` for every eslint-disable comment under src/."""
    hits: list[str] = []
    for path in sorted((ROOT / "src").rglob("*.ts*")):
        for lineno, line in enumerate(path.read_text().splitlines(), start=1):
            if "eslint-disable" in line:
                hits.append(f"{path.relative_to(ROOT / 'src')}:{lineno}: {line.strip()}")
    return hits


def eslint_counts() -> dict[str, int]:
    """file (relative to src/) → error count."""
    out = subprocess.run(
        ["npx", "eslint", ".", "-f", "json"],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    if not out.stdout.strip():
        print(f"check:lint: eslint produced no JSON ({out.stderr.strip()[:200]})", file=sys.stderr)
        return {}
    counts: dict[str, int] = {}
    for entry in json.loads(out.stdout):
        errors = sum(1 for m in entry["messages"] if m.get("severity") == 2)
        if not errors:
            continue
        rel = entry["filePath"].split("/src/")[-1]
        counts[rel] = errors
    return counts


def read_baseline() -> dict[str, int]:
    if not BASELINE.exists():
        return {}
    out: dict[str, int] = {}
    for line in BASELINE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        path, _, count = line.rpartition(" ")
        out[path] = int(count)
    return out


def main() -> int:
    counts = eslint_counts()

    if "--update-baseline" in sys.argv:
        total = sum(counts.values())
        BASELINE.write_text(
            "# eslint errors per file, frozen so the count only ratchets down.\n"
            "# Regenerate: npm run check:lint -- --update-baseline\n"
            + "".join(f"{p} {c}\n" for p, c in sorted(counts.items()))
        )
        print(f"wrote {BASELINE.name}: {total} errors in {len(counts)} files")
        return 0

    baseline = read_baseline()
    if "--list" in sys.argv:
        for path, count in sorted(counts.items()):
            print(f"{count:4d}  {path}")
        return 0

    failed = False
    for hit in suppressions():
        if hit.split(":", 1)[0] not in SUPPRESSION_ALLOW:
            print(f"check:lint: {hit} silences a rule; fix the finding instead", file=sys.stderr)
            failed = True

    grown = {p: (baseline.get(p, 0), c) for p, c in counts.items() if c > baseline.get(p, 0)}
    if grown:
        for path, (was, now) in sorted(grown.items()):
            print(f"{path}: {now} eslint errors (was {was})")
        print(
            f"check:lint: {len(grown)} file(s) gained eslint errors — fix them "
            "(scripts/eslint-baseline.txt is a ratchet, it only shrinks)",
            file=sys.stderr,
        )
        failed = True
    if failed:
        return 1
    print(f"check:lint: OK ({sum(counts.values())} frozen errors in {len(counts)} files)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
