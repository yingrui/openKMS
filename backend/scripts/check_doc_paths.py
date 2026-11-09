#!/usr/bin/env python3
"""Every `backend/...` or `frontend/...` path written in the docs must exist.

Prose drifts after a move, and nothing notices: the page still reads correctly, the link still resolves, and a reader
follows a path that was renamed three commits ago. The layout split touched ~250 files and left about 25 stale paths across
nine pages — all of them still plausible-looking, none of them real.

The ratchet is the file itself: no baseline, because zero is achievable and anything above it is a typo.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
DOCS = [ROOT / 'AGENTS.md'] + sorted((ROOT / 'docs').rglob('*.md'))
PATH = re.compile(r'`((?:backend|frontend)/[\w./-]+)`')


def missing() -> list[tuple[Path, str]]:
    out: list[tuple[Path, str]] = []
    for page in DOCS:
        if not page.exists():
            continue
        for token in sorted(set(PATH.findall(page.read_text()))):
            target = token.rstrip('/')
            # a directory, a file, or a module named without its extension
            if (ROOT / target).exists() or (ROOT / target).with_suffix('').exists():
                continue
            out.append((page.relative_to(ROOT), token))
    return out


def main() -> int:
    stale = missing()
    if stale:
        for page, token in stale:
            print(f'  {page}: {token}', file=sys.stderr)
        print(
            f'check-doc-paths: {len(stale)} path(s) above are written in the docs but do not exist. '
            'Update the page, or restore the path.',
            file=sys.stderr,
        )
        return 1
    print(f'check-doc-paths: OK ({len(DOCS)} pages)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
