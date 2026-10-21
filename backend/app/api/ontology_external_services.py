"""Named external services an Ontology Function may call (`client.external("turtle")`).

Two kinds, because two things can be true about where the service lives:

* ``http`` — a URL the function sandbox can reach itself. The registry holds the origin, the
  credential and the path prefixes; the request leaves from the sandbox.
* ``k8s_service`` — a Service inside a registered cluster. Its DNS only resolves inside the cluster,
  so the **backend** makes that call with the cluster's kubeconfig (the same tunnel the hosted-App
  proxy uses), after checking the same allowlist.

The Function source names the service either way; changing the transport is a registry edit, not a
code change. Secrets are stored encrypted, never listed, and resolved only at call time.
"""

from __future__ import annotations

import json
import uuid
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_any_permission, require_auth
from app.api.ontology.deps import validate_api_name
from app.database import get_db
from app.models.external_service import AUTH_KINDS, SERVICE_KINDS, ExternalService
from app.models.kubernetes_cluster import KubernetesCluster
from app.services.credentials.credential_encryption import decrypt, encrypt
from app.services.kubernetes.cluster_service_proxy import (
    identity_headers,
    join_proxy_path,
    proxy_service_async,
)
from app.services.kubernetes.cluster_config import validate_resource_name
from app.services.permissions.permission_catalog import PERM_ONTOLOGY_READ, PERM_ONTOLOGY_WRITE

router = APIRouter(
    prefix="/ontology/external-services",
    tags=["ontology-external-services"],
    dependencies=[Depends(require_auth)],
)

MAX_TIMEOUT_SECONDS = 60
CALL_METHODS = ("GET", "POST", "PUT", "PATCH", "DELETE")


class ExternalServiceCreate(BaseModel):
    api_name: str = Field(min_length=1, max_length=128)
    display_name: str = Field(min_length=1, max_length=256)
    description: str | None = None
    kind: str = "http"
    #: `http` only.
    base_url: str | None = None
    #: `k8s_service` only.
    cluster_id: str | None = None
    namespace: str | None = None
    service: str | None = None
    port: int | None = None
    base_path: str = ""
    auth_kind: str = "none"
    auth_header_name: str | None = None
    secret: str | None = None
    allowed_paths: list[str] = []
    timeout_seconds: int = 10


class ExternalServiceUpdate(BaseModel):
    display_name: str | None = None
    description: str | None = None
    kind: str | None = None
    base_url: str | None = None
    cluster_id: str | None = None
    namespace: str | None = None
    service: str | None = None
    port: int | None = None
    base_path: str | None = None
    auth_kind: str | None = None
    auth_header_name: str | None = None
    #: Omit to keep the stored secret; send an empty string to clear it.
    secret: str | None = None
    allowed_paths: list[str] | None = None
    timeout_seconds: int | None = None


class ExternalServiceResponse(BaseModel):
    id: str
    api_name: str
    display_name: str
    description: str | None = None
    kind: str
    base_url: str | None = None
    cluster_id: str | None = None
    namespace: str | None = None
    service: str | None = None
    port: int | None = None
    base_path: str = ""
    auth_kind: str
    auth_header_name: str | None = None
    has_secret: bool
    allowed_paths: list[str]
    timeout_seconds: int
    created_at: object
    updated_at: object


class ExternalServiceResolveResponse(BaseModel):
    """What the function runtime needs. `transport` says who sends the request."""

    api_name: str
    kind: str
    transport: str  # direct | backend
    base_url: str | None = None
    base_path: str = ""
    auth_kind: str
    auth_header_name: str | None = None
    secret: str | None = None
    allowed_paths: list[str]
    timeout_seconds: int


class ExternalServiceCallRequest(BaseModel):
    method: str
    path: str
    query: dict | None = None
    #: JSON body; the backend serializes it once and signs those exact bytes.
    body: object | None = None


class ExternalServiceCallResponse(BaseModel):
    status: int
    body: object | None = None


class K8sClusterOption(BaseModel):
    id: str
    name: str
    default_namespace: str


CLUSTER_DNS_SUFFIXES = (".svc", ".svc.cluster.local")


def _validate_base_url(value: str) -> str:
    parsed = urlparse(value.strip())
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise HTTPException(
            status_code=400, detail="base_url must be an http(s) origin, e.g. http://backend:8200"
        )
    if parsed.query or parsed.fragment:
        raise HTTPException(status_code=400, detail="base_url must not carry a query or fragment")
    host = (parsed.hostname or "").lower()
    if host.endswith(CLUSTER_DNS_SUFFIXES) or ".svc." in host:
        # The sandbox has no cluster DNS; registering this as `http` would fail at the first call.
        raise HTTPException(
            status_code=400,
            detail=(
                f"'{host}' is a cluster-internal Service name — the function sandbox cannot resolve it. "
                "Register it with kind=k8s_service (cluster/namespace/service/port) instead."
            ),
        )
    return value.strip().rstrip("/")


