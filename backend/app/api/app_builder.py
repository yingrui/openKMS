"""App Builder + Apps runtime API."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import ensure_permission, require_any_permission
from app.api.ontology.deps import jwt_user_from_request, validate_api_name
from app.database import get_db
from app.models.kubernetes_cluster import KubernetesCluster
from app.schemas.app_builder import (
    AppBuilderComponent,
    AppBuilderCreate,
    AppBuilderDesignResponse,
    AppBuilderPublishIn,
    AppBuilderResponse,
    AppBuilderRunResponse,
    AppBuilderUpdate,
    AppBuilderVersionOut,
)
from app.services.app_builder import service as apps_svc
from app.services.credentials.credential_encryption import decrypt
from app.services.kubernetes.cluster_service_proxy import (
    identity_headers,
    join_proxy_path,
    proxy_service_async,
    proxy_service_direct_async,
    service_direct_base_url,
)
from app.services.permissions.permission_catalog import (
    PERM_CONSOLE_KUBERNETES,
    PERM_ONTOLOGY_READ,
    PERM_ONTOLOGY_WRITE,
)

_read_deps = [Depends(require_any_permission(PERM_ONTOLOGY_READ))]
# The hosted app owns the Authorization header; openKMS authenticates the iframe by session cookie.
_proxy_deps = [Depends(require_any_permission(PERM_ONTOLOGY_READ, session_only=True))]


async def _to_list_item(db: AsyncSession, app) -> AppBuilderResponse:
    stale, missing = await apps_svc.enrich_stale(db, app)
    has_draft = await apps_svc.has_draft_components(db, app.id)
    published_version = await apps_svc.current_published_version(db, app)
    return AppBuilderResponse(
        **apps_svc.to_response_base(
            app,
            stale=stale,
            missing=missing,
            has_draft=has_draft,
            published_version=published_version,
        )
    )


def _components_out(components: list[dict[str, Any]]) -> list[AppBuilderComponent]:
    return [AppBuilderComponent(**c) for c in components]


def _register_routes(api: APIRouter) -> None:
    @api.get("", response_model=list[AppBuilderResponse], dependencies=_read_deps)
    async def list_apps(
        status: str | None = Query(None),
        db: AsyncSession = Depends(get_db),
    ):
        rows = await apps_svc.list_apps(db, status=status)
        return [await _to_list_item(db, r) for r in rows]

    @api.post("", response_model=AppBuilderResponse, status_code=201, dependencies=_read_deps)
    async def create_app(
        body: AppBuilderCreate,
        request: Request,
        db: AsyncSession = Depends(get_db),
        _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
    ):
        validate_api_name(body.api_name)
        if (body.template_id or "a2ui").strip() == "module":
            await ensure_permission(request, db, PERM_CONSOLE_KUBERNETES)
        uid, uname = jwt_user_from_request(request)
        app = await apps_svc.create_app(db, body, created_by=uid, created_by_name=uname)
        return await _to_list_item(db, app)

    @api.get("/{app_id}", response_model=AppBuilderRunResponse, dependencies=_read_deps)
    async def get_app_run(app_id: str, db: AsyncSession = Depends(get_db)):
        """Published runtime document only (404 if draft / unpublished)."""
        app = await apps_svc.get_app(db, app_id)
        kind = apps_svc.app_kind_of(app)
        components = await apps_svc.published_components_dicts(db, app)
        if app.status != "published":
            raise HTTPException(status_code=404, detail="Published app not found")
        if kind == "a2ui" and not components:
            raise HTTPException(status_code=404, detail="Published app not found")
        stale, missing = await apps_svc.enrich_stale(db, app)
        published_version = await apps_svc.current_published_version(db, app)
        base = apps_svc.to_response_base(app, stale=stale, missing=missing, published_version=published_version)
        return AppBuilderRunResponse(**base, components=_components_out(components))

    @api.get("/{app_id}/design", response_model=AppBuilderDesignResponse, dependencies=_read_deps)
    async def get_app_design(
        app_id: str,
        db: AsyncSession = Depends(get_db),
        _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
    ):
        app = await apps_svc.get_app(db, app_id)
        components = await apps_svc.draft_components_dicts(db, app.id)
        stale, missing = await apps_svc.enrich_stale(db, app)
        base = apps_svc.to_response_base(app, stale=stale, missing=missing)
        return AppBuilderDesignResponse(**base, components=_components_out(components))

    @api.patch("/{app_id}", response_model=AppBuilderResponse, dependencies=_read_deps)
    async def update_app(
        app_id: str,
        body: AppBuilderUpdate,
        db: AsyncSession = Depends(get_db),
        _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
    ):
        app = await apps_svc.get_app(db, app_id)
        app = await apps_svc.update_app(db, app, body)
        return await _to_list_item(db, app)

    @api.delete("/{app_id}", status_code=204, dependencies=_read_deps)
    async def delete_app(
        app_id: str,
        db: AsyncSession = Depends(get_db),
        _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
    ):
        app = await apps_svc.get_app(db, app_id)
        await apps_svc.delete_app(db, app)
        return None

    @api.post("/{app_id}/synthesize", response_model=AppBuilderDesignResponse, dependencies=_read_deps)
    async def synthesize_app(
        app_id: str,
        db: AsyncSession = Depends(get_db),
        _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
    ):
        app = await apps_svc.get_app(db, app_id)
        app = await apps_svc.synthesize_draft(db, app)
        components = await apps_svc.draft_components_dicts(db, app.id)
        stale, missing = await apps_svc.enrich_stale(db, app)
        base = apps_svc.to_response_base(app, stale=stale, missing=missing)
        return AppBuilderDesignResponse(**base, components=_components_out(components))

    @api.post("/{app_id}/publish", response_model=AppBuilderRunResponse, dependencies=_read_deps)
    async def publish_app(
        app_id: str,
        request: Request,
        body: AppBuilderPublishIn | None = None,
        db: AsyncSession = Depends(get_db),
        _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
    ):
        app = await apps_svc.get_app(db, app_id)
        uid, uname = jwt_user_from_request(request)
        raw_components = None
        if body and body.components is not None:
            raw_components = [c.model_dump() for c in body.components]
        app = await apps_svc.publish_app(
            db, app, components=raw_components, created_by=uid, created_by_name=uname
        )
        components = await apps_svc.published_components_dicts(db, app)
        stale, missing = await apps_svc.enrich_stale(db, app)
        base = apps_svc.to_response_base(app, stale=stale, missing=missing)
        return AppBuilderRunResponse(**base, components=_components_out(components))

    @api.post("/{app_id}/unpublish", response_model=AppBuilderResponse, dependencies=_read_deps)
    async def unpublish_app(
        app_id: str,
        db: AsyncSession = Depends(get_db),
        _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
    ):
        app = await apps_svc.get_app(db, app_id)
        app = await apps_svc.unpublish_app(db, app)
        return await _to_list_item(db, app)

    @api.get("/{app_id}/versions", response_model=list[AppBuilderVersionOut], dependencies=_read_deps)
    async def list_versions(
        app_id: str,
        db: AsyncSession = Depends(get_db),
        _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
    ):
        app = await apps_svc.get_app(db, app_id)
        rows = await apps_svc.list_published_versions(db, app.id)
        return [
            AppBuilderVersionOut(
                id=v.id,
                version=v.version,
                created_at=v.created_at,
                created_by_name=v.created_by_name,
                is_current=v.id == app.published_version_id,
            )
            for v in rows
        ]

    @api.post(
        "/{app_id}/versions/{version_id}/rollback",
        response_model=AppBuilderResponse,
        dependencies=_read_deps,
    )
    async def rollback_version(
        app_id: str,
        version_id: str,
        db: AsyncSession = Depends(get_db),
        _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
    ):
        app = await apps_svc.get_app(db, app_id)
        app = await apps_svc.rollback_to_version(db, app, version_id)
        return await _to_list_item(db, app)

    _PROXY_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]

    async def _proxy_module_app(app_id: str, request: Request, path: str, db: AsyncSession):
        if request.headers.get("upgrade"):
            raise HTTPException(status_code=501, detail="WebSocket proxy is not supported")
        app = await apps_svc.get_app(db, app_id)
        if apps_svc.app_kind_of(app) != "module" or app.status != "published":
            raise HTTPException(status_code=404, detail="Published module app not found")
        k8s = (app.bindings or {}).get("k8s") if isinstance(app.bindings, dict) else None
        if not isinstance(k8s, dict):
            raise HTTPException(status_code=400, detail="module app is missing bindings.k8s")
        cluster_id = str(k8s.get("cluster_id") or "").strip()
        namespace = str(k8s.get("namespace") or "").strip()
        service = str(k8s.get("service") or "").strip()
        try:
            port = int(k8s.get("port"))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Invalid k8s.port") from None
        cluster = await db.get(KubernetesCluster, cluster_id)
        if not cluster:
            raise HTTPException(status_code=400, detail="Unknown Kubernetes cluster")
        try:
            kubeconfig = decrypt(cluster.kubeconfig_encrypted)
        except Exception:
            raise HTTPException(status_code=500, detail="Failed to decrypt kubeconfig") from None
        extra = join_proxy_path(k8s.get("path") if isinstance(k8s.get("path"), str) else None, path)
        query = [(k, v) for k, v in request.query_params.multi_items()]
        body = await request.body()
        options = cluster.options or {}
        identity = identity_headers(getattr(request.state, "openkms_jwt_payload", None) or {})
        try:
            if options.get("direct_service_access"):
                status, headers, payload = await proxy_service_direct_async(
                    service_direct_base_url(namespace, service, port),
                    method=request.method,
                    extra_path=extra,
                    query=query,
                    body=body or None,
                    headers=list(request.headers.items()),
                    identity=identity,
                )
            else:
                status, headers, payload = await proxy_service_async(
                    kubeconfig,
                    method=request.method,
                    namespace=namespace,
                    service=service,
                    port=port,
                    extra_path=extra,
                    query=query,
                    body=body or None,
                    content_type=request.headers.get("content-type"),
                    identity=identity,
                    insecure_skip_tls_verify=bool(options.get("insecure_skip_tls_verify")),
                    api_server=cluster.api_server,
                )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Service proxy failed: {e}") from e
        return Response(content=payload, status_code=status, headers=headers)

    @api.api_route(
        "/{app_id}/proxy",
        methods=_PROXY_METHODS,
        dependencies=_proxy_deps,
        include_in_schema=True,
    )
    async def proxy_app_root(app_id: str, request: Request, db: AsyncSession = Depends(get_db)):
        """Proxy HTTP to the registered Kubernetes Service (module apps)."""
        return await _proxy_module_app(app_id, request, "", db)

    @api.api_route(
        "/{app_id}/proxy/{path:path}",
        methods=_PROXY_METHODS,
        dependencies=_proxy_deps,
        include_in_schema=True,
    )
    async def proxy_app_path(
        app_id: str,
        path: str,
        request: Request,
        db: AsyncSession = Depends(get_db),
    ):
        return await _proxy_module_app(app_id, request, path, db)


router = APIRouter(prefix="/app-builder/apps", tags=["app-builder"])
_register_routes(router)
