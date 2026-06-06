"""Internal API surfaces (e.g. worker/CLI paths under /internal-api)."""

from app.api.internal.documents import router as documents_router
from app.api.internal.models import router as models_router

__all__ = ["documents_router", "models_router"]
