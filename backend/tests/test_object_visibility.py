"""Object reads refuse a row-policied dataset instead of serving it unfiltered."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.services.explorer.object_visibility import POLICY_NOT_APPLIED, require_object_rows_readable


class _Session:
    def __init__(self, restricted: list[object]):
        self.restricted = restricted

    async def execute(self, _query):
        rows = self.restricted

        class _Result:
            def scalars(self):
                return self

            def all(self):
                return rows

        return _Result()


def test_a_type_without_a_dataset_has_no_policy_source():
    asyncio.run(require_object_rows_readable(_Session([]), None, SimpleNamespace(dataset_id=None)))


def test_a_dataset_in_a_public_model_is_readable():
    obj_type = SimpleNamespace(dataset_id="ds-public")
    asyncio.run(require_object_rows_readable(_Session([]), None, obj_type))


def test_a_restricted_model_refuses_the_read_and_says_why():
    obj_type = SimpleNamespace(dataset_id="ds-restricted")
    with pytest.raises(HTTPException) as exc:
        asyncio.run(require_object_rows_readable(_Session([SimpleNamespace(is_restricted=True)]), None, obj_type))
    assert exc.value.status_code == 403
    assert "not applied to the object layer" in exc.value.detail
    assert POLICY_NOT_APPLIED == exc.value.detail
