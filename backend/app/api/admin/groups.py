"""Console: access groups and resource sharing."""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_permission
from app.config import settings
from app.database import get_db
from app.models.access_group import AccessGroup, AccessGroupMember
from app.models.resource_acl import ResourceAclEntry
from app.models.user import User
from app.services.permissions.permission_catalog import PERM_CONSOLE_GROUPS
from app.services.acl.resource_acl_admin_helpers import (
    resolve_resource_label,
    resource_type_label,
    share_path_for,
)
from app.services.acl.resource_acl_constants import GRANTEE_GROUP, perm_label
from app.services.acl.resource_acl_service import canonicalize_group_member_subjects

router = APIRouter(prefix="/admin/groups", tags=["admin-access-groups"])


class AccessGroupOut(BaseModel):
    id: str
    name: str
    description: str | None
    member_count: int = 0
    shared_resource_count: int = 0


class AccessGroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=256)
    description: str | None = None


class AccessGroupUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=256)
    description: str | None = None


class GroupMembersBody(BaseModel):
    subjects: list[str] = Field(
        default_factory=list,
        description="User id, OIDC sub, or username/email; stored as canonical subject after normalize",
    )


class MemberBrief(BaseModel):
    subject: str
    email: str | None = None
    username: str | None = None


class GroupMembersResponse(BaseModel):
    members: list[MemberBrief]


class AccessGroupsPageOut(BaseModel):
    items: list[AccessGroupOut]
    total: int
    limit: int
    offset: int


class GroupMembersPageOut(BaseModel):
    members: list[MemberBrief]
    total: int
    limit: int
    offset: int


class GroupMemberSubjectsOut(BaseModel):
    subjects: list[str]


class GroupSharedResourcesPageOut(BaseModel):
    items: list["GroupSharedResourceOut"]
    total: int
    limit: int
    offset: int


async def _group_counts(
    db: AsyncSession, group_ids: list[str]
) -> tuple[dict[str, int], dict[str, int]]:
    if not group_ids:
        return {}, {}
    mc = await db.execute(
        select(AccessGroupMember.group_id, func.count())
        .where(AccessGroupMember.group_id.in_(group_ids))
        .group_by(AccessGroupMember.group_id)
    )
    member_map = {str(row[0]): int(row[1]) for row in mc.all()}
    rc = await db.execute(
        select(ResourceAclEntry.grantee_id, func.count())
        .where(
            ResourceAclEntry.grantee_type == GRANTEE_GROUP,
            ResourceAclEntry.grantee_id.in_(group_ids),
        )
        .group_by(ResourceAclEntry.grantee_id)
    )
    resource_map = {str(row[0]): int(row[1]) for row in rc.all()}
    return member_map, resource_map


def _group_out(
    g: AccessGroup,
    member_map: dict[str, int],
    resource_map: dict[str, int],
) -> AccessGroupOut:
    return AccessGroupOut(
        id=g.id,
        name=g.name,
        description=g.description,
        member_count=member_map.get(g.id, 0),
        shared_resource_count=resource_map.get(g.id, 0),
    )


