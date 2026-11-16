"""Relationship validation tests (early checks run before any DB access)."""
import asyncio

import pytest

from app.models.dataset import Dataset
from app.services.data.joins import (
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


class _ProfileResult:
    def __init__(self, profile):
        self._profile = profile

    def scalar_one_or_none(self):
        return self._profile


class _StubDb:
    def __init__(self, profile):
        self._profile = profile

    async def execute(self, *_args, **_kwargs):
        return _ProfileResult(self._profile)


def _profile(rows, distinct, nulls=0):
    import datetime as dt

    from app.models.dataset_profile import DatasetProfile

    return DatasetProfile(
        id="p",
        dataset_id="t",
        row_count=rows,
        computed_at=dt.datetime.now(dt.timezone.utc),
        column_stats=[{"column": "sku_id", "distinct_count": distinct, "null_count": nulls}],
    )


def test_join_without_declared_key_needs_a_profile():
    """Uniqueness is what makes a join many-to-one; with nothing declared it can only come from the data."""
    from app.services.data.joins import _require_unique_target

    with pytest.raises(JoinValidationError, match="refresh the dataset's statistics"):
        asyncio.run(_require_unique_target(_StubDb(None), _dataset(display_name="商品"), ["sku_id"]))


def test_join_refuses_a_target_column_that_repeats():
    from app.services.data.joins import _require_unique_target

    with pytest.raises(JoinValidationError, match="would multiply rows"):
        asyncio.run(
            _require_unique_target(_StubDb(_profile(rows=100, distinct=80)), _dataset(), ["sku_id"])
        )


def test_join_accepts_a_unique_column_with_nulls():
    """`count(distinct)` ignores NULLs and a NULL never matches, so nulls do not break uniqueness."""
    from app.services.data.joins import _require_unique_target

    asyncio.run(
        _require_unique_target(
            _StubDb(_profile(rows=100, distinct=95, nulls=5)), _dataset(), ["sku_id"]
        )
    )


def test_join_refuses_a_composite_target_without_a_declared_key():
    from app.services.data.joins import _require_unique_target

    with pytest.raises(JoinValidationError, match="composite"):
        asyncio.run(
            _require_unique_target(_StubDb(_profile(rows=10, distinct=10)), _dataset(), ["a", "b"])
        )
