"""Label a source by whether the answer actually used it.

Before this, `select_display_sources` returned a flat list: a query the agent ran to look around looked exactly like the
query the answer's numbers came from. That is the difference a reader needs, and it is the difference an evaluation cannot
see when everything looks the same.

Nothing is dropped. A source is labelled `used` when at least one number in the answer traces to it (a query's rows, or a
passage's own text), otherwise
`consulted` — the query ran, the answer did not draw on it. For evidence with no rows (RAG chunks, Page Index sections) the
label stays `None`: the notion does not apply, and inventing one would be worse than saying nothing.
"""
from __future__ import annotations

from typing import Any

from .grounding import traceable_numbers
from .schemas import GroundingReport, SourceItem

__all__ = ["ground", "label_sources"]

USED = "used"
CONSULTED = "consulted"


def _evidence_of(source: SourceItem) -> list[Any]:
    """What this source can be traced against: a query's rows, or a passage's own text.

    A RAG answer quoting "IC_IR > 0.5" is grounded in the chunk that says so. Tracing only against Catalog rows made every
    prose answer score 0/9 — a false alarm that would have taught readers to ignore the number.
    """
    if source.data_query:
        rows = source.data_query.get("rows")
        return rows if isinstance(rows, list) else []
    return [source.content] if source.content else []


def label_sources(sources: list[SourceItem], answer: str) -> list[SourceItem]:
    """Return the same sources, each Catalog one labelled `used` or `consulted`.

    `used` is decided per source: how many of the answer's numbers appear in *this* source's rows. A source that supplied
    none is `consulted` — not wrong, and not removed.
    """
    labelled: list[SourceItem] = []
    for source in sources:
        if not source.data_query:
            labelled.append(source)
            continue
        report = traceable_numbers(answer, _evidence_of(source))
        labelled.append(
            source.model_copy(
                update={
                    "usage": USED if report["traceable"] else CONSULTED,
                    "traceable_numbers": report["traceable"],
                }
            )
        )
    return labelled


def ground(sources: list[SourceItem], answer: str) -> GroundingReport:
    """The answer's overall grounding: how many of its numbers appear in *any* cited result."""
    evidence: list[Any] = []
    for source in sources:
        evidence.extend(_evidence_of(source))
    report = traceable_numbers(answer, evidence)
    return GroundingReport(
        traceable=report["traceable"],
        total=report["total"],
        ratio=report["ratio"],
        untraced=report["untraced"],
    )


def grounding_warnings(report: GroundingReport, mode: str) -> list[str]:
    """The warning a KB asked for, or none.

    The ratio is always computed; `mark` and `enforce` are about saying something out loud. Neither edits the answer: a
    number removed after the fact is a wrong number made invisible, and the reader cannot tell which happened.
    """
    if mode == "off" or report.total == 0 or report.traceable == report.total:
        return []
    missing = report.total - report.traceable
    listed = ", ".join(_format_number(v) for v in report.untraced[:5]) if report.untraced else ""
    return [
        f"{missing} of {report.total} number(s) in this answer do not appear in any cited source"
        + (f": {listed}" if listed else "")
    ]


def _format_number(value: float) -> str:
    """A number a reader recognises: 20,010,827 rather than 2.00108e+07."""
    if value == int(value):
        return f"{int(value):,}"
    return f"{value:,.2f}".rstrip("0").rstrip(".")
