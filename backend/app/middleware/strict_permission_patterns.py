"""Optional strict enforcement: /api requests must match a catalog backend_api_pattern."""

from __future__ import annotations

from fastapi import HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.api.auth import (
    jwt_payload_is_admin,
    require_auth,
)
from app.config import settings
from app.database import async_session_maker
from app.services.permission_catalog import PERM_ALL
from app.services.permission_pattern_cache import get_compiled_pattern_rules
from app.services.permission_pattern_engine import resolve_required_permission_keys
from app.services.permission_resolution import resolve_oidc_permission_keys, resolve_user_permission_keys

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
        ("GET", "/redoc"),
    }
)


def _norm_path(path: str) -> str:
    p = path.split("?", 1)[0]
    if len(p) > 1 and p.endswith("/"):
        p = p[:-1]
    return p or "/"


class StrictPermissionPatternMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        if not settings.enforce_permission_patterns_strict:
            return await call_next(request)

        method = request.method.upper()
        path = _norm_path(request.url.path)

        if not path.startswith("/api"):
            return await call_next(request)

        if method == "OPTIONS":
            return await call_next(request)

        if (method, path) in _OPENAPI_EXACT:
            return await call_next(request)

        if (method, path) in _UNAUTH_EXACT:
            return await call_next(request)

        try:
            await require_auth(request)
        except HTTPException as e:
            if e.status_code == 401:
                return JSONResponse({"detail": e.detail}, status_code=401)
            raise

        payload = request.state.openkms_jwt_payload
        if jwt_payload_is_admin(payload):
            return await call_next(request)
        sub = payload.get("sub")
        if sub == "local-cli":
            return await call_next(request)

        if (method, path) in _AUTH_PATTERN_SKIP_EXACT:
            return await call_next(request)

        if not isinstance(sub, str):
            return JSONResponse({"detail": "Forbidden"}, status_code=403)

        async with async_session_maker() as db:
            rules = await get_compiled_pattern_rules(db, float(settings.permission_pattern_cache_ttl_seconds))
            required_keys = resolve_required_permission_keys(method, path, rules)

            if required_keys is None:
                return JSONResponse(
                    {
                        "detail": "No permission pattern covers this API path. "
                        "Add a backend_api_patterns entry in security_permissions or disable strict mode."
                    },
                    status_code=403,
                )

            if settings.auth_mode == "local":
                perms = await resolve_user_permission_keys(db, sub)
            else:
                perms = await resolve_oidc_permission_keys(db, payload)

        if PERM_ALL in perms or (required_keys and perms.intersection(required_keys)):
            return await call_next(request)

        need = ", ".join(sorted(required_keys))
        return JSONResponse(
            {"detail": f"Missing permission: need one of ({need})"},
            status_code=403,
        )
