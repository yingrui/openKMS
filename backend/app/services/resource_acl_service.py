"""Hierarchical resource ACL: resolve effective permissions and list filters."""

from __future__ import annotations

import re
from typing import Any

from sqlalchemy import false, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.access_group import AccessGroup
from app.models.article import Article
from app.models.article_channel import ArticleChannel
from app.models.document import Document
from app.models.document_channel import DocumentChannel
from app.models.access_group import AccessGroupMember
from app.models.resource_acl import ResourceAclEntry
from app.models.wiki_models import WikiPage, WikiSpace
from app.services.resource_acl_constants import (
    GRANTEE_AUTHENTICATED,
    GRANTEE_GROUP,
    GRANTEE_USER,
    LEAF_CONTAINER,
    PERM_MANAGE,
    PERM_READ,
    PERM_WRITE,
    RT_ARTICLE,
    RT_ARTICLE_CHANNEL,
    RT_DOCUMENT,
    RT_DOCUMENT_CHANNEL,
    RT_WIKI_PAGE,
    RT_WIKI_SPACE,
    SECURABLE_RESOURCE_TYPES,
    perm_satisfies,
)


def jwt_is_admin(payload: dict) -> bool:
    realm = payload.get("realm_access") or {}
    roles = realm.get("roles") if isinstance(realm, dict) else []
    if not isinstance(roles, list):
        return False
    return "admin" in {str(r) for r in roles if r is not None}


def _acl_subject(payload: dict, subject: str | None) -> bool:
    """True for signed-in users subject to data ACL (including JWT admins)."""
    if not subject or subject == "local-cli":
        return False
    return True


def acl_applies(payload: dict, subject: str | None) -> bool:
    """True when resource ACL filtering should run for this caller."""
    return _acl_subject(payload, subject)


# Backward-compatible alias used across the codebase
def scope_applies(payload: dict, subject: str | None) -> bool:
    return acl_applies(payload, subject)


def subject_aliases(subject: str, payload: dict | None = None) -> set[str]:
    """Identity strings that may appear in access_group_members.subject."""
    aliases: set[str] = set()
    if subject and subject.strip():
        aliases.add(subject.strip())
    if not payload:
        return aliases
    for key in ("preferred_username", "name", "email"):
        v = payload.get(key)
        if isinstance(v, str) and v.strip():
            aliases.add(v.strip())
    return aliases


async def resolve_subject_display(
    db: AsyncSession,
    subject: str,
    *,
    display_hint: str | None = None,
) -> str:
    """Human-readable username for an ACL subject (local user id, OIDC sub, or username)."""
    if display_hint and display_hint.strip():
        return display_hint.strip()
    if not subject or not subject.strip():
        return subject
    subject = subject.strip()

    from sqlalchemy import func, or_

    from app.models.user import User
    from app.models.user_api_key import UserApiKey

    if settings.auth_mode == "oidc":
        from app.services.oidc_identity_service import display_label_for_oidc_sub

        directory_label = await display_label_for_oidc_sub(db, subject)
        if directory_label:
            return directory_label

    user = await db.get(User, subject)
    if user:
        return user.username

    r = await db.execute(
        select(User).where(
            or_(
                func.lower(User.username) == subject.lower(),
                func.lower(User.email) == subject.lower(),
            )
        )
    )
    user = r.scalar_one_or_none()
    if user:
        return user.username

    r = await db.execute(
        select(UserApiKey.display_username, UserApiKey.display_email)
        .where(UserApiKey.owner_sub == subject)
        .order_by(UserApiKey.created_at.desc())
        .limit(1)
    )
    key_row = r.first()
    if key_row:
        uname, email = key_row[0], key_row[1]
        if uname and str(uname).strip():
            return str(uname).strip()
        if email and str(email).strip():
            r2 = await db.execute(
                select(User.username).where(func.lower(User.email) == str(email).strip().lower())
            )
            from_username = r2.scalar_one_or_none()
            if from_username:
                return str(from_username)

    hint = await _display_hints_for_subject(db, subject)
    if hint:
        return hint

    return subject