def _validate_paths(paths: list[str]) -> list[str]:
    cleaned: list[str] = []
    for raw in paths:
        path = (raw or "").strip()
        if not path:
            continue
        if not path.startswith("/") or "://" in path:
            raise HTTPException(
                status_code=400,
                detail=f"allowed path {path!r} must be a path prefix starting with '/'",
            )
        if path not in cleaned:
            cleaned.append(path)
    if not cleaned:
        raise HTTPException(status_code=400, detail="At least one allowed path prefix is required")
    return cleaned


def _validate_base_path(value: str | None) -> str:
    path = (value or "").strip()
    if not path:
        return ""
    if "://" in path:
        raise HTTPException(status_code=400, detail="base_path must be a path, not a URL")
    return "/" + path.strip("/")


def _validate_auth(auth_kind: str, header_name: str | None) -> str | None:
    if auth_kind not in AUTH_KINDS:
        raise HTTPException(status_code=400, detail=f"auth_kind must be one of {AUTH_KINDS}")
    if auth_kind == "header":
        name = (header_name or "").strip()
        if not name:
            raise HTTPException(
                status_code=400, detail="auth_header_name is required for header auth"
            )
        return name
    if auth_kind == "hmac":
        # Signature header defaults to the one this project's receivers check.
        return (header_name or "").strip() or "X-OpenKMS-Signature"
    return None


def _validate_timeout(value: int) -> int:
    if value < 1 or value > MAX_TIMEOUT_SECONDS:
        raise HTTPException(
            status_code=400, detail=f"timeout_seconds must be between 1 and {MAX_TIMEOUT_SECONDS}"
        )
    return value


async def _validate_kind_fields(
    db: AsyncSession, values: dict
) -> dict:
    """Return the kind-specific fields to persist, or raise 400."""
    kind = values.get("kind") or "http"
    if kind not in SERVICE_KINDS:
        raise HTTPException(status_code=400, detail=f"kind must be one of {SERVICE_KINDS}")
    if kind == "http":
        base_url = (values.get("base_url") or "").strip()
        if not base_url:
            raise HTTPException(status_code=400, detail="http services need base_url")
        return {
            "kind": "http",
            "base_url": _validate_base_url(base_url),
            "cluster_id": None,
            "namespace": None,
            "service": None,
            "port": None,
            "base_path": _validate_base_path(values.get("base_path")),
        }

    cluster_id = (values.get("cluster_id") or "").strip()
    namespace = (values.get("namespace") or "").strip()
    service = (values.get("service") or "").strip()
    port = values.get("port")
    if not cluster_id:
        raise HTTPException(status_code=400, detail="k8s_service needs cluster_id")
    if not namespace or not service:
        raise HTTPException(status_code=400, detail="k8s_service needs namespace and service")
    if not isinstance(port, int) or not (0 < port < 65536):
        raise HTTPException(status_code=400, detail="k8s_service needs a port between 1 and 65535")
    try:
        validate_resource_name(namespace)
        validate_resource_name(service)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    cluster = await db.get(KubernetesCluster, cluster_id)
    if not cluster:
        raise HTTPException(status_code=400, detail="Unknown Kubernetes cluster")
    return {
        "kind": "k8s_service",
        "base_url": None,
        "cluster_id": cluster_id,
        "namespace": namespace,
        "service": service,
        "port": port,
        "base_path": _validate_base_path(values.get("base_path")),
    }


def _to_response(service: ExternalService) -> ExternalServiceResponse:
    return ExternalServiceResponse(
        id=service.id,
        api_name=service.api_name,
        display_name=service.display_name,
        description=service.description,
        kind=service.kind,
        base_url=service.base_url,
        cluster_id=service.cluster_id,
        namespace=service.namespace,
        service=service.service,
        port=service.port,
        base_path=service.base_path or "",
        auth_kind=service.auth_kind,
        auth_header_name=service.auth_header_name,
        has_secret=bool(service.secret_encrypted),
        allowed_paths=list(service.allowed_paths or []),
        timeout_seconds=service.timeout_seconds,
        created_at=service.created_at,
        updated_at=service.updated_at,
    )


async def _get_service(db: AsyncSession, service_id: str) -> ExternalService:
    service = await db.get(ExternalService, service_id)
    if not service:
        raise HTTPException(status_code=404, detail="External service not found")
    return service


async def _get_service_by_name(db: AsyncSession, api_name: str) -> ExternalService:
    service = (
        await db.execute(select(ExternalService).where(ExternalService.api_name == api_name))
    ).scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=404, detail=f"External service not found: {api_name}")
    return service


