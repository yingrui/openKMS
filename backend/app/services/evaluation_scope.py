"""Evaluation resource ACL — thin aliases over ``resource_guard``."""

from __future__ import annotations

from app.models.evaluation import Evaluation
from app.services.resource_acl_constants import PERM_MANAGE, PERM_READ, PERM_WRITE, RT_EVALUATION
from app.services.resource_guard import (
    load_scoped_resource,
    require_manage,
    require_read,
    require_write,
    resource_allowed,
)

__all__ = [
    "evaluation_allowed",
    "load_evaluation_scoped",
    "require_evaluation_manage",
    "require_evaluation_read",
    "require_evaluation_write",
]


async def evaluation_allowed(db, request, evaluation_id: str, required: int) -> bool:
    return await resource_allowed(db, request, RT_EVALUATION, evaluation_id, required)


async def require_evaluation_read(db, request, ev: Evaluation) -> Evaluation:
    return await require_read(db, request, RT_EVALUATION, ev)


async def require_evaluation_write(db, request, ev: Evaluation) -> Evaluation:
    return await require_write(db, request, RT_EVALUATION, ev)


async def require_evaluation_manage(db, request, ev: Evaluation) -> Evaluation:
    return await require_manage(db, request, RT_EVALUATION, ev)


async def load_evaluation_scoped(
    db, request, evaluation_id: str, required: int = PERM_READ
) -> Evaluation:
    return await load_scoped_resource(db, request, RT_EVALUATION, evaluation_id, required)
