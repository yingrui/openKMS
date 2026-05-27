"""Internal models routes for workers/CLI (separate prefix from /api for future policy splits)."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_internal_client
from app.database import get_db
from app.models.api_model import MODEL_CATEGORIES
from app.models.knowledge_base import KnowledgeBase
from app.services.data_resource_policy import knowledge_base_visible
from app.services.agent.llm import resolve_agent_llm_config
from app.services.model_config_by_name import resolve_model_config_by_name
from app.services.document_parse_defaults import get_document_parse_vlm_defaults_for_cli
from app.services.kb_embedding_cli_defaults import get_kb_embedding_credentials_for_cli

router = APIRouter(
    prefix="/internal-api/models",
    tags=["internal-models"],
    dependencies=[Depends(require_internal_client)],
)


@router.get("/document-parse-defaults")
async def get_document_parse_defaults(
    db: AsyncSession = Depends(get_db),
    model_name: str | None = Query(
        default=None,
        description="If set, resolve vl/ocr ApiModel by model_name or display name; else category default.",
    ),
):
    """VLM base_url, model_name, api_key for openkms-cli (named vl/ocr row or same fallback as public defaults)."""
    d = await get_document_parse_vlm_defaults_for_cli(db, model_name)
    return {
        "base_url": d.base_url or "",
        "model_name": d.model_name or "",
        "api_key": d.api_key or "",
    }


@router.get("/config-by-name")
async def get_model_config_by_name(
    model_name: str = Query(..., description="ApiModel.model_name, e.g. qwen3.5, gpt-4"),
    category: str = Query(
        default="llm",
        description="Model category (llm, vl, ocr, embedding, text-classification).",
    ),
    db: AsyncSession = Depends(get_db),
):
    """base_url, model_name, api_key for openkms-cli (e.g. pipeline metadata extraction)."""
    valid_categories = {c for c, _ in MODEL_CATEGORIES}
    if category not in valid_categories:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid category {category!r}; expected one of: {', '.join(sorted(valid_categories))}",
        )
    cfg = await resolve_model_config_by_name(db, model_name=model_name, category=category)
    if cfg is None:
        raise HTTPException(
            status_code=404,
            detail=f"No {category!r} model with model_name={model_name!r} found",
        )
    return {
        "base_url": cfg["base_url"] or "",
        "model_name": cfg["model_name"] or "",
        "api_key": cfg["api_key"] or "",
    }


@router.get("/llm-defaults")
async def get_llm_defaults(db: AsyncSession = Depends(get_db)):
    """LLM base_url, model_name, api_key for qa-agent (default ``llm`` category; same as embedded wiki agent)."""
    cfg = await resolve_agent_llm_config(db)
    if cfg is None:
        raise HTTPException(
            status_code=400,
            detail=(
                "No default LLM model configured. Add an LLM on Models and set it as the category default, "
                "or set OPENKMS_AGENT_MODEL_ID on the backend."
            ),
        )
    return {
        "base_url": cfg["base_url"] or "",
        "model_name": cfg["model_name"] or "",
        "api_key": cfg["api_key"] or "",
    }


@router.get("/kb-embedding-credentials")
async def get_kb_embedding_credentials(
    request: Request,
    knowledge_base_id: str = Query(
        ...,
        min_length=1,
        description="Knowledge base whose embedding_model_id is resolved with provider api_key.",
    ),
    db: AsyncSession = Depends(get_db),
):
    """Embedding base_url, model_name, api_key for openkms-cli kb-index (same pattern as document-parse-defaults)."""
    kb = await db.get(KnowledgeBase, knowledge_base_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if isinstance(sub, str) and not await knowledge_base_visible(db, p, sub, kb):
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    creds = await get_kb_embedding_credentials_for_cli(db, kb)
    if creds is None:
        raise HTTPException(
            status_code=400,
            detail="Knowledge base has no embedding model, or the model is missing or not category embedding",
        )
    return {
        "base_url": creds.base_url,
        "model_name": creds.model_name,
        "api_key": creds.api_key,
    }
