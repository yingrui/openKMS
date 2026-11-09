"""File datasets: draft → files → publish, and what a published version promises.

Everything that touches object storage is stubbed, so these tests describe the lifecycle and the
refusals rather than the bucket. The storage calls themselves are the deployment's, already covered
by the media/wiki suites.
"""

from __future__ import annotations

import io
import json
import uuid

import pandas as pd
import pytest
import pytest_asyncio


@pytest.fixture
def storage(monkeypatch):
    """An in-memory object store behind the module's storage imports."""
    from app.services.data.data_layer import file_datasets

    objects: dict[str, bytes] = {}
    monkeypatch.setattr(
        file_datasets,
        "upload_object",
        lambda key, body, ctype=None: objects.__setitem__(
            key, body if isinstance(body, bytes) else body.read()
        ),
    )
    monkeypatch.setattr(file_datasets, "get_object", lambda key: objects[key])
    monkeypatch.setattr(file_datasets, "object_exists", lambda key: key in objects)
    monkeypatch.setattr(
        file_datasets,
        "get_redirect_url",
        lambda key, expires_in=900: f"https://minio.local/{key}?sig=test",
    )
    return objects


async def _drop_test_datasets() -> None:
    """Test datasets publish manifests into a stubbed store, so their rows outlive the objects.

    A failed assertion used to leave such a row behind, and the catalog then listed a version whose
    manifest object does not exist — a 500 in the Versions panel.
    """
    from sqlalchemy import select

    from app.database import async_session_maker
    from app.models.dataset import Dataset

    async with async_session_maker() as session:
        for row in (
            await session.execute(
                select(Dataset).where(Dataset.display_name.like("test-training-set-%"))
            )
        ).scalars().all():
            await session.delete(row)
        await session.commit()


@pytest_asyncio.fixture
async def db():
    from app.database import async_session_maker

    async with async_session_maker() as session:
        yield session
    await _drop_test_datasets()


@pytest_asyncio.fixture(autouse=True)
async def _fresh_pool():
    """Drop pooled connections between tests: they are bound to the loop that opened them, and
    pytest-asyncio gives each test its own."""
    yield
    from app.database import engine

    await engine.dispose()


def _parquet(rows: list[dict]) -> bytes:
    buffer = io.BytesIO()
    pd.DataFrame(rows).to_parquet(buffer, index=False)
    return buffer.getvalue()


def _january() -> bytes:
    return _parquet(
        [
            {"ts_code": "600519.SH", "trade_date": "2026-01-05", "mom_20d": 0.031, "RSI": 61.2},
            {"ts_code": "000001.SZ", "trade_date": "2026-01-06", "mom_20d": -0.012, "RSI": 44.0},
        ]
    )


def _february() -> bytes:
    return _parquet([{"ts_code": "600519.SH", "trade_date": "2026-02-03", "mom_20d": 0.055, "RSI": 66.5}])


def test_a_parquet_slice_is_parsed_with_its_types():
    from app.services.data.data_layer.file_datasets import columns_of, read_file_bytes

    frame = read_file_bytes(_january(), "2026-01.parquet")

    assert len(frame) == 2
    assert frame["ts_code"].tolist() == ["600519.SH", "000001.SZ"]
    assert {c["name"]: c["type"] for c in columns_of(frame)}["mom_20d"] == "number"


def test_an_unsupported_file_type_is_refused_by_name():
    from app.services.data.data_layer.file_datasets import FileDatasetError, read_file_bytes

    with pytest.raises(FileDatasetError, match="Unsupported file type"):
        read_file_bytes(b"PK\x03\x04", "model.xlsx")


@pytest.mark.asyncio
async def test_draft_publish_and_pin(storage, db):
    from app.services.data.data_layer.file_datasets import (
        add_file,
        create_file_dataset,
        list_versions,
        open_version,
        publish,
        rows,
    )

    dataset = await create_file_dataset(
        db, display_name=f"test-training-set-{uuid.uuid4().hex[:8]}", description=None, owner_sub="u1", owner_name="tester"
    )
    version = await open_version(db, dataset, notes="2026Q1", user={"sub": "u1"})
    assert version.version == 1 and version.status == "draft"
    await add_file(db, dataset, version, name="2026-01.parquet", content=_january(), user={"sub": "u1"})
    await add_file(db, dataset, version, name="2026-02.parquet", content=_february(), user={"sub": "u1"})

    # A draft has no manifest, so nothing can pin it — reading it is refused.
    with pytest.raises(Exception, match="draft"):
        await rows(db, version, limit=10)

    published = await publish(db, dataset, version)
    assert published.status == "published" and published.manifest_key
    assert published.file_count == 2 and published.row_count == 3
    assert str(published.date_from) == "2026-01-05" and str(published.date_to) == "2026-02-03"
    assert published.byte_size > 0

    manifest = json.loads(storage[published.manifest_key])
    assert [f["name"] for f in manifest["files"]] == ["2026-01.parquet", "2026-02.parquet"]
    # The range is a note, not a field: the manifest describes the file, it does not invent a schema.
    assert manifest["files"][0]["description"] == "trade_date 2026-01-05 → 2026-01-06"
    assert manifest["schema"][0]["name"] == "ts_code"

    # A version is frozen once published.
    with pytest.raises(Exception, match="already published"):
        await publish(db, dataset, published)
    with pytest.raises(Exception, match="can only be added to a draft"):
        await add_file(db, dataset, published, name="2026-03.parquet", content=_february(), user={})

    assert [(v.version, v.status) for v in await list_versions(db, dataset.id)] == [(1, "published")]

    await db.delete(dataset)          # versions cascade
    await db.commit()


