"""BFF OIDC entry points.

The root ``/login`` / callback routes remain in ``app.api.auth`` for the legacy SPA flow and the IdP
registration. These routes are the SPA-facing BFF entry points.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import _start_oidc_login, logout as perform_logout
from app.database import get_db

router = APIRouter(prefix="/api/auth/oidc", tags=["auth"])


@router.get("/login")
async def oidc_login(request: Request, returnTo: str = "/") -> RedirectResponse:
    """Start the backend OIDC code flow; the callback sets the opaque session cookie."""
    return await _start_oidc_login(request, returnTo)


@router.get("/logout")
async def oidc_logout(request: Request, db: AsyncSession = Depends(get_db)) -> RedirectResponse:
    """Revoke the server session, then RP-initiated logout when the IdP supports it."""
    return await perform_logout(request, db)
