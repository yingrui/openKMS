"""Data resources API — named, row-scoped slices of a semantic model.

Creating, editing, and deleting a resource needs `data:write`. Reading one needs
`data:read` **plus** a read grant, unless the caller holds manage on it (an operator editing
sharing must be able to see what they are editing). Grants themselves live in the shared
resource-ACL API (`/api/resource-acl/data_resource/{id}`) like every other securable type.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_auth, require_permission
from app.database import get_db
from app.models.data_resource import DataResource
from app.models.semantic_model import SemanticModel
from app.models.semantic_model_dataset import SemanticModelDataset
from app.schemas.data_resource import (
    DataResourceCreate,
    DataResourceListResponse,
    DataResourceResponse,
    DataResourceUpdate,
)
from app.services.acl.acl_store import bootstrap_owner_acl
from app.services.acl.resource_acl_constants import PERM_MANAGE, PERM_READ, RT_DATA_RESOURCE
from app.services.data_layer.catalog_access import check_data_resource_access
from app.services.data_layer.entity_scope import (
    EntityScopeError,
    build_entity_scope,
    load_model_graph,
)
from app.services.acl.resource_acl_presentation import serialize_resource_acl
from app.services.data_layer.row_policy import RowPolicyError, validate_policy
from app.services.permissions.permission_catalog import PERM_DATA_WRITE

router = APIRouter(prefix="/data-resources", tags=["data-resources"], dependencies=[Depends(require_auth)])


def _out(resource: DataResource) -> DataResourceResponse:
    return DataResourceResponse(
        id=resource.id,
        name=resource.name,
        description=resource.description,
        semantic_model_id=resource.semantic_model_id,
        base_dataset_id=resource.base_dataset_id,
        row_policy=list(resource.row_policy or []),
        created_by_name=resource.created_by_name,
        created_at=resource.created_at,
        updated_at=resource.updated_at,
    )


async def _validate(
    db: AsyncSession,
    *,
    semantic_model_id: str,
    base_dataset_id: str | None,
    row_policy: list[dict] | None,
) -> list[dict]:
    model = await db.get(SemanticModel, semantic_model_id)
    if not model:
        raise HTTPException(status_code=400, detail="Unknown semantic model")
    if base_dataset_id:
        # Membership is a composite-key join row (no `id` column): select the dataset id and
        # test for a row, which is what "is this dataset in the model" means.
        member = await db.execute(
            select(SemanticModelDataset.dataset_id).where(
                SemanticModelDataset.semantic_model_id == semantic_model_id,
                SemanticModelDataset.dataset_id == base_dataset_id,
            )
        )
        if member.first() is None:
            raise HTTPException(status_code=400, detail="Base dataset is not in this model")
    try:
        policy = validate_policy(row_policy)
    except RowPolicyError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if policy:
        # Attribute each column now: an ambiguous or unknown column is a definition mistake,
        # and reporting it at save time is the only moment the author can still fix it cheaply.
        try:
            graph = await load_model_graph(db, semantic_model_id)
            await build_entity_scope(db, graph=graph, policy=policy, claims={})
        except EntityScopeError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    return policy


async def _load(db: AsyncSession, resource_id: str) -> DataResource:
    resource = await db.get(DataResource, resource_id)
    if not resource:
        raise HTTPException(status_code=404, detail="Data resource not found")
    return resource


async def _require_manage(db: AsyncSession, request: Request, resource_id: str) -> None:
    payload = request.state.openkms_jwt_payload
    sub = payload.get("sub")
    if not isinstance(sub, str) or not await check_data_resource_access(
        db, payload, sub, resource_id, PERM_MANAGE
    ):
        raise HTTPException(status_code=404, detail="Data resource not found")


@router.get("", response_model=DataResourceListResponse)
async def list_data_resources(
    request: Request,
    semantic_model_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Resources the caller may use.

    Data plane, not an operation key: a caller holding a grant must be able to find the
    resource they were granted even without `data:read`. Rows without a read grant are
    filtered out, and a resource with no ACL rows at all is not listed (nobody holds it).
    """
    payload = getattr(request.state, "openkms_jwt_payload", None) or {}
    sub = payload.get("sub") if isinstance(payload.get("sub"), str) else None
    stmt = select(DataResource).order_by(DataResource.created_at)
    if semantic_model_id:
        stmt = stmt.where(DataResource.semantic_model_id == semantic_model_id)
    rows = (await db.execute(stmt)).scalars().all()
    visible = [
        r
        for r in rows
        if sub
        and await check_data_resource_access(db, payload, sub, r.id, PERM_READ)
    ]
    return DataResourceListResponse(items=[_out(r) for r in visible], total=len(visible))


