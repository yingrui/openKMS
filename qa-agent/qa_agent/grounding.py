"""Does an answer's numbers come from the queries it cites?

A KB answer may only assert numbers it can source. Two ways to go wrong, and this module measures the second:

- the answer cites a query that does **not** answer the question (a prompt/behaviour problem), and
- the answer states numbers that **no cited query produced** — a made-up or misremembered figure.

The ratio here is `traceable / total`, not a boolean. Derived figures ("同比增长 12%") legitimately do not appear verbatim
in any result, and a boolean would flag every good answer along with the bad ones. The caller decides what to do with the
ratio; this module only reports it.
"""
from __future__ import annotations

import re
from collections.abc import Iterable, Mapping, Sequence
from typing import Any

__all__ = ["normalize_numbers", "traceable_numbers"]

#: A number with optional thousands separators, a decimal part, and a trailing 万/亿/％/%/倍.
#: The lookarounds reject digits that are part of an identifier — `600519.SH` is a ticker, not a quantity, and counting it as
#: an unsourced number is exactly the noise that teaches a reader to ignore the ratio.
_NUMBER = re.compile(r"(?<![\w.])(-?\d[\d,]*)(\.\d+)?\s*(万亿|亿|万|千|%|％|倍)?(?![\w]|\.[A-Za-z])")

#: Numbers that are structure rather than claims: list ordinals, day numbers, and years. `2026 年上半年` is a date; `1.` `2.`
#: are a list. Neither is a figure that has to appear in a source, and including them made every answer look ungrounded.
_STRUCTURAL_MAX = 31
_YEAR_RANGE = (1900, 2100)

#: Scale of a Chinese magnitude suffix.
_SCALE = {"千": 1e3, "万": 1e4, "亿": 1e8, "万亿": 1e12}

#: Values below this are treated as years/counts of no interest? No — years are numbers too. Kept for callers to filter.
_PERCENT = {"%", "％"}


def _looks_like_a_date(value: float) -> bool:
    """`20260630` / `2026-06-30` written as digits: a date, not a quantity."""
    text = str(int(value)) if value == int(value) else ""
    if len(text) != 8:
        return False
    year, month, day = int(text[:4]), int(text[4:6]), int(text[6:])
    return _YEAR_RANGE[0] <= year <= _YEAR_RANGE[1] and 1 <= month <= 12 and 1 <= day <= 31


def _is_claim(value: float) -> bool:
    """Whether a number is something the answer is asserting, rather than date or list structure."""
    if value == int(value):
        if 0 <= value <= _STRUCTURAL_MAX:
            return False
        if _YEAR_RANGE[0] <= value <= _YEAR_RANGE[1]:
            return False
        if _looks_like_a_date(value):
            return False
    return True


def _to_floats(text: str) -> list[float]:
    """Every number in ``text``, de-scaled. ``12.3亿`` becomes ``1230000000.0``; ``12.3%`` becomes ``12.3``."""
    out: list[float] = []
    for integer, decimal, suffix in _NUMBER.findall(text or ""):
        try:
            value = float(f"{integer.replace(',', '')}{decimal or ''}")
        except ValueError:
            continue
        if suffix in _SCALE:
            value *= _SCALE[suffix]
        # A suffix (`%`, `倍`, `万`, `亿`) always makes a number a claim: `12%` is a figure, `12.` is a list marker.
        if not suffix and value == int(value) and not _is_claim(float(value)):
            continue
        out.append(value)
    return out


def normalize_numbers(value: Any) -> set[float]:
    """The numeric values inside a result cell, a row, or free text — rounded to absorb float noise."""
    if value is None or isinstance(value, bool):
        return set()
    if isinstance(value, (int, float)):
        return {round(float(value), 3)}
    if isinstance(value, str):
        return {round(v, 3) for v in _to_floats(value)}
    if isinstance(value, Mapping):
        out: set[float] = set()
        for v in value.values():
            out |= normalize_numbers(v)
        return out
    if isinstance(value, Iterable) and not isinstance(value, (bytes, bytearray)):
        out = set()
        for v in value:
            out |= normalize_numbers(v)
        return out
    return set()


def traceable_numbers(answer: str, results: Iterable[Any]) -> dict[str, Any]:
    """How many of the answer's numbers appear in the cited results.

    ``results`` is the set of things the answer is allowed to draw on: result rows (mappings or sequences), or the whole
    tool outputs. Returns ``{"traceable", "total", "ratio", "untraced"}`` — ``ratio`` is ``1.0`` when the answer states no
    numbers at all, because "cited nothing numeric" is not "cited something unverifiable".
    """
    available: set[float] = set()
    for result in results:
        available |= normalize_numbers(result)

    stated = {round(v, 3) for v in _to_floats(answer or "")}
    if not stated:
        return {"traceable": 0, "total": 0, "ratio": 1.0, "untraced": []}

    traced = stated & available
    return {
        "traceable": len(traced),
        "total": len(stated),
        "ratio": len(traced) / len(stated),
        "untraced": sorted(stated - available),
    }