@router.get("", response_model=AccessGroupsPageOut)
async def list_groups(
    limit: int = Query(20, ge=1, le=200),
    offset: int = Query(0, ge=0),
    search: str | None = Query(None, max_length=256),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission(PERM_CONSOLE_GROUPS)),
):
    base = select(AccessGroup)
    if search and (q := search.strip()):
        like = f"%{q}%"
        base = base.where(
            AccessGroup.name.ilike(like) | AccessGroup.description.ilike(like)
        )
    count_result = await db.execute(select(func.count()).select_from(base.subquery()))
    total = int(count_result.scalar_one() or 0)
    result = await db.execute(
        base.order_by(AccessGroup.name).limit(limit).offset(offset)
    )
    rows = list(result.scalars().all())
    member_map, resource_map = await _group_counts(db, [g.id for g in rows])
    return AccessGroupsPageOut(
        items=[_group_out(g, member_map, resource_map) for g in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


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
    member_map, resource_map = await _group_counts(db, [g.id])
    return _group_out(g, member_map, resource_map)


@router.get("/{group_id}", response_model=AccessGroupOut)
async def get_group(
    group_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission(PERM_CONSOLE_GROUPS)),
):
    g = await db.get(AccessGroup, group_id)
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    member_map, resource_map = await _group_counts(db, [g.id])
    return _group_out(g, member_map, resource_map)


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
    member_map, resource_map = await _group_counts(db, [g.id])
    return _group_out(g, member_map, resource_map)


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


async def _members_page(
    db: AsyncSession, group_id: str, limit: int, offset: int
) -> GroupMembersPageOut:
    count_result = await db.execute(
        select(func.count())
        .select_from(AccessGroupMember)
        .where(AccessGroupMember.group_id == group_id)
    )
    total = int(count_result.scalar_one() or 0)
    result = await db.execute(
        select(AccessGroupMember.subject)
        .where(AccessGroupMember.group_id == group_id)
        .order_by(AccessGroupMember.subject)
        .limit(limit)
        .offset(offset)
    )
    subjects = [str(row[0]) for row in result.all()]
    if not subjects:
        return GroupMembersPageOut(members=[], total=total, limit=limit, offset=offset)
    if settings.auth_mode == "local":
        ur = await db.execute(select(User).where(User.id.in_(subjects)))
        users = {u.id: u for u in ur.scalars().all()}
        members = [
            MemberBrief(
                subject=s,
                email=users[s].email if s in users else None,
                username=users[s].username if s in users else None,
            )
            for s in subjects
        ]
    else:
        members = [MemberBrief(subject=s) for s in subjects]
    return GroupMembersPageOut(members=members, total=total, limit=limit, offset=offset)


@router.get("/{group_id}/member-subjects", response_model=GroupMemberSubjectsOut)
async def get_group_member_subjects(
    group_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission(PERM_CONSOLE_GROUPS)),
):
    if not await db.get(AccessGroup, group_id):
        raise HTTPException(status_code=404, detail="Group not found")
    result = await db.execute(
        select(AccessGroupMember.subject)
        .where(AccessGroupMember.group_id == group_id)
        .order_by(AccessGroupMember.subject)
    )
    return GroupMemberSubjectsOut(subjects=[str(row[0]) for row in result.all()])


@router.get("/{group_id}/members", response_model=GroupMembersPageOut)
async def get_group_members(
    group_id: str,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission(PERM_CONSOLE_GROUPS)),
):
    if not await db.get(AccessGroup, group_id):
        raise HTTPException(status_code=404, detail="Group not found")
    return await _members_page(db, group_id, limit, offset)


@router.put("/{group_id}/members", response_model=GroupMembersResponse)
async def put_group_members(
    group_id: str,
    body: GroupMembersBody,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission(PERM_CONSOLE_GROUPS)),
):
    if not await db.get(AccessGroup, group_id):
        raise HTTPException(status_code=404, detail="Group not found")
    subjects = await canonicalize_group_member_subjects(db, body.subjects)
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


@router.get("/{group_id}/shared-resources", response_model=GroupSharedResourcesPageOut)
async def get_group_shared_resources(
    group_id: str,
    limit: int = Query(20, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission(PERM_CONSOLE_GROUPS)),
):
    """ACL grants that reference this access group (read-only audit)."""
    if not await db.get(AccessGroup, group_id):
        raise HTTPException(status_code=404, detail="Group not found")
    base = select(ResourceAclEntry).where(
        ResourceAclEntry.grantee_type == GRANTEE_GROUP,
        ResourceAclEntry.grantee_id == group_id,
    )
    count_result = await db.execute(select(func.count()).select_from(base.subquery()))
    total = int(count_result.scalar_one() or 0)
    result = await db.execute(
        base.order_by(ResourceAclEntry.resource_type, ResourceAclEntry.resource_id)
        .limit(limit)
        .offset(offset)
    )
    items: list[GroupSharedResourceOut] = []
    for entry in result.scalars().all():
        label = await resolve_resource_label(db, entry.resource_type, entry.resource_id)
        items.append(
            GroupSharedResourceOut(
                resource_type=entry.resource_type,
                resource_type_label=resource_type_label(entry.resource_type),
                resource_id=entry.resource_id,
                resource_label=label,
                permissions=perm_label(entry.permissions),
                share_path=share_path_for(entry.resource_type, entry.resource_id),
            )
        )
    return GroupSharedResourcesPageOut(items=items, total=total, limit=limit, offset=offset)


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
