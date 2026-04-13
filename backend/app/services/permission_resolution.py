"""Resolve operation permissions from DB for /me and require_permission."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.security_role import SecurityRole, SecurityRolePermission, UserSecurityRole


def jwt_realm_role_names(payload: dict) -> set[str]:
    """Normalized realm role strings from OIDC-style JWT (e.g. Keycloak realm_access.roles)."""
    realm = payload.get("realm_access") or {}
    raw = realm.get("roles") if isinstance(realm, dict) else []
    if not isinstance(raw, list):
        return set()
    return {str(r).strip() for r in raw if r is not None and str(r).strip()}


async def resolve_user_permission_keys(db: AsyncSession, user_id: str) -> set[str]:
    """Union of permission_key from all security roles assigned to the local user."""
    result = await db.execute(
        select(SecurityRolePermission.permission_key)
        .join(UserSecurityRole, UserSecurityRole.role_id == SecurityRolePermission.role_id)
        .where(UserSecurityRole.user_id == user_id)
    )
    return {row[0] for row in result.all() if row[0]}


async def resolve_oidc_permission_keys(db: AsyncSession, jwt_payload: dict) -> set[str]:
    """Union of permissions for security roles whose name matches a JWT realm role (realm_access.roles)."""
    names = jwt_realm_role_names(jwt_payload)
    if not names:
        return set()
    result = await db.execute(
        select(SecurityRolePermission.permission_key)
        .join(SecurityRole, SecurityRole.id == SecurityRolePermission.role_id)
        .where(SecurityRole.name.in_(names))
    )
    return {row[0] for row in result.all() if row[0]}
