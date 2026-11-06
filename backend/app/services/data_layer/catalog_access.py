"""Catalog access: resolve a model (+ optional data resource) into an executable scope.

Two gates, both must pass:

1. **Layer 1** — the caller holds a Catalog operation key (`data:read`). Checked by the
   routes, not here.
2. **Layer 2** — when the model is `restricted`, the caller must present a `resource_id` and
   hold a **read grant** on that data resource. There is deliberately **no admin bypass**:
   JWT `admin` / `all` may configure grants but cannot read restricted data without one.

The resolved scope answers: which model, which resource, and which row conditions to inject
on the model's base table. Public models resolve to an empty scope (no injection).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_resource import DataResource
from app.models.semantic_model import SemanticModel
from app.services.acl.acl_context import acl_check_required
from app.services.acl.acl_resolve import effective_permissions
from app.services.acl.resource_acl_constants import (
    PERM_READ,
    RT_DATA_RESOURCE,
    perm_satisfies,
)
from app.services.data_layer.row_policy import (
    RowPolicyError,
    policy_conditions,
    policy_fingerprint,
)

ACCESS_PUBLIC = "public"
ACCESS_RESTRICTED = "restricted"
ACCESS_MODES = frozenset({ACCESS_PUBLIC, ACCESS_RESTRICTED})


@dataclass(frozen=True)
class CatalogScope:
    """What one Catalog call may read, after both gates passed."""

    model: SemanticModel
    resource: DataResource | None = None
    #: SQL conditions ANDed onto the base table (rendered from the resource's row policy).
    base_conditions: list[str] = field(default_factory=list)
    base_params: dict[str, Any] = field(default_factory=dict)
    claims_used: list[str] = field(default_factory=list)
    @property
    def resource_id(self) -> str | None:
        return self.resource.id if self.resource else None

    @property
    def policy_fingerprint(self) -> str | None:
        return policy_fingerprint(self.resource.row_policy) if self.resource else None


def _deny(status: int, code: str, detail: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": detail})


async def check_data_resource_access(
    db: AsyncSession,
    payload: dict,
    subject: str,
    resource_id: str,
    required: int,
) -> bool:
    """ACL check that **does not** skip service subjects.

    `check_resource_access` returns True for `local-cli` because content resources are reached
    through operations that already proved authorization. In the Catalog data plane a service
    is an ordinary principal: skipping the grant check would make every internal call a full
    table read, which is the bypass the resource grant exists to prevent.
    """
    if not subject:
        return False
    if not await acl_check_required(db, RT_DATA_RESOURCE, resource_id):
        # An un-granted resource is not "open": the model's `restricted` mode already denied the
        # call before we get here, so the absence of ACL rows means nobody holds it.
        return False
    bits = await effective_permissions(db, subject, RT_DATA_RESOURCE, resource_id, payload)
    return perm_satisfies(bits, required)


async def has_model_grant(
    db: AsyncSession, *, payload: dict, sub: str | None, model_id: str
) -> bool:
    """Whether the caller holds **any** read grant on a data resource of this model.

    This is the metadata gate, not the row gate: seeing a model's fields and metrics is part
    of deciding to query it, and does not expose rows. Row access still needs an explicit
    `resource_id` (see `resolve_catalog_scope`).
    """
    if not sub:
        return False
    rows = (
        await db.execute(
            select(DataResource.id).where(DataResource.semantic_model_id == model_id)
        )
    ).scalars().all()
    for resource_id in rows:
        if await check_data_resource_access(db, payload, sub, resource_id, PERM_READ):
            return True
    return False


async def load_restricted_model(db: AsyncSession, model_id: str) -> SemanticModel:
    model = await db.get(SemanticModel, model_id)
    if not model:
        raise HTTPException(status_code=404, detail="Semantic model not found")
    return model


async def resolve_catalog_scope(
    db: AsyncSession,
    *,
    payload: dict,
    sub: str | None,
    model: SemanticModel,
    resource_id: str | None,
) -> CatalogScope:
    """Authorize one Catalog call and render its row conditions.

    Raises 400 when a restricted model is queried without `resource_id`, 404 when the resource
    is not this model's (or is unknown), 403 when the caller holds no read grant.
    """
    restricted = (model.access_mode or ACCESS_PUBLIC) == ACCESS_RESTRICTED
    if not restricted:
        # A public model ignores `resource_id`: it is already open to the operation key.
        return CatalogScope(model=model)

    if not resource_id:
        raise _deny(
            400,
            "RESOURCE_REQUIRED",
            "This semantic model is not public — pass the data resource you are querying.",
        )

    resource = await db.get(DataResource, resource_id)
    if not resource or resource.semantic_model_id != model.id:
        raise _deny(404, "RESOURCE_NOT_FOUND", "Data resource not found for this model.")

    if not sub or not await check_data_resource_access(
        db, payload, sub, resource.id, PERM_READ
    ):
        raise _deny(403, "RESOURCE_FORBIDDEN", "You do not have access to this data resource.")

    try:
        conditions, params = policy_conditions(
            resource.row_policy, alias="base", claims=payload
        )
    except RowPolicyError as exc:
        failure = exc.failure
        raise _deny(
            403 if failure.code == "ROW_POLICY_CLAIM_MISSING" else 400,
            failure.code,
            str(exc),
        ) from exc

    claims_used = sorted(
        {c["claim"] for c in (resource.row_policy or []) if isinstance(c, dict) and "claim" in c}
    )
    return CatalogScope(
        model=model,
        resource=resource,
        base_conditions=conditions,
        base_params=params,
        claims_used=claims_used,
    )
