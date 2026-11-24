"""Who may read an object type's rows, and the honest answer when we cannot tell.

Object instances are read from the graph, which is a **mirror** of a dataset's rows, indexed once for everyone.
A dataset's row policy is per-caller, so the mirror cannot carry it: the same node is visible to one user and not
another. Until the policy can be compiled onto the node's properties (the next step), a type whose backing dataset
sits in a restricted model is refused rather than served unfiltered — a wrong *few* is recoverable, a silent leak
is not.

A type with no backing dataset (`object_instances`, hand-created) has no policy source, so it is readable.
"""

from __future__ import annotations

from fastapi import HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.object_type import ObjectType
from app.services.ontology.rules.scoping import restricted_models_for_dataset

#: The reason a caller sees when the object layer cannot honour a row policy yet.
POLICY_NOT_APPLIED = (
    "this object type's dataset belongs to a restricted model, and row policies are not applied to the "
    "object layer yet — read these rows from the dataset instead"
)


async def require_object_rows_readable(
    db: AsyncSession, request: Request, obj_type: ObjectType
) -> None:
    """Refuse when the type mirrors a dataset that a row policy would filter.

    `request` is accepted so the check can start honouring grants per caller in the next step without changing
    every call site; today the refusal is the same for everyone, which is the point.
    """
    if not obj_type.dataset_id:
        return
    restricted = await restricted_models_for_dataset(db, obj_type.dataset_id)
    if restricted:
        raise HTTPException(status_code=403, detail=POLICY_NOT_APPLIED)
