"""Chamber apps: the rules the registry enforces, and the lifecycle it no longer has.

No database and no HTTP here — the service functions take a session, and what they decide (409, 400, what a response
carries) is the whole surface. The proxy and its session-cookie rule live in `test_cluster_service_proxy.py`.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.schemas.chamber import ChamberBindings, ChamberCreate, ChamberUpdate
from app.services.runtime.chamber import service as chamber

CLUSTER_ID = "c1"
BINDINGS = {
    "k8s": {"cluster_id": CLUSTER_ID, "namespace": "mlops-hub", "service": "forecast", "port": 8000}
}


class FakeDb:
    """Just the session verbs the service uses, and one row per `get`."""

    def __init__(self, cluster=True, api_name_taken=False):
        self.cluster = cluster
        self.api_name_taken = api_name_taken
        self.added: list = []
        self.deleted: list = []
        self.commits = 0

    async def get(self, _model, _pk):
        return SimpleNamespace(id=CLUSTER_ID) if self.cluster else None

    async def execute(self, _stmt):
        return SimpleNamespace(
            scalar_one_or_none=lambda: "oa-taken" if self.api_name_taken else None
        )

    def add(self, row):
        self.added.append(row)

    async def flush(self):
        return None

    async def commit(self):
        self.commits += 1

    async def refresh(self, _row):
        return None

    async def delete(self, row):
        self.deleted.append(row)


def _create(**over):
    body = {
        "name": "Forecast",
        "api_name": "forecast",
        "bindings": ChamberBindings(**BINDINGS),
    }
    body.update(over)
    return ChamberCreate(**body)


def _app(**over):
    row = {
        "id": "oa-1",
        "name": "Forecast",
        "api_name": "forecast",
        "description": None,
        "template_id": "module",
        "bindings": BINDINGS,
        "created_by": "u1",
        "created_by_name": "yingrui",
        "created_at": None,
        "updated_at": None,
    }
    row.update(over)
    return SimpleNamespace(**row)


class TestCreate:
    @pytest.mark.asyncio
    async def test_a_taken_api_name_is_a_conflict_not_a_database_error(self):
        db = FakeDb(api_name_taken=True)
        with pytest.raises(HTTPException) as exc:
            await chamber.create_app(db, _create(), created_by="u1", created_by_name="yingrui")
        assert exc.value.status_code == 409
        assert db.added == []

    @pytest.mark.asyncio
    async def test_bindings_are_required(self):
        db = FakeDb()
        with pytest.raises(HTTPException) as exc:
            await chamber.create_app(
                db, _create(bindings=None), created_by=None, created_by_name=None
            )
        assert exc.value.status_code == 400

    @pytest.mark.asyncio
    async def test_an_unknown_cluster_is_refused_before_anything_is_stored(self):
        db = FakeDb(cluster=False)
        with pytest.raises(HTTPException) as exc:
            await chamber.create_app(db, _create(), created_by=None, created_by_name=None)
        assert exc.value.status_code == 400
        assert "cluster" in exc.value.detail.lower()
        assert db.added == []

    @pytest.mark.asyncio
    async def test_a_registered_app_invents_no_lifecycle(self):
        db = FakeDb()
        app = await chamber.create_app(db, _create(), created_by="u1", created_by_name="yingrui")
        assert db.added == [app]
        assert "status" not in vars(app)
        assert app.template_id == "module"


class TestUpdate:
    @pytest.mark.asyncio
    async def test_bad_bindings_leave_the_old_ones_alone(self):
        db = FakeDb(cluster=False)
        app = _app()
        with pytest.raises(HTTPException) as exc:
            await chamber.update_app(
                db,
                app,
                ChamberUpdate(
                    bindings=ChamberBindings(
                        k8s={
                            "cluster_id": "gone",
                            "namespace": "ns",
                            "service": "svc",
                            "port": 80,
                        }
                    )
                ),
            )
        assert exc.value.status_code == 400
        assert app.bindings == BINDINGS
        assert db.commits == 0


class TestResponse:
    def test_the_document_has_no_lifecycle_vocabulary(self):
        body = chamber.to_response_base(_app(), stale=False, missing=[])
        assert "status" not in body
        assert "published_version_id" not in body
        assert body["bindings"] == BINDINGS

    def test_staleness_is_about_the_cluster_row(self):
        body = chamber.to_response_base(_app(), stale=True, missing=["k8s.cluster_id"])
        assert body["bindings_stale"] is True
        assert body["missing_bindings"] == ["k8s.cluster_id"]


class TestEnrichStale:
    @pytest.mark.asyncio
    async def test_a_missing_cluster_is_stale_and_names_the_binding(self):
        stale, missing = await chamber.enrich_stale(FakeDb(cluster=False), _app())
        assert stale is True
        assert missing == ["k8s.cluster_id"]

    @pytest.mark.asyncio
    async def test_a_present_cluster_is_not_stale(self):
        assert await chamber.enrich_stale(FakeDb(), _app()) == (False, [])

    @pytest.mark.asyncio
    async def test_bindings_without_a_cluster_are_stale(self):
        stale, missing = await chamber.enrich_stale(FakeDb(), _app(bindings={}))
        assert (stale, missing) == (True, ["k8s"])


class TestDelete:
    @pytest.mark.asyncio
    async def test_delete_removes_the_registration_only(self):
        db = FakeDb()
        app = _app()
        await chamber.delete_app(db, app)
        assert db.deleted == [app]
        assert db.commits == 1
