"""Internal API surfaces (e.g. worker/CLI paths under /internal-api)."""

from app.api.internal.documents import router as documents_router
from app.api.internal.knowledge_bases import router as knowledge_bases_router
from app.api.internal.models import router as models_router

__all__ = ["documents_router", "knowledge_bases_router", "models_router"]