def _path_allowed(service: ExternalService, path: str) -> bool:
    return any(path.startswith(prefix) for prefix in (service.allowed_paths or []))


def _auth_headers(service: ExternalService, raw_body: bytes) -> dict[str, str]:
    """The credential the service expects, applied by whoever sends the request."""
    if service.auth_kind == "bearer" and service.secret_encrypted:
        return {"Authorization": f"Bearer {decrypt(service.secret_encrypted)}"}
    if service.auth_kind == "header" and service.secret_encrypted and service.auth_header_name:
        return {service.auth_header_name: decrypt(service.secret_encrypted)}
    if service.auth_kind == "hmac" and service.secret_encrypted:
        import hashlib
        import hmac as hmac_lib

        digest = hmac_lib.new(
            decrypt(service.secret_encrypted).encode("utf-8"), raw_body, hashlib.sha256
        ).hexdigest()
        header = service.auth_header_name or "X-OpenKMS-Signature"
        return {header: f"sha256={digest}"}
    return {}


@router.get("", response_model=list[ExternalServiceResponse])
async def list_external_services(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_READ)),
):
    rows = (
        await db.execute(select(ExternalService).order_by(ExternalService.api_name))
    ).scalars().all()
    return [_to_response(r) for r in rows]


@router.get("/k8s-clusters", response_model=list[K8sClusterOption])
async def list_cluster_options(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_READ)),
):
    """Clusters a `k8s_service` entry can point at (id + name only; the picker needs no more)."""
    rows = (
        await db.execute(select(KubernetesCluster).order_by(KubernetesCluster.name))
    ).scalars().all()
    return [
        K8sClusterOption(id=r.id, name=r.name, default_namespace=r.default_namespace or "default")
        for r in rows
    ]


@router.post("", response_model=ExternalServiceResponse, status_code=201)
async def create_external_service(
    body: ExternalServiceCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
):
    validate_api_name(body.api_name)
    existing = await db.execute(
        select(ExternalService).where(ExternalService.api_name == body.api_name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=400, detail=f"api_name {body.api_name!r} is already registered"
        )
    target = await _validate_kind_fields(db, body.model_dump())
    auth_header_name = _validate_auth(body.auth_kind, body.auth_header_name)
    if body.auth_kind != "none" and not (body.secret or "").strip():
        raise HTTPException(status_code=400, detail="A secret is required for this auth_kind")

    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    uname = p.get("preferred_username") or p.get("name")
    service = ExternalService(
        id=str(uuid.uuid4()),
        api_name=body.api_name,
        display_name=body.display_name.strip(),
        description=(body.description or "").strip() or None,
        auth_kind=body.auth_kind,
        auth_header_name=auth_header_name,
        secret_encrypted=encrypt(body.secret.strip()) if (body.secret or "").strip() else None,
        allowed_paths=_validate_paths(body.allowed_paths),
        timeout_seconds=_validate_timeout(body.timeout_seconds),
        created_by=sub if isinstance(sub, str) else None,
        created_by_name=str(uname)[:256] if isinstance(uname, str) and uname.strip() else None,
        **target,
    )
    db.add(service)
    await db.commit()
    await db.refresh(service)
    return _to_response(service)


@router.patch("/{service_id}", response_model=ExternalServiceResponse)
async def update_external_service(
    service_id: str,
    body: ExternalServiceUpdate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
):
    service = await _get_service(db, service_id)
    if body.display_name is not None:
        service.display_name = body.display_name.strip()
    if body.description is not None:
        service.description = body.description.strip() or None

    target_fields = {
        "kind",
        "base_url",
        "cluster_id",
        "namespace",
        "service",
        "port",
        "base_path",
    }
    if any(getattr(body, f) is not None for f in target_fields - {"kind", "base_path"}):
        # Re-validate the *whole* target: switching kind must not leave the other kind's fields
        # behind, and half a coordinate pair is worse than a rejected edit.
        merged = {
            "kind": body.kind or service.kind,
            "base_url": body.base_url if body.base_url is not None else service.base_url,
            "cluster_id": body.cluster_id if body.cluster_id is not None else service.cluster_id,
            "namespace": body.namespace if body.namespace is not None else service.namespace,
            "service": body.service if body.service is not None else service.service,
            "port": body.port if body.port is not None else service.port,
            "base_path": body.base_path if body.base_path is not None else service.base_path,
        }
        for key, value in (await _validate_kind_fields(db, merged)).items():
            setattr(service, key, value)
    elif body.kind is not None:
        service.kind = body.kind
    elif body.base_path is not None:
        service.base_path = _validate_base_path(body.base_path)

    if body.auth_kind is not None:
        service.auth_kind = body.auth_kind
        service.auth_header_name = _validate_auth(body.auth_kind, body.auth_header_name)
        if body.auth_kind == "none":
            service.secret_encrypted = None
    elif body.auth_header_name is not None:
        service.auth_header_name = _validate_auth(service.auth_kind, body.auth_header_name)
    if body.secret is not None:
        service.secret_encrypted = encrypt(body.secret.strip()) if body.secret.strip() else None
    if service.auth_kind != "none" and not service.secret_encrypted:
        raise HTTPException(status_code=400, detail="A secret is required for this auth_kind")
    if body.allowed_paths is not None:
        service.allowed_paths = _validate_paths(body.allowed_paths)
    if body.timeout_seconds is not None:
        service.timeout_seconds = _validate_timeout(body.timeout_seconds)
    await db.commit()
    await db.refresh(service)
    return _to_response(service)


@router.delete("/{service_id}", status_code=204)
async def delete_external_service(
    service_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
):
    service = await _get_service(db, service_id)
    await db.delete(service)


@router.post("/by-api-name/{api_name}/resolve", response_model=ExternalServiceResolveResponse)
async def resolve_external_service(
    api_name: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_READ)),
):
    """Hand the runtime what it needs: URL + credential for `http`, a transport for `k8s_service`.

    For `k8s_service` no URL travels — only the marker that the backend makes the call — because the
    Service's DNS exists inside the cluster and the sandbox has no route to it.
    """
    service = await _get_service_by_name(db, api_name)
    return ExternalServiceResolveResponse(
        api_name=service.api_name,
        kind=service.kind,
        transport="direct" if service.kind == "http" else "backend",
        base_url=service.base_url,
        base_path=service.base_path or "",
        auth_kind=service.auth_kind,
        auth_header_name=service.auth_header_name,
        secret=(
            decrypt(service.secret_encrypted)
            if service.secret_encrypted and service.kind == "http"
            else None
        ),
        allowed_paths=list(service.allowed_paths or []),
        timeout_seconds=service.timeout_seconds,
    )


