"""Load persisted feature toggles and guard API routes."""

from __future__ import annotations

from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.feature_toggle import FeatureToggle

DEFAULTS: dict[str, bool] = {
    "evaluations": False,
    "connectors": True,
    "agents": True,
    "media": False,
}


async def load_feature_toggles(db: AsyncSession) -> dict[str, bool]:
    result = await db.execute(select(FeatureToggle))
    rows = {row.key: row.enabled for row in result.scalars().all()}
    return {k: rows.get(k, v) for k, v in DEFAULTS.items()}


async def is_feature_enabled(db: AsyncSession, key: str) -> bool:
    toggles = await load_feature_toggles(db)
    return toggles.get(key, DEFAULTS.get(key, False))


async def require_agents_feature(db: AsyncSession = Depends(get_db)) -> None:
    if not await is_feature_enabled(db, "agents"):
        raise HTTPException(status_code=404, detail="Agents feature is disabled")


async def require_media_feature(db: AsyncSession = Depends(get_db)) -> None:
    if not await is_feature_enabled(db, "media"):
        raise HTTPException(status_code=404, detail="Media feature is disabled")
