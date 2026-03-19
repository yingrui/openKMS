"""Feature toggles API – read for all authenticated users, write for admins."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_admin, require_auth
from app.database import get_db
from app.models.data_source import DataSource
from app.models.feature_toggle import FeatureToggle

DEFAULTS = {"articles": True, "knowledgeBases": True, "objectsAndLinks": True}

router = APIRouter(prefix="/feature-toggles", tags=["feature-toggles"])


class FeatureTogglesResponse(BaseModel):
    articles: bool = True
    knowledgeBases: bool = True
    objectsAndLinks: bool = True
    hasNeo4jDataSource: bool = False


class FeatureTogglesUpdate(BaseModel):
    articles: bool | None = None
    knowledgeBases: bool | None = None
    objectsAndLinks: bool | None = None


async def _load_toggles(db: AsyncSession) -> dict[str, bool]:
    result = await db.execute(select(FeatureToggle))
    rows = {row.key: row.enabled for row in result.scalars().all()}
    return {k: rows.get(k, v) for k, v in DEFAULTS.items()}


@router.get("", response_model=FeatureTogglesResponse, dependencies=[Depends(require_auth)])
async def get_feature_toggles(db: AsyncSession = Depends(get_db)):
    toggles = await _load_toggles(db)
    result = await db.execute(select(DataSource).where(DataSource.kind == "neo4j").limit(1))
    has_neo4j = result.scalar_one_or_none() is not None
    return FeatureTogglesResponse(**toggles, hasNeo4jDataSource=has_neo4j)


@router.put("", response_model=FeatureTogglesResponse, dependencies=[Depends(require_admin)])
async def update_feature_toggles(
    body: FeatureTogglesUpdate,
    db: AsyncSession = Depends(get_db),
):
    updates = body.model_dump(exclude_none=True)
    allowed = set(DEFAULTS.keys())
    for key, enabled in updates.items():
        if key not in allowed:
            continue
        toggle = await db.get(FeatureToggle, key)
        if toggle:
            toggle.enabled = enabled
        else:
            db.add(FeatureToggle(key=key, enabled=enabled))
    await db.flush()
    toggles = await _load_toggles(db)
    return FeatureTogglesResponse(**toggles)