async def _display_hints_for_subject(db: AsyncSession, canonical: str) -> str | None:
    """Resolve display name without personal API keys (groups, created_by_name, users)."""
    from app.models.article_channel import ArticleChannel
    from app.models.document_channel import DocumentChannel
    from app.models.knowledge_base import KnowledgeBase
    from app.models.wiki_models import WikiSpace

    for model in (DocumentChannel, ArticleChannel, WikiSpace, KnowledgeBase):
        r = await db.execute(
            select(model.created_by_name)
            .where(model.created_by == canonical)
            .where(model.created_by_name.isnot(None))
            .limit(1)
        )
        name = r.scalar_one_or_none()
        if isinstance(name, str) and name.strip():
            return name.strip()

    members = await db.execute(select(AccessGroupMember.subject))
    for (subj,) in members.all():
        if not subj:
            continue
        raw = subj.strip()
        if raw == canonical or _looks_like_oidc_opaque_id(raw):
            continue
        if await normalize_user_grantee_id(db, raw, None) == canonical:
            return raw

    if settings.auth_mode == "oidc":
        from app.models.user import User

        users_result = await db.execute(select(User))
        for u in users_result.scalars().all():
            if str(u.id) == canonical:
                return u.username
            if await _oidc_sub_for_user_row(db, u) == canonical:
                return u.username

    return None


async def _oidc_sub_for_user_row(db: AsyncSession, user: Any) -> str | None:
    """Map a local users row to OIDC sub via identity directory or personal API keys."""
    from sqlalchemy import func, or_

    from app.models.oidc_identity import OidcIdentity
    from app.models.user_api_key import UserApiKey

    if user.username:
        r = await db.execute(
            select(OidcIdentity.sub)
            .where(func.lower(OidcIdentity.preferred_username) == user.username.lower())
            .order_by(OidcIdentity.last_seen_at.desc())
            .limit(1)
        )
        sub = r.scalar_one_or_none()
        if sub:
            return sub
    if user.email:
        r = await db.execute(
            select(OidcIdentity.sub)
            .where(func.lower(OidcIdentity.email) == user.email.lower())
            .order_by(OidcIdentity.last_seen_at.desc())
            .limit(1)
        )
        sub = r.scalar_one_or_none()
        if sub:
            return sub

    clauses = []
    if user.username:
        clauses.append(func.lower(UserApiKey.display_username) == user.username.lower())
    if user.email:
        clauses.append(func.lower(UserApiKey.display_email) == user.email.lower())
    if not clauses:
        return None
    r = await db.execute(
        select(UserApiKey.owner_sub)
        .where(or_(*clauses))
        .order_by(UserApiKey.created_at.desc())
        .limit(1)
    )
    return r.scalar_one_or_none()


async def _canonical_user_grantee_id(
    db: AsyncSession,
    user: Any,
    payload: dict | None = None,
) -> str:
    """Storage id for a user grant: users.id in local auth, OIDC sub when known."""
    if settings.auth_mode == "local":
        return str(user.id)
    sub = payload.get("sub") if payload else None
    if isinstance(sub, str):
        alias_lc = {a.lower() for a in subject_aliases(sub, payload)}
        if user.username and user.username.lower() in alias_lc:
            return sub
        if user.email and user.email.lower() in alias_lc:
            return sub
    oidc_sub = await _oidc_sub_for_user_row(db, user)
    if oidc_sub:
        return oidc_sub
    return str(user.id)


def _pick_richer_owner_label(current: str | None, new: str) -> str:
    """Prefer labels that include email or more detail (for duplicate alias merge)."""
    new = (new or "").strip()
    if not new:
        return current or ""
    if not current:
        return new
    if "@" in new and "@" not in current:
        return new
    if len(new) > len(current):
        return new
    return current


def _label_from_api_key_fields(
    username: str | None, email: str | None, *, fallback: str
) -> str:
    label = (username or "").strip() or fallback
    em = (email or "").strip()
    if em and em.lower() != label.lower():
        return f"{label} ({em})"
    return label


async def _owner_label_for_subject(db: AsyncSession, canonical: str) -> str:
    from sqlalchemy import func, or_

    from app.models.user import User
    from app.models.user_api_key import UserApiKey

    r = await db.execute(
        select(UserApiKey.display_username, UserApiKey.display_email)
        .where(UserApiKey.owner_sub == canonical)
        .order_by(UserApiKey.created_at.desc())
        .limit(1)
    )
    row = r.first()
    if row and (row[0] or row[1]):
        return _label_from_api_key_fields(row[0], row[1], fallback=canonical)

    user = await db.get(User, canonical)
    if not user:
        r = await db.execute(
            select(User).where(
                or_(
                    func.lower(User.username) == canonical.lower(),
                    func.lower(User.email) == canonical.lower(),
                )
            )
        )
        user = r.scalar_one_or_none()
    if user:
        return _label_from_api_key_fields(user.username, user.email, fallback=user.username)

    return await resolve_subject_display(db, canonical)


