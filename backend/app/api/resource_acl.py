"""Resource sharing (ACL) API."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.api.auth import get_jwt_payload, require_auth
from app.database import get_db
from app.models.access_group import AccessGroup
from app.models.user import User
from app.services.resource_acl_constants import (
    GRANTEE_AUTHENTICATED,
    GRANTEE_GROUP,
    GRANTEE_USER,
    GRANTEE_TYPES,
    PERM_ALL_DATA,
    PERM_MANAGE,
    PERM_READ,
    PERM_WRITE,
    RT_ARTICLE_CHANNEL,
    RT_DOCUMENT_CHANNEL,
    SECURABLE_RESOURCE_TYPES,
    perm_label,
)
from app.services.resource_acl_service import (
    check_resource_access,
    effective_permissions,
    list_acl_entries,
    replace_resource_acl,
    resolve_subject_display,
    resource_context_chain,
    resource_has_acl_restrictions,
)

router = APIRouter(prefix="/resource-acl", tags=["resource-acl"], dependencies=[Depends(require_auth)])


class AclGrantIn(BaseModel):
    grantee_type: str
    grantee_id: str | None = None
    permissions: str = Field(description="Permission string: r, w, m (e.g. rw, r, rwm)")


class AclGrantOut(BaseModel):
    grantee_type: str
    grantee_id: str | None
    permissions: str
    grantee_label: str | None = None
    is_owner: bool = False


class ResourceAclOut(BaseModel):
    resource_type: str
    resource_id: str
    grants: list[AclGrantOut]
    effective_permissions: str
    inherits_from: list[dict[str, str]]
    owner_subject: str | None = None
    owner_label: str | None = None
    created_by: str | None = None


class OwnerCandidateOut(BaseModel):
    subject: str
    label: str


class ResourceAclPut(BaseModel):
    grants: list[AclGrantIn]


def _parse_grants(body: ResourceAclPut) -> list[dict]:
    from app.services.resource_acl_constants import parse_perm_string

    out: list[dict] = []
    for g in body.grants:
        if g.grantee_type not in GRANTEE_TYPES:
            raise HTTPException(status_code=400, detail=f"Invalid grantee_type: {g.grantee_type}")
        if g.grantee_type in (GRANTEE_USER, GRANTEE_GROUP) and not g.grantee_id:
            raise HTTPException(status_code=400, detail="grantee_id required for user/group grants")
        if g.grantee_type == GRANTEE_AUTHENTICATED:
            gid = None
        else:
            gid = g.grantee_id
        bits = parse_perm_string(g.permissions)
        if bits == 0 and g.grantee_type != GRANTEE_AUTHENTICATED:
            raise HTTPException(status_code=400, detail="At least one permission (r/w/m) required")
        out.append({"grantee_type": g.grantee_type, "grantee_id": gid, "permissions": bits})
    return out


async def _channel_creator_identity(
    db: AsyncSession, resource_type: str, resource_id: str
) -> tuple[str | None, str | None]:
    from app.models.article_channel import ArticleChannel
    from app.models.document_channel import DocumentChannel

    if resource_type == RT_DOCUMENT_CHANNEL:
        ch = await db.get(DocumentChannel, resource_id)
    elif resource_type == RT_ARTICLE_CHANNEL:
        ch = await db.get(ArticleChannel, resource_id)
    else:
        return None, None
    if not ch:
        return None, None
    return ch.created_by, ch.created_by_name


async def _grant_labels(
    db: AsyncSession,
    grants: list,
    *,
    creator_subject: str | None = None,
    creator_display_name: str | None = None,
) -> tuple[list[AclGrantOut], str | None, str | None]:
    group_names: dict[str, str] = {}
    gids = [g.grantee_id for g in grants if g.grantee_type == GRANTEE_GROUP and g.grantee_id]
    if gids:
        r = await db.execute(select(AccessGroup).where(AccessGroup.id.in_(gids)))
        for row in r.scalars().all():
            group_names[row.id] = row.name

    out: list[AclGrantOut] = []
    owner_subject: str | None = None
    owner_label: str | None = None
    for g in grants:
        label: str | None = None
        is_owner = False
        if g.grantee_type == GRANTEE_GROUP and g.grantee_id:
            label = group_names.get(g.grantee_id, g.grantee_id)
        elif g.grantee_type == GRANTEE_AUTHENTICATED:
            label = "Others"
        elif g.grantee_type == GRANTEE_USER and g.grantee_id:
            is_owner = True
            hint = creator_display_name if g.grantee_id == creator_subject else None
            label = await resolve_subject_display(db, g.grantee_id, display_hint=hint)
            if owner_subject is None:
                owner_subject = g.grantee_id
                owner_label = label
        out.append(
            AclGrantOut(
                grantee_type=g.grantee_type,
                grantee_id=g.grantee_id,
                permissions=perm_label(g.permissions),
                grantee_label=label,
                is_owner=is_owner,
            )
        )
    return out, owner_subject, owner_label


async def _owner_from_created_by(
    db: AsyncSession,
    resource_type: str,
    resource_id: str,
    *,
    creator_subject: str | None = None,
    creator_display_name: str | None = None,
) -> tuple[str | None, str | None]:
    if creator_subject is None and creator_display_name is None:
        creator_subject, creator_display_name = await _channel_creator_identity(
            db, resource_type, resource_id
        )
    created_by = creator_subject
    if not created_by:
        return None, None
    label = await resolve_subject_display(
        db, created_by, display_hint=creator_display_name
    )
    return created_by, label


async def _enrich_default_owner_grant(
    db: AsyncSession,
    resource_type: str,
    resource_id: str,
    entries: list,
    grant_rows: list[AclGrantOut],
    owner: str | None,
    owner_label: str | None,
    *,
    creator_subject: str | None = None,
    creator_display_name: str | None = None,
) -> tuple[list[AclGrantOut], str | None, str | None]:
    """When no persisted owner ACL exists, default to channel creator with full permissions."""
    if any(e.grantee_type == GRANTEE_USER for e in entries):
        return grant_rows, owner, owner_label
    created_by, label = await _owner_from_created_by(
        db,
        resource_type,
        resource_id,
        creator_subject=creator_subject,
        creator_display_name=creator_display_name,
    )
    if not created_by:
        return grant_rows, owner, owner_label
    default_perms = perm_label(PERM_ALL_DATA)
    enriched = list(grant_rows) + [
        AclGrantOut(
            grantee_type=GRANTEE_USER,
            grantee_id=created_by,
            permissions=default_perms,
            grantee_label=label,
            is_owner=True,
        )
    ]
    return enriched, created_by, label


def _append_preserved_owner(parsed: list[dict], grantee_id: str, permissions: int) -> None:
    parsed.append(
        {
            "grantee_type": GRANTEE_USER,
            "grantee_id": grantee_id,
            "permissions": permissions,
        }
    )


async def _ensure_owner_in_parsed(
    db: AsyncSession,
    resource_type: str,
    resource_id: str,
    parsed: list[dict],
) -> None:
    if any(g["grantee_type"] == GRANTEE_USER for g in parsed):
        return
    existing_entries = await list_acl_entries(db, resource_type, resource_id)
    existing_owner = next((e for e in existing_entries if e.grantee_type == GRANTEE_USER), None)
    if existing_owner and existing_owner.grantee_id:
        _append_preserved_owner(parsed, existing_owner.grantee_id, existing_owner.permissions)
        return
    creator_subject, _ = await _channel_creator_identity(db, resource_type, resource_id)
    if creator_subject:
        _append_preserved_owner(parsed, creator_subject, PERM_ALL_DATA)


async def list_local_owner_candidates(db: AsyncSession) -> list[OwnerCandidateOut]:
    if settings.auth_mode != "local":
        return []
    result = await db.execute(select(User).order_by(User.username))
    out: list[OwnerCandidateOut] = []
    for user in result.scalars().all():
        out.append(OwnerCandidateOut(subject=str(user.id), label=user.username))
    return out


async def serialize_resource_acl(
    db: AsyncSession,
    resource_type: str,
    resource_id: str,
    viewer_sub: str,
    payload: dict,
    *,
    entries: list | None = None,
) -> ResourceAclOut:
    if entries is None:
        entries = await list_acl_entries(db, resource_type, resource_id)
    chain = await resource_context_chain(db, resource_type, resource_id)
    inherits = [
        {"resource_type": rt, "resource_id": rid}
        for rt, rid in chain[1:]
        if await resource_has_acl_restrictions(db, rt, rid)
    ]
    eff = await effective_permissions(db, viewer_sub, resource_type, resource_id, payload)
    creator_subject, creator_display_name = await _channel_creator_identity(
        db, resource_type, resource_id
    )
    grant_rows, owner, owner_label = await _grant_labels(
        db,
        entries,
        creator_subject=creator_subject,
        creator_display_name=creator_display_name,
    )
    grant_rows, owner, owner_label = await _enrich_default_owner_grant(
        db,
        resource_type,
        resource_id,
        entries,
        grant_rows,
        owner,
        owner_label,
        creator_subject=creator_subject,
        creator_display_name=creator_display_name,
    )
    return ResourceAclOut(
        resource_type=resource_type,
        resource_id=resource_id,
        grants=grant_rows,
        effective_permissions=perm_label(eff),
        inherits_from=inherits,
        owner_subject=owner,
        owner_label=owner_label,
        created_by=creator_subject,
    )


async def persist_resource_acl(
    db: AsyncSession,
    resource_type: str,
    resource_id: str,
    body: ResourceAclPut,
    viewer_sub: str,
    payload: dict,
    *,
    skip_manage_check: bool = False,
) -> ResourceAclOut:
    if not skip_manage_check:
        can_manage = await check_resource_access(db, payload, viewer_sub, resource_type, resource_id, PERM_MANAGE)
        if not can_manage:
            has_any = await resource_has_acl_restrictions(db, resource_type, resource_id)
            if has_any:
                raise HTTPException(status_code=403, detail="Manage permission required to change sharing")

    parsed = _parse_grants(body)
    for g in parsed:
        if g["grantee_type"] == GRANTEE_GROUP and g["grantee_id"]:
            if not await db.get(AccessGroup, g["grantee_id"]):
                raise HTTPException(status_code=400, detail=f"Group not found: {g['grantee_id']}")

    await _ensure_owner_in_parsed(db, resource_type, resource_id, parsed)
    entries = await replace_resource_acl(db, resource_type, resource_id, parsed)
    await db.commit()
    return await serialize_resource_acl(
        db, resource_type, resource_id, viewer_sub, payload, entries=entries
    )


@router.get("/{resource_type}/{resource_id}/owner-candidates", response_model=list[OwnerCandidateOut])
async def get_owner_candidates(
    resource_type: str,
    resource_id: str,
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(get_jwt_payload),
):
    if resource_type not in SECURABLE_RESOURCE_TYPES:
        raise HTTPException(status_code=400, detail="Unknown resource type")
    sub = payload.get("sub")
    if not isinstance(sub, str):
        raise HTTPException(status_code=401, detail="Unauthorized")
    if not await check_resource_access(db, payload, sub, resource_type, resource_id, PERM_MANAGE):
        raise HTTPException(status_code=403, detail="Manage permission required")

    return await list_local_owner_candidates(db)


@router.get("/{resource_type}/{resource_id}", response_model=ResourceAclOut)
async def get_resource_acl(
    resource_type: str,
    resource_id: str,
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(get_jwt_payload),
):
    if resource_type not in SECURABLE_RESOURCE_TYPES:
        raise HTTPException(status_code=400, detail="Unknown resource type")
    sub = payload.get("sub")
    if not isinstance(sub, str):
        raise HTTPException(status_code=401, detail="Unauthorized")
    if not await check_resource_access(db, payload, sub, resource_type, resource_id, PERM_READ):
        raise HTTPException(status_code=404, detail="Resource not found")

    return await serialize_resource_acl(db, resource_type, resource_id, sub, payload)


@router.put("/{resource_type}/{resource_id}", response_model=ResourceAclOut)
async def put_resource_acl(
    resource_type: str,
    resource_id: str,
    body: ResourceAclPut,
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(get_jwt_payload),
):
    if resource_type not in SECURABLE_RESOURCE_TYPES:
        raise HTTPException(status_code=400, detail="Unknown resource type")
    sub = payload.get("sub")
    if not isinstance(sub, str):
        raise HTTPException(status_code=401, detail="Unauthorized")
    return await persist_resource_acl(db, resource_type, resource_id, body, sub, payload)
