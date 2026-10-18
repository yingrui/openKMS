"""Record every mutation, whoever made it — agent, person or script.

Outermost middleware: it sees the caller the auth layer resolved (via `request.state`) and the final
status code, including 403s and 500s. A rejected attempt is as interesting as a successful one.
"""
from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.services.audit import MUTATING, record_audit_event


class AuditMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        try:
            response = await call_next(request)
        except Exception as exc:
            # A crash is the mutation you most want in the log: record it, then let it propagate — an
            # audit middleware that hides an exception would be worse than none.
            if request.method in MUTATING:
                await self._record(request, 500, {"error": type(exc).__name__})
            raise
        if request.method not in MUTATING:
            return response

        await self._record(request, response.status_code)
        return response

    @staticmethod
    async def _record(request: Request, status_code: int, detail: dict | None = None) -> None:
        payload = getattr(request.state, "openkms_jwt_payload", None) or {}
        await record_audit_event(
            method=request.method,
            path=request.url.path,
            status_code=status_code,
            actor_sub=payload.get("sub") if isinstance(payload.get("sub"), str) else None,
            actor_name=(
                payload.get("username")
                or payload.get("email")
                or payload.get("preferred_username")
                or None
            ),
            auth_mode=payload.get("auth_mode") if isinstance(payload.get("auth_mode"), str) else None,
            detail=detail,
        )
