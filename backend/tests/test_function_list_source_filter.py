"""One registry, two authoring modes: `source` is what the two Function Editor menus split on.

No database here — the filter is a `WHERE` clause, and what matters is that it is applied to **both** the page and
the count (a count that ignores the filter reports a pagination length the page cannot fill).
"""

from __future__ import annotations

import pytest

from app.services.ontology import function_service


class _Result:
    def __init__(self, *, scalar=None, rows=None):
        self._scalar = scalar
        self._rows = rows or []

    def scalar_one(self):
        return self._scalar

    def scalars(self):
        return self

    def all(self):
        return self._rows


class RecordingDb:
    """Captures the statements so the test can assert what was filtered."""

    def __init__(self, functions):
        self.functions = functions
        self.statements = []

    async def execute(self, stmt):
        self.statements.append(stmt)
        if str(stmt).lower().startswith("select count"):
            return _Result(scalar=len(self.functions))
        return _Result(rows=self.functions)


def _where_sql(stmt) -> str:
    return str(stmt).split("WHERE", 1)[1] if "WHERE" in str(stmt) else ""


def _params(stmt) -> dict:
    return dict(stmt.compile().params)


@pytest.mark.asyncio
async def test_source_filter_reaches_both_the_page_and_the_count(monkeypatch):
    db = RecordingDb([])
    monkeypatch.setattr(
        function_service,
        "_version_summaries",
        lambda *_a, **_k: _async((({}, {}))),
    )
    monkeypatch.setattr(
        function_service, "latest_versions_by_fn", lambda *_a, **_k: _async({})
    )

    await function_service.list_functions(db, limit=10, offset=0, source="llm")

    assert len(db.statements) == 2
    for stmt in db.statements:
        assert "ontology_functions.source = " in _where_sql(stmt)
        assert "llm" in _params(stmt).values()


@pytest.mark.asyncio
async def test_no_source_means_no_filter(monkeypatch):
    db = RecordingDb([])
    monkeypatch.setattr(
        function_service, "_version_summaries", lambda *_a, **_k: _async((({}, {})))
    )
    monkeypatch.setattr(
        function_service, "latest_versions_by_fn", lambda *_a, **_k: _async({})
    )

    await function_service.list_functions(db, limit=10, offset=0)

    for stmt in db.statements:
        assert "WHERE" not in str(stmt).upper()


async def _async(value):
    return value
