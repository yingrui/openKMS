"""ping — verify auth + connectivity (GET /api/auth/me)."""
from __future__ import annotations

import argparse

from ..client import client
from .._io import print_json


def cmd_ping(_: argparse.Namespace) -> None:
    with client() as s:
        r = s.get("/api/auth/me")
    r.raise_for_status()
    print_json(r.json())


def add_subparser(sub) -> None:
    p = sub.add_parser("ping", help="GET /api/auth/me")
    p.set_defaults(fn=cmd_ping)
