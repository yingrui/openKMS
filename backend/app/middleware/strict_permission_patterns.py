"""Optional strict enforcement: /api requests must match a catalog backend_api_pattern.

Paths outside ``/api`` (e.g. ``/internal-api/...``) are not evaluated here, so they can
use separate ingress or future middleware without sharing the same pattern catalog.

Implemented as pure ASGI (not BaseHTTPMiddleware) so nested HTTP from Ontology
Function Client → same process does not deadlock while execute awaits ofs.
"""

from __future__ import annotations

from fastapi import HTTPException
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.api.auth import (
    authenticate_request,
    jwt_payload_is_admin,
)
from app.config import settings
from app.database import async_session_maker
from app.services.identity.permissions.permission_catalog import PERM_ALL
from app.services.identity.permissions.permission_pattern_cache import get_compiled_pattern_rules
from app.services.identity.permissions.permission_pattern_engine import resolve_required_permission_keys
from app.services.identity.permissions.permission_resolution import resolve_oidc_permission_keys, resolve_user_permission_keys

# No authentication required. Prefer /api/public/<resource> for non-auth data reads (not /api/auth/*).
_UNAUTH_EXACT: frozenset[tuple[str, str]] = frozenset(
    {
        ("GET", "/api/auth/public-config"),
        ("GET", "/api/public/system"),
        ("POST", "/api/auth/register"),
        ("POST", "/api/auth/login"),
    }
)

# Authenticated; pattern resolution skipped (bootstrap / shared read-only)
_AUTH_PATTERN_SKIP_EXACT: frozenset[tuple[str, str]] = frozenset(
    {
        ("GET", "/api/auth/me"),
        ("PATCH", "/api/auth/me"),
        ("GET", "/api/auth/permission-catalog"),
        ("POST", "/api/auth/logout"),
        ("GET", "/api/feature-toggles"),
        ("HEAD", "/api/feature-toggles"),
    }
)

_OPENAPI_EXACT: frozenset[tuple[str, str]] = frozenset(
    {
        ("GET", "/openapi.json"),
        ("GET", "/docs"),
        # The docs UI's own assets — vendored, so the page works without a CDN.
        ("GET", "/static/swagger-ui/swagger-ui-bundle.js"),
        ("GET", "/static/swagger-ui/swagger-ui.css"),
        ("GET", "/static/swagger-ui/favicon-32x32.png"),
    }
)


#: **Catalog data plane** — reads decided by the data resource grant, not by an operation key.
#: These paths deliberately match no `security_permissions` pattern: matching one would mean
#: a key decided whether a caller may read rows, which is the confusion this split removes.
#: The handlers enforce their own gate (`require_model_access`, `resolve_catalog_scope`).
_DATA_PLANE_GET_SUFFIXES: tuple[str, ...] = (
    "/fields",
    "/export",
    "/metrics",
    "/compute",
    "/runs",
)


def _is_data_plane(method: str, path: str) -> bool:
    """True for a Catalog read/query path whose gate is the resource grant."""
    parts = [p for p in path.split("/") if p]
    # /api/semantic-models/{id}[/...]
    if len(parts) >= 3 and parts[:2] == ["api", "semantic-models"]:
        rest = parts[3:]
        if method in ("POST",) and rest in (["query"], ["sql"]):
            return True
        if method in ("GET", "HEAD") and (not rest or path.endswith(_DATA_PLANE_GET_SUFFIXES)):
            return True
    # /api/metrics[/{id}[/compute|/runs]]
    if parts[:2] == ["api", "metrics"] and method in ("GET", "HEAD"):
        return True
    # /api/data-resources[/{id}] — a granted caller must be able to find their resource.
    if parts[:2] == ["api", "data-resources"] and method in ("GET", "HEAD"):
        return True
    return False


def _norm_path(path: str) -> str:
    p = path.split("?", 1)[0]
    if len(p) > 1 and p.endswith("/"):
        p = p[:-1]
    return p or "/"


class StrictPermissionPatternMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        if not settings.enforce_permission_patterns_strict:
            await self.app(scope, receive, send)
            return

        request = Request(scope, receive)
        method = request.method.upper()
        path = _norm_path(request.url.path)

        if not path.startswith("/api"):
            await self.app(scope, receive, send)
            return

        if method == "OPTIONS":
            await self.app(scope, receive, send)
            return

        if (method, path) in _OPENAPI_EXACT:
            await self.app(scope, receive, send)
            return

        if (method, path) in _UNAUTH_EXACT:
            await self.app(scope, receive, send)
            return

        try:
            async with async_session_maker() as db:
                await authenticate_request(request, db)
        except HTTPException as e:
            if e.status_code == 401:
                await JSONResponse({"detail": e.detail}, status_code=401)(scope, receive, send)
                return
            raise

        payload = request.state.openkms_jwt_payload
        if jwt_payload_is_admin(payload):
            await self.app(scope, receive, send)
            return
        sub = payload.get("sub")
        if sub == "local-cli":
            await self.app(scope, receive, send)
            return

        if (method, path) in _AUTH_PATTERN_SKIP_EXACT:
            await self.app(scope, receive, send)
            return

        if path.startswith("/api/auth/api-keys"):
            await self.app(scope, receive, send)
            return

        # Catalog data plane: authentication is enough here — the handler decides access from
        # the data resource grant (a public model is open to any authenticated caller). No
        # permission key may stand in for that decision.
        if _is_data_plane(method, path):
            await self.app(scope, receive, send)
            return

        if not isinstance(sub, str):
            await JSONResponse({"detail": "Forbidden"}, status_code=403)(scope, receive, send)
            return

        async with async_session_maker() as db:
            rules = await get_compiled_pattern_rules(db, float(settings.permission_pattern_cache_ttl_seconds))
            required_keys = resolve_required_permission_keys(method, path, rules)

            if required_keys is None:
                await JSONResponse(
                    {
                        "detail": "No permission pattern covers this API path. "
                        "Add a backend_api_patterns entry in security_permissions or disable strict mode."
                    },
                    status_code=403,
                )(scope, receive, send)
                return

            if settings.auth_mode == "local":
                perms = await resolve_user_permission_keys(db, sub)
            else:
                perms = await resolve_oidc_permission_keys(db, payload)

        if PERM_ALL in perms or (required_keys and perms.intersection(required_keys)):
            await self.app(scope, receive, send)
            return

        need = ", ".join(sorted(required_keys))
        await JSONResponse(
            {"detail": f"Missing permission: need one of ({need})"},
            status_code=403,
        )(scope, receive, send)
