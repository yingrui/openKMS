"""Chamber registry + Service proxy API."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import ensure_permission, require_any_permission
from app.api.ontology.deps import jwt_user_from_request, validate_api_name
from app.database import get_db
from app.models.kubernetes_cluster import KubernetesCluster
from app.schemas.chamber import (
    ChamberCreate,
    ChamberResponse,
    ChamberRunResponse,
    ChamberUpdate,
    ChamberVersionOut,
)
from app.services.runtime.chamber import service as chamber_svc
from app.services.platform.credentials.credential_encryption import decrypt
from app.services.platform.credentials.credential_encryption import DECRYPT_ERRORS
from app.services.runtime.kubernetes.cluster_service_proxy import (
    identity_headers,
    join_proxy_path,
    proxy_service_async,
    proxy_service_direct_async,
    service_direct_base_url,
)
from app.services.identity.permissions.permission_catalog import (
    PERM_CONSOLE_KUBERNETES,
    PERM_ONTOLOGY_READ,
    PERM_ONTOLOGY_WRITE,
)

_read_deps = [Depends(require_any_permission(PERM_ONTOLOGY_READ))]
# The hosted app owns the Authorization header; openKMS authenticates the iframe by session cookie.
_proxy_deps = [Depends(require_any_permission(PERM_ONTOLOGY_READ, session_only=True))]


async def _to_list_item(db: AsyncSession, app) -> ChamberResponse:
    stale, missing = await chamber_svc.enrich_stale(db, app)
    published_version = await chamber_svc.current_published_version(db, app)
    return ChamberResponse(
        **chamber_svc.to_response_base(
            app,
            stale=stale,
            missing=missing,
            published_version=published_version,
        )
    )


def _register_routes(api: APIRouter) -> None:
    @api.get("", response_model=list[ChamberResponse], dependencies=_read_deps)
    async def list_apps(
        status: str | None = Query(None),
        db: AsyncSession = Depends(get_db),
    ):
        rows = await chamber_svc.list_apps(db, status=status)
        return [await _to_list_item(db, r) for r in rows]

    @api.post("", response_model=ChamberResponse, status_code=201, dependencies=_read_deps)
    async def create_app(
        body: ChamberCreate,
        request: Request,
        db: AsyncSession = Depends(get_db),
        _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
    ):
        validate_api_name(body.api_name)
        await ensure_permission(request, db, PERM_CONSOLE_KUBERNETES)
        uid, uname = jwt_user_from_request(request)
        app = await chamber_svc.create_app(db, body, created_by=uid, created_by_name=uname)
        return await _to_list_item(db, app)

    @api.get("/{app_id}", response_model=ChamberRunResponse, dependencies=_read_deps)
    async def get_app_run(app_id: str, db: AsyncSession = Depends(get_db)):
        """Published Chamber app only (404 if draft / unpublished)."""
        app = await chamber_svc.get_app(db, app_id)
        if app.status != "published" or app.template_id != "module":
            raise HTTPException(status_code=404, detail="Published app not found")
        stale, missing = await chamber_svc.enrich_stale(db, app)
        published_version = await chamber_svc.current_published_version(db, app)
        base = chamber_svc.to_response_base(app, stale=stale, missing=missing, published_version=published_version)
        return ChamberRunResponse(**base)

    @api.patch("/{app_id}", response_model=ChamberResponse, dependencies=_read_deps)
    async def update_app(
        app_id: str,
        body: ChamberUpdate,
        db: AsyncSession = Depends(get_db),
        _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
    ):
        app = await chamber_svc.get_app(db, app_id)
        app = await chamber_svc.update_app(db, app, body)
        return await _to_list_item(db, app)

    @api.delete("/{app_id}", status_code=204, dependencies=_read_deps)
    async def delete_app(
        app_id: str,
        db: AsyncSession = Depends(get_db),
        _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
    ):
        app = await chamber_svc.get_app(db, app_id)
        await chamber_svc.delete_app(db, app)
        return None

    @api.post("/{app_id}/publish", response_model=ChamberRunResponse, dependencies=_read_deps)
    async def publish_app(
        app_id: str,
        request: Request,
        db: AsyncSession = Depends(get_db),
        _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
    ):
        app = await chamber_svc.get_app(db, app_id)
        uid, uname = jwt_user_from_request(request)
        app = await chamber_svc.republish_app(db, app, created_by=uid, created_by_name=uname)
        stale, missing = await chamber_svc.enrich_stale(db, app)
        published_version = await chamber_svc.current_published_version(db, app)
        base = chamber_svc.to_response_base(app, stale=stale, missing=missing, published_version=published_version)
        return ChamberRunResponse(**base)

    @api.post("/{app_id}/unpublish", response_model=ChamberResponse, dependencies=_read_deps)
    async def unpublish_app(
        app_id: str,
        db: AsyncSession = Depends(get_db),
        _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
    ):
        app = await chamber_svc.get_app(db, app_id)
        app = await chamber_svc.unpublish_app(db, app)
        return await _to_list_item(db, app)

    @api.get("/{app_id}/versions", response_model=list[ChamberVersionOut], dependencies=_read_deps)
    async def list_versions(
        app_id: str,
        db: AsyncSession = Depends(get_db),
        _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
    ):
        app = await chamber_svc.get_app(db, app_id)
        rows = await chamber_svc.list_published_versions(db, app.id)
        return [
            ChamberVersionOut(
                id=v.id,
                version=v.version,
                created_at=v.created_at,
                created_by_name=v.created_by_name,
                is_current=v.id == app.published_version_id,
            )
            for v in rows
        ]

    _PROXY_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]

    async def _proxy_module_app(app_id: str, request: Request, path: str, db: AsyncSession):
        if request.headers.get("upgrade"):
            raise HTTPException(status_code=501, detail="WebSocket proxy is not supported")
        app = await chamber_svc.get_app(db, app_id)
        if app.template_id != "module" or app.status != "published":
            raise HTTPException(status_code=404, detail="Published Chamber app not found")
        k8s = (app.bindings or {}).get("k8s") if isinstance(app.bindings, dict) else None
        if not isinstance(k8s, dict):
            raise HTTPException(status_code=400, detail="Chamber app is missing bindings.k8s")
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
        except DECRYPT_ERRORS:
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
        """Proxy HTTP to the registered Kubernetes Service (Chamber apps)."""
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


router = APIRouter(prefix="/chamber/apps", tags=["chamber"])
_register_routes(router)
