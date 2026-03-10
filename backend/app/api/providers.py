"""Providers API – CRUD for service providers (OpenAI, Anthropic, etc.)."""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_auth
from app.database import get_db
from app.models.api_model import ApiModel
from app.models.api_provider import ApiProvider
from app.schemas.api_provider import (
    ApiProviderCreate,
    ApiProviderListResponse,
    ApiProviderResponse,
    ApiProviderUpdate,
)

router = APIRouter(prefix="/providers", tags=["providers"], dependencies=[Depends(require_auth)])


@router.get("", response_model=ApiProviderListResponse)
async def list_providers(db: AsyncSession = Depends(get_db)):
    """List all service providers."""
    count_result = await db.execute(select(func.count(ApiProvider.id)))
    total = count_result.scalar_one()
    result = await db.execute(select(ApiProvider).order_by(ApiProvider.name))
    items = list(result.scalars().all())
    return ApiProviderListResponse(items=[ApiProviderResponse.model_validate(p) for p in items], total=total)


@router.post("", response_model=ApiProviderResponse, status_code=201)
async def create_provider(body: ApiProviderCreate, db: AsyncSession = Depends(get_db)):
    """Create a new service provider."""
    provider = ApiProvider(
        id=f"provider_{uuid.uuid4().hex[:8]}",
        name=body.name,
        base_url=body.base_url,
        api_key=body.api_key,
        config=body.config,
    )
    db.add(provider)
    await db.commit()
    await db.refresh(provider)
    return ApiProviderResponse.model_validate(provider)


@router.get("/{provider_id}", response_model=ApiProviderResponse)
async def get_provider(provider_id: str, db: AsyncSession = Depends(get_db)):
    """Get a provider by ID."""
    provider = await db.get(ApiProvider, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    return ApiProviderResponse.model_validate(provider)


@router.put("/{provider_id}", response_model=ApiProviderResponse)
async def update_provider(provider_id: str, body: ApiProviderUpdate, db: AsyncSession = Depends(get_db)):
    """Update a provider."""
    provider = await db.get(ApiProvider, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(provider, key, value)
    await db.commit()
    await db.refresh(provider)
    return ApiProviderResponse.model_validate(provider)


@router.delete("/{provider_id}", status_code=204)
async def delete_provider(provider_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a provider. Fails if it has models."""
    provider = await db.get(ApiProvider, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    count_result = await db.execute(select(func.count(ApiModel.id)).where(ApiModel.provider_id == provider_id))
    if count_result.scalar_one() > 0:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete provider with models. Delete or move models first.",
        )
    await db.delete(provider)
    await db.commit()


@router.get("/{provider_id}/models")
async def list_provider_models(provider_id: str, db: AsyncSession = Depends(get_db)):
    """List models for a provider. Returns model IDs and names."""
    from sqlalchemy.orm import selectinload

    provider = await db.get(ApiProvider, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    result = await db.execute(
        select(ApiModel).where(ApiModel.provider_id == provider_id).order_by(ApiModel.name)
    )
    models = result.scalars().all()
    return {"items": [{"id": m.id, "name": m.name, "category": m.category} for m in models], "total": len(models)}
