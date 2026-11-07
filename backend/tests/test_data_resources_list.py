"""Listing data resources is decided by model sharing, not by the resource's own read grant.

Opening a model lets a Catalog user see every slice it defines; "which rows may I read" is a
per-query question (`resolve_catalog_scope`), so hiding resource definitions behind a read grant
again made the list un-openable until somebody had already granted a slice of it.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.models.data_resource import DataResource


def _resource(resource_id: str, model_id: str = "m1") -> DataResource:
    now = datetime.now(timezone.utc)
    return DataResource(
        id=resource_id,
        name=resource_id,
        semantic_model_id=model_id,
        row_policy=[],
        created_at=now,
        updated_at=now,
    )


class _RowsDB:
    """`execute` returning the given resources regardless of the statement."""

    def __init__(self, resources: list[DataResource]):
        self._resources = resources

    async def execute(self, _stmt):
        resources = self._resources

        class _Result:
            def scalars(self):
                return self

            def all(self):
                return list(resources)

        return _Result()


def _run(coro):
    return asyncio.run(coro)


def test_listing_a_model_shows_every_resource_not_just_granted(monkeypatch):
    """Model read exposes all slices, even one the caller holds no grant on."""
    from app.api.data_resources import list_data_resources

    async def model_readable(_db, _payload, _sub, _rt, _rid, _required):
        return True

    # The caller holds a grant on r1 only; r2 has no grant, yet both must be listed.
    async def granted(_db, _payload, _sub, resource_id, _required):
        return resource_id == "r1"

    monkeypatch.setattr("app.api.data_resources.check_resource_access", model_readable)
    monkeypatch.setattr("app.api.data_resources.check_data_resource_access", granted)

    db = _RowsDB([_resource("r1"), _resource("r2")])
    request = SimpleNamespace(state=SimpleNamespace(openkms_jwt_payload={"sub": "u1"}))
    out = _run(list_data_resources(request, semantic_model_id="m1", db=db))
    assert [r.id for r in out.items] == ["r1", "r2"]


def test_granted_only_filters_to_resources_the_caller_may_query(monkeypatch):
    from app.api.data_resources import list_data_resources

    async def model_readable(_db, _payload, _sub, _rt, _rid, _required):
        return True

    async def granted(_db, _payload, _sub, resource_id, _required):
        return resource_id == "r1"

    monkeypatch.setattr("app.api.data_resources.check_resource_access", model_readable)
    monkeypatch.setattr("app.api.data_resources.check_data_resource_access", granted)

    db = _RowsDB([_resource("r1"), _resource("r2")])
    request = SimpleNamespace(state=SimpleNamespace(openkms_jwt_payload={"sub": "u1"}))
    out = _run(
        list_data_resources(request, semantic_model_id="m1", granted_only=True, db=db)
    )
    assert [r.id for r in out.items] == ["r1"]


def test_listing_a_model_the_caller_cannot_open_is_forbidden(monkeypatch):
    from app.api.data_resources import list_data_resources

    async def denied(_db, _payload, _sub, _rt, _rid, _required):
        return False

    monkeypatch.setattr("app.api.data_resources.check_resource_access", denied)

    db = _RowsDB([_resource("r1")])
    request = SimpleNamespace(state=SimpleNamespace(openkms_jwt_payload={"sub": "u1"}))
    with pytest.raises(HTTPException) as excinfo:
        _run(list_data_resources(request, semantic_model_id="m1", db=db))
    assert excinfo.value.status_code == 403
