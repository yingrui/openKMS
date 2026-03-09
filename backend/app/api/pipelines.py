"""Pipelines API – CRUD for pipeline configurations."""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_auth
from app.database import get_db
from app.models.api_model import ApiModel
from app.models.pipeline import Pipeline
from app.schemas.pipeline import (
    PipelineCreate,
    PipelineListResponse,
    PipelineResponse,
    PipelineUpdate,
)

router = APIRouter(prefix="/pipelines", tags=["pipelines"], dependencies=[Depends(require_auth)])


async def _enrich_pipeline(pipeline: Pipeline, db: AsyncSession) -> PipelineResponse:
    """Build a PipelineResponse, resolving linked model info."""
    data = PipelineResponse.model_validate(pipeline)
    if pipeline.model_id:
        model = await db.get(ApiModel, pipeline.model_id)
        if model:
            data.model_name = model.name
            data.model_base_url = model.base_url
    return data


@router.get("/template-variables")
async def get_template_variables():
    """Return available template variables for pipeline command templates."""
    from app.jobs.tasks import TEMPLATE_VARIABLES
    return {"variables": TEMPLATE_VARIABLES}


@router.get("", response_model=PipelineListResponse)
async def list_pipelines(db: AsyncSession = Depends(get_db)):
    """List all pipeline configurations."""
    total_result = await db.execute(select(func.count(Pipeline.id)))
    total = total_result.scalar_one()

    result = await db.execute(select(Pipeline).order_by(Pipeline.created_at.desc()))
    items = [await _enrich_pipeline(p, db) for p in result.scalars().all()]
    return PipelineListResponse(items=items, total=total)


@router.post("", response_model=PipelineResponse, status_code=201)
async def create_pipeline(body: PipelineCreate, db: AsyncSession = Depends(get_db)):
    """Create a new pipeline configuration."""
    pipeline = Pipeline(
        id=f"pipeline_{uuid.uuid4().hex[:8]}",
        name=body.name,
        description=body.description,
        command=body.command,
        default_args=body.default_args,
        model_id=body.model_id,
    )
    db.add(pipeline)
    await db.commit()
    await db.refresh(pipeline)
    return await _enrich_pipeline(pipeline, db)


@router.get("/{pipeline_id}", response_model=PipelineResponse)
async def get_pipeline(pipeline_id: str, db: AsyncSession = Depends(get_db)):
    """Get a pipeline configuration by ID."""
    pipeline = await db.get(Pipeline, pipeline_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return await _enrich_pipeline(pipeline, db)


@router.put("/{pipeline_id}", response_model=PipelineResponse)
async def update_pipeline(pipeline_id: str, body: PipelineUpdate, db: AsyncSession = Depends(get_db)):
    """Update a pipeline configuration."""
    pipeline = await db.get(Pipeline, pipeline_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(pipeline, key, value)

    await db.commit()
    await db.refresh(pipeline)
    return await _enrich_pipeline(pipeline, db)


@router.delete("/{pipeline_id}", status_code=204)
async def delete_pipeline(pipeline_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a pipeline configuration."""
    pipeline = await db.get(Pipeline, pipeline_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    await db.delete(pipeline)
    await db.commit()
