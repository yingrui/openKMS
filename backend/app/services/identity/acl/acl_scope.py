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


def is_service_subject(payload: dict, subject: str | None) -> bool:
    """True for an internal service principal (``local-cli``, or an allowlisted machine client).

    Services skip the *content* ACL because they act on behalf of an already-authorized
    operation (a worker indexing a document). That is not true of the **Catalog data plane**:
    there a service is just another principal that must hold a grant, so
    ``catalog_access`` evaluates its grants explicitly instead of taking the bypass.
    """
    if subject == "local-cli":
        return True
    client_id = payload.get("azp") or payload.get("client_id")
    return isinstance(client_id, str) and bool(client_id)


def acl_applies(payload: dict, subject: str | None) -> bool:
    """True when resource ACL filtering should run for this caller."""
    return _acl_subject(payload, subject)


# Backward-compatible alias used across the codebase
def scope_applies(payload: dict, subject: str | None) -> bool:
    return acl_applies(payload, subject)
