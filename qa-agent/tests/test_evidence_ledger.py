"""The ledger is the one place that decides what an answer's `sources` contain.

Two bugs came from this area and both were invisible in tests: the tool dropped the retrieval provenance on the way out,
and the stream had no branch for the corpus search, so chat answers had no sources at all. The rules pinned here are the
ones that let those bugs happen.
"""
from __future__ import annotations

import json

from qa_agent.evidence_ledger import FAMILIES, SOURCE_TYPES, EvidenceLedger
from qa_agent.kb_answer_sources import select_display_sources
from qa_agent.schemas import SourceItem


def _src(id_: str, source_type: str = "chunk", **kw) -> SourceItem:
    return SourceItem(id=id_, source_type=source_type, content="x", score=0.0, **kw)


def test_families_are_appended_not_filtered():
    # Before: the first non-empty family won, so a turn that cited a section *and* a passage only showed the section.
    out = select_display_sources(
        [],
        streamed_sections=[_src("s1", "document_section")],
        streamed_searched=[_src("c1")],
        streamed_web=[_src("https://a", "web", url="https://a")],
    )
    assert [s.source_type for s in out] == ["document_section", "chunk", "web"]


def test_order_is_the_family_order_not_the_arrival_order():
    ledger = EvidenceLedger()
    ledger.add("web", [_src("https://a", "web", url="https://a")])
    ledger.add("searched", [_src("c1")])
    ledger.add("page", [_src("p1", "document_section")])
    assert [s.source_type for s in ledger.snapshot()] == ["document_section", "chunk", "web"]


def test_the_same_page_twice_is_one_row():
    ledger = EvidenceLedger()
    assert ledger.add("web", [_src("https://a", "web", url="https://a")]) == 1
    assert ledger.add("web", [_src("other-id", "web", url="https://a")]) == 0
    assert len(ledger.snapshot()) == 1


def test_a_row_without_identity_is_dropped():
    ledger = EvidenceLedger()
    assert ledger.add("searched", [SourceItem(id="", source_type="chunk", content="x", score=0.0)]) == 0


def test_an_unknown_family_is_a_programming_error():
    # Silently accepting one would put a new family outside the order, which is how a family goes missing.
    try:
        EvidenceLedger().add("rumours", [_src("x")])
    except ValueError as exc:
        assert "rumours" in str(exc)
    else:  # pragma: no cover
        raise AssertionError("an unknown family must raise")


def test_the_legacy_chunks_are_used_only_when_nothing_else_arrived():
    legacy = [_src("legacy")]
    assert [s.id for s in select_display_sources(legacy)] == ["legacy"]
    mixed = select_display_sources(legacy, streamed_searched=[_src("c1")])
    # Both are corpus rows; the legacy list is the pre-tool path and never doubles up with a search.
    assert [s.id for s in mixed] == ["c1"]


def test_every_source_type_has_a_ui_kind_and_a_label():
    """The vocabulary is shared with the frontend by string, and an unmapped value renders as "semantic search"."""
    from pathlib import Path

    repo = Path(__file__).resolve().parents[2]
    utils = (repo / "frontend/src/pages/workforce/chat/chatUtils.ts").read_text()
    for locale in ("en", "zh-CN"):
        strings = json.loads(
            (repo / f"frontend/src/i18n/locales/{locale}/workforce.json").read_text()
        )
        kinds = strings["chat"]["sourceKind"]
        for value in SOURCE_TYPES:
            assert f"'{value}'" in utils or f"'{value}'," in utils, f"{value} missing from chatSourceKind"
            assert value in kinds, f"{locale} has no chat.sourceKind.{value}"


def test_the_family_order_covers_the_source_types():
    # A family exists to be ordered; a type that belongs to none of them could never be shown.
    assert FAMILIES == ("page", "catalog", "ontology", "searched", "web")
    assert "web" in SOURCE_TYPES and "chunk" in SOURCE_TYPES
