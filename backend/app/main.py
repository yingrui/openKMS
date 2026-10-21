"""FastAPI application entry point."""

import logging
import traceback
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from procrastinate.exceptions import ProcrastinateException
from sqlalchemy.exc import SQLAlchemyError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.sessions import SessionMiddleware

from app.api.auth import api_auth_router, router as auth_router
from app.api.article_channels import router as article_channels_router
from app.api.articles import router as articles_router
from app.api.media_channels import router as media_channels_router
from app.api.media import router as media_router
from app.api.comments import router as comments_router
from app.api.channels import router as channels_router
from app.api.documents import router as documents_router
from app.api.feature_toggles import router as feature_toggles_router
from app.api.jobs import router as jobs_router
from app.api.internal import documents_router as internal_documents_router
from app.api.internal import knowledge_bases_router as internal_knowledge_bases_router
from app.api.internal import models_router as internal_models_router
from app.api.internal import process_heartbeat_router as internal_process_heartbeat_router
from app.api.models import router as models_router
from app.api.pipelines import router as pipelines_router
from app.api.knowledge_bases import router as knowledge_bases_router
from app.api.wiki_spaces import router as wiki_spaces_router

from app.api.agent_skills import router as agent_skills_router
from app.api.projects import router as projects_router
from app.api.user_git_credentials import router as user_git_credentials_router
from app.api.glossaries import router as glossaries_router
from app.api.object_types import router as object_types_router
from app.api.link_types import router as link_types_router
from app.api.ontology_explore import router as ontology_explore_router
from app.api.ontology_external_services import router as ontology_external_services_router
from app.api.ontology_functions import router as ontology_functions_router
from app.api.ontology_groups import router as ontology_groups_router
from app.api.ontology_action_types import router as ontology_action_types_router
from app.api.app_builder import router as app_builder_router
from app.api.providers import router as providers_router
from app.api.connectors import router as connectors_router
from app.api.schedules import router as schedules_router
from app.api.data_sources import router as data_sources_router
from app.api.kubernetes_clusters import router as kubernetes_clusters_router
from app.api.datasets import router as datasets_router
from app.api.semantic_models import router as semantic_models_router
from app.api.semantic_model_fields import router as semantic_model_fields_router
from app.api.dataset_ingests import router as dataset_ingests_router
from app.api.dataset_rows import router as dataset_rows_router
from app.api.dataset_joins import router as dataset_joins_router
from app.api.quality_rules import router as quality_rules_router
from app.api.metrics import router as metrics_router
from app.api.admin.audit_log import router as audit_log_router
from app.api.stories import router as stories_router
from app.api.quality_issues import router as quality_issues_router
from app.api.evaluations import router as evaluations_router
from app.api.users_admin import router as users_admin_router
from app.api.admin.resource_acl_admin import router as admin_resource_acl_router
from app.api.resource_acl import router as resource_acl_router
from app.api.admin.groups import router as admin_groups_router
from app.api.admin.security_roles import router as admin_security_roles_router
from app.api.admin.security_permissions import router as admin_security_permissions_router
from app.api.admin.permission_reference import router as admin_permission_reference_router
from app.api.admin.health_status import router as admin_health_status_router
from app.api.admin.console_storage import router as admin_console_storage_router
from app.api.global_search import router as global_search_router
from app.api.home_hub import router as home_hub_router
from app.api.system_settings import public_router as system_public_router
from app.api.system_settings import router as system_settings_router
from app.api.knowledge_map import router as knowledge_map_router
from app.config import settings
from app.logging_config import configure_logging
from app.middleware.audit import AuditMiddleware
from app.middleware.strict_permission_patterns import StrictPermissionPatternMiddleware

configure_logging(
    backend_level=settings.backend_log_level,
    agent_level=settings.agent_log_level,
)

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

    ensure_bucket()

    try:
        from app.jobs import job_app
        async with job_app.open_async():
            try:
                await job_app.schema_manager.apply_schema_async()
                logger.info("Procrastinate schema applied")
            except (ProcrastinateException, SQLAlchemyError, OSError):
                # Applying the schema twice is the normal case (the tables are already there).
                logger.info("Procrastinate schema already exists")
            yield
    except (ImportError, ProcrastinateException, SQLAlchemyError, OSError) as e:
        logger.warning("Procrastinate setup skipped: %s", e)
        yield
    finally:
        from app.services.deep_agents.checkpointer import close_checkpointer

        await close_checkpointer()


app = FastAPI(
    title=settings.app_title,
    version=settings.app_version,
    lifespan=lifespan,
    # The UI is served from this repo, not from a CDN: jsdelivr is unreachable from some of the networks
    # this runs on, and a docs page that needs a third party is a docs page that is sometimes blank.
    docs_url=None,
    redoc_url=None,
)

