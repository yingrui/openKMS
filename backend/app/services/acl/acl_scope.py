"""ACL scope gating: when resource ACL applies to a caller."""

from __future__ import annotations

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