@router.post(
    "",
    response_model=DataResourceResponse,
    status_code=201,
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def create_data_resource(
    body: DataResourceCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    if not (body.name or "").strip():
        raise HTTPException(status_code=400, detail="A data resource needs a name.")
    policy = await _validate(
        db,
        semantic_model_id=body.semantic_model_id,
        base_dataset_id=body.base_dataset_id,
        row_policy=body.row_policy,
    )
    payload = request.state.openkms_jwt_payload
    sub = payload.get("sub") if isinstance(payload.get("sub"), str) else None
    uname = payload.get("preferred_username") or payload.get("name")
    resource = DataResource(
        name=body.name.strip(),
        description=body.description,
        semantic_model_id=body.semantic_model_id,
        base_dataset_id=body.base_dataset_id,
        row_policy=policy,
        created_by=sub,
        created_by_name=str(uname)[:256] if isinstance(uname, str) and uname.strip() else None,
    )
    db.add(resource)
    await db.flush()
    await bootstrap_owner_acl(db, RT_DATA_RESOURCE, resource.id, sub)
    await db.commit()
    await db.refresh(resource)
    return _out(resource)


@router.get("/{resource_id}", response_model=DataResourceResponse)
async def get_data_resource(
    resource_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """One resource the caller may use (read or manage). Data plane, same as the list."""
    resource = await _load(db, resource_id)
    payload = request.state.openkms_jwt_payload
    sub = payload.get("sub") if isinstance(payload.get("sub"), str) else None
    allowed = bool(
        sub
        and (
            await check_data_resource_access(db, payload, sub, resource_id, PERM_READ)
            or await check_data_resource_access(db, payload, sub, resource_id, PERM_MANAGE)
        )
    )
    if not allowed:
        raise HTTPException(status_code=404, detail="Data resource not found")
    return _out(resource)


@router.put(
    "/{resource_id}",
    response_model=DataResourceResponse,
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def update_data_resource(
    resource_id: str,
    body: DataResourceUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    resource = await _load(db, resource_id)
    await _require_manage(db, request, resource_id)
    data = body.model_dump(exclude_unset=True)
    base_dataset_id = data.get("base_dataset_id", resource.base_dataset_id)
    row_policy = data.get("row_policy", resource.row_policy)
    policy = await _validate(
        db,
        semantic_model_id=resource.semantic_model_id,
        base_dataset_id=base_dataset_id,
        row_policy=row_policy,
    )
    if "name" in data:
        if not (data["name"] or "").strip():
            raise HTTPException(status_code=400, detail="A data resource needs a name.")
        resource.name = data["name"].strip()
    if "description" in data:
        resource.description = data["description"]
    resource.base_dataset_id = base_dataset_id
    resource.row_policy = policy
    await db.commit()
    await db.refresh(resource)
    return _out(resource)


@router.delete("/{resource_id}", status_code=204, dependencies=[Depends(require_permission(PERM_DATA_WRITE))])
async def delete_data_resource(
    resource_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    await _load(db, resource_id)
    await _require_manage(db, request, resource_id)
    from app.models.resource_acl import ResourceAclEntry

    await db.execute(
        delete(ResourceAclEntry).where(
            ResourceAclEntry.resource_type == RT_DATA_RESOURCE,
            ResourceAclEntry.resource_id == resource_id,
        )
    )
    await db.execute(delete(DataResource).where(DataResource.id == resource_id))
    await db.commit()


@router.get("/{resource_id}/sharing")
async def get_data_resource_sharing(
    resource_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Sharing view for the Console/panel: requires manage (an editor sees the grants)."""
    await _load(db, resource_id)
    await _require_manage(db, request, resource_id)
    payload = request.state.openkms_jwt_payload
    sub = payload.get("sub") if isinstance(payload.get("sub"), str) else None
    return await serialize_resource_acl(db, RT_DATA_RESOURCE, resource_id, sub or "", payload)