_SWAGGER_UI = Path(__file__).parent / "static" / "swagger-ui"
app.mount("/static/swagger-ui", StaticFiles(directory=_SWAGGER_UI), name="swagger-ui")


@app.get("/docs", include_in_schema=False)
async def swagger_ui() -> HTMLResponse:
    """Swagger UI, with its assets from `/static/swagger-ui` (vendored; `swagger-ui-dist`)."""
    return get_swagger_ui_html(
        openapi_url=app.openapi_url or "/openapi.json",
        title=f"{app.title} — docs",
        swagger_js_url="/static/swagger-ui/swagger-ui-bundle.js",
        swagger_css_url="/static/swagger-ui/swagger-ui.css",
        swagger_favicon_url="/static/swagger-ui/favicon-32x32.png",
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Return JSON for unexpected errors so CLI/Agents can diagnose (not plain text).

    HTTPException / RequestValidationError keep FastAPI's built-in handlers (more specific).
    When ``OPENKMS_DEBUG`` is true, include a truncated traceback.
    """
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    detail: dict[str, str] = {
        "type": type(exc).__name__,
        "message": str(exc).strip() or type(exc).__name__,
    }
    if settings.debug:
        detail["traceback"] = traceback.format_exc()[-4000:]
    return JSONResponse(status_code=500, content={"detail": detail})


# Order: each add_middleware wraps the stack; last added is outermost on the request.
# Session must run before StrictPermissionPatternMiddleware (which calls require_auth).
app.add_middleware(StrictPermissionPatternMiddleware)
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

# Outermost on purpose: it records the status of requests other middleware rejects (403s included).
app.add_middleware(AuditMiddleware)
app.include_router(api_auth_router)
app.include_router(system_public_router, prefix="/api")
app.include_router(system_settings_router, prefix="/api")
app.include_router(knowledge_map_router, prefix="/api")
app.include_router(home_hub_router, prefix="/api")
app.include_router(global_search_router, prefix="/api")
app.include_router(channels_router, prefix="/api")
app.include_router(documents_router, prefix="/api")
app.include_router(article_channels_router, prefix="/api")
app.include_router(articles_router, prefix="/api")
app.include_router(media_channels_router, prefix="/api")
app.include_router(media_router, prefix="/api")
app.include_router(comments_router, prefix="/api")
app.include_router(feature_toggles_router, prefix="/api")
app.include_router(pipelines_router, prefix="/api")
app.include_router(models_router, prefix="/api")
app.include_router(internal_models_router)
app.include_router(internal_documents_router)
app.include_router(internal_knowledge_bases_router)
app.include_router(internal_process_heartbeat_router)
app.include_router(providers_router, prefix="/api")
app.include_router(jobs_router, prefix="/api")
app.include_router(knowledge_bases_router, prefix="/api")
app.include_router(wiki_spaces_router, prefix="/api")

app.include_router(projects_router, prefix="/api")
app.include_router(agent_skills_router, prefix="/api")
app.include_router(user_git_credentials_router, prefix="/api")
app.include_router(glossaries_router, prefix="/api")
app.include_router(object_types_router, prefix="/api")
app.include_router(link_types_router, prefix="/api")
app.include_router(ontology_explore_router, prefix="/api")
app.include_router(ontology_functions_router, prefix="/api")
app.include_router(ontology_external_services_router, prefix="/api")
app.include_router(ontology_groups_router, prefix="/api")
app.include_router(ontology_action_types_router, prefix="/api")
app.include_router(app_builder_router, prefix="/api")
app.include_router(connectors_router, prefix="/api")
app.include_router(schedules_router, prefix="/api")
app.include_router(data_sources_router, prefix="/api")
app.include_router(kubernetes_clusters_router, prefix="/api")
app.include_router(dataset_ingests_router, prefix="/api")
app.include_router(dataset_rows_router, prefix="/api")
app.include_router(datasets_router, prefix="/api")
app.include_router(semantic_models_router, prefix="/api")
app.include_router(semantic_model_fields_router, prefix="/api")
app.include_router(dataset_joins_router, prefix="/api")
app.include_router(quality_rules_router, prefix="/api")
app.include_router(metrics_router, prefix="/api")
app.include_router(stories_router, prefix="/api")
app.include_router(audit_log_router, prefix="/api")
app.include_router(quality_issues_router, prefix="/api")
app.include_router(evaluations_router, prefix="/api")
app.include_router(users_admin_router, prefix="/api")
app.include_router(admin_groups_router, prefix="/api")
app.include_router(resource_acl_router, prefix="/api")
app.include_router(admin_resource_acl_router, prefix="/api")
app.include_router(admin_security_roles_router, prefix="/api")
app.include_router(admin_security_permissions_router, prefix="/api")
app.include_router(admin_permission_reference_router, prefix="/api")
app.include_router(admin_health_status_router, prefix="/api")
app.include_router(admin_console_storage_router, prefix="/api")


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}
