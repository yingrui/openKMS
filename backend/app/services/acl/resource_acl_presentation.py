"""Build display-ready ACL views (grant labels, default owner, effective permissions)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.access_group import AccessGroup
from app.schemas.resource_acl import AclGrantOut, OwnerCandidateOut, ResourceAclOut
from app.services.acl.resource_acl_constants import (
    GRANTEE_AUTHENTICATED,
    GRANTEE_GROUP,
    GRANTEE_USER,
    PERM_ALL_DATA,
    RT_ARTICLE_CHANNEL,
    RT_DATASET,
    RT_DOCUMENT_CHANNEL,
    RT_EVALUATION,
    RT_GLOSSARY,
    RT_KNOWLEDGE_BASE,
    RT_LINK_TYPE,
    RT_OBJECT_TYPE,
    RT_PROJECT,
    RT_WIKI_SPACE,
    perm_label,
)
from app.services.acl.resource_acl_service import (
    effective_permissions,
    list_acl_entries,
    list_owner_candidates,
    resolve_subject_display,
    resource_context_chain,
    resource_has_acl_restrictions,
    user_grant_matches,
)


async def resource_creator_identity(
    db: AsyncSession, resource_type: str, resource_id: str
) -> tuple[str | None, str | None]:
    from app.models.article_channel import ArticleChannel
    from app.models.dataset import Dataset
    from app.models.document_channel import DocumentChannel
    from app.models.evaluation import Evaluation
    from app.models.glossary import Glossary
    from app.models.knowledge_base import KnowledgeBase
    from app.models.link_type import LinkType
    from app.models.object_type import ObjectType
    from app.models.project import Project
    from app.models.wiki_models import WikiSpace

    model = {
        RT_DOCUMENT_CHANNEL: DocumentChannel,
        RT_ARTICLE_CHANNEL: ArticleChannel,
        RT_WIKI_SPACE: WikiSpace,
        RT_KNOWLEDGE_BASE: KnowledgeBase,
        RT_EVALUATION: Evaluation,
        RT_GLOSSARY: Glossary,
        RT_DATASET: Dataset,
        RT_OBJECT_TYPE: ObjectType,
        RT_LINK_TYPE: LinkType,
        RT_PROJECT: Project,
    }.get(resource_type)
    row = await db.get(model, resource_id) if model else None
    if not row:
        return None, None
    return row.created_by, row.created_by_name


async def grant_labels(
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
            hint: str | None = getattr(g, "grantee_label", None)
            if hint and not str(hint).strip():
                hint = None
            if creator_subject and creator_display_name:
                if g.grantee_id == creator_subject:
                    hint = hint or creator_display_name
                elif await user_grant_matches(db, g.grantee_id, creator_subject, None):
                    hint = hint or creator_display_name
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


async def enrich_default_owner_grant(
    db: AsyncSession,
    entries: list,
    grant_rows: list[AclGrantOut],
    owner: str | None,
    owner_label: str | None,
    *,
    creator_subject: str | None,
    creator_display_name: str | None,
) -> tuple[list[AclGrantOut], str | None, str | None]:
    """When no persisted owner ACL exists, default to the resource creator with full permissions."""
    if any(e.grantee_type == GRANTEE_USER for e in entries) or not creator_subject:
        return grant_rows, owner, owner_label
    label = await resolve_subject_display(db, creator_subject, display_hint=creator_display_name)
    enriched = list(grant_rows) + [
        AclGrantOut(
            grantee_type=GRANTEE_USER,
            grantee_id=creator_subject,
            permissions=perm_label(PERM_ALL_DATA),
            grantee_label=label,
            is_owner=True,
        )
    ]
    return enriched, creator_subject, label


async def labeled_grants(
    db: AsyncSession, resource_type: str, resource_id: str, entries: list
) -> tuple[list[AclGrantOut], str | None, str | None, str | None]:
    """Return (grants, owner_subject, owner_label, creator_subject) including the default owner row."""
    creator_subject, creator_display_name = await resource_creator_identity(db, resource_type, resource_id)
    grant_rows, owner, owner_label = await grant_labels(
        db,
        entries,
        creator_subject=creator_subject,
        creator_display_name=creator_display_name,
    )
    grant_rows, owner, owner_label = await enrich_default_owner_grant(
        db,
        entries,
        grant_rows,
        owner,
        owner_label,
        creator_subject=creator_subject,
        creator_display_name=creator_display_name,
    )
    return grant_rows, owner, owner_label, creator_subject


async def list_local_owner_candidates(db: AsyncSession) -> list[OwnerCandidateOut]:
    rows = await list_owner_candidates(db)
    return [OwnerCandidateOut(subject=subject, label=label) for subject, label in rows]


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
    grant_rows, owner, owner_label, creator_subject = await labeled_grants(
        db, resource_type, resource_id, entries
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
