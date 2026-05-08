"""Stdin/stdout helpers shared across commands."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any


def print_json(data: Any) -> None:
    print(json.dumps(data, indent=2, default=str, ensure_ascii=False))


def write_or_print(text: str, out_path: str | None) -> None:
    if out_path:
        Path(out_path).write_text(text, encoding="utf-8")
    else:
        sys.stdout.write(text)
        if not text.endswith("\n"):
            sys.stdout.write("\n")


def html_to_markish(html: str) -> str:
    """Strip HTML to a rough text/markdown approximation. Used by `articles from-url`."""
    t = re.sub(r"(?is)<script[^>]*>.*?</script>", "", html)
    t = re.sub(r"(?is)<style[^>]*>.*?</style>", "", t)
    t = re.sub(r"(?is)<br\s*/?>", "\n", t)
    t = re.sub(r"(?is)</p>", "\n\n", t)
    t = re.sub(r"(?is)<[^>]+>", "", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()
