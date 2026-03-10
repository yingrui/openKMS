"""Models API – CRUD for models under service providers."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.auth import require_auth, require_service_client
from app.database import get_db
from app.models.api_model import ApiModel, MODEL_CATEGORIES
from app.models.api_provider import ApiProvider
from app.schemas.api_model import (
    ApiModelCreate,
    ApiModelListResponse,
    ApiModelResponse,
    ApiModelTestRequest,
    ApiModelTestResponse,
    ApiModelUpdate,
)

router = APIRouter(prefix="/models", tags=["models"], dependencies=[Depends(require_auth)])


@router.get("/categories")
async def get_categories():
    """Return the fixed list of model categories."""
    return {"categories": [{"id": c[0], "label": c[1]} for c in MODEL_CATEGORIES]}


@router.get("", response_model=ApiModelListResponse)
async def list_models(
    category: str | None = Query(None),
    provider_id: str | None = Query(None),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """List registered models, optionally filtered by category, provider, or search term."""
    stmt = select(ApiModel).options(selectinload(ApiModel.provider_rel))
    count_stmt = select(func.count(ApiModel.id))

    if category:
        stmt = stmt.where(ApiModel.category == category)
        count_stmt = count_stmt.where(ApiModel.category == category)
    if provider_id:
        stmt = stmt.where(ApiModel.provider_id == provider_id)
        count_stmt = count_stmt.where(ApiModel.provider_id == provider_id)
    if search:
        like = f"%{search}%"
        stmt = stmt.join(ApiProvider).where(
            ApiModel.name.ilike(like) | ApiProvider.name.ilike(like)
        )
        count_stmt = count_stmt.join(ApiProvider).where(
            ApiModel.name.ilike(like) | ApiProvider.name.ilike(like)
        )

    total_result = await db.execute(count_stmt)
    total = total_result.scalar_one()

    result = await db.execute(stmt.order_by(ApiModel.created_at.desc()))
    items = [ApiModelResponse.model_validate(m) for m in result.scalars().all()]
    return ApiModelListResponse(items=items, total=total)


@router.post("", response_model=ApiModelResponse, status_code=201)
async def create_model(body: ApiModelCreate, db: AsyncSession = Depends(get_db)):
    """Register a new model under a provider."""
    provider = await db.get(ApiProvider, body.provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    model = ApiModel(
        id=f"model_{uuid.uuid4().hex[:8]}",
        provider_id=body.provider_id,
        name=body.name,
        category=body.category,
        model_name=body.model_name,
        config=body.config,
    )
    db.add(model)
    await db.commit()
    await db.refresh(model)
    await db.refresh(model, ["provider_rel"])
    return ApiModelResponse.model_validate(model)


@router.get("/config-by-name")
async def get_model_config_by_name(
    model_name: str = Query(..., description="LLM model name, e.g. qwen3.5, gpt-4"),
    _token: str = Depends(require_service_client),
    db: AsyncSession = Depends(get_db),
):
    """Get model config by model_name. Returns first matching LLM model. Service client only."""
    stmt = (
        select(ApiModel)
        .options(selectinload(ApiModel.provider_rel))
        .where(ApiModel.category == "llm", ApiModel.model_name == model_name)
        .limit(1)
    )
    result = await db.execute(stmt)
    model = result.scalar_one_or_none()
    if not model:
        raise HTTPException(status_code=404, detail=f"No LLM model with model_name={model_name!r} found")
    return {
        "base_url": model.provider_rel.base_url,
        "api_key": model.provider_rel.api_key or "",
        "model_name": model.model_name or "gpt-4",
    }


@router.get("/{model_id}/config")
async def get_model_config(
    model_id: str,
    _token: str = Depends(require_service_client),
    db: AsyncSession = Depends(get_db),
):
    """Get full model config (base_url, api_key, model_name) for CLI. Service client only."""
    result = await db.execute(
        select(ApiModel).options(selectinload(ApiModel.provider_rel)).where(ApiModel.id == model_id)
    )
    model = result.scalar_one_or_none()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    return {
        "base_url": model.provider_rel.base_url,
        "api_key": model.provider_rel.api_key or "",
        "model_name": model.model_name or "gpt-4",
    }


@router.get("/{model_id}", response_model=ApiModelResponse)
async def get_model(model_id: str, db: AsyncSession = Depends(get_db)):
    """Get a model by ID."""
    result = await db.execute(
        select(ApiModel).options(selectinload(ApiModel.provider_rel)).where(ApiModel.id == model_id)
    )
    model = result.scalar_one_or_none()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    return ApiModelResponse.model_validate(model)


@router.put("/{model_id}", response_model=ApiModelResponse)
async def update_model(model_id: str, body: ApiModelUpdate, db: AsyncSession = Depends(get_db)):
    """Update a registered model."""
    result = await db.execute(
        select(ApiModel).options(selectinload(ApiModel.provider_rel)).where(ApiModel.id == model_id)
    )
    model = result.scalar_one_or_none()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    update_data = body.model_dump(exclude_unset=True)
    if "provider_id" in update_data:
        provider = await db.get(ApiProvider, update_data["provider_id"])
        if not provider:
            raise HTTPException(status_code=404, detail="Provider not found")
    for key, value in update_data.items():
        setattr(model, key, value)
    await db.commit()
    await db.refresh(model)
    await db.refresh(model, ["provider_rel"])
    return ApiModelResponse.model_validate(model)


@router.delete("/{model_id}", status_code=204)
async def delete_model(model_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a registered model."""
    model = await db.get(ApiModel, model_id)
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    await db.delete(model)
    await db.commit()


@router.post("/{model_id}/test", response_model=ApiModelTestResponse)
async def test_model(model_id: str, body: ApiModelTestRequest, db: AsyncSession = Depends(get_db)):
    """Proxy a test request to the model's API endpoint."""
    from app.services.model_testing import execute_test

    result = await db.execute(
        select(ApiModel).options(selectinload(ApiModel.provider_rel)).where(ApiModel.id == model_id)
    )
    model = result.scalar_one_or_none()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    return await execute_test(
        base_url=model.provider_rel.base_url,
        category=model.category,
        api_key=model.provider_rel.api_key,
        model_name=model.model_name,
        prompt=body.prompt,
        image=body.image,
        max_tokens=body.max_tokens,
        temperature=body.temperature,
    )