@router.post("/by-api-name/{api_name}/call", response_model=ExternalServiceCallResponse)
async def call_external_service(
    api_name: str,
    body: ExternalServiceCallRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_READ)),
):
    """Make a `k8s_service` call through the cluster's kubeconfig.

    The sandbox cannot resolve a cluster Service, so this endpoint relays it. The allowlist is
    re-checked here (never trusted from the caller), the credential is applied here, and the request
    is recorded by the audit middleware like any other POST.
    """
    service = await _get_service_by_name(db, api_name)
    if service.kind != "k8s_service":
        raise HTTPException(
            status_code=400,
            detail="This service is called directly by the runtime; only k8s_service entries relay through the backend",
        )
    method = (body.method or "").upper()
    if method not in CALL_METHODS:
        raise HTTPException(status_code=400, detail=f"method must be one of {CALL_METHODS}")
    path = (body.path or "").strip()
    if "://" in path or not path.startswith("/"):
        raise HTTPException(status_code=400, detail="path must start with '/' and be relative")
    if not _path_allowed(service, path):
        raise HTTPException(
            status_code=400,
            detail=f"path {path!r} is not in the allowed prefixes {service.allowed_paths}",
        )

    cluster = await db.get(KubernetesCluster, service.cluster_id) if service.cluster_id else None
    if not cluster:
        raise HTTPException(status_code=400, detail="The service's Kubernetes cluster is missing")
    try:
        kubeconfig = decrypt(cluster.kubeconfig_encrypted)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to decrypt kubeconfig") from e

    raw_body = json.dumps(body.body).encode("utf-8") if body.body is not None else None
    headers = _auth_headers(service, raw_body or b"")
    identity = identity_headers(getattr(request.state, "openkms_jwt_payload", None) or {})
    options = cluster.options or {}
    try:
        status, _headers, payload = await proxy_service_async(
            kubeconfig,
            method=method,
            namespace=str(service.namespace),
            service=str(service.service),
            port=int(service.port or 0),
            extra_path=join_proxy_path(service.base_path, path),
            query=[(k, str(v)) for k, v in (body.query or {}).items() if v is not None],
            body=raw_body,
            content_type="application/json" if raw_body is not None else None,
            identity={**identity, **headers},
            insecure_skip_tls_verify=bool(options.get("insecure_skip_tls_verify")),
            api_server=cluster.api_server,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Service call failed: {e}") from e

    parsed: object | None
    try:
        parsed = json.loads(payload) if payload else None
    except json.JSONDecodeError:
        parsed = {"text": payload.decode("utf-8", errors="replace")[:4000]}
    return ExternalServiceCallResponse(status=status, body=parsed)
