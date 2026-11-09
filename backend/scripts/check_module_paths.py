#!/usr/bin/env python3
"""Every `app.<package>.<name>` written in backend Python must resolve to a module that exists.

`pytest` imports the tests, and the tests import the app — but they do not import `scheduler.py` or `worker.py`, and they
never re-run a migration. After the services split, 48 files still named the old paths: the gates were green, `alembic
upgrade head` was a no-op on an already-migrated database, and the dev server would not start.

This checks the two things that were silently wrong: the module path exists, and the entry points import.
"""
from __future__ import annotations

import importlib.util
import logging
import re
import sys
from pathlib import Path

from app.services.platform.boundaries import boundary

ROOT = Path(__file__).resolve().parent.parent
ENTRY_POINTS = ('scheduler.py', 'worker.py')
#: Only `app.<something that exists at the top level>` — otherwise `app.add_middleware` on the FastAPI instance reads as a
#: module path. Built from the package itself, so it cannot drift.
TOP_LEVEL = sorted(
    p.stem if p.is_file() else p.name
    for p in (ROOT / 'app').iterdir()
    if not p.name.startswith('__') and (p.suffix == '.py' or (p / '__init__.py').is_file())
)
MODULE_REF = re.compile(r'\bapp\.((?:' + '|'.join(map(re.escape, TOP_LEVEL)) + r')(?:\.[a-z_][\w]*)*)\b')


def _resolves(dotted: str) -> bool:
    parts = dotted.split('.')
    for cut in range(len(parts), 0, -1):
        base = ROOT.joinpath(*parts[:cut])
        if base.with_suffix('.py').is_file() or (base / '__init__.py').is_file():
            return True
        if base.is_dir():
            return False
    return False


def stale_paths() -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    for path in sorted(ROOT.rglob('*.py')):
        if '.venv' in path.parts or '__pycache__' in path.parts:
            continue
        for dotted in sorted(set(MODULE_REF.findall(path.read_text()))):
            if not _resolves(f'app.{dotted}'):
                out.append((str(path.relative_to(ROOT)), f'app.{dotted}'))
    return out


def broken_entry_points() -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    for name in ENTRY_POINTS:
        path = ROOT / name
        if not path.is_file():
            continue
        spec = importlib.util.spec_from_file_location(f'_check_{path.stem}', path)
        module = importlib.util.module_from_spec(spec)
        # A boundary, not a blind except: the contract here is "load it and report whatever went wrong", which is exactly
        # what `app/services/platform/boundaries.py` exists for (`BLE001` is enabled repo-wide).
        with boundary(f'import {name}', logger=logging.getLogger(__name__)) as failed:
            spec.loader.exec_module(module)
        if failed:
            out.append((name, f'{type(failed[0]).__name__}: {failed[0]}'))
    return out


def main() -> int:
    stale = stale_paths()
    broken = broken_entry_points()
    for where, what in stale:
        print(f'  {where}: {what} does not resolve', file=sys.stderr)
    for where, what in broken:
        print(f'  {where}: {what}', file=sys.stderr)
    if stale or broken:
        print(f'check-module-paths: {len(stale)} stale module path(s), {len(broken)} entry point(s) that do not import.',
              file=sys.stderr)
        return 1
    print('check-module-paths: OK')
    return 0


if __name__ == '__main__':
    sys.exit(main())
