"""Dataset-join validation tests (early checks run before any DB access)."""
import asyncio

import pytest

from app.services.data_layer.joins import CARDINALITIES, JoinValidationError, validate_join


def _validate(**kw):
    return asyncio.run(validate_join(None, **kw))


def test_cardinalities_are_declared():
    assert CARDINALITIES == ("one-to-one", "one-to-many")


def test_rejects_same_source_and_target():
    with pytest.raises(JoinValidationError):
        _validate(
            source_dataset_id="a",
            target_dataset_id="a",
            cardinality="one-to-many",
            join_columns=[{"source": "x", "target": "y"}],
        )


def test_rejects_unknown_cardinality():
    with pytest.raises(JoinValidationError):
        _validate(
            source_dataset_id="a",
            target_dataset_id="b",
            cardinality="many-to-many",
            join_columns=[{"source": "x", "target": "y"}],
        )


def test_rejects_empty_columns():
    with pytest.raises(JoinValidationError):
        _validate(
            source_dataset_id="a",
            target_dataset_id="b",
            cardinality="one-to-one",
            join_columns=[],
        )