async def _add_owner_candidate(
    db: AsyncSession,
    by_canonical: dict[str, str],
    raw_subject: str,
    label: str | None = None,
) -> None:
    """Merge one alias into by_canonical under normalize_user_grantee_id canonical subject."""
    raw = (raw_subject or "").strip()
    if not raw:
        return
    canonical = await normalize_user_grantee_id(db, raw, None)
    if not canonical:
        return
    lbl = (label or "").strip() or await _owner_label_for_subject(db, canonical)
    by_canonical[canonical] = _pick_richer_owner_label(by_canonical.get(canonical), lbl)


async def list_owner_candidates(db: AsyncSession) -> list[tuple[str, str]]:
    """Known identities for owner assignment: (canonical subject, label).

    OIDC mode collapses username, local users.id, and OIDC sub to one row per person.
    """
    if settings.auth_mode == "local":
        from app.models.user import User

        result = await db.execute(select(User).order_by(User.username))
        return [(str(u.id), u.username) for u in result.scalars().all()]

    from sqlalchemy import func

    from app.models.access_group import AccessGroupMember
    from app.models.user import User
    from app.models.user_api_key import UserApiKey

    by_canonical: dict[str, str] = {}

    from app.models.oidc_identity import OidcIdentity

    identities = await db.execute(
        select(OidcIdentity.sub, OidcIdentity.preferred_username, OidcIdentity.email).order_by(
            OidcIdentity.preferred_username
        )
    )
    for sub, username, email in identities.all():
        if not sub:
            continue
        await _add_owner_candidate(
            db,
            by_canonical,
            sub,
            _label_from_api_key_fields(username, email, fallback=sub),
        )

    keys = await db.execute(
        select(UserApiKey.owner_sub, UserApiKey.display_username, UserApiKey.display_email)
        .where(UserApiKey.owner_sub != "")
        .order_by(UserApiKey.created_at.desc())
    )
    for owner_sub, username, email in keys.all():
        if not owner_sub:
            continue
        await _add_owner_candidate(
            db,
            by_canonical,
            owner_sub,
            _label_from_api_key_fields(username, email, fallback=owner_sub),
        )

    users = await db.execute(select(User).order_by(User.username))
    for user in users.scalars().all():
        await _add_owner_candidate(db, by_canonical, str(user.id), user.username)
        oidc_sub = await _oidc_sub_for_user_row(db, user)
        if oidc_sub:
            await _add_owner_candidate(
                db,
                by_canonical,
                oidc_sub,
                _label_from_api_key_fields(user.username, user.email, fallback=user.username),
            )

    members = await db.execute(select(func.distinct(AccessGroupMember.subject)))
    for (subj,) in members.all():
        if subj:
            await _add_owner_candidate(db, by_canonical, subj)

    return sorted(by_canonical.items(), key=lambda pair: pair[1].lower())


async def canonicalize_group_member_subjects(
    db: AsyncSession, raw_subjects: list[str]
) -> list[str]:
    """Normalize member subjects for storage (OIDC sub or local users.id); dedupe aliases."""
    out: list[str] = []
    seen: set[str] = set()
    for raw in raw_subjects:
        s = (raw or "").strip()
        if not s:
            continue
        canonical = await normalize_user_grantee_id(db, s, None)
        if not canonical or canonical in seen:
            continue
        seen.add(canonical)
        out.append(canonical)
    return out


async def normalize_user_grantee_id(
    db: AsyncSession,
    grantee_id: str,
    payload: dict | None = None,
) -> str:
    """Map username / alias to canonical subject (local user id or OIDC sub) for ACL storage."""
    raw = (grantee_id or "").strip()
    if not raw:
        return raw
    sub = payload.get("sub") if payload else None
    if isinstance(sub, str) and raw == sub:
        return raw
    if payload and isinstance(sub, str):
        aliases = subject_aliases(sub, payload)
        if raw in aliases or raw.lower() in {a.lower() for a in aliases}:
            return sub

    from sqlalchemy import func, or_

    from app.models.user import User
    from app.models.user_api_key import UserApiKey

    by_id = await db.get(User, raw)
    if by_id:
        return await _canonical_user_grantee_id(db, by_id, payload)
    r = await db.execute(
        select(User).where(
            or_(func.lower(User.username) == raw.lower(), func.lower(User.email) == raw.lower())
        )
    )
    user = r.scalar_one_or_none()
    if user:
        return await _canonical_user_grantee_id(db, user, payload)
    r = await db.execute(
        select(UserApiKey.owner_sub)
        .where(func.lower(UserApiKey.display_username) == raw.lower())
        .order_by(UserApiKey.created_at.desc())
        .limit(1)
    )
    oidc_sub = r.scalar_one_or_none()
    if oidc_sub:
        return oidc_sub
    if "@" in raw:
        r = await db.execute(
            select(UserApiKey.owner_sub)
            .where(func.lower(UserApiKey.display_email) == raw.lower())
            .order_by(UserApiKey.created_at.desc())
            .limit(1)
        )
        oidc_sub = r.scalar_one_or_none()
        if oidc_sub:
            return oidc_sub
    from app.services.oidc_identity_service import lookup_oidc_sub_by_alias

    directory_sub = await lookup_oidc_sub_by_alias(db, raw)
    if directory_sub:
        return directory_sub
    return raw


