"""FastAPI application entry point."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.api.auth import router as auth_router
from app.api.channels import router as channels_router
from app.api.documents import router as documents_router
from app.api.jobs import router as jobs_router
from app.api.pipelines import router as pipelines_router
from app.config import settings
from app.database import init_db

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create tables, storage bucket, and procrastinate schema on startup."""
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
    allow_origins=[settings.keycloak_frontend_url.rstrip("/")],
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
app.include_router(channels_router, prefix="/api")
app.include_router(documents_router, prefix="/api")
app.include_router(pipelines_router, prefix="/api")
app.include_router(jobs_router, prefix="/api")


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}
