"""NDJSON line encoding for agent streaming APIs."""

from __future__ import annotations

import json
from typing import Any


def ndjson_line(payload: Any) -> bytes:
    return (json.dumps(payload, ensure_ascii=False, default=str) + "\n").encode()