def _looks_like_oidc_opaque_id(subject: str) -> bool:
    """True when subject is likely an IdP sub (UUID, auth0|…), not a bare short username."""
    s = subject.strip()
    if not s:
        return False
    if "|" in s:
        return True
    if len(s) > 40:
        return True
    return bool(
        re.fullmatch(
            r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
            s,
            flags=re.IGNORECASE,
        )
    )


async def normalize_owner_grantee_id(
    db: AsyncSession,
    grantee_id: str,
    payload: dict | None = None,
) -> str:
    """Canonical subject for owner ACL (OIDC sub, local users.id, or username when unresolved)."""
    return await normalize_user_grantee_id(db, grantee_id, payload)


async def user_grant_matches(
    db: AsyncSession,
    grantee_id: str | None,
    subject: str,
    payload: dict | None = None,
) -> bool:
    """True when a persisted user grant applies to the current subject."""
    if not grantee_id or not grantee_id.strip():
        return False
    canonical = await normalize_user_grantee_id(db, grantee_id, payload)
    if canonical == subject:
        return True
    aliases = subject_aliases(subject, payload)
    if canonical in aliases or canonical.lower() in {a.lower() for a in aliases}:
        return True
    from app.models.user import User

    user = await db.get(User, canonical)
    if user:
        if str(user.id) == subject:
            return True
        alias_lc = {a.lower() for a in aliases}
        if user.username and user.username.lower() in alias_lc:
            return True
        if user.email and user.email.lower() in alias_lc:
            return True
    return False


async def user_group_ids(db: AsyncSession, subject: str, payload: dict | None = None) -> list[str]:
    aliases = subject_aliases(subject, payload)
    if not aliases:
        return []
    if settings.auth_mode == "local":
        from sqlalchemy import func, or_

        from app.models.user import User

        lowered = {a.lower() for a in aliases}
        ur = await db.execute(
            select(User.id, User.username).where(
                or_(User.id.in_(aliases), func.lower(User.username).in_(lowered))
            )
        )
        for uid, uname in ur.all():
            aliases.add(str(uid))
            if uname:
                aliases.add(uname)
                aliases.add(uname.lower())
    result = await db.execute(
        select(AccessGroupMember.group_id).where(AccessGroupMember.subject.in_(list(aliases)))
    )
    return list({str(row[0]) for row in result.all()})


async def _acl_entries_for_resources(
    db: AsyncSession, pairs: list[tuple[str, str]]
) -> list[ResourceAclEntry]:
    if not pairs:
        return []
    clauses = [
        (ResourceAclEntry.resource_type == rt) & (ResourceAclEntry.resource_id == rid)
        for rt, rid in pairs
    ]
    result = await db.execute(select(ResourceAclEntry).where(or_(*clauses)))
    return list(result.scalars().all())


async def _document_channel_chain(db: AsyncSession, channel_id: str) -> list[tuple[str, str]]:
    chain: list[tuple[str, str]] = []
    cur_id: str | None = channel_id
    seen: set[str] = set()
    while cur_id and cur_id not in seen:
        seen.add(cur_id)
        chain.append((RT_DOCUMENT_CHANNEL, cur_id))
        ch = await db.get(DocumentChannel, cur_id)
        cur_id = ch.parent_id if ch else None
    return chain


