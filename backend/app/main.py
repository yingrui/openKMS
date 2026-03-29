"""FastAPI application entry point."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.api.auth import api_auth_router, router as auth_router
from app.api.channels import router as channels_router
from app.api.documents import router as documents_router
from app.api.feature_toggles import router as feature_toggles_router
from app.api.jobs import router as jobs_router
from app.api.models import router as models_router
from app.api.pipelines import router as pipelines_router
from app.api.knowledge_bases import router as knowledge_bases_router
from app.api.glossaries import router as glossaries_router
from app.api.object_types import router as object_types_router
from app.api.link_types import router as link_types_router
from app.api.ontology_explore import router as ontology_explore_router
from app.api.providers import router as providers_router
from app.api.data_sources import router as data_sources_router
from app.api.datasets import router as datasets_router
from app.api.evaluation_datasets import router as evaluation_datasets_router
from app.api.users_admin import router as users_admin_router
from app.config import settings
from app.database import init_db

logger = logging.getLogger(__name__)


DEFAULT_SECRET_KEY = "openkms-dev-secret-change-in-production"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create tables, storage bucket, and procrastinate schema on startup."""
    if not settings.debug and settings.secret_key == DEFAULT_SECRET_KEY:
        raise RuntimeError(
            "Refusing to start: secret_key is the default value. "
            "Set OPENKMS_SECRET_KEY to a secure value in production."
        )

    from app.services.storage import ensure_bucket

    await init_db()
    ensure_bucket()

    try:
        from app.jobs import job_app
        async with job_app.open_async():
            try:
                await job_app.schema_manager.apply_schema_async()
                logger.info("Procrastinate schema applied")
            except Exception:
                logger.info("Procrastinate schema already exists")
            yield
    except Exception as e:
        logger.warning("Procrastinate setup skipped: %s", e)
        yield


app = FastAPI(
    title=settings.app_title,
    version=settings.app_version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url.rstrip("/")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.secret_key,
    session_cookie="openkms_session",
    same_site="lax",
    max_age=86400 * 7,  # 7 days
)

app.include_router(auth_router)
app.include_router(api_auth_router)
app.include_router(channels_router, prefix="/api")
app.include_router(documents_router, prefix="/api")
app.include_router(feature_toggles_router, prefix="/api")
app.include_router(pipelines_router, prefix="/api")
app.include_router(models_router, prefix="/api")
app.include_router(providers_router, prefix="/api")
app.include_router(jobs_router, prefix="/api")
app.include_router(knowledge_bases_router, prefix="/api")
app.include_router(glossaries_router, prefix="/api")
app.include_router(object_types_router, prefix="/api")
app.include_router(link_types_router, prefix="/api")
app.include_router(ontology_explore_router, prefix="/api")
app.include_router(data_sources_router, prefix="/api")
app.include_router(datasets_router, prefix="/api")
app.include_router(evaluation_datasets_router, prefix="/api")
app.include_router(users_admin_router, prefix="/api")


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}
