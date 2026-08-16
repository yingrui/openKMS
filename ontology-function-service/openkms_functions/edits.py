"""Ontology edit batch helpers (Palantir @osdk/functions Edits analogue).

Functions that declare ``@function(edits=[...])`` should return a list of edit
dicts (or call ``batch.get_edits()``). Action execute applies ``create`` /
``modify`` / ``delete`` ops onto resolvable object instances.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class OntologyEdit:
    op: str
    object_type: str
    primary_key: str | None = None
    properties: dict[str, Any] = field(default_factory=dict)


class EditBatch:
    def __init__(self) -> None:
        self._edits: list[dict[str, Any]] = []

    def create(
        self,
        object_type: str | Any,
        *,
        primary_key: str | None = None,
        **properties: Any,
    ) -> None:
        """Queue an object create. Omit ``primary_key`` to let Action apply assign a UUID."""
        api_name = object_type if isinstance(object_type, str) else getattr(object_type, "api_name", str(object_type))
        edit: dict[str, Any] = {
            "op": "create",
            "object_type": api_name,
            "properties": properties,
        }
        if primary_key is not None and str(primary_key).strip():
            edit["primary_key"] = str(primary_key).strip()
        self._edits.append(edit)

    def modify(self, object_type: str | Any, *, primary_key: str, **properties: Any) -> None:
        api_name = object_type if isinstance(object_type, str) else getattr(object_type, "api_name", str(object_type))
        self._edits.append(
            {
                "op": "modify",
                "object_type": api_name,
                "primary_key": primary_key,
                "properties": properties,
            }
        )

    def delete(self, object_type: str | Any, *, primary_key: str) -> None:
        api_name = object_type if isinstance(object_type, str) else getattr(object_type, "api_name", str(object_type))
        self._edits.append(
            {
                "op": "delete",
                "object_type": api_name,
                "primary_key": primary_key,
            }
        )

    def get_edits(self) -> list[dict[str, Any]]:
        return list(self._edits)


def create_edit_batch() -> EditBatch:
    return EditBatch()