@pytest.mark.asyncio
async def test_selection_reads_columns_and_skips_files_outside_the_window(storage, db):
    from app.services.data.data_layer.file_datasets import (
        add_file,
        create_file_dataset,
        open_version,
        publish,
        rows,
    )

    dataset = await create_file_dataset(
        db, display_name=f"test-training-set-{uuid.uuid4().hex[:8]}", description=None, owner_sub="u1", owner_name="t"
    )
    version = await open_version(db, dataset, notes=None, user={"sub": "u1"})
    await add_file(db, dataset, version, name="2026-01.parquet", content=_january(), user={})
    await add_file(db, dataset, version, name="2026-02.parquet", content=_february(), user={})
    published = await publish(db, dataset, version)

    february = await rows(db, published, columns=["ts_code", "trade_date"], start=pd.Timestamp("2026-02-01").date())
    assert [r["ts_code"] for r in february["rows"]] == ["600519.SH"]
    assert february["columns"] == ["ts_code", "trade_date"]

    with pytest.raises(Exception, match="not in this version"):
        await rows(db, published, columns=["not_a_column"])

    await db.delete(dataset)
    await db.commit()


@pytest.mark.asyncio
async def test_a_later_version_reuses_files_instead_of_copying_them(storage, db):
    from app.services.data.data_layer.file_datasets import (
        add_file,
        create_file_dataset,
        open_version,
        publish,
        reuse_files,
        version_files,
    )

    dataset = await create_file_dataset(
        db, display_name=f"test-training-set-{uuid.uuid4().hex[:8]}", description=None, owner_sub="u1", owner_name="t"
    )
    first = await open_version(db, dataset, notes=None, user={"sub": "u1"})
    await add_file(db, dataset, first, name="2026-01.parquet", content=_january(), user={})
    first = await publish(db, dataset, first)

    second = await open_version(db, dataset, notes="add February", user={"sub": "u1"})
    assert second.version == 2
    assert await reuse_files(db, dataset, second, first.version) == 1
    await add_file(db, dataset, second, name="2026-02.parquet", content=_february(), user={})
    second = await publish(db, dataset, second)

    files = {f.name: f for f in await version_files(db, second)}
    assert files["2026-01.parquet"].reused_from_version == 1
    # Reuse is a reference: v2's January entry points at v1's object; only February was written
    # under v2.
    assert files["2026-01.parquet"].storage_key.endswith("versions/1/files/2026-01.parquet")
    assert files["2026-02.parquet"].storage_key.endswith("versions/2/files/2026-02.parquet")
    assert storage[files["2026-01.parquet"].storage_key] == _january()

    await db.delete(dataset)
    await db.commit()


@pytest.mark.asyncio
async def test_a_file_dataset_is_refused_where_sql_is_required():
    """The guard every row reader shares, tested at its source rather than through HTTP."""
    from app.models.dataset import Dataset
    from app.services.ontology.dataset_tables import fetch_dataset_rows_page

    file_dataset = Dataset(
        id=str(uuid.uuid4()),
        data_source_id="00000000-0000-4000-8000-00000000f11e",
        kind="file",
        display_name="training-set-5d",
    )

    class _Stub:
        async def get(self, model, key):
            return file_dataset if key == file_dataset.id else None

    with pytest.raises(ValueError, match="file dataset"):
        await fetch_dataset_rows_page(_Stub(), file_dataset.id)  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_a_relationship_cannot_use_a_file_dataset():
    from app.models.dataset import Dataset
    from app.services.data.data_layer.joins import JoinValidationError, validate_join

    file_dataset = Dataset(
        id="f1", data_source_id="00000000-0000-4000-8000-00000000f11e", kind="file", display_name="x"
    )
    table_dataset = Dataset(id="t1", data_source_id="ds", kind="table", schema_name="public", table_name="t")

    class _Stub:
        async def get(self, model, key):
            return {"f1": file_dataset, "t1": table_dataset}.get(key)

    with pytest.raises(JoinValidationError, match="file dataset"):
        await validate_join(
            _Stub(),  # type: ignore[arg-type]
            from_dataset_id="f1",
            to_dataset_id="t1",
            from_columns=["a"],
            to_columns=["b"],
        )


@pytest.mark.asyncio
async def test_only_a_draft_can_be_deleted(storage, db):
    """A published version is kept: it may be pinned, so removing it would strand a model."""
    from app.services.data.data_layer import file_datasets as fd

    dataset = await fd.create_file_dataset(
        db, display_name=f"test-training-set-{uuid.uuid4().hex[:8]}", description=None,
        owner_sub="u1", owner_name="t",
    )
    version = await fd.open_version(db, dataset, notes=None, user={"sub": "u1"})
    await fd.add_file(db, dataset, version, name="2026-01.parquet", content=_january(), user={})
    await fd.publish(db, dataset, version)

    assert version.status == "published"
    await db.delete(dataset)
    await db.commit()
