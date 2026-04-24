"""Internal models routes for workers/CLI (separate prefix from /api for future policy splits)."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_auth
from app.database import get_db
from app.services.document_parse_defaults import get_document_parse_vlm_defaults_for_cli

router = APIRouter(
    prefix="/internal-api/models",
    tags=["internal-models"],
    dependencies=[Depends(require_auth)],
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
