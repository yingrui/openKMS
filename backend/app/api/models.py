"""Models API – CRUD for models under service providers."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.auth import require_auth
from app.database import get_db
from app.models.api_model import API_KINDS, MODEL_CAPABILITIES, ApiModel
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


@router.get("/api-kinds")
async def get_api_kinds():
    """Return the fixed list of API kinds (protocol / endpoint shape)."""
    return {"api_kinds": [{"id": k[0], "label": k[1]} for k in API_KINDS]}


@router.get("/capabilities")
async def get_capabilities():
    """Return known capability tags for models (vision, tools, etc.)."""
    return {"capabilities": [{"id": c[0], "label": c[1]} for c in MODEL_CAPABILITIES]}


@router.get("", response_model=ApiModelListResponse)
async def list_models(
    api_kind: str | None = Query(None),
    capability: str | None = Query(None, description="Filter models that include this capability tag"),
    provider_id: str | None = Query(None),
    search: str | None = Query(None),
    limit: int = Query(25, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """List registered models, optionally filtered by api_kind, capability, provider, or search."""
    stmt = select(ApiModel).options(selectinload(ApiModel.provider_rel))
    count_stmt = select(func.count(ApiModel.id))

    if api_kind:
        stmt = stmt.where(ApiModel.api_kind == api_kind)
        count_stmt = count_stmt.where(ApiModel.api_kind == api_kind)
    if capability and (cap := capability.strip()):
        stmt = stmt.where(ApiModel.capabilities.contains([cap]))
        count_stmt = count_stmt.where(ApiModel.capabilities.contains([cap]))
    if provider_id:
        stmt = stmt.where(ApiModel.provider_id == provider_id)
        count_stmt = count_stmt.where(ApiModel.provider_id == provider_id)
    if search and (q := search.strip()):
        like = f"%{q}%"
        stmt = stmt.join(ApiProvider).where(
            ApiModel.name.ilike(like) | ApiProvider.name.ilike(like)
        )
        count_stmt = count_stmt.join(ApiProvider).where(
            ApiModel.name.ilike(like) | ApiProvider.name.ilike(like)
        )

    total_result = await db.execute(count_stmt)
    total = int(total_result.scalar_one() or 0)

    result = await db.execute(
        stmt.order_by(ApiModel.created_at.desc()).limit(limit).offset(offset)
    )
    items = [ApiModelResponse.model_validate(m) for m in result.scalars().all()]
    return ApiModelListResponse(items=items, total=total, limit=limit, offset=offset)


async def _clear_api_kind_defaults(db: AsyncSession, api_kind: str, exclude_model_id: str | None = None):
    """Set is_default_in_category=False for all models in api_kind except exclude_model_id."""
    stmt = update(ApiModel).where(ApiModel.api_kind == api_kind).values(is_default_in_category=False)
    if exclude_model_id:
        stmt = stmt.where(ApiModel.id != exclude_model_id)
    await db.execute(stmt)


@router.post("", response_model=ApiModelResponse, status_code=201)
async def create_model(body: ApiModelCreate, db: AsyncSession = Depends(get_db)):
    """Register a new model under a provider."""
    provider = await db.get(ApiProvider, body.provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    if body.is_default_in_category:
        await _clear_api_kind_defaults(db, body.api_kind)
    model = ApiModel(
        id=f"model_{uuid.uuid4().hex[:8]}",
        provider_id=body.provider_id,
        name=body.name,
        api_kind=body.api_kind,
        capabilities=body.capabilities,
        is_default_in_category=body.is_default_in_category,
        model_name=body.model_name,
        config=body.config,
    )
    db.add(model)
    await db.commit()
    await db.refresh(model)
    await db.refresh(model, ["provider_rel"])
    return ApiModelResponse.model_validate(model)


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
    if update_data.get("is_default_in_category") is True:
        api_kind = update_data.get("api_kind", model.api_kind)
        await _clear_api_kind_defaults(db, api_kind, exclude_model_id=model_id)
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
    from app.services.models.model_testing import execute_test

    result = await db.execute(
        select(ApiModel).options(selectinload(ApiModel.provider_rel)).where(ApiModel.id == model_id)
    )
    model = result.scalar_one_or_none()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    return await execute_test(
        base_url=model.provider_rel.base_url,
        api_kind=model.api_kind,
        capabilities=model.capabilities,
        api_key=model.provider_rel.api_key,
        model_name=model.model_name,
        prompt=body.prompt,
        image=body.image,
        max_tokens=body.max_tokens,
        temperature=body.temperature,
    )
