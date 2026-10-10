"""Project-scoped Kubernetes helpers (dev sync). Kubeconfig never leaves the server."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_permission
from app.api.deps import get_jwt_sub
from app.database import get_db
from app.models.kubernetes_cluster import KubernetesCluster
from app.models.project import Project
from app.schemas.kubernetes_cluster import (
    ProjectKubernetesDevSyncRequest,
    ProjectKubernetesDevSyncResponse,
)
from app.services.credentials.credential_encryption import decrypt
from app.services.kubernetes.cluster_dev_sync import sync_project_tree_async
from app.services.permissions.permission_catalog import (
    PERM_CONSOLE_KUBERNETES,
    PERM_PROJECTS_WRITE,
)
from app.services.project_fs import resolve_project_path

router = APIRouter()


async def _get_owned_project(db: AsyncSession, project_id: str, sub: str) -> Project:
    p = await db.get(Project, project_id)
    if not p or p.user_sub != sub:
        raise HTTPException(status_code=404, detail="Project not found")
    return p


def _client_overrides(row: KubernetesCluster) -> dict:
    opts = row.options or {}
    return {
        "insecure_skip_tls_verify": bool(opts.get("insecure_skip_tls_verify")),
        "api_server": row.api_server,
    }


@router.post(
    "/{project_id}/kubernetes/dev-sync",
    response_model=ProjectKubernetesDevSyncResponse,
    dependencies=[
        Depends(require_permission(PERM_PROJECTS_WRITE)),
        Depends(require_permission(PERM_CONSOLE_KUBERNETES)),
    ],
)
async def project_kubernetes_dev_sync(
    project_id: str,
    body: ProjectKubernetesDevSyncRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Pack a project subtree and extract it into a Deployment Pod (on-demand, no long sync)."""
    sub = get_jwt_sub(request)
    await _get_owned_project(db, project_id, sub)

    cluster = await db.get(KubernetesCluster, body.cluster_id.strip())
    if not cluster:
        raise HTTPException(status_code=404, detail="Kubernetes cluster not found")

    ns = (body.namespace or "").strip() or (cluster.default_namespace or "default")
    try:
        local_root = resolve_project_path(project_id, body.local_path)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    try:
        kubeconfig = decrypt(cluster.kubeconfig_encrypted)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to decrypt kubeconfig") from None

    try:
        result = await sync_project_tree_async(
            kubeconfig,
            namespace=ns,
            deployment=body.deployment.strip(),
            container=(body.container.strip() if body.container else None),
            local_root=local_root,
            container_path=body.container_path.strip(),
            reload=body.reload,
            reload_port=body.reload_port,
            reload_path=body.reload_path,
            reload_required=body.reload_required,
            **_client_overrides(cluster),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Dev sync failed: {e}") from e

    return ProjectKubernetesDevSyncResponse(**result)