async def _article_channel_chain(db: AsyncSession, channel_id: str) -> list[tuple[str, str]]:
    chain: list[tuple[str, str]] = []
    cur_id: str | None = channel_id
    seen: set[str] = set()
    while cur_id and cur_id not in seen:
        seen.add(cur_id)
        chain.append((RT_ARTICLE_CHANNEL, cur_id))
        ch = await db.get(ArticleChannel, cur_id)
        cur_id = ch.parent_id if ch else None
    return chain


async def resource_context_chain(
    db: AsyncSession, resource_type: str, resource_id: str
) -> list[tuple[str, str]]:
    """Resource itself plus container ancestors for ACL inheritance (nearest first)."""
    chain: list[tuple[str, str]] = [(resource_type, resource_id)]

    if resource_type == RT_DOCUMENT:
        doc = await db.get(Document, resource_id)
        if doc:
            chain.extend(await _document_channel_chain(db, doc.channel_id))
    elif resource_type == RT_ARTICLE:
        art = await db.get(Article, resource_id)
        if art:
            chain.extend(await _article_channel_chain(db, art.channel_id))
    elif resource_type == RT_WIKI_PAGE:
        page = await db.get(WikiPage, resource_id)
        if page:
            chain.append((RT_WIKI_SPACE, page.wiki_space_id))
    elif resource_type in LEAF_CONTAINER.values():
        pass
    elif resource_type in {RT_WIKI_SPACE, RT_DOCUMENT_CHANNEL, RT_ARTICLE_CHANNEL}:
        if resource_type == RT_DOCUMENT_CHANNEL:
            chain.extend(await _document_channel_chain(db, resource_id))
            chain = list(dict.fromkeys(chain))
        elif resource_type == RT_ARTICLE_CHANNEL:
            chain.extend(await _article_channel_chain(db, resource_id))
            chain = list(dict.fromkeys(chain))

    return list(dict.fromkeys(chain))


async def resource_has_acl_restrictions(
    db: AsyncSession, resource_type: str, resource_id: str
) -> bool:
    chain = await resource_context_chain(db, resource_type, resource_id)
    entries = await _acl_entries_for_resources(db, chain)
    return len(entries) > 0


def _grant_matches(
    entry: ResourceAclEntry,
    subject: str,
    group_ids: set[str],
    *,
    subject_alias_set: set[str] | None = None,
) -> bool:
    if entry.grantee_type == GRANTEE_USER:
        if not entry.grantee_id:
            return False
        grantee = entry.grantee_id.strip()
        if grantee == subject:
            return True
        if subject_alias_set:
            if grantee in subject_alias_set:
                return True
            lower = grantee.lower()
            if lower in {a.lower() for a in subject_alias_set}:
                return True
        return False
    if entry.grantee_type == GRANTEE_GROUP:
        return entry.grantee_id in group_ids
    if entry.grantee_type == GRANTEE_AUTHENTICATED:
        return True
    return False


def _authenticated_bits_from_chain(
    chain: list[tuple[str, str]], entries: list[ResourceAclEntry]
) -> int | None:
    """Nearest explicit Others (authenticated) grant on chain; 0 means deny others here."""
    by_resource: dict[tuple[str, str], int] = {}
    for entry in entries:
        if entry.grantee_type == GRANTEE_AUTHENTICATED:
            by_resource[(entry.resource_type, entry.resource_id)] = entry.permissions
    for rt, rid in chain:
        if (rt, rid) in by_resource:
            return by_resource[(rt, rid)]
    return None


async def effective_permissions(
    db: AsyncSession,
    subject: str,
    resource_type: str,
    resource_id: str,
    payload: dict | None = None,
) -> int:
    group_ids = set(await user_group_ids(db, subject, payload))
    alias_set = subject_aliases(subject, payload)
    if settings.auth_mode == "local":
        from app.models.user import User

        user = await db.get(User, subject)
        if user:
            alias_set.add(str(user.id))
            alias_set.add(user.username)
            alias_set.add(user.username.lower())
    chain = await resource_context_chain(db, resource_type, resource_id)
    entries = await _acl_entries_for_resources(db, chain)
    bits = 0
    auth_bits = _authenticated_bits_from_chain(chain, entries)
    if auth_bits:
        bits |= auth_bits
    for entry in entries:
        if entry.grantee_type == GRANTEE_AUTHENTICATED:
            continue
        if entry.grantee_type == GRANTEE_USER:
            if await user_grant_matches(db, entry.grantee_id, subject, payload):
                bits |= entry.permissions
            continue
        if _grant_matches(entry, subject, group_ids, subject_alias_set=alias_set):
            bits |= entry.permissions
    return bits


