"""Internal API surfaces (e.g. worker/CLI paths under /internal-api)."""

from app.api.internal.models import router as models_router

__all__ = ["models_router"]
