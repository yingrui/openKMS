"""Console: access groups and data-security resource scopes."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_permission
from app.config import settings
from app.database import get_db
from app.models.access_group import (
    AccessGroup,
    AccessGroupChannel,
    AccessGroupDataset,
    AccessGroupEvaluationDataset,
    AccessGroupKnowledgeBase,
    AccessGroupLinkType,
    AccessGroupObjectType,
    AccessGroupUser,
)
from app.models.user import User
from app.services.permission_catalog import PERM_CONSOLE_GROUPS

router = APIRouter(prefix="/admin/groups", tags=["admin-access-groups"])


class AccessGroupOut(BaseModel):
    id: str
    name: str
    description: str | None


class AccessGroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=256)
    description: str | None = None


class AccessGroupUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=256)
    description: str | None = None


class GroupMembersBody(BaseModel):
    user_ids: list[str] = Field(default_factory=list)


class GroupScopesOut(BaseModel):
    channel_ids: list[str]
    knowledge_base_ids: list[str]
    evaluation_dataset_ids: list[str]
    dataset_ids: list[str]
    object_type_ids: list[str]
    link_type_ids: list[str]


class GroupScopesPut(BaseModel):
    channel_ids: list[str] | None = None
    knowledge_base_ids: list[str] | None = None
    evaluation_dataset_ids: list[str] | None = None
    dataset_ids: list[str] | None = None
    object_type_ids: list[str] | None = None
    link_type_ids: list[str] | None = None


class LocalUserBrief(BaseModel):
    id: str
    email: str
    username: str


class GroupMembersResponse(BaseModel):
    users: list[LocalUserBrief]


def _local_only():
    if settings.auth_mode != "local":
        raise HTTPException(
            status_code=403,
            detail="Access groups are managed in local auth mode only in this release.",
        )


async def _scopes_payload(db: AsyncSession, group_id: str) -> GroupScopesOut:
    async def col(model, fk: str) -> list[str]:
        r = await db.execute(select(getattr(model, fk)).where(model.group_id == group_id))
        return sorted({str(row[0]) for row in r.all()})

    return GroupScopesOut(
        channel_ids=await col(AccessGroupChannel, "channel_id"),
        knowledge_base_ids=await col(AccessGroupKnowledgeBase, "knowledge_base_id"),
        evaluation_dataset_ids=await col(AccessGroupEvaluationDataset, "evaluation_dataset_id"),
        dataset_ids=await col(AccessGroupDataset, "dataset_id"),
        object_type_ids=await col(AccessGroupObjectType, "object_type_id"),
        link_type_ids=await col(AccessGroupLinkType, "link_type_id"),
    )


@router.get("", response_model=list[AccessGroupOut])
async def list_groups(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission(PERM_CONSOLE_GROUPS)),
):
    _local_only()
    result = await db.execute(select(AccessGroup).order_by(AccessGroup.name))
    rows = list(result.scalars().all())
    return [AccessGroupOut(id=g.id, name=g.name, description=g.description) for g in rows]


@router.post("", response_model=AccessGroupOut, status_code=201)
async def create_group(
    body: AccessGroupCreate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission(PERM_CONSOLE_GROUPS)),
):
    _local_only()
    g = AccessGroup(name=body.name.strip(), description=body.description)
    db.add(g)
    try:
        await db.flush()
    except IntegrityError:
        raise HTTPException(status_code=409, detail="Group name already exists") from None
    await db.refresh(g)
    return AccessGroupOut(id=g.id, name=g.name, description=g.description)


@router.get("/{group_id}", response_model=AccessGroupOut)
async def get_group(
    group_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission(PERM_CONSOLE_GROUPS)),
):
    _local_only()
    g = await db.get(AccessGroup, group_id)
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    return AccessGroupOut(id=g.id, name=g.name, description=g.description)


@router.patch("/{group_id}", response_model=AccessGroupOut)
async def patch_group(
    group_id: str,
    body: AccessGroupUpdate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission(PERM_CONSOLE_GROUPS)),
):
    _local_only()
    g = await db.get(AccessGroup, group_id)
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    if body.name is not None:
        g.name = body.name.strip()
    if body.description is not None:
        g.description = body.description
    await db.flush()
    await db.refresh(g)
    return AccessGroupOut(id=g.id, name=g.name, description=g.description)


@router.delete("/{group_id}", status_code=204)
async def delete_group(
    group_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission(PERM_CONSOLE_GROUPS)),
):
    _local_only()
    g = await db.get(AccessGroup, group_id)
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    await db.execute(delete(AccessGroup).where(AccessGroup.id == group_id))


@router.get("/{group_id}/members", response_model=GroupMembersResponse)
async def get_group_members(
    group_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission(PERM_CONSOLE_GROUPS)),
):
    _local_only()
    if not await db.get(AccessGroup, group_id):
        raise HTTPException(status_code=404, detail="Group not found")
    result = await db.execute(select(AccessGroupUser.user_id).where(AccessGroupUser.group_id == group_id))
    uids = [str(row[0]) for row in result.all()]
    if not uids:
        return GroupMembersResponse(users=[])
    ur = await db.execute(select(User).where(User.id.in_(uids)))
    users = list(ur.scalars().all())
    return GroupMembersResponse(
        users=[LocalUserBrief(id=str(u.id), email=u.email, username=u.username) for u in users]
    )


@router.put("/{group_id}/members", response_model=GroupMembersResponse)
async def put_group_members(
    group_id: str,
    body: GroupMembersBody,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission(PERM_CONSOLE_GROUPS)),
):
    _local_only()
    if not await db.get(AccessGroup, group_id):
        raise HTTPException(status_code=404, detail="Group not found")
    for uid in body.user_ids:
        if not await db.get(User, uid):
            raise HTTPException(status_code=400, detail=f"User not found: {uid}")
    await db.execute(delete(AccessGroupUser).where(AccessGroupUser.group_id == group_id))
    for uid in body.user_ids:
        db.add(AccessGroupUser(user_id=uid, group_id=group_id))
    await db.flush()
    result = await db.execute(select(AccessGroupUser.user_id).where(AccessGroupUser.group_id == group_id))
    uids = [str(row[0]) for row in result.all()]
    if not uids:
        return GroupMembersResponse(users=[])
    ur = await db.execute(select(User).where(User.id.in_(uids)))
    users = list(ur.scalars().all())
    return GroupMembersResponse(
        users=[LocalUserBrief(id=str(u.id), email=u.email, username=u.username) for u in users]
    )


@router.get("/{group_id}/scopes", response_model=GroupScopesOut)
async def get_group_scopes(
    group_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission(PERM_CONSOLE_GROUPS)),
):
    _local_only()
    if not await db.get(AccessGroup, group_id):
        raise HTTPException(status_code=404, detail="Group not found")
    return await _scopes_payload(db, group_id)


@router.put("/{group_id}/scopes", response_model=GroupScopesOut)
async def put_group_scopes(
    group_id: str,
    body: GroupScopesPut,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission(PERM_CONSOLE_GROUPS)),
):
    _local_only()
    if not await db.get(AccessGroup, group_id):
        raise HTTPException(status_code=404, detail="Group not found")

    async def replace(model, ids: list[str] | None, fk_attr: str) -> None:
        if ids is None:
            return
        await db.execute(delete(model).where(model.group_id == group_id))
        for x in ids:
            db.add(model(group_id=group_id, **{fk_attr: x}))

    await replace(AccessGroupChannel, body.channel_ids, "channel_id")
    await replace(AccessGroupKnowledgeBase, body.knowledge_base_ids, "knowledge_base_id")
    await replace(AccessGroupEvaluationDataset, body.evaluation_dataset_ids, "evaluation_dataset_id")
    await replace(AccessGroupDataset, body.dataset_ids, "dataset_id")
    await replace(AccessGroupObjectType, body.object_type_ids, "object_type_id")
    await replace(AccessGroupLinkType, body.link_type_ids, "link_type_id")
    await db.flush()
    return await _scopes_payload(db, group_id)
