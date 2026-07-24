#!/usr/bin/env python3
"""Generate openkms_ontology_sdk Python stubs from openKMS ontology HTTP APIs.

Usage:
  OPENKMS_API_URL=http://localhost:8102 OPENKMS_API_KEY=... python scripts/generate_ontology_sdk.py

Output: ontology-function-service/openkms_ontology_sdk/ (generated; do not hand-edit)
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "ontology-function-service" / "openkms_ontology_sdk"


def _fetch(base: str, path: str, token: str) -> object:
    req = urllib.request.Request(f"{base.rstrip('/')}{path}", headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _snake(name: str) -> str:
    s = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", name)
    return s.replace("-", "_").lower()


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def main() -> int:
    base = os.environ.get("OPENKMS_API_URL", "http://localhost:8102")
    token = os.environ.get("OPENKMS_API_KEY") or os.environ.get("OPENKMS_TOKEN")
    if not token:
        print("Set OPENKMS_API_KEY or OPENKMS_TOKEN", file=sys.stderr)
        return 1

    object_types = _fetch(base, "/api/object-types", token)
    items = object_types.get("items") if isinstance(object_types, dict) else object_types
    items = list(items or [])

    functions = _fetch(base, "/api/ontology/functions?limit=500", token)
    fn_items = functions.get("items") if isinstance(functions, dict) else []

    lines = [
        '"""Generated ontology SDK — regenerate via scripts/generate_ontology_sdk.py."""',
        "from __future__ import annotations",
        "from dataclasses import dataclass",
        "",
    ]

    for ot in items:
        name = ot.get("name") or ot.get("id")
        if not name:
            continue
        cls = re.sub(r"[^a-zA-Z0-9_]", "", str(name))
        if not cls or cls[0].isdigit():
            cls = f"O_{cls}"
        lines.extend(
            [
                "@dataclass(frozen=True)",
                f"class {cls}:",
                f'    """Object type: {name}"""',
                f'    api_name: str = "{name}"',
                "",
            ]
        )

    for fn in fn_items:
        if fn.get("status") != "active" and not fn.get("published_version_id"):
            continue
        api_name = fn.get("api_name")
        if not api_name:
            continue
        var = _snake(str(api_name))
        lines.extend(
            [
                "@dataclass(frozen=True)",
                f"class {var}:",
                f'    """Published function query: {api_name}"""',
                f'    api_name: str = "{api_name}"',
                "",
            ]
        )

    _write(OUT_DIR / "__init__.py", "\n".join(lines) + "\n")
    print(f"Wrote {OUT_DIR / '__init__.py'} ({len(items)} object types, {len(fn_items)} functions scanned)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
