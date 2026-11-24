"""Who may read an object type's rows, and how that policy reaches the graph.

Object instances are read from the graph, which is a **mirror** of a dataset's rows, indexed once for everyone. A
dataset's row policy is per-caller, so the mirror cannot carry it — the same node is visible to one user and not
another. Two things follow:

* a type whose backing dataset sits in a **public** model has no policy to apply, or no dataset at all (hand-made
  instances) — it is readable as is;
* a type in a **restricted** model carries the resource's row conditions, translated into the object-set's own
  filter vocabulary and ANDed with whatever the caller asked for. That is why the caller sees their rows and not
  everyone's, from the same URL.

When a condition cannot be honoured — it names another dataset in the model, which would need a hop the graph query
does not make, or the caller has no single granted resource — the read is **refused** with the reason. A wrong few
is recoverable; a silent leak is not.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_resource import DataResource
from app.models.object_type import ObjectType
from app.models.semantic_model import SemanticModel
from app.services.data.catalog_access import check_data_resource_access, resolve_catalog_scope
from app.services.data.entity_scope import EntityScopeError, _owner_of
from app.services.data.row_policy import RowPolicyError, _claim_value, validate_policy
from app.services.identity.acl.resource_acl_constants import PERM_READ
from app.services.ontology.object_query import PropertyFilter
from app.services.ontology.rules.scoping import restricted_models_for_dataset

#: A policy operator expressed in the object-set vocabulary. `between` becomes two conditions and `like` a
#: `contains`, because that is what the caller's own filters mean.
_OP_MAP = {
    "=": "eq",
    "!=": "ne",
    ">": "gt",
    ">=": "ge",
    "<": "lt",
    "<=": "le",
    "in": "in",
    "like": "contains",
    "is_null": "is_null",
    "is_not_null": "is_not_null",
}

NOT_APPLIED = (
    "this object type's dataset belongs to a restricted model, and its row policy cannot be applied to the "
    "object layer yet — read these rows from the dataset instead"
)


def _filters_from_policy(
    *,
    policy: list[dict[str, Any]],
    claims: dict[str, Any],
    dataset_id: str,
    scope: Any,
) -> list[PropertyFilter]:
    """A dataset's row conditions as object-set filters, or a refusal when one needs another table."""
    out: list[PropertyFilter] = []
    for condition in policy:
        column = str(condition["column"])
        try:
            owner = _owner_of(scope.graph, scope.columns_by_dataset, column)
        except EntityScopeError as exc:
            raise HTTPException(status_code=403, detail=NOT_APPLIED) from exc
        if owner != dataset_id:
            # The condition constrains a related dataset; the graph query does not hop, so it cannot be honoured.
            raise HTTPException(status_code=403, detail=NOT_APPLIED)
        op = str(condition["op"])
        value: Any = None
        if op not in ("is_null", "is_not_null"):
            if "value" in condition:
                value = condition["value"]
            else:
                try:
                    value = _claim_value(str(condition.get("claim", "")), claims)
                except RowPolicyError as exc:
                    raise HTTPException(status_code=403, detail=NOT_APPLIED) from exc
        if op == "between":
            lo, hi = (value if isinstance(value, (list, tuple)) and len(value) == 2 else (None, None))
            if lo is None:
                raise HTTPException(status_code=403, detail=NOT_APPLIED)
            out.append(PropertyFilter(prop=column, op="ge", value=lo))
            out.append(PropertyFilter(prop=column, op="le", value=hi))
            continue
        mapped = _OP_MAP.get(op)
        if mapped is None:
            raise HTTPException(status_code=403, detail=NOT_APPLIED)
        if mapped in ("is_null", "is_not_null"):
            out.append(PropertyFilter(prop=column, op=mapped, value=None))
        else:
            out.append(PropertyFilter(prop=column, op=mapped, value=value))
    return out


async def object_scope_filters(
    db: AsyncSession, request: Request, obj_type: ObjectType
) -> list[PropertyFilter]:
    """The caller's row conditions for this object type, ready to AND with their own filters."""
    if not obj_type.dataset_id:
        return []
    models = await restricted_models_for_dataset(db, obj_type.dataset_id)
    if not models:
        return []
    if len(models) > 1:
        # Two restricted models can carry different policies over the same table.
        raise HTTPException(
            status_code=403,
            detail="this dataset belongs to several restricted models; the object layer cannot choose a policy",
        )
    model: SemanticModel = models[0]
    payload = getattr(request.state, "openkms_jwt_payload", None) or {}
    sub = payload.get("sub") if isinstance(payload.get("sub"), str) else None
    resources = (
        await db.execute(select(DataResource).where(DataResource.semantic_model_id == model.id))
    ).scalars().all()
    granted = [
        resource
        for resource in resources
        if sub and await check_data_resource_access(db, payload, sub, resource.id, PERM_READ)
    ]
    if len(granted) != 1:
        raise HTTPException(
            status_code=403,
            detail=(
                "this restricted model grants you no single data resource, so its row policy cannot be applied"
                if not granted
                else "this restricted model grants you several data resources; the object layer cannot choose one"
            ),
        )
    try:
        catalog_scope = await resolve_catalog_scope(
            db, payload=payload, sub=sub, model=model, resource_id=granted[0].id
        )
    except Exception as exc:  # the access layer raises its own HTTP errors; keep the reason
        raise HTTPException(status_code=403, detail=NOT_APPLIED) from exc
    scope = catalog_scope.entity_scope
    if scope is None:
        return []
    try:
        policy = validate_policy(scope.policy)
    except RowPolicyError as exc:
        raise HTTPException(status_code=403, detail=NOT_APPLIED) from exc
    return _filters_from_policy(
        policy=policy, claims=scope.claims, dataset_id=obj_type.dataset_id, scope=scope
    )
