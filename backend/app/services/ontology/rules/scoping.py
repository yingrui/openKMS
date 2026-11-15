"""The row scope a rule run may read.

A rule compares numbers; if it reads rows the runner cannot see, its verdict disagrees with the number on
screen — the worst kind of wrong, because both look authoritative. So a run resolves the caller's data
resource the same way a query does:

* a **public** model → no row scope (nothing to filter);
* a **restricted** model with exactly one granted resource → that resource's policy;
* a restricted model with **none** or **several** grants → the run cannot decide ("no grant" / "a rule has no
  way to pick one"), which is reported as `unknown` with the reason rather than computed over everything.
"""
from __future__ import annotations

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_resource import DataResource
from app.models.semantic_model import SemanticModel
from app.services.data.catalog_access import check_data_resource_access, resolve_catalog_scope
from app.services.data.entity_scope import EntityScope
from app.services.identity.acl.resource_acl_constants import PERM_READ


async def run_entity_scope(
    db: AsyncSession, request: Request, model: SemanticModel
) -> tuple[EntityScope | None, str]:
    """`(scope, reason)` — a reason non-empty means the run must not read anything."""
    if not model.is_restricted:
        return None, ""
    payload = getattr(request.state, "openkms_jwt_payload", None) or {}
    sub = payload.get("sub") if isinstance(payload.get("sub"), str) else None
    resources = (
        await db.execute(
            select(DataResource).where(DataResource.semantic_model_id == model.id)
        )
    ).scalars().all()
    granted = [
        resource
        for resource in resources
        if sub and await check_data_resource_access(db, payload, sub, resource.id, PERM_READ)
    ]
    if not granted:
        return None, "this restricted model has no data resource grant for the runner"
    if len(granted) > 1:
        return None, (
            "this restricted model has several data resources and a rule run cannot choose one"
        )
    scope = await resolve_catalog_scope(
        db, payload=payload, sub=sub, model=model, resource_id=granted[0].id
    )
    return scope.entity_scope, ""


async def restricted_models_for_dataset(db: AsyncSession, dataset_id: str) -> list[SemanticModel]:
    """Models that include this dataset and restrict access — a dataset aggregate cannot honour a policy."""
    from app.models.semantic_model_dataset import SemanticModelDataset

    rows = (
        await db.execute(
            select(SemanticModel)
            .join(SemanticModelDataset, SemanticModelDataset.semantic_model_id == SemanticModel.id)
            .where(SemanticModelDataset.dataset_id == dataset_id)
        )
    ).scalars().all()
    return [model for model in rows if model.is_restricted]
