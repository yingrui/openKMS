"""The Catalog data plane is decided by resource grants, not by an operation key.

These tests pin the split that motivated the change: `data:read` means "may use the Data Model
feature"; it must not decide whether a caller can read rows, and a public model must answer
any authenticated caller regardless of which feature keys they hold.
"""

from __future__ import annotations

import asyncio

import pytest
from fastapi import HTTPException

from app.models.data_resource import DataResource
from app.models.semantic_model import SemanticModel
from app.services.acl.resource_acl_constants import PERM_READ, RT_DATA_RESOURCE
from app.services.data_layer.catalog_access import has_model_grant, resolve_catalog_scope


class _FakeDB:
    def __init__(self, models: list[SemanticModel], resources: list[DataResource]):
        self._rows = {**{m.id: m for m in models}, **{r.id: r for r in resources}}
        self._resource_ids = [r.id for r in resources]

    async def get(self, cls, key):
        row = self._rows.get(key)
        return row if isinstance(row, cls) else None

    async def execute(self, _stmt):
        ids = self._resource_ids

        class _Result:
            def scalars(self):
                return self

            def all(self):
                return list(ids)

        return _Result()


def _model(mode: str = "public", model_id: str = "m1") -> SemanticModel:
    return SemanticModel(id=model_id, name="Orders", access_mode=mode)


def _resource(resource_id: str = "r1", model_id: str = "m1") -> DataResource:
    return DataResource(
        id=resource_id, name="slice", semantic_model_id=model_id, row_policy=[]
    )


def _run(coro):
    return asyncio.run(coro)


@pytest.fixture
def no_grant(monkeypatch):
    async def fake(db, payload, subject, resource_id, required):
        return False

    monkeypatch.setattr(
        "app.services.data_layer.catalog_access.check_data_resource_access", fake
    )


@pytest.fixture
def grant(monkeypatch):
    async def fake(db, payload, subject, resource_id, required):
        return True

    monkeypatch.setattr(
        "app.services.data_layer.catalog_access.check_data_resource_access", fake
    )


def test_a_public_model_does_not_consult_the_grant(monkeypatch):
    """Public means public: no grant check, and an operation key is not consulted either."""

    async def explode(*_args, **_kwargs):
        raise AssertionError("a public model must not check resource grants")

    monkeypatch.setattr(
        "app.services.data_layer.catalog_access.check_data_resource_access", explode
    )
    model = _model("public")
    scope = _run(
        resolve_catalog_scope(
            _FakeDB([model], []), payload={"sub": "u1"}, sub="u1", model=model, resource_id=None
        )
    )
    assert scope.resource is None


def test_has_model_grant_is_false_without_a_grant(no_grant):
    db = _FakeDB([_model("restricted")], [_resource()])
    assert not _run(has_model_grant(db, payload={"sub": "u1"}, sub="u1", model_id="m1"))


def test_has_model_grant_is_true_with_a_grant(grant):
    db = _FakeDB([_model("restricted")], [_resource()])
    assert _run(has_model_grant(db, payload={"sub": "u1"}, sub="u1", model_id="m1"))


def test_an_anonymous_caller_never_has_a_model_grant(grant):
    db = _FakeDB([_model("restricted")], [_resource()])
    assert not _run(has_model_grant(db, payload={}, sub=None, model_id="m1"))


def test_restricted_query_without_a_resource_id_is_still_a_bad_request(no_grant):
    model = _model("restricted")
    with pytest.raises(HTTPException) as excinfo:
        _run(
            resolve_catalog_scope(
                _FakeDB([model], [_resource()]),
                payload={"sub": "u1"},
                sub="u1",
                model=model,
                resource_id=None,
            )
        )
    assert excinfo.value.status_code == 400
    assert excinfo.value.detail["code"] == "RESOURCE_REQUIRED"


def test_restricted_query_without_a_grant_is_forbidden(no_grant):
    model = _model("restricted")
    with pytest.raises(HTTPException) as excinfo:
        _run(
            resolve_catalog_scope(
                _FakeDB([model], [_resource()]),
                payload={"sub": "u1"},
                sub="u1",
                model=model,
                resource_id="r1",
            )
        )
    assert excinfo.value.status_code == 403


def test_the_data_resource_type_is_securable():
    from app.services.acl.resource_acl_constants import SECURABLE_RESOURCE_TYPES

    assert RT_DATA_RESOURCE in SECURABLE_RESOURCE_TYPES
    assert PERM_READ == 1


class _ModelRowsDB:
    """`execute(...)` serving both shapes these functions use.

    `readable_model_ids` asks for `.all()` of `(model_id, access_mode)`; `has_model_grant`
    asks for `.scalars().all()` of resource ids. One fake covers both.
    """

    def __init__(self, rows: list[tuple[str, str]], resource_ids: list[str] | None = None):
        self._rows = rows
        self._resource_ids = resource_ids or []

    async def execute(self, _stmt):
        rows = self._rows
        resource_ids = self._resource_ids

        class _Result:
            def all(self):
                return list(rows)

            def scalars(self):
                class _Scalars:
                    def all(_self):
                        return list(resource_ids)

                return _Scalars()

        return _Result()


def test_readable_model_ids_includes_every_public_model(no_grant):
    """A public model is readable without any grant — including by a caller with no keys."""
    from app.api.catalog_scoped import readable_model_ids

    db = _ModelRowsDB([("m1", "public"), ("m2", "restricted")])
    assert _run(readable_model_ids(db, payload={}, sub=None)) == {"m1"}


def test_readable_model_ids_adds_restricted_models_only_with_a_grant(grant):
    from app.api.catalog_scoped import readable_model_ids

    db = _ModelRowsDB([("m1", "public"), ("m2", "restricted")], resource_ids=["r2"])
    assert _run(readable_model_ids(db, payload={"sub": "u1"}, sub="u1")) == {"m1", "m2"}


def test_readable_model_ids_excludes_restricted_models_without_a_grant(no_grant):
    from app.api.catalog_scoped import readable_model_ids

    db = _ModelRowsDB([("m1", "public"), ("m2", "restricted")], resource_ids=["r2"])
    assert _run(readable_model_ids(db, payload={"sub": "u1"}, sub="u1")) == {"m1"}


def test_readable_model_ids_tolerates_a_null_access_mode():
    """Rows created before the column existed read as public, not as restricted."""
    from app.api.catalog_scoped import readable_model_ids

    db = _ModelRowsDB([("m1", None)])
    assert _run(readable_model_ids(db, payload={}, sub=None)) == {"m1"}