async def check_resource_access(
    db: AsyncSession,
    payload: dict,
    subject: str,
    resource_type: str,
    resource_id: str,
    required: int,
) -> bool:
    # JWT admin may configure sharing (manage) but still needs ACL grants to read/write data.
    if jwt_is_admin(payload) and required == PERM_MANAGE:
        return True
    if not _acl_subject(payload, subject):
        return True
    if not await resource_has_acl_restrictions(db, resource_type, resource_id):
        return True
    bits = await effective_permissions(db, subject, resource_type, resource_id, payload)
    return perm_satisfies(bits, required)


async def bootstrap_owner_acl(
    db: AsyncSession,
    resource_type: str,
    resource_id: str,
    owner_subject: str | None,
) -> None:
    """Grant owner rwm only. No Others row — non-owners are denied once any ACL exists.

    Pre-existing wiki spaces / knowledge bases (and channels) may have Others rwm from
    Alembic seed migrations; new creates rely on this owner-only bootstrap.
    """
    if not owner_subject or resource_type not in SECURABLE_RESOURCE_TYPES:
        return
    existing = await db.execute(
        select(ResourceAclEntry).where(
            ResourceAclEntry.resource_type == resource_type,
            ResourceAclEntry.resource_id == resource_id,
            ResourceAclEntry.grantee_type == GRANTEE_USER,
            ResourceAclEntry.grantee_id == owner_subject,
        )
    )
    if existing.scalar_one_or_none():
        return
    db.add(
        ResourceAclEntry(
            resource_type=resource_type,
            resource_id=resource_id,
            grantee_type=GRANTEE_USER,
            grantee_id=owner_subject,
            permissions=PERM_READ | PERM_WRITE | PERM_MANAGE,
        )
    )


async def list_acl_entries(
    db: AsyncSession, resource_type: str, resource_id: str
) -> list[ResourceAclEntry]:
    result = await db.execute(
        select(ResourceAclEntry)
        .where(
            ResourceAclEntry.resource_type == resource_type,
            ResourceAclEntry.resource_id == resource_id,
        )
        .order_by(ResourceAclEntry.grantee_type, ResourceAclEntry.grantee_id)
    )
    return list(result.scalars().all())


async def replace_resource_acl(
    db: AsyncSession,
    resource_type: str,
    resource_id: str,
    grants: list[dict[str, Any]],
) -> list[ResourceAclEntry]:
    from sqlalchemy import delete

    await db.execute(
        delete(ResourceAclEntry).where(
            ResourceAclEntry.resource_type == resource_type,
            ResourceAclEntry.resource_id == resource_id,
        )
    )
    out: list[ResourceAclEntry] = []
    for g in grants:
        label = g.get("grantee_label")
        grantee_label = label.strip() if isinstance(label, str) and label.strip() else None
        entry = ResourceAclEntry(
            resource_type=resource_type,
            resource_id=resource_id,
            grantee_type=g["grantee_type"],
            grantee_id=g.get("grantee_id"),
            grantee_label=grantee_label,
            permissions=int(g["permissions"]),
        )
        db.add(entry)
        out.append(entry)
    await db.flush()
    return out


def _expand_channel_ids(all_channels: list, roots: set[str], id_attr: str = "id", parent_attr: str = "parent_id") -> set[str]:
    by_parent: dict[str | None, list] = {}
    for c in all_channels:
        by_parent.setdefault(getattr(c, parent_attr), []).append(c)

    out: set[str] = set()

    def walk(cid: str) -> None:
        if cid in out:
            return
        out.add(cid)
        for ch in by_parent.get(cid, []):
            walk(getattr(ch, id_attr))

    all_ids = {getattr(c, id_attr) for c in all_channels}
    for r in roots:
        if r in all_ids:
            walk(r)
    return out


async def readable_document_channel_ids(
    db: AsyncSession, payload: dict, subject: str
) -> set[str] | None:
    """Channel ids the user may list/read.

    Channels without ACL on themselves or any ancestor are open to all authenticated users.
    Restricted channels require a matching grant (group, user, or authenticated/Others).
    """
    if not isinstance(subject, str):
        return set()
    result = await db.execute(select(DocumentChannel.id))
    all_ids = {str(row[0]) for row in result.all()}
    if not all_ids:
        return set()
    readable: set[str] = set()
    for cid in all_ids:
        if not await resource_has_acl_restrictions(db, RT_DOCUMENT_CHANNEL, cid):
            readable.add(cid)
        elif await check_resource_access(db, payload, subject, RT_DOCUMENT_CHANNEL, cid, PERM_READ):
            readable.add(cid)
    return readable


