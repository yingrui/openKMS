"""Project deploy secrets — encrypted storage + sync to Kubernetes Opaque Secrets."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_permission
from app.api.deps import get_jwt_sub
from app.database import get_db
from app.models.kubernetes_cluster import KubernetesCluster
from app.models.project import Project
from app.models.project_deploy_secret import ProjectDeploySecret
from app.schemas.project_deploy_secret import (
    ProjectDeploySecretCreate,
    ProjectDeploySecretResponse,
    ProjectDeploySecretUpdate,
)
from app.services.credentials.credential_encryption import decrypt
from app.services.kubernetes.cluster_config import (
    delete_secret_async,
    openkms_secret_labels,
    upsert_secret_async,
)
from app.services.permissions.permission_catalog import (
    PERM_CONSOLE_KUBERNETES,
    PERM_PROJECTS_READ,
    PERM_PROJECTS_WRITE,
)
from app.services.projects import deploy_secrets as deploy_svc

router = APIRouter()


async def _get_owned_project(db: AsyncSession, project_id: str, sub: str) -> Project:
    p = await db.get(Project, project_id)
    if not p or p.user_sub != sub:
        raise HTTPException(status_code=404, detail="Project not found")
    return p


def _reject_api_key(request: Request) -> None:
    payload = getattr(request.state, "openkms_jwt_payload", None) or {}
    if payload.get("openkms_auth_via") == "api_key":
        raise HTTPException(
            status_code=403,
            detail="Deploy secret values can only be managed from the signed-in console, not via API keys",
        )


def _client_overrides(row: KubernetesCluster) -> dict:
    opts = row.options or {}
    return {
        "insecure_skip_tls_verify": bool(opts.get("insecure_skip_tls_verify")),
        "api_server": row.api_server,
    }


async def _load_secret_or_404(
    db: AsyncSession, project_id: str, secret_id: str
) -> ProjectDeploySecret:
    row = await db.get(ProjectDeploySecret, secret_id)
    if not row or row.project_id != project_id:
        raise HTTPException(status_code=404, detail="Deploy secret not found")
    return row


@router.get(
    "/{project_id}/deploy-secrets",
    response_model=list[ProjectDeploySecretResponse],
    dependencies=[Depends(require_permission(PERM_PROJECTS_READ))],
)
async def list_deploy_secrets(
    project_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """List deploy secrets (names and keys only; values never returned)."""
    sub = get_jwt_sub(request)
    await _get_owned_project(db, project_id, sub)
    rows = (
        await db.execute(
            select(ProjectDeploySecret)
            .where(ProjectDeploySecret.project_id == project_id)
            .order_by(ProjectDeploySecret.name)
        )
    ).scalars().all()
    return [ProjectDeploySecretResponse(**deploy_svc.to_response_dict(r)) for r in rows]


@router.post(
    "/{project_id}/deploy-secrets",
    response_model=ProjectDeploySecretResponse,
    status_code=201,
    dependencies=[Depends(require_permission(PERM_PROJECTS_WRITE))],
)
async def create_deploy_secret(
    project_id: str,
    body: ProjectDeploySecretCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    _reject_api_key(request)
    sub = get_jwt_sub(request)
    await _get_owned_project(db, project_id, sub)
    try:
        name = deploy_svc.validate_secret_name(body.name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    cluster = await db.get(KubernetesCluster, body.cluster_id)
    if not cluster:
        raise HTTPException(status_code=400, detail="Unknown Kubernetes cluster")
    exists = (
        await db.execute(
            select(ProjectDeploySecret.id).where(
                ProjectDeploySecret.project_id == project_id,
                ProjectDeploySecret.name == name,
            )
        )
    ).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=409, detail="Deploy secret name already exists")
    try:
        values = deploy_svc.merge_values({}, set_values=body.values or {})
        if not values:
            raise ValueError("at least one key/value is required")
        cipher = deploy_svc.encrypt_values(values)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    ns = (body.namespace or "default").strip() or "default"
    row = ProjectDeploySecret(
        project_id=project_id,
        name=name,
        cluster_id=cluster.id,
        namespace=ns,
        key_names=sorted(values.keys()),
        data_encrypted=cipher,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return ProjectDeploySecretResponse(**deploy_svc.to_response_dict(row))


@router.patch(
    "/{project_id}/deploy-secrets/{secret_id}",
    response_model=ProjectDeploySecretResponse,
    dependencies=[Depends(require_permission(PERM_PROJECTS_WRITE))],
)
async def update_deploy_secret(
    project_id: str,
    secret_id: str,
    body: ProjectDeploySecretUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    _reject_api_key(request)
    sub = get_jwt_sub(request)
    await _get_owned_project(db, project_id, sub)
    row = await _load_secret_or_404(db, project_id, secret_id)
    if body.cluster_id is not None:
        cluster = await db.get(KubernetesCluster, body.cluster_id)
        if not cluster:
            raise HTTPException(status_code=400, detail="Unknown Kubernetes cluster")
        row.cluster_id = cluster.id
    if body.namespace is not None:
        row.namespace = body.namespace.strip() or "default"
    try:
        current = deploy_svc.decrypt_values(row.data_encrypted)
        merged = deploy_svc.merge_values(
            current, set_values=body.set_values or {}, remove_keys=body.remove_keys or []
        )
        if not merged:
            raise ValueError("deploy secret must keep at least one key")
        row.data_encrypted = deploy_svc.encrypt_values(merged)
        row.key_names = sorted(merged.keys())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    row.last_sync_error = None
    await db.flush()
    await db.refresh(row)
    return ProjectDeploySecretResponse(**deploy_svc.to_response_dict(row))


@router.delete(
    "/{project_id}/deploy-secrets/{secret_id}",
    status_code=204,
    dependencies=[Depends(require_permission(PERM_PROJECTS_WRITE))],
)
async def delete_deploy_secret(
    project_id: str,
    secret_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    delete_in_cluster: bool = Query(False),
):
    _reject_api_key(request)
    sub = get_jwt_sub(request)
    await _get_owned_project(db, project_id, sub)
    row = await _load_secret_or_404(db, project_id, secret_id)
    if delete_in_cluster:
        if not row.cluster_id:
            raise HTTPException(status_code=400, detail="No cluster configured for this secret")
        cluster = await db.get(KubernetesCluster, row.cluster_id)
        if not cluster:
            raise HTTPException(status_code=400, detail="Unknown Kubernetes cluster")
        try:
            plain = decrypt(cluster.kubeconfig_encrypted)
            await delete_secret_async(
                plain,
                row.namespace,
                row.name,
                require_project_id=project_id,
                **_client_overrides(cluster),
            )
        except LookupError as e:
            raise HTTPException(status_code=409, detail=str(e)) from e
        except ValueError as e:
            # already gone in cluster is fine
            if "not found" not in str(e).lower():
                raise HTTPException(status_code=400, detail=str(e)) from e
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Cluster delete failed: {e}") from e
    await db.delete(row)
    await db.flush()
    return None


@router.post(
    "/{project_id}/deploy-secrets/{secret_id}/sync",
    response_model=ProjectDeploySecretResponse,
    dependencies=[
        Depends(require_permission(PERM_PROJECTS_WRITE)),
        Depends(require_permission(PERM_CONSOLE_KUBERNETES)),
    ],
)
async def sync_deploy_secret(
    project_id: str,
    secret_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Write the encrypted values to a Kubernetes Opaque Secret (labels mark project ownership)."""
    _reject_api_key(request)
    sub = get_jwt_sub(request)
    await _get_owned_project(db, project_id, sub)
    row = await _load_secret_or_404(db, project_id, secret_id)
    if not row.cluster_id:
        raise HTTPException(status_code=400, detail="No cluster configured for this secret")
    cluster = await db.get(KubernetesCluster, row.cluster_id)
    if not cluster:
        raise HTTPException(status_code=400, detail="Unknown Kubernetes cluster")
    try:
        values = deploy_svc.decrypt_values(row.data_encrypted)
        plain = decrypt(cluster.kubeconfig_encrypted)
        # Read current keys in cluster via upsert: pass all values; remove stale keys separately
        from app.services.kubernetes.cluster_config import list_secrets_async

        existing = await list_secrets_async(plain, row.namespace, **_client_overrides(cluster))
        existing_keys = next((i["keys"] for i in existing if i["name"] == row.name), [])
        remove_keys = [k for k in existing_keys if k not in values]
        await upsert_secret_async(
            plain,
            row.namespace,
            row.name,
            set_values=values,
            remove_keys=remove_keys,
            labels=openkms_secret_labels(project_id),
            require_project_id=project_id,
            **_client_overrides(cluster),
        )
        row.last_synced_at = datetime.now(timezone.utc)
        row.last_sync_error = None
    except LookupError as e:
        row.last_sync_error = str(e)
        await db.flush()
        raise HTTPException(status_code=409, detail=str(e)) from e
    except ValueError as e:
        row.last_sync_error = str(e)
        await db.flush()
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        row.last_sync_error = str(e)
        await db.flush()
        raise HTTPException(status_code=502, detail=f"Sync failed: {e}") from e
    await db.flush()
    await db.refresh(row)
    return ProjectDeploySecretResponse(**deploy_svc.to_response_dict(row))


async def purge_project_deploy_secrets(db: AsyncSession, project_id: str) -> None:
    await db.execute(delete(ProjectDeploySecret).where(ProjectDeploySecret.project_id == project_id))
