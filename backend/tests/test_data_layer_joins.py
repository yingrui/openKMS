"""Relationship validation tests (early checks run before any DB access)."""
import asyncio

import pytest

from app.models.dataset import Dataset
from app.services.data_layer.joins import (
    JoinValidationError,
    _declared_keys,
    validate_join,
)


def _validate(**kw):
    return asyncio.run(validate_join(None, **kw))


def _dataset(**kw) -> Dataset:
    base = dict(id="d", data_source_id="ds", schema_name="s", table_name="t")
    base.update(kw)
    return Dataset(**base)


def test_declared_keys_collects_pk_and_unique_keys():
    d = _dataset(primary_key_columns=["a"], unique_keys=[["b", "c"], []])
    assert _declared_keys(d) == [{"a"}, {"b", "c"}]


def test_declared_keys_empty_when_none():
    assert _declared_keys(_dataset()) == []


def test_rejects_same_from_and_to():
    with pytest.raises(JoinValidationError):
        _validate(from_dataset_id="a", to_dataset_id="a", from_columns=["x"], to_columns=["y"])


def test_rejects_empty_columns():
    with pytest.raises(JoinValidationError):
        _validate(from_dataset_id="a", to_dataset_id="b", from_columns=[], to_columns=[])


def test_rejects_misaligned_columns():
    with pytest.raises(JoinValidationError):
        _validate(from_dataset_id="a", to_dataset_id="b", from_columns=["x", "y"], to_columns=["u"])
