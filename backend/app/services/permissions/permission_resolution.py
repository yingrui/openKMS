"""Resolve operation permissions from DB for /me and require_permission."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.security_role import SecurityRole, SecurityRolePermission, UserSecurityRole
from app.services.permissions.permission_catalog import PERM_ALL


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


def jwt_payload_is_admin(payload: dict[str, Any]) -> bool:
    realm_access = payload.get("realm_access", {})
    roles = realm_access.get("roles", []) if isinstance(realm_access, dict) else []
    if not isinstance(roles, list):
        return False
    return "admin" in {str(r) for r in roles if r is not None}


async def resolve_agent_permission_keys(db: AsyncSession, jwt_payload: dict[str, Any]) -> set[str]:
    """Permission keys resolved from JWT for API callers (e.g. future agent tooling)."""
    if jwt_payload_is_admin(jwt_payload):
        return {PERM_ALL}
    sub = jwt_payload.get("sub")
    if sub == "local-cli":
        return {PERM_ALL}
    if not isinstance(sub, str) or not sub.strip():
        return set()
    if settings.auth_mode == "local":
        return await resolve_user_permission_keys(db, sub)
    return await resolve_oidc_permission_keys(db, jwt_payload)
