"""Kubernetes clusters API – CRUD and test connection (console permission)."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_auth, require_permission
from app.database import get_db
from app.models.kubernetes_cluster import KubernetesCluster
from app.schemas.kubernetes_cluster import (
    KubernetesClusterCreate,
    KubernetesClusterListResponse,
    KubernetesClusterResponse,
    KubernetesClusterUpdate,
    KubernetesDeploymentListResponse,
    KubernetesNamespaceListResponse,
    KubernetesPodListResponse,
)
from app.services.credentials.credential_encryption import decrypt, encrypt
from app.services.kubernetes.cluster_connection import (
    normalize_api_server,
    probe_cluster_connection_async,
    resolve_api_server_from_text,
)
from app.services.kubernetes.cluster_resources import (
    list_deployments_async,
    list_namespaces_async,
    list_pods_async,
)
from app.services.permissions.permission_catalog import PERM_CONSOLE_KUBERNETES

router = APIRouter(
    prefix="/kubernetes-clusters",
    tags=["kubernetes-clusters"],
    dependencies=[Depends(require_auth)],
)


def _options_insecure(options: dict | None) -> bool:
    if not options:
        return False
    return bool(options.get("insecure_skip_tls_verify"))


def _to_response(row: KubernetesCluster) -> KubernetesClusterResponse:
    return KubernetesClusterResponse(
        id=row.id,
        name=row.name,
        description=row.description,
        default_namespace=row.default_namespace or "default",
        api_server=row.api_server,
        kubeconfig_configured=bool(row.kubeconfig_encrypted),
        options=row.options,
        last_tested_at=row.last_tested_at,
        last_test_ok=row.last_test_ok,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _parse_and_encrypt_kubeconfig(kubeconfig: str) -> tuple[str, str | None]:
    """Validate kubeconfig, extract api_server, return (encrypted, api_server)."""
    text = kubeconfig.strip()
    try:
        api_server = resolve_api_server_from_text(text)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return encrypt(text), api_server


def _http_normalize_api_server(value: str | None) -> str | None:
    try:
        return normalize_api_server(value)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


def _resolve_stored_api_server(override: str | None, extracted: str | None) -> str | None:
    return _http_normalize_api_server(override) or extracted


def _client_overrides(row: KubernetesCluster) -> dict:
    return {
        "insecure_skip_tls_verify": _options_insecure(row.options),
        "api_server": row.api_server,
    }


async def _load_cluster_or_404(cluster_id: str, db: AsyncSession) -> KubernetesCluster:
    row = await db.get(KubernetesCluster, cluster_id)
    if not row:
        raise HTTPException(status_code=404, detail="Kubernetes cluster not found")
    return row


def _decrypt_kubeconfig(row: KubernetesCluster) -> str:
    try:
        return decrypt(row.kubeconfig_encrypted)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to decrypt kubeconfig") from None


def _resource_http_error(exc: Exception) -> HTTPException:
    msg = str(exc) or exc.__class__.__name__
    if "Forbidden" in msg or "403" in msg:
        return HTTPException(status_code=403, detail=f"Cluster denied access: {msg}")
    if "Unauthorized" in msg or "401" in msg:
        return HTTPException(status_code=401, detail=f"Cluster auth failed: {msg}")
    if "Not Found" in msg or "404" in msg:
        return HTTPException(status_code=404, detail=msg)
    return HTTPException(status_code=502, detail=f"Cluster request failed: {msg}")


@router.get(
    "",
    response_model=KubernetesClusterListResponse,
    dependencies=[Depends(require_permission(PERM_CONSOLE_KUBERNETES))],
)
async def list_kubernetes_clusters(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """List registered Kubernetes clusters (paginated)."""
    total = int((await db.execute(select(func.count()).select_from(KubernetesCluster))).scalar_one())
    result = await db.execute(
        select(KubernetesCluster)
        .order_by(KubernetesCluster.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    items = result.scalars().all()
    return KubernetesClusterListResponse(
        items=[_to_response(r) for r in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post(
    "",
    response_model=KubernetesClusterResponse,
    status_code=201,
    dependencies=[Depends(require_permission(PERM_CONSOLE_KUBERNETES))],
)
async def create_kubernetes_cluster(
    body: KubernetesClusterCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a cluster registration. Encrypts kubeconfig; never returns it."""
    encrypted, extracted = _parse_and_encrypt_kubeconfig(body.kubeconfig)
    ns = (body.default_namespace or "default").strip() or "default"
    row = KubernetesCluster(
        id=str(uuid.uuid4()),
        name=body.name.strip(),
        description=(body.description or "").strip() or None,
        default_namespace=ns,
        api_server=_resolve_stored_api_server(body.api_server, extracted),
        kubeconfig_encrypted=encrypted,
        options=body.options,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return _to_response(row)


@router.get(
    "/{cluster_id}",
    response_model=KubernetesClusterResponse,
    dependencies=[Depends(require_permission(PERM_CONSOLE_KUBERNETES))],
)
async def get_kubernetes_cluster(cluster_id: str, db: AsyncSession = Depends(get_db)):
    """Get a cluster registration by ID."""
    row = await db.get(KubernetesCluster, cluster_id)
    if not row:
        raise HTTPException(status_code=404, detail="Kubernetes cluster not found")
    return _to_response(row)


@router.put(
    "/{cluster_id}",
    response_model=KubernetesClusterResponse,
    dependencies=[Depends(require_permission(PERM_CONSOLE_KUBERNETES))],
)
async def update_kubernetes_cluster(
    cluster_id: str,
    body: KubernetesClusterUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a cluster. Empty/omitted kubeconfig keeps the stored secret."""
    row = await db.get(KubernetesCluster, cluster_id)
    if not row:
        raise HTTPException(status_code=404, detail="Kubernetes cluster not found")
    if body.name is not None:
        row.name = body.name.strip()
    if body.description is not None:
        row.description = body.description.strip() or None
    if body.default_namespace is not None:
        row.default_namespace = body.default_namespace.strip() or "default"
    if body.options is not None:
        row.options = body.options
    kubeconfig_replaced = bool(body.kubeconfig and body.kubeconfig.strip())
    extracted: str | None = None
    if kubeconfig_replaced:
        encrypted, extracted = _parse_and_encrypt_kubeconfig(body.kubeconfig or "")
        row.kubeconfig_encrypted = encrypted
    if "api_server" in body.model_fields_set:
        if not (body.api_server or "").strip():
            if extracted is None:
                try:
                    extracted = resolve_api_server_from_text(_decrypt_kubeconfig(row))
                except ValueError as e:
                    raise HTTPException(status_code=400, detail=str(e)) from e
            row.api_server = extracted
        else:
            row.api_server = _http_normalize_api_server(body.api_server)
    elif kubeconfig_replaced:
        row.api_server = extracted
    await db.flush()
    await db.refresh(row)
    return _to_response(row)


@router.delete(
    "/{cluster_id}",
    status_code=204,
    dependencies=[Depends(require_permission(PERM_CONSOLE_KUBERNETES))],
)
async def delete_kubernetes_cluster(cluster_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a cluster registration."""
    row = await db.get(KubernetesCluster, cluster_id)
    if not row:
        raise HTTPException(status_code=404, detail="Kubernetes cluster not found")
    await db.delete(row)


@router.post(
    "/{cluster_id}/test",
    dependencies=[Depends(require_permission(PERM_CONSOLE_KUBERNETES))],
)
async def test_kubernetes_cluster(cluster_id: str, db: AsyncSession = Depends(get_db)):
    """Test connectivity using the stored kubeconfig."""
    row = await _load_cluster_or_404(cluster_id, db)
    plain = _decrypt_kubeconfig(row)

    ok, message = await probe_cluster_connection_async(plain, **_client_overrides(row))
    row.last_tested_at = datetime.now(timezone.utc)
    row.last_test_ok = ok
    await db.flush()
    return {"ok": ok, "message": message}


@router.get(
    "/{cluster_id}/namespaces",
    response_model=KubernetesNamespaceListResponse,
    dependencies=[Depends(require_permission(PERM_CONSOLE_KUBERNETES))],
)
async def list_cluster_namespaces(cluster_id: str, db: AsyncSession = Depends(get_db)):
    """List namespaces on the registered cluster (read-only)."""
    row = await _load_cluster_or_404(cluster_id, db)
    plain = _decrypt_kubeconfig(row)
    try:
        items = await list_namespaces_async(plain, **_client_overrides(row))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise _resource_http_error(e) from e
    return KubernetesNamespaceListResponse(items=items)


@router.get(
    "/{cluster_id}/deployments",
    response_model=KubernetesDeploymentListResponse,
    dependencies=[Depends(require_permission(PERM_CONSOLE_KUBERNETES))],
)
async def list_cluster_deployments(
    cluster_id: str,
    namespace: str | None = Query(None, description="Namespace; defaults to cluster default_namespace"),
    db: AsyncSession = Depends(get_db),
):
    """List Deployments in a namespace (read-only)."""
    row = await _load_cluster_or_404(cluster_id, db)
    ns = (namespace or row.default_namespace or "default").strip() or "default"
    plain = _decrypt_kubeconfig(row)
    try:
        items = await list_deployments_async(plain, ns, **_client_overrides(row))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise _resource_http_error(e) from e
    return KubernetesDeploymentListResponse(namespace=ns, items=items)


@router.get(
    "/{cluster_id}/pods",
    response_model=KubernetesPodListResponse,
    dependencies=[Depends(require_permission(PERM_CONSOLE_KUBERNETES))],
)
async def list_cluster_pods(
    cluster_id: str,
    namespace: str | None = Query(None, description="Namespace; defaults to cluster default_namespace"),
    db: AsyncSession = Depends(get_db),
):
    """List Pods in a namespace (read-only)."""
    row = await _load_cluster_or_404(cluster_id, db)
    ns = (namespace or row.default_namespace or "default").strip() or "default"
    plain = _decrypt_kubeconfig(row)
    try:
        items = await list_pods_async(plain, ns, **_client_overrides(row))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise _resource_http_error(e) from e
    return KubernetesPodListResponse(namespace=ns, items=items)
