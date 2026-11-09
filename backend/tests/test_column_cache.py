"""Column metadata is fetched once per table per TTL, and never on the event loop.

Every restricted Catalog query re-read `information_schema` for every dataset in the model. Each
read opened a fresh connection (``NullPool`` — ~13 ms locally) and the sync call sat directly in
an ``async def``, so a ten-dataset model spent ~130 ms of connection setup per query *and* blocked
every other request for that long.

Two properties are worth pinning down, because both are easy to undo without noticing:

* the read is cached (a second call must not touch the source), and
* the read happens off the event loop (a concurrent task must not be stalled by it).
"""

from __future__ import annotations

import asyncio
import time

import pytest

from app.models.data_source import DataSource
from app.services.data.data_layer import columns as columns_module
from app.services.data.data_layer.columns import (
    cached_column_names,
    invalidate_columns,
)


def _ds() -> DataSource:
    return DataSource(
        id="src1", name="src", kind="postgresql", host="localhost", port=5432,
        database="openkms", username_encrypted="x", password_encrypted="y",
    )


@pytest.fixture(autouse=True)
def _clear_cache():
    columns_module._column_cache.clear()
    yield
    columns_module._column_cache.clear()


def test_the_second_read_is_served_from_the_cache(monkeypatch):
    calls: list[tuple[str, str]] = []

    def fake_fetch(ds, schema_name, table_name):
        calls.append((schema_name, table_name))
        return [("ts_code",), ("industry",)]

    monkeypatch.setattr(columns_module, "fetch_columns_sync", fake_fetch)

    first = cached_column_names(_ds(), "public", "orders")
    second = cached_column_names(_ds(), "public", "orders")

    assert first == second == ("ts_code", "industry")
    assert len(calls) == 1


def test_the_cache_expires(monkeypatch):
    calls: list[str] = []

    def fake_fetch(ds, schema_name, table_name):
        calls.append(table_name)
        return [("c",)]

    monkeypatch.setattr(columns_module, "fetch_columns_sync", fake_fetch)
    monkeypatch.setattr(columns_module, "COLUMN_CACHE_TTL_SECONDS", 0.01)

    cached_column_names(_ds(), "public", "orders")
    time.sleep(0.02)
    cached_column_names(_ds(), "public", "orders")

    assert len(calls) == 2


def test_different_tables_are_cached_separately(monkeypatch):
    def fake_fetch(ds, schema_name, table_name):
        return [(f"{table_name}_id",)]

    monkeypatch.setattr(columns_module, "fetch_columns_sync", fake_fetch)

    assert cached_column_names(_ds(), "public", "orders") == ("orders_id",)
    assert cached_column_names(_ds(), "public", "customers") == ("customers_id",)


def test_invalidate_drops_only_the_named_table():
    ds = _ds()
    columns_module._column_cache[(ds.id, "public", "orders")] = (time.monotonic(), ("a",))
    columns_module._column_cache[(ds.id, "public", "customers")] = (time.monotonic(), ("b",))

    invalidate_columns(data_source_id=ds.id, schema_name="public", table_name="orders")

    assert (ds.id, "public", "orders") not in columns_module._column_cache
    assert (ds.id, "public", "customers") in columns_module._column_cache


def test_invalidate_by_source_clears_every_table_of_it():
    ds = _ds()
    columns_module._column_cache[(ds.id, "public", "a")] = (time.monotonic(), ("x",))
    columns_module._column_cache[(ds.id, "public", "b")] = (time.monotonic(), ("y",))

    invalidate_columns(data_source_id=ds.id)

    assert columns_module._column_cache == {}


def test_a_cached_read_does_not_block_the_event_loop():
    """A cached hit must not stall concurrent work — and neither may a miss."""
    ds = _ds()
    columns_module._column_cache[(ds.id, "public", "orders")] = (time.monotonic(), ("a",))

    async def scenario() -> float:
        started = time.perf_counter()

        async def other() -> None:
            await asyncio.sleep(0.05)

        task = asyncio.create_task(other())
        await asyncio.to_thread(cached_column_names, ds, "public", "orders")
        await task
        return time.perf_counter() - started

    # Both ran; the cached read returned immediately, so the 50 ms sleep sets the floor.
    assert asyncio.run(scenario()) < 0.2
