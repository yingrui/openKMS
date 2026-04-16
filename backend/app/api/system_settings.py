"""System-wide settings: public branding read; authenticated admin update."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_permission
from app.database import get_db
from app.models.system_settings import SystemSettings as SystemSettingsRow
from app.services.permission_catalog import PERM_CONSOLE_SETTINGS

# Unauthenticated reads live under /api/public/<resource> (see strict_permission_patterns).
public_router = APIRouter(prefix="/public", tags=["public"])
router = APIRouter(prefix="/system", tags=["system"])

SETTINGS_ROW_ID = 1
DEFAULT_SYSTEM_DISPLAY_NAME = "openKMS"


def _strip_system_name(raw: str | None) -> str:
    """Normalized stored value (may be empty). Display default is applied in the SPA after fetch."""
    return (raw or "").strip()


class SystemPublicResponse(BaseModel):
    """Exposed without authentication (e.g. sidebar title on the login shell)."""

    system_name: str


class SystemSettingsResponse(BaseModel):
    system_name: str
    default_timezone: str
    api_base_url_note: str | None = None


class SystemSettingsUpdate(BaseModel):
    system_name: str = Field(..., min_length=1, max_length=256)
    default_timezone: str = Field(..., min_length=1, max_length=64)
    api_base_url_note: str | None = Field(None, max_length=2048)


async def _get_row(db: AsyncSession) -> SystemSettingsRow:
    row = await db.get(SystemSettingsRow, SETTINGS_ROW_ID)
    if row is None:
        raise HTTPException(status_code=500, detail="System settings row missing; run migrations.")
    return row


@public_router.get("/system", response_model=SystemPublicResponse)
async def get_system_public(db: AsyncSession = Depends(get_db)):
    """Public read: system display name (no auth). Path: GET /api/public/system."""
    row = await _get_row(db)
    return SystemPublicResponse(system_name=_strip_system_name(row.system_name))


@router.get(
    "/settings",
    response_model=SystemSettingsResponse,
    dependencies=[Depends(require_permission(PERM_CONSOLE_SETTINGS))],
)
async def get_system_settings(db: AsyncSession = Depends(get_db)):
    row = await _get_row(db)
    return SystemSettingsResponse(
        system_name=_strip_system_name(row.system_name),
        default_timezone=row.default_timezone,
        api_base_url_note=row.api_base_url_note,
    )


@router.put(
    "/settings",
    response_model=SystemSettingsResponse,
    dependencies=[Depends(require_permission(PERM_CONSOLE_SETTINGS))],
)
async def update_system_settings(body: SystemSettingsUpdate, db: AsyncSession = Depends(get_db)):
    row = await _get_row(db)
    row.system_name = body.system_name.strip() or DEFAULT_SYSTEM_DISPLAY_NAME
    row.default_timezone = body.default_timezone.strip()
    row.api_base_url_note = body.api_base_url_note.strip() if body.api_base_url_note and body.api_base_url_note.strip() else None
    return SystemSettingsResponse(
        system_name=_strip_system_name(row.system_name),
        default_timezone=row.default_timezone,
        api_base_url_note=row.api_base_url_note,
    )
