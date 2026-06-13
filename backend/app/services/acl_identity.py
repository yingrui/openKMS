"""ACL subject identity resolution and owner candidate listing."""

from __future__ import annotations

import re
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.access_group import AccessGroupMember


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
