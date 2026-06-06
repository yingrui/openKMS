"""Feature toggles API – read for all authenticated users, write for admins."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_auth, require_permission
from app.services.permission_catalog import PERM_CONSOLE_FEATURE_TOGGLES
from app.database import get_db
from app.models.data_source import DataSource
from app.models.feature_toggle import FeatureToggle
from app.services.feature_toggles import DEFAULTS, load_feature_toggles

router = APIRouter(prefix="/feature-toggles", tags=["feature-toggles"])


class FeatureTogglesResponse(BaseModel):
    evaluations: bool = False
    connectors: bool = True
    agents: bool = True
    hasNeo4jDataSource: bool = False


class FeatureTogglesUpdate(BaseModel):
    evaluations: bool | None = None
    connectors: bool | None = None
    agents: bool | None = None


async def _load_toggles(db: AsyncSession) -> dict[str, bool]:
    return await load_feature_toggles(db)


@router.get("", response_model=FeatureTogglesResponse, dependencies=[Depends(require_auth)])
async def get_feature_toggles(db: AsyncSession = Depends(get_db)):
    toggles = await _load_toggles(db)
    result = await db.execute(select(DataSource).where(DataSource.kind == "neo4j").limit(1))
    has_neo4j = result.scalar_one_or_none() is not None
    return FeatureTogglesResponse(**toggles, hasNeo4jDataSource=has_neo4j)


@router.put("", response_model=FeatureTogglesResponse, dependencies=[Depends(require_permission(PERM_CONSOLE_FEATURE_TOGGLES))])
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
