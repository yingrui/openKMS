"""Unit tests for @function(uses=...) publish validation helpers."""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from app.services.ontology import function_service
from app.services.ontology.function_service import publish_function, validate_uses_dependencies


def _result(scalar):
    r = MagicMock()
    r.scalar_one_or_none.return_value = scalar
    return r


def test_validate_uses_missing_dependency() -> None:
    async def _run() -> None:
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_result(None))
        errors = await validate_uses_dependencies(
            db,
            '@function(uses=["missingFn"])\ndef execute(input, client): return {}',
        )
        assert any("not found" in e for e in errors)

    asyncio.run(_run())


def test_validate_uses_unpublished() -> None:
    async def _run() -> None:
        other = SimpleNamespace(api_name="helloGreeting", published_version_id=None)
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_result(other))
        errors = await validate_uses_dependencies(
            db,
            '@function(uses=["helloGreeting"])\ndef execute(input, client): return {}',
        )
        assert any("not published" in e for e in errors)

    asyncio.run(_run())


def test_validate_uses_self_forbidden() -> None:
    async def _run() -> None:
        db = AsyncMock()
        errors = await validate_uses_dependencies(
            db,
            '@function(uses=["myFn"])\ndef execute(input, client): return {}',
            self_api_name="myFn",
        )
        assert any("self" in e for e in errors)
        db.execute.assert_not_called()

    asyncio.run(_run())


def test_validate_uses_ok() -> None:
    async def _run() -> None:
        other = SimpleNamespace(api_name="helloGreeting", published_version_id="fnv-1")
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_result(other))
        errors = await validate_uses_dependencies(
            db,
            '@function(uses=["helloGreeting"])\ndef execute(input, client): return {}',
        )
        assert errors == []

    asyncio.run(_run())


def test_publish_rejects_invalid_uses(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _run() -> None:
        fn = SimpleNamespace(id="fn-1", api_name="callerFn", published_version_id=None)
        ver = SimpleNamespace(
            id="fnv-1",
            function_id="fn-1",
            entrypoint="execute",
            source_code=(
                "from openkms_functions import Client, function\n\n"
                '@function(uses=["missing"])\n'
                "def execute(input: dict, client: Client) -> dict:\n"
                "    return {}\n"
            ),
        )
        db = AsyncMock()

        async def fake_get(_db, _id):
            return fn

        async def fake_latest(_db, _id):
            return ver

        async def fake_uses(_db, _source, **_kwargs):
            return ["uses dependency not found: missing"]

        monkeypatch.setattr(function_service, "get_function", fake_get)
        monkeypatch.setattr(function_service, "latest_version", fake_latest)
        monkeypatch.setattr(function_service, "validate_uses_dependencies", fake_uses)

        with pytest.raises(HTTPException) as ei:
            await publish_function(db, "fn-1", version_id=None)
        assert ei.value.status_code == 400
        detail = ei.value.detail
        assert isinstance(detail, dict)
        assert any("not found" in e for e in detail["errors"])

    asyncio.run(_run())