async def readable_article_channel_ids(
    db: AsyncSession, payload: dict, subject: str
) -> set[str] | None:
    if not isinstance(subject, str):
        return set()
    result = await db.execute(select(ArticleChannel.id))
    all_ids = {str(row[0]) for row in result.all()}
    if not all_ids:
        return set()
    readable: set[str] = set()
    for cid in all_ids:
        if not await resource_has_acl_restrictions(db, RT_ARTICLE_CHANNEL, cid):
            readable.add(cid)
        elif await check_resource_access(db, payload, subject, RT_ARTICLE_CHANNEL, cid, PERM_READ):
            readable.add(cid)
    return readable


async def readable_resource_ids(
    db: AsyncSession, payload: dict, subject: str, resource_type: str
) -> set[str] | None:
    """Instance ids (KB, wiki space, etc.) readable by user; unset ACL = open."""
    if not isinstance(subject, str):
        return set()
    from app.models.dataset import Dataset
    from app.models.evaluation import Evaluation
    from app.models.glossary import Glossary
    from app.models.knowledge_base import KnowledgeBase
    from app.models.link_type import LinkType
    from app.models.object_type import ObjectType
    from app.services.resource_acl_constants import (
        RT_DATASET,
        RT_EVALUATION,
        RT_GLOSSARY,
        RT_KNOWLEDGE_BASE,
        RT_LINK_TYPE,
        RT_OBJECT_TYPE,
    )

    model_by_type = {
        RT_WIKI_SPACE: WikiSpace,
        RT_KNOWLEDGE_BASE: KnowledgeBase,
        RT_EVALUATION: Evaluation,
        RT_GLOSSARY: Glossary,
        RT_DATASET: Dataset,
        RT_OBJECT_TYPE: ObjectType,
        RT_LINK_TYPE: LinkType,
    }
    model = model_by_type.get(resource_type)
    if model is None:
        return None
    result = await db.execute(select(model.id))
    all_ids = {str(row[0]) for row in result.all()}
    readable: set[str] = set()
    for rid in all_ids:
        if not await resource_has_acl_restrictions(db, resource_type, rid):
            readable.add(rid)
        elif await check_resource_access(db, payload, subject, resource_type, rid, PERM_READ):
            readable.add(rid)
    return readable


# Legacy name used by list filters
async def accessible_document_channel_ids(
    db: AsyncSession, subject: str, payload: dict | None = None
) -> set[str] | None:
    if payload is None:
        return None
    return await readable_document_channel_ids(db, payload, subject)


async def accessible_article_channel_ids(
    db: AsyncSession, subject: str, payload: dict | None = None
) -> set[str] | None:
    if payload is None:
        return None
    return await readable_article_channel_ids(db, payload, subject)


async def accessible_resource_ids(
    db: AsyncSession, subject: str, resource_type: str, payload: dict | None = None
) -> set[str] | None:
    if payload is None:
        return None
    return await readable_resource_ids(db, payload, subject, resource_type)


async def scoped_document_predicate(db: AsyncSession, payload: dict, subject: str) -> Any | None:
    if not isinstance(subject, str):
        return false()
    allowed_channels = await readable_document_channel_ids(db, payload, subject)
    direct_docs = await _instance_ids_with_direct_read(db, subject, RT_DOCUMENT, payload)
    parts = []
    if allowed_channels:
        parts.append(Document.channel_id.in_(allowed_channels))
    if direct_docs:
        parts.append(Document.id.in_(direct_docs))
    if not parts:
        return false()
    return or_(*parts) if len(parts) > 1 else parts[0]


async def _instance_ids_with_direct_read(
    db: AsyncSession, subject: str, resource_type: str, payload: dict | None = None
) -> set[str]:
    group_ids = set(await user_group_ids(db, subject, payload))
    alias_set = subject_aliases(subject, payload)
    result = await db.execute(
        select(ResourceAclEntry).where(ResourceAclEntry.resource_type == resource_type)
    )
    out: set[str] = set()
    for entry in result.scalars().all():
        matched = False
        if entry.grantee_type == GRANTEE_USER:
            matched = await user_grant_matches(db, entry.grantee_id, subject, payload)
        else:
            matched = _grant_matches(entry, subject, group_ids, subject_alias_set=alias_set)
        if matched and perm_satisfies(entry.permissions, PERM_READ):
            out.add(entry.resource_id)
    return out


