"""Relationship validation tests (early checks run before any DB access)."""
import asyncio

import pytest

from app.services.data_layer.joins import JOIN_TYPES, JoinValidationError, validate_join


def _validate(**kw):
    return asyncio.run(validate_join(None, **kw))


def test_join_types_are_declared():
    assert JOIN_TYPES == ("left", "inner", "right", "full")


def test_rejects_same_from_and_to():
    with pytest.raises(JoinValidationError):
        _validate(
            from_dataset_id="a",
            to_dataset_id="a",
            from_columns=["x"],
            to_columns=["y"],
            join_type="left",
        )


def test_rejects_unknown_join_type():
    with pytest.raises(JoinValidationError):
        _validate(
            from_dataset_id="a",
            to_dataset_id="b",
            from_columns=["x"],
            to_columns=["y"],
            join_type="many-to-many",
        )


def test_rejects_empty_columns():
    with pytest.raises(JoinValidationError):
        _validate(
            from_dataset_id="a",
            to_dataset_id="b",
            from_columns=[],
            to_columns=[],
            join_type="left",
        )


def test_rejects_misaligned_columns():
    with pytest.raises(JoinValidationError):
        _validate(
            from_dataset_id="a",
            to_dataset_id="b",
            from_columns=["x", "y"],
            to_columns=["u"],
            join_type="left",
        )
