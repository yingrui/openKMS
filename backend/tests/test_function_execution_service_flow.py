"""Service-level create → publish → execute flow with mocked OFS."""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.services.ontology import execution_service


def _scalar_result(value):
    r = MagicMock()
    r.scalar_one_or_none.return_value = value
    r.scalars.return_value.all.return_value = []
    return r


def test_execute_validates_input_schema(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _run() -> None:
        fn = SimpleNamespace(id="fn-1", api_name="greet", published_version_id="fnv-1")
        ver = SimpleNamespace(
            id="fnv-1",
            function_id="fn-1",
            version=1,
            entrypoint="execute",
            source_code="def execute(input, client): return {}",
            input_schema={"type": "object", "required": ["name"], "properties": {"name": {"type": "string"}}},
        )

        async def fake_get(_db, _id):
            return fn

        async def fake_resolve(_db, _fn, **_kw):
            return ver

        monkeypatch.setattr(execution_service, "get_function", fake_get)
        monkeypatch.setattr(execution_service, "resolve_version_for_execute", fake_resolve)

        with pytest.raises(HTTPException) as ei:
            await execution_service.execute_function_by_id(
                AsyncMock(),
                "fn-1",
                input_payload={},
                version_id=None,
                use_published=True,
                caller_user_id="u1",
                caller_token="tok",
            )
        assert ei.value.status_code == 400

    asyncio.run(_run())


def test_execute_detects_cycle(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _run() -> None:
        fn = SimpleNamespace(id="fn-1", api_name="greet", published_version_id="fnv-1")
        ver = SimpleNamespace(
            id="fnv-1",
            function_id="fn-1",
            version=1,
            entrypoint="execute",
            source_code="def execute(input, client): return {}",
            input_schema=None,
        )

        async def fake_get(_db, _id):
            return fn

        async def fake_resolve(_db, _fn, **_kw):
            return ver

        monkeypatch.setattr(execution_service, "get_function", fake_get)
        monkeypatch.setattr(execution_service, "resolve_version_for_execute", fake_resolve)

        with pytest.raises(HTTPException) as ei:
            await execution_service.execute_function_by_id(
                AsyncMock(),
                "fn-1",
                input_payload={},
                version_id=None,
                use_published=True,
                caller_user_id="u1",
                caller_token="tok",
                call_stack=["greet"],
            )
        assert "cycle" in str(ei.value.detail).lower()

    asyncio.run(_run())


def test_execute_happy_path_mocks_ofs(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _run() -> None:
        fn = SimpleNamespace(id="fn-1", api_name="greet", published_version_id="fnv-1")
        ver = SimpleNamespace(
            id="fnv-1",
            function_id="fn-1",
            version=1,
            entrypoint="execute",
            source_code="def execute(input, client): return {}",
            input_schema=None,
        )
        db = AsyncMock()
        db.commit = AsyncMock()
        db.add = MagicMock()

        async def fake_get(_db, _id):
            return fn

        async def fake_resolve(_db, _fn, **_kw):
            return ver

        async def fake_ofs(**_kwargs):
            return {"hello": "world"}, None, 12

        monkeypatch.setattr(execution_service, "get_function", fake_get)
        monkeypatch.setattr(execution_service, "resolve_version_for_execute", fake_resolve)
        monkeypatch.setattr(execution_service, "execute_in_ofs", fake_ofs)

        res = await execution_service.execute_function_by_id(
            db,
            "fn-1",
            input_payload={"name": "x"},
            version_id=None,
            use_published=True,
            caller_user_id="u1",
            caller_token="tok",
        )
        assert res.status == "ok"
        assert res.output == {"hello": "world"}
        assert res.duration_ms == 12
        db.add.assert_called()
        db.commit.assert_awaited()

    asyncio.run(_run())
