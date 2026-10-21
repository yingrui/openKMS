"""Tests for Action edit-batch apply (create / modify / delete on object instances)."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.ontology import edit_apply_service
from app.services.ontology.edit_apply_service import apply_edit_batch_to_objects, extract_edits
from app.services.ontology import execution_service


def test_extract_edits():
    assert extract_edits(None) == []
    assert extract_edits({"result": 1}) == []
    assert extract_edits({"edits": [{"op": "modify"}]}) == [{"op": "modify"}]


def test_apply_modify_merges_properties():
    async def _run() -> None:
        ot = SimpleNamespace(id="ot-wi", name="WorkItem")
        inst = SimpleNamespace(
            id="wi-1",
            object_type_id="ot-wi",
            data={"title": "Card", "status": "backlog"},
        )

        db = AsyncMock()

        async def fake_execute(stmt):
            r = MagicMock()
            r.scalar_one_or_none.return_value = ot
            return r

        async def fake_get(model, pk):
            if pk == "wi-1":
                return inst
            return None

        db.execute = fake_execute
        db.get = fake_get

        result = await apply_edit_batch_to_objects(
            db,
            [
                {
                    "op": "modify",
                    "object_type": "WorkItem",
                    "primary_key": "wi-1",
                    "properties": {"status": "done"},
                }
            ],
            allowed_object_type_id="ot-wi",
        )
        assert result.modified_ids == ["wi-1"]
        assert inst.data == {"title": "Card", "status": "done"}
        assert result.errors == []

    asyncio.run(_run())


def test_apply_rejects_unknown_instance():
    async def _run() -> None:
        ot = SimpleNamespace(id="ot-wi", name="WorkItem")
        db = AsyncMock()

        async def fake_execute(stmt):
            r = MagicMock()
            r.scalar_one_or_none.return_value = ot
            return r

        db.execute = fake_execute
        db.get = AsyncMock(return_value=None)

        result = await apply_edit_batch_to_objects(
            db,
            [
                {
                    "op": "modify",
                    "object_type": "WorkItem",
                    "primary_key": "missing",
                    "properties": {"status": "done"},
                }
            ],
            allowed_object_type_id="ot-wi",
        )
        assert result.modified_ids == []
        assert any("not found" in e for e in result.errors)

    asyncio.run(_run())


def test_apply_create_adds_instance():
    async def _run() -> None:
        ot = SimpleNamespace(id="ot-wi", name="WorkItem")
        db = AsyncMock()
        added: list[object] = []

        async def fake_execute(stmt):
            r = MagicMock()
            r.scalar_one_or_none.return_value = ot
            return r

        db.execute = fake_execute
        db.get = AsyncMock(return_value=None)
        db.add = lambda obj: added.append(obj)

        result = await apply_edit_batch_to_objects(
            db,
            [
                {
                    "op": "create",
                    "object_type": "WorkItem",
                    "primary_key": "wi-new",
                    "properties": {"title": "New", "status": "backlog"},
                }
            ],
            allowed_object_type_id="ot-wi",
        )
        assert result.created_ids == ["wi-new"]
        assert len(added) == 1
        assert added[0].id == "wi-new"
        assert added[0].data == {"title": "New", "status": "backlog"}
        assert result.errors == []

    asyncio.run(_run())


def test_apply_create_generates_primary_key_when_omitted():
    async def _run() -> None:
        ot = SimpleNamespace(id="ot-wi", name="WorkItem")
        db = AsyncMock()
        added: list[object] = []

        async def fake_execute(stmt):
            r = MagicMock()
            r.scalar_one_or_none.return_value = ot
            return r

        db.execute = fake_execute
        db.get = AsyncMock(return_value=None)
        db.add = lambda obj: added.append(obj)

        result = await apply_edit_batch_to_objects(
            db,
            [{"op": "create", "object_type": "WorkItem", "properties": {"title": "Auto"}}],
            allowed_object_type_id="ot-wi",
        )
        assert len(result.created_ids) == 1
        assert result.created_ids[0]
        assert added[0].id == result.created_ids[0]

    asyncio.run(_run())


def test_apply_delete_removes_instance():
    async def _run() -> None:
        ot = SimpleNamespace(id="ot-wi", name="WorkItem")
        inst = SimpleNamespace(id="wi-1", object_type_id="ot-wi", data={})
        db = AsyncMock()

        async def fake_execute(stmt):
            r = MagicMock()
            r.scalar_one_or_none.return_value = ot
            return r

        db.execute = fake_execute
        db.get = AsyncMock(return_value=inst)
        db.delete = AsyncMock()

        result = await apply_edit_batch_to_objects(
            db,
            [{"op": "delete", "object_type": "WorkItem", "primary_key": "wi-1"}],
            allowed_object_type_id="ot-wi",
        )
        assert result.deleted_ids == ["wi-1"]
        db.delete.assert_awaited_once_with(inst)
        assert result.errors == []

    asyncio.run(_run())


def test_apply_skips_unknown_ops():
    async def _run() -> None:
        db = AsyncMock()
        result = await apply_edit_batch_to_objects(
            db,
            [{"op": "link_create", "object_type": "WorkItem"}],
        )
        assert result.skipped
        assert result.created_ids == []

    asyncio.run(_run())


def test_execute_action_applies_edits_on_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _run() -> None:
        at = SimpleNamespace(id="at-1", object_type_id="ot-wi")
        fn = SimpleNamespace(id="fn-1", api_name="moveDone")
        ver = SimpleNamespace(id="fnv-1", version=1, entrypoint="execute", source_code="x")

        outcome = execution_service.ExecutionOutcome(
            status="ok",
            output={
                "edits": [
                    {
                        "op": "modify",
                        "object_type": "WorkItem",
                        "primary_key": "wi-1",
                        "properties": {"status": "done"},
                    }
                ]
            },
            error=None,
            duration_ms=12,
        )

        async def fake_run_ofs(**_kw):
            return outcome

        async def fake_apply(db, edits, *, allowed_object_type_id=None):
            return edit_apply_service.EditApplyResult(modified_ids=["wi-1"])

        monkeypatch.setattr(execution_service, "_run_ofs", fake_run_ofs)
        monkeypatch.setattr(execution_service, "apply_edit_batch_to_objects", fake_apply)
        monkeypatch.setattr(
            execution_service,
            "sync_edit_apply_result_to_neo4j",
            AsyncMock(),
        )

        db = AsyncMock()
        db.get = AsyncMock(return_value=SimpleNamespace(id="ot-wi", dataset_id=None, name="WorkItem"))
        resp = await execution_service.execute_action_and_audit(
            db,
            at,
            fn,
            ver,
            input_payload={"object_id": "wi-1"},
            object_id="wi-1",
            caller_user_id="u1",
            caller_token="tok",
        )
        assert resp.status == "ok"
        assert resp.applied == {
            "created_ids": [],
            "modified_ids": ["wi-1"],
            "deleted_ids": [],
            "skipped": [],
            "errors": [],
        }
        db.add.assert_called()
        db.commit.assert_called()

    asyncio.run(_run())


def test_apply_rejects_dataset_backed_type():
    async def _run() -> None:
        ot = SimpleNamespace(id="ot-stock", name="Stock", dataset_id="ds-1")
        db = AsyncMock()

        async def fake_execute(stmt):
            r = MagicMock()
            r.scalar_one_or_none.return_value = ot
            return r

        db.execute = fake_execute
        result = await apply_edit_batch_to_objects(
            db,
            [
                {
                    "op": "create",
                    "object_type": "Stock",
                    "properties": {"name": "x"},
                }
            ],
            allowed_object_type_id="ot-stock",
        )
        assert result.created_ids == []
        assert any("dataset-backed" in e for e in result.errors)

    asyncio.run(_run())


def test_execute_action_no_edits_noop(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _run() -> None:
        at = SimpleNamespace(id="at-1", object_type_id="ot-wi")
        fn = SimpleNamespace(id="fn-1", api_name="suggest")
        ver = SimpleNamespace(id="fnv-1", version=1, entrypoint="execute", source_code="x")

        async def fake_run_ofs(**_kw):
            return execution_service.ExecutionOutcome(
                status="ok",
                output={"priority": "high"},
                error=None,
                duration_ms=5,
            )

        monkeypatch.setattr(execution_service, "_run_ofs", fake_run_ofs)

        db = AsyncMock()
        resp = await execution_service.execute_action_and_audit(
            db,
            at,
            fn,
            ver,
            input_payload={},
            object_id=None,
            caller_user_id=None,
            caller_token="tok",
        )
        assert resp.status == "ok"
        assert resp.applied is None

    asyncio.run(_run())


# --- dataset-backed types: modify yes, create/delete no ----------------------
def _dataset_type_harness(props: dict):
    ot = SimpleNamespace(id="ot-holding", name="Holding", dataset_id="ds-1", key_property="id",
                         properties=[{"name": k, "type": "string"} for k in props])

    class _Db:
        def __init__(self):
            self.rows: dict[str, SimpleNamespace] = {}

        async def get(self, model, pk):
            if model.__name__ == "ObjectType":
                return ot
            return self.rows.get(pk)

        async def execute(self, stmt):
            r = MagicMock()
            r.scalar_one_or_none.return_value = ot
            return r

        def add(self, row):
            self.rows[row.id] = row

        async def flush(self):
            pass

    return ot, _Db()


def test_a_modify_on_a_dataset_backed_type_is_an_overlay_edit(monkeypatch):
    """The object's id is the business key, so the merged node is the one the table owns."""
    from app.services.ontology import edit_apply_service as svc

    ot, db = _dataset_type_harness({"id": "", "target_weight": ""})

    async def fake_fetch(_db, _ot, object_id):
        return {"id": object_id, "target_weight": 0.01}

    monkeypatch.setattr(svc, "fetch_object_from_neo4j", fake_fetch)

    async def _run():
        return await svc.apply_edit_batch_to_objects(
            db,
            [{"op": "modify", "object_type": "Holding", "primary_key": "h-1",
              "properties": {"target_weight": 0.05}}],
        )

    result = asyncio.run(_run())
    assert result.errors == []
    assert result.modified_ids == ["h-1"]
    assert db.rows["h-1"].data["target_weight"] == 0.05


def test_create_and_delete_on_a_dataset_backed_type_point_at_the_owner():
    from app.services.ontology import edit_apply_service as svc

    _, db = _dataset_type_harness({"id": ""})

    async def _run():
        return (
            await svc.apply_edit_batch_to_objects(
                db, [{"op": "create", "object_type": "Holding", "properties": {"id": "x"}}]
            ),
            await svc.apply_edit_batch_to_objects(
                db, [{"op": "delete", "object_type": "Holding", "primary_key": "h-1"}]
            ),
        )

    created, deleted = asyncio.run(_run())
    for result, op in ((created, "create"), (deleted, "delete")):
        assert result.errors
        assert f"cannot {op} an object of dataset-backed type" in result.errors[0]
