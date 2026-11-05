"""Catalog access resolution: public vs gated models, resource grants, row scope.

The rule this file pins down: a **gated** model is reachable only with a `resource_id` and a
read grant, and there is no admin escape hatch. Everything else is a 400/403/404.
"""

from __future__ import annotations

import asyncio

import pytest
from fastapi import HTTPException

from app.models.data_resource import DataResource
from app.models.semantic_model import SemanticModel
from app.services.data_layer.catalog_access import (
    ACCESS_GATED,
    ACCESS_PUBLIC,
    resolve_catalog_scope,
)


class _FakeDB:
    """Just enough `db.get`: resources and models by id."""

    def __init__(self, *, model: SemanticModel, resources: list[DataResource]):
        self._model = model
        self._by_id = {model.id: model, **{r.id: r for r in resources}}

    async def get(self, model_cls, key):
        row = self._by_id.get(key)
        return row if isinstance(row, model_cls) else None


def _model(mode: str = ACCESS_PUBLIC) -> SemanticModel:
    return SemanticModel(id="m1", name="Orders", access_mode=mode)


def _resource(policy: list[dict] | None = None, *, model_id: str = "m1") -> DataResource:
    return DataResource(
        id="r1",
        name="华东订单",
        semantic_model_id=model_id,
        base_dataset_id="ds1",
        row_policy=policy or [],
    )


USER = {"sub": "u1", "preferred_username": "u1"}


def _run(coro):
    return asyncio.run(coro)


def _patched_check(monkeypatch, allowed: bool):
    async def fake_check(db, payload, subject, resource_id, required):
        return allowed

    monkeypatch.setattr(
        "app.services.data_layer.catalog_access.check_data_resource_access", fake_check
    )


def test_a_public_model_needs_no_resource(monkeypatch):
    db = _FakeDB(model=_model(ACCESS_PUBLIC), resources=[])
    scope = _run(
        resolve_catalog_scope(db, payload=USER, sub="u1", model=_model(), resource_id=None)
    )
    assert scope.resource is None
    assert scope.base_conditions == []


def test_a_public_model_ignores_a_resource_id(monkeypatch):
    resource = _resource([{"column": "region", "op": "=", "value": "east"}])
    db = _FakeDB(model=_model(ACCESS_PUBLIC), resources=[resource])
    scope = _run(
        resolve_catalog_scope(db, payload=USER, sub="u1", model=_model(), resource_id="r1")
    )
    # Public means open: a resource id must not quietly narrow it.
    assert scope.resource is None


def test_a_gated_model_without_a_resource_id_is_a_bad_request(monkeypatch):
    model = _model(ACCESS_GATED)
    db = _FakeDB(model=model, resources=[])
    with pytest.raises(HTTPException) as excinfo:
        _run(resolve_catalog_scope(db, payload=USER, sub="u1", model=model, resource_id=None))
    assert excinfo.value.status_code == 400
    assert excinfo.value.detail["code"] == "RESOURCE_REQUIRED"


def test_a_gated_model_rejects_a_resource_from_another_model(monkeypatch):
    model = _model(ACCESS_GATED)
    other = _resource(model_id="m2")
    db = _FakeDB(model=model, resources=[other])
    with pytest.raises(HTTPException) as excinfo:
        _run(resolve_catalog_scope(db, payload=USER, sub="u1", model=model, resource_id="r1"))
    assert excinfo.value.status_code == 404


def test_a_gated_model_requires_a_read_grant(monkeypatch):
    model = _model(ACCESS_GATED)
    db = _FakeDB(model=model, resources=[_resource()])
    _patched_check(monkeypatch, allowed=False)
    with pytest.raises(HTTPException) as excinfo:
        _run(resolve_catalog_scope(db, payload=USER, sub="u1", model=model, resource_id="r1"))
    assert excinfo.value.status_code == 403
    assert excinfo.value.detail["code"] == "RESOURCE_FORBIDDEN"


def test_an_admin_without_a_grant_is_still_denied(monkeypatch):
    """Platform admin may configure grants; it does not imply data access."""
    model = _model(ACCESS_GATED)
    db = _FakeDB(model=model, resources=[_resource()])
    _patched_check(monkeypatch, allowed=False)
    admin = {"sub": "root", "realm_access": {"roles": ["admin"]}}
    with pytest.raises(HTTPException) as excinfo:
        _run(resolve_catalog_scope(db, payload=admin, sub="root", model=model, resource_id="r1"))
    assert excinfo.value.status_code == 403


def test_a_granted_resource_renders_its_row_policy_on_the_base_alias(monkeypatch):
    model = _model(ACCESS_GATED)
    db = _FakeDB(
        model=model,
        resources=[_resource([{"column": "region", "op": "=", "value": "east"}])],
    )
    _patched_check(monkeypatch, allowed=True)
    scope = _run(
        resolve_catalog_scope(db, payload=USER, sub="u1", model=model, resource_id="r1")
    )
    assert scope.base_conditions == ['base."region" = :rp0']
    assert scope.base_params == {"rp0": "east"}
    assert scope.policy_fingerprint


def test_a_claim_bound_policy_resolves_from_the_caller(monkeypatch):
    model = _model(ACCESS_GATED)
    db = _FakeDB(
        model=model,
        resources=[_resource([{"column": "org_id", "op": "=", "claim": "org_id"}])],
    )
    _patched_check(monkeypatch, allowed=True)
    caller = {**USER, "org_id": "acme"}
    scope = _run(
        resolve_catalog_scope(db, payload=caller, sub="u1", model=model, resource_id="r1")
    )
    assert scope.base_params == {"rp0": "acme"}
    assert scope.claims_used == ["org_id"]


def test_a_missing_claim_is_a_forbidden_call_not_an_unfiltered_query(monkeypatch):
    model = _model(ACCESS_GATED)
    db = _FakeDB(
        model=model,
        resources=[_resource([{"column": "org_id", "op": "=", "claim": "org_id"}])],
    )
    _patched_check(monkeypatch, allowed=True)
    with pytest.raises(HTTPException) as excinfo:
        _run(resolve_catalog_scope(db, payload=USER, sub="u1", model=model, resource_id="r1"))
    assert excinfo.value.status_code == 403
    assert excinfo.value.detail["code"] == "ROW_POLICY_CLAIM_MISSING"


def test_an_anonymous_caller_cannot_use_a_gated_model(monkeypatch):
    model = _model(ACCESS_GATED)
    db = _FakeDB(model=model, resources=[_resource()])
    _patched_check(monkeypatch, allowed=True)
    with pytest.raises(HTTPException) as excinfo:
        _run(resolve_catalog_scope(db, payload={}, sub=None, model=model, resource_id="r1"))
    assert excinfo.value.status_code == 403
