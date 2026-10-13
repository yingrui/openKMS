"""Row-edit service guardrails (early checks run before any DB access)."""
import asyncio

import pytest

from app.models.dataset import Dataset
from app.services.data_layer.dataset_rows_edit import RowEditError, apply_row_ops


def _dataset(**kw) -> Dataset:
    base = dict(id="d", data_source_id="ds", schema_name="s", table_name="t")
    base.update(kw)
    return Dataset(**base)


def _apply(dataset: Dataset, ops: list[dict]):
    return asyncio.run(apply_row_ops(None, dataset, ops))  # type: ignore[arg-type]


def test_rejects_non_editable_dataset():
    with pytest.raises(RowEditError, match="not editable"):
        _apply(_dataset(is_editable=False), [{"op": "insert", "values": {"a": 1}}])


def test_update_requires_primary_key():
    with pytest.raises(RowEditError, match="primary key"):
        _apply(
            _dataset(is_editable=True, primary_key_columns=[]),
            [{"op": "update", "pk": {"a": 1}, "values": {"b": 2}}],
        )


def test_delete_requires_primary_key():
    with pytest.raises(RowEditError, match="primary key"):
        _apply(
            _dataset(is_editable=True),
            [{"op": "delete", "pk": {"a": 1}}],
        )