async def document_passes_scoped_predicate(
    db: AsyncSession, payload: dict, subject: str, doc: Document
) -> bool:
    if not isinstance(subject, str):
        return False
    if not await resource_has_acl_restrictions(db, RT_DOCUMENT, doc.id):
        chain = await resource_context_chain(db, RT_DOCUMENT, doc.id)
        if not any(await resource_has_acl_restrictions(db, rt, rid) for rt, rid in chain[1:]):
            return True
    return await check_resource_access(db, payload, subject, RT_DOCUMENT, doc.id, PERM_READ)


async def scoped_article_predicate(db: AsyncSession, payload: dict, subject: str) -> Any | None:
    if not isinstance(subject, str):
        return false()
    allowed_channels = await readable_article_channel_ids(db, payload, subject)
    direct = await _instance_ids_with_direct_read(db, subject, RT_ARTICLE, payload)
    parts = []
    if allowed_channels:
        parts.append(Article.channel_id.in_(allowed_channels))
    if direct:
        parts.append(Article.id.in_(direct))
    if not parts:
        return false()
    return or_(*parts) if len(parts) > 1 else parts[0]


async def article_passes_scoped_predicate(
    db: AsyncSession, payload: dict, subject: str, article: Article
) -> bool:
    if not isinstance(subject, str):
        return False
    if not await resource_has_acl_restrictions(db, RT_ARTICLE, article.id):
        chain = await _article_channel_chain(db, article.channel_id)
        if not any(await resource_has_acl_restrictions(db, rt, rid) for rt, rid in chain):
            return True
    return await check_resource_access(db, payload, subject, RT_ARTICLE, article.id, PERM_READ)


async def instance_visible(
    db: AsyncSession, payload: dict, subject: str, resource_type: str, resource_id: str
) -> bool:
    if not isinstance(subject, str):
        return False
    if not await resource_has_acl_restrictions(db, resource_type, resource_id):
        return True
    return await check_resource_access(db, payload, subject, resource_type, resource_id, PERM_READ)


async def channel_allowed_for_document_upload(
    db: AsyncSession, payload: dict, subject: str, channel_id: str
) -> bool:
    if not isinstance(subject, str):
        return False
    return await check_resource_access(
        db, payload, subject, RT_DOCUMENT_CHANNEL, channel_id, PERM_WRITE
    )


async def effective_wiki_space_ids(db: AsyncSession, subject: str, payload: dict | None = None) -> set[str] | None:
    return await accessible_resource_ids(db, subject, RT_WIKI_SPACE, payload)


async def effective_knowledge_base_ids(db: AsyncSession, subject: str, payload: dict | None = None) -> set[str] | None:
    from app.services.resource_acl_constants import RT_KNOWLEDGE_BASE

    return await accessible_resource_ids(db, subject, RT_KNOWLEDGE_BASE, payload)


async def effective_evaluation_ids(db: AsyncSession, subject: str, payload: dict | None = None) -> set[str] | None:
    from app.services.resource_acl_constants import RT_EVALUATION

    return await accessible_resource_ids(db, subject, RT_EVALUATION, payload)


async def effective_dataset_ids(db: AsyncSession, subject: str, payload: dict | None = None) -> set[str] | None:
    from app.services.resource_acl_constants import RT_DATASET

    return await accessible_resource_ids(db, subject, RT_DATASET, payload)


async def effective_object_type_ids(db: AsyncSession, subject: str, payload: dict | None = None) -> set[str] | None:
    from app.services.resource_acl_constants import RT_OBJECT_TYPE

    return await accessible_resource_ids(db, subject, RT_OBJECT_TYPE, payload)


async def effective_link_type_ids(db: AsyncSession, subject: str, payload: dict | None = None) -> set[str] | None:
    from app.services.resource_acl_constants import RT_LINK_TYPE

    return await accessible_resource_ids(db, subject, RT_LINK_TYPE, payload)


async def effective_channel_ids(db: AsyncSession, subject: str, payload: dict | None = None) -> set[str] | None:
    return await accessible_document_channel_ids(db, subject, payload)


async def effective_article_channel_ids(db: AsyncSession, subject: str, payload: dict | None = None) -> set[str] | None:
    return await accessible_article_channel_ids(db, subject, payload)


async def effective_channel_ids_with_data_resources(
    db: AsyncSession, payload: dict, subject: str
) -> set[str] | None:
    return await readable_document_channel_ids(db, payload, subject)
