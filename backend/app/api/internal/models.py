"""Internal models routes for workers/CLI (separate prefix from /api for future policy splits)."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import _is_internal_service_caller, require_internal_client
from app.database import get_db
from app.models.api_model import VALID_API_KINDS
from app.models.knowledge_base import KnowledgeBase
from app.services.identity.acl.data_resource_policy import knowledge_base_visible
from app.services.runtime.agent.llm import resolve_agent_llm_config
from app.services.content.models.model_config_by_name import resolve_model_config_by_name
from app.services.content.documents.document_parse_defaults import get_document_parse_vlm_defaults_for_cli
from app.services.content.knowledge_bases.kb_embedding_cli_defaults import get_kb_embedding_credentials_for_cli
from app.services.content.knowledge_bases.rerank import resolve_rerank_model

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
        description="If set, resolve document-parse ApiModel by model_name or display name; else default.",
    ),
):
    """VLM base_url, model_name, api_key for openkms-cli (document-parse capability or env fallback)."""
    d = await get_document_parse_vlm_defaults_for_cli(db, model_name)
    return {
        "base_url": d.base_url or "",
        "model_name": d.model_name or "",
        "api_key": d.api_key or "",
    }


@router.get("/config-by-name")
async def get_model_config_by_name(
    model_name: str = Query(..., description="ApiModel.model_name, e.g. qwen3.5, gpt-4"),
    api_kind: str = Query(
        default="chat-completions",
        description="API kind (chat-completions, embeddings, custom).",
    ),
    db: AsyncSession = Depends(get_db),
):
    """base_url, model_name, api_key for openkms-cli (e.g. pipeline metadata extraction)."""
    if api_kind not in VALID_API_KINDS:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid api_kind {api_kind!r}; expected one of: {', '.join(sorted(VALID_API_KINDS))}",
        )
    cfg = await resolve_model_config_by_name(db, model_name=model_name, api_kind=api_kind)
    if cfg is None:
        raise HTTPException(
            status_code=404,
            detail=f"No {api_kind!r} model with model_name={model_name!r} found",
        )
    return {
        "base_url": cfg["base_url"] or "",
        "model_name": cfg["model_name"] or "",
        "api_key": cfg["api_key"] or "",
        # Body fragments for thinking on/off; the qa-agent merges the one the agent chose.
        "thinking": cfg.get("thinking") or {},
    }


@router.get("/llm-defaults")
async def get_llm_defaults(db: AsyncSession = Depends(get_db)):
    """LLM base_url, model_name, api_key for qa-agent (default chat-completions; same as embedded wiki agent)."""
    cfg = await resolve_agent_llm_config(db)
    if cfg is None:
        raise HTTPException(
            status_code=400,
            detail=(
                "No default chat-completions model configured. Add a model on Models and set it as default "
                "for its API kind, or set OPENKMS_AGENT_MODEL_ID on the backend."
            ),
        )
    return {
        "base_url": cfg["base_url"] or "",
        "model_name": cfg["model_name"] or "",
        "api_key": cfg["api_key"] or "",
        # How this provider spells its thinking toggle; the qa-agent needs it to send the right field.
        # Body fragments for thinking on/off; the qa-agent merges the one the agent chose.
        "thinking": cfg.get("thinking") or {},
    }


@router.get("/{model_id}/llm-credentials")
async def get_model_llm_credentials(model_id: str, db: AsyncSession = Depends(get_db)):
    """Endpoint + key for one registered chat model, so an agent can name its own model.

    The same shape as `/llm-defaults`, resolved from an explicit model instead of the deployment default: an agent
    that picks a model from another provider needs that provider's `base_url` and key, not just a different model
    name. The key never travels in the ask body — the qa-agent fetches it with its own service credentials.
    """
    cfg = await resolve_agent_llm_config(db, model_id=model_id)
    if cfg is None:
        raise HTTPException(status_code=404, detail=f"Chat model {model_id!r} not found or not chat-completions")
    return {
        "base_url": cfg["base_url"] or "",
        "model_name": cfg["model_name"] or "",
        "api_key": cfg["api_key"] or "",
        "thinking": cfg.get("thinking") or {},
    }


@router.get("/rerank-defaults")
async def get_rerank_defaults(db: AsyncSession = Depends(get_db)):
    """The deployment's rerank model: endpoint, model name and key.

    A registered model beats an environment variable, because the registry is where someone chose it and the UI can
    show it. 404 means this deployment has no reranker, and the caller skips the stage.
    """
    targets = await resolve_rerank_model(db)
    if targets is None:
        raise HTTPException(status_code=404, detail="No rerank model is registered or marked default")
    return targets.as_response()


@router.get("/{model_id}/rerank-credentials")
async def get_model_rerank_credentials(model_id: str, db: AsyncSession = Depends(get_db)):
    """Endpoint, model name and key for one registered rerank model.

    Same shape as `/llm-credentials`, for the other kind of model an answer depends on: a knowledge base may name its
    reranker, and the qa-agent fetches that model's provider credentials itself rather than receiving a key in the body.
    """
    targets = await resolve_rerank_model(db, model_id=model_id)
    if targets is None:
        raise HTTPException(status_code=404, detail=f"Rerank model {model_id!r} not found")
    return targets.as_response()


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
    if (
        isinstance(sub, str)
        and not _is_internal_service_caller(p)
        and not await knowledge_base_visible(db, p, sub, kb)
    ):
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    creds = await get_kb_embedding_credentials_for_cli(db, kb)
    if creds is None:
        raise HTTPException(
            status_code=400,
            detail="Knowledge base has no embedding model, or the model is missing or not api_kind embeddings",
        )
    return {
        "base_url": creds.base_url,
        "model_name": creds.model_name,
        "api_key": creds.api_key,
    }
