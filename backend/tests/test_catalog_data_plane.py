"""The Catalog data plane is decided by resource grants, not by an operation key.

These tests pin the split that motivated the change: `data:read` means "may use the Data Model
feature"; it must not decide whether a caller can read rows, and a public model must answer
any authenticated caller regardless of which feature keys they hold.
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.models.data_resource import DataResource
from app.models.semantic_model import SemanticModel
from app.services.identity.acl.resource_acl_constants import PERM_READ, RT_DATA_RESOURCE
from app.services.data_layer.catalog_access import resolve_catalog_scope


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


@pytest.fixture(autouse=True)
def _model_sharing_open(monkeypatch):
    """Model-level sharing is a separate gate; these cases are about the row scope."""

    async def allowed(*_args, **_kwargs):
        return True

    monkeypatch.setattr("app.api.catalog_scoped.check_resource_access", allowed)


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


def test_has_a_model_grant_helper_is_gone():
    """The metadata gate must not consult data resources; the helper that did is removed."""
    from app.services.data_layer import catalog_access

    assert not hasattr(catalog_access, "has_model_grant")


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
    from app.services.identity.acl.resource_acl_constants import SECURABLE_RESOURCE_TYPES

    assert RT_DATA_RESOURCE in SECURABLE_RESOURCE_TYPES
    assert PERM_READ == 1


class _ModelRowsDB:
    """`execute(...)` answering by the entity the statement selects.

    `readable_model_ids` selects whole `SemanticModel` rows; `has_model_grant` selects
    `DataResource.id`. The fake inspects the statement rather than guessing from call order, so
    it exercises the real `is_restricted` predicate instead of re-spelling it here.
    """

    def __init__(self, rows: list[tuple[str, str | None]], resource_ids: list[str] | None = None):
        from app.models.semantic_model import SemanticModel

        self._models = [
            SemanticModel(id=model_id, name=model_id, access_mode=mode or "public")
            for model_id, mode in rows
        ]
        self._resource_ids = resource_ids or []

    async def execute(self, stmt):
        from app.models.access_group import AccessGroupMember
        from app.models.data_resource import DataResource
        from app.models.resource_acl import ResourceAclEntry

        entity = (stmt.column_descriptions or [{}])[0].get("entity")
        if entity is AccessGroupMember:
            values = []
        elif entity is ResourceAclEntry:
            values = []
        elif entity is DataResource:
            values = self._resource_ids
        else:
            values = self._models

        class _Result:
            def all(self):
                return list(values)

            def scalars(self):
                class _Scalars:
                    def all(_self):
                        return list(values)

                return _Scalars()

        return _Result()


def test_readable_model_ids_includes_every_model_sharing_allows(no_grant):
    """Opening a model is decided by model sharing alone — the row scope does not hide it.

    A restricted model still appears: the caller may read its metrics and relationships, and is
    told which data resources exist. What they cannot do without a grant is read rows, which the
    data plane enforces per call.
    """
    from app.api.catalog_scoped import readable_model_ids

    db = _ModelRowsDB([("m1", "public"), ("m2", "restricted")], resource_ids=["r2"])
    assert _run(readable_model_ids(db, payload={"sub": "u1"}, sub="u1")) == {"m1", "m2"}


def test_readable_model_ids_still_hides_models_sharing_denies(monkeypatch):
    from app.api.catalog_scoped import readable_model_ids

    async def denied(*_args, **_kwargs):
        return False

    monkeypatch.setattr("app.api.catalog_scoped.check_resource_access", denied)

    db = _ModelRowsDB([("m1", "public"), ("m2", "restricted")])
    assert _run(readable_model_ids(db, payload={"sub": "u1"}, sub="u1")) == set()


def test_readable_model_ids_tolerates_a_null_access_mode():
    """Rows created before the column existed read as public, not as restricted."""
    from app.api.catalog_scoped import readable_model_ids

    db = _ModelRowsDB([("m1", None)])
    assert _run(readable_model_ids(db, payload={}, sub=None)) == {"m1"}


def test_a_restricted_model_opens_with_model_sharing_alone(monkeypatch):
    """Reading a restricted model's definition does not need a data-resource grant.

    This is the layering the two grant types are for: model sharing says who may open the model,
    a data resource says which rows they may read. Requiring both here made a model un-openable
    until somebody had already granted a slice of it — "look before you grant" was impossible.
    """
    from app.api.catalog_scoped import require_model_read
    from app.models.semantic_model import SemanticModel

    async def allowed(*_args, **_kwargs):
        return True

    monkeypatch.setattr("app.api.catalog_scoped.check_resource_access", allowed)

    class _DB:
        async def get(self, cls, key):
            return SemanticModel(id=key, name="Stock", access_mode="restricted")

    request = SimpleNamespace(state=SimpleNamespace(openkms_jwt_payload={"sub": "u1"}))
    # No exception: the row gate is not consulted on a metadata read.
    _run(require_model_read("m1", request, _DB()))


def test_a_public_model_still_honours_model_sharing(monkeypatch):
    """Model sharing is its own gate: `public` decides row scope, not who may open the model."""
    from app.api.catalog_scoped import require_model_read
    from app.models.semantic_model import SemanticModel

    async def denied(*_args, **_kwargs):
        return False

    monkeypatch.setattr("app.api.catalog_scoped.check_resource_access", denied)

    class _DB:
        async def get(self, cls, key):
            return SemanticModel(id=key, name="Stock", access_mode="public")

    request = SimpleNamespace(state=SimpleNamespace(openkms_jwt_payload={"sub": "u1"}))

    with pytest.raises(HTTPException) as excinfo:
        _run(require_model_read("m1", request, _DB()))
    assert excinfo.value.status_code == 403
    assert excinfo.value.detail["code"] == "MODEL_FORBIDDEN"


def test_a_model_granted_read_is_readable_even_when_public(monkeypatch):
    from app.api.catalog_scoped import require_model_read
    from app.models.semantic_model import SemanticModel

    async def allowed(*_args, **_kwargs):
        return True

    monkeypatch.setattr("app.api.catalog_scoped.check_resource_access", allowed)

    class _DB:
        async def get(self, cls, key):
            return SemanticModel(id=key, name="Stock", access_mode="public")

    request = SimpleNamespace(state=SimpleNamespace(openkms_jwt_payload={"sub": "u1"}))

    _run(require_model_read("m1", request, _DB()))  # no raise
