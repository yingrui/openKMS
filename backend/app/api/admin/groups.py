"""Console: access groups and resource sharing."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_permission
from app.config import settings
from app.database import get_db
from app.models.access_group import AccessGroup, AccessGroupMember
from app.models.resource_acl import ResourceAclEntry
from app.models.user import User
from app.services.permission_catalog import PERM_CONSOLE_GROUPS
from app.services.resource_acl_admin_helpers import (
    resolve_resource_label,
    resource_type_label,
    share_path_for,
)
from app.services.resource_acl_constants import GRANTEE_GROUP, perm_label

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
    subjects: list[str] = Field(default_factory=list, description="User ids (local) or OIDC sub values")


class MemberBrief(BaseModel):
    subject: str
    email: str | None = None
    username: str | None = None


class GroupMembersResponse(BaseModel):
    members: list[MemberBrief]


@router.get("", response_model=list[AccessGroupOut])
async def list_groups(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission(PERM_CONSOLE_GROUPS)),
):
    result = await db.execute(select(AccessGroup).order_by(AccessGroup.name))
    rows = list(result.scalars().all())
    return [AccessGroupOut(id=g.id, name=g.name, description=g.description) for g in rows]


@router.post("", response_model=AccessGroupOut, status_code=201)
async def create_group(
    body: AccessGroupCreate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission(PERM_CONSOLE_GROUPS)),
):
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
    g = await db.get(AccessGroup, group_id)
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    await db.execute(delete(AccessGroup).where(AccessGroup.id == group_id))


async def _members_payload(db: AsyncSession, group_id: str) -> GroupMembersResponse:
    result = await db.execute(
        select(AccessGroupMember.subject).where(AccessGroupMember.group_id == group_id)
    )
    subjects = [str(row[0]) for row in result.all()]
    if not subjects:
        return GroupMembersResponse(members=[])
    if settings.auth_mode == "local":
        ur = await db.execute(select(User).where(User.id.in_(subjects)))
        users = {u.id: u for u in ur.scalars().all()}
        return GroupMembersResponse(
            members=[
                MemberBrief(
                    subject=s,
                    email=users[s].email if s in users else None,
                    username=users[s].username if s in users else None,
                )
                for s in subjects
            ]
        )
    return GroupMembersResponse(members=[MemberBrief(subject=s) for s in subjects])


@router.get("/{group_id}/members", response_model=GroupMembersResponse)
async def get_group_members(
    group_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission(PERM_CONSOLE_GROUPS)),
):
    if not await db.get(AccessGroup, group_id):
        raise HTTPException(status_code=404, detail="Group not found")
    return await _members_payload(db, group_id)


@router.put("/{group_id}/members", response_model=GroupMembersResponse)
async def put_group_members(
    group_id: str,
    body: GroupMembersBody,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission(PERM_CONSOLE_GROUPS)),
):
    if not await db.get(AccessGroup, group_id):
        raise HTTPException(status_code=404, detail="Group not found")
    subjects = [s.strip() for s in body.subjects if s.strip()]
    if settings.auth_mode == "local":
        for sub in subjects:
            if not await db.get(User, sub):
                raise HTTPException(status_code=400, detail=f"User not found: {sub}")
    await db.execute(delete(AccessGroupMember).where(AccessGroupMember.group_id == group_id))
    for sub in subjects:
        db.add(AccessGroupMember(subject=sub, group_id=group_id))
    await db.flush()
    return await _members_payload(db, group_id)


class GroupSharedResourceOut(BaseModel):
    resource_type: str
    resource_type_label: str
    resource_id: str
    resource_label: str
    permissions: str
    share_path: str | None


@router.get("/{group_id}/shared-resources", response_model=list[GroupSharedResourceOut])
async def get_group_shared_resources(
    group_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission(PERM_CONSOLE_GROUPS)),
):
    """ACL grants that reference this access group (read-only audit)."""
    if not await db.get(AccessGroup, group_id):
        raise HTTPException(status_code=404, detail="Group not found")
    result = await db.execute(
        select(ResourceAclEntry)
        .where(
            ResourceAclEntry.grantee_type == GRANTEE_GROUP,
            ResourceAclEntry.grantee_id == group_id,
        )
        .order_by(ResourceAclEntry.resource_type, ResourceAclEntry.resource_id)
    )
    out: list[GroupSharedResourceOut] = []
    for entry in result.scalars().all():
        label = await resolve_resource_label(db, entry.resource_type, entry.resource_id)
        out.append(
            GroupSharedResourceOut(
                resource_type=entry.resource_type,
                resource_type_label=resource_type_label(entry.resource_type),
                resource_id=entry.resource_id,
                resource_label=label,
                permissions=perm_label(entry.permissions),
                share_path=share_path_for(entry.resource_type, entry.resource_id),
            )
        )
    return out


# Legacy scope endpoints — deprecated in favor of per-resource ACL sharing
class GroupScopesOut(BaseModel):
    channel_ids: list[str] = Field(default_factory=list)
    article_channel_ids: list[str] = Field(default_factory=list)
    knowledge_base_ids: list[str] = Field(default_factory=list)
    wiki_space_ids: list[str] = Field(default_factory=list)
    evaluation_ids: list[str] = Field(default_factory=list)
    dataset_ids: list[str] = Field(default_factory=list)
    object_type_ids: list[str] = Field(default_factory=list)
    link_type_ids: list[str] = Field(default_factory=list)
    data_resource_ids: list[str] = Field(default_factory=list)
    deprecated: bool = True
    message: str = "Use PUT /api/resource-acl/{resource_type}/{resource_id} to manage sharing per resource."


@router.get("/{group_id}/scopes", response_model=GroupScopesOut)
async def get_group_scopes(
    group_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission(PERM_CONSOLE_GROUPS)),
):
    if not await db.get(AccessGroup, group_id):
        raise HTTPException(status_code=404, detail="Group not found")
    return GroupScopesOut()


@router.put("/{group_id}/scopes", response_model=GroupScopesOut)
async def put_group_scopes(
    group_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission(PERM_CONSOLE_GROUPS)),
):
    if not await db.get(AccessGroup, group_id):
        raise HTTPException(status_code=404, detail="Group not found")
    raise HTTPException(
        status_code=410,
        detail="Group scope lists are deprecated. Share each resource via /api/resource-acl instead.",
    )
