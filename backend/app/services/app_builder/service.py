"""CRUD + publish snapshots for module (hosted Kubernetes Service) Apps."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.app_builder import AppBuilderApp, AppBuilderPublishedVersion
from app.models.kubernetes_cluster import KubernetesCluster
from app.schemas.app_builder import AppBuilderBindings, AppBuilderCreate, AppBuilderUpdate
from app.services.app_builder.k8s_binding import normalize_module_bindings

APP_ID_PREFIX = "oa-"
ID_HEX = 12


def new_app_id() -> str:
    return f"{APP_ID_PREFIX}{uuid.uuid4().hex[:ID_HEX]}"


def new_version_id() -> str:
    return str(uuid.uuid4())


def bindings_as_dict(bindings: AppBuilderBindings | dict[str, Any] | None) -> dict[str, Any]:
    if bindings is None:
        raise ValueError("module apps require bindings.k8s")
    if isinstance(bindings, AppBuilderBindings):
        raw = bindings.model_dump(exclude_none=True)
    else:
        raw = dict(bindings)
    return normalize_module_bindings(raw)


def app_kind_of(app: AppBuilderApp) -> str:
    return "module"


def to_response_base(
    app: AppBuilderApp,
    *,
    stale: bool = False,
    missing: list[str] | None = None,
    published_version: int | None = None,
) -> dict[str, Any]:
    return {
        "id": app.id,
        "name": app.name,
        "api_name": app.api_name,
        "description": app.description,
        "template_id": app.template_id or "module",
        "app_kind": "module",
        "bindings": app.bindings or {},
        "status": app.status,
        "bindings_hash": app.bindings_hash,
        "bindings_stale": stale,
        "missing_bindings": list(missing or []),
        "created_by": app.created_by,
        "created_by_name": app.created_by_name,
        "created_at": app.created_at,
        "updated_at": app.updated_at,
        "published_version": published_version,
        "has_draft": False,
        "has_published": app.published_version_id is not None,
    }


async def _require_k8s_cluster(db: AsyncSession, bindings: dict[str, Any]) -> dict[str, Any]:
    k8s = bindings.get("k8s") if isinstance(bindings, dict) else None
    if not isinstance(k8s, dict):
        raise HTTPException(status_code=400, detail="module apps require bindings.k8s")
    cluster_id = str(k8s.get("cluster_id") or "").strip()
    row = await db.get(KubernetesCluster, cluster_id) if cluster_id else None
    if not row:
        raise HTTPException(status_code=400, detail="Unknown Kubernetes cluster")
    return k8s


async def enrich_stale(db: AsyncSession, app: AppBuilderApp) -> tuple[bool, list[str]]:
    bindings = app.bindings or {}
    k8s = bindings.get("k8s") if isinstance(bindings, dict) else None
    if not isinstance(k8s, dict) or not str(k8s.get("cluster_id") or "").strip():
        return True, ["k8s"]
    row = await db.get(KubernetesCluster, str(k8s.get("cluster_id")))
    if not row:
        return True, ["k8s.cluster_id"]
    return False, []


async def get_app(db: AsyncSession, app_id: str) -> AppBuilderApp:
    app = await db.get(AppBuilderApp, app_id)
    if not app:
        raise HTTPException(status_code=404, detail="App not found")
    return app


async def list_apps(
    db: AsyncSession, *, status: str | None = None
) -> list[AppBuilderApp]:
    q = (
        select(AppBuilderApp)
        .where(AppBuilderApp.template_id == "module")
        .order_by(AppBuilderApp.updated_at.desc())
    )
    if status:
        q = q.where(AppBuilderApp.status == status)
    return list((await db.execute(q)).scalars().all())


async def current_published_version(db: AsyncSession, app: AppBuilderApp) -> int | None:
    if not app.published_version_id:
        return None
    version = await db.get(AppBuilderPublishedVersion, app.published_version_id)
    return version.version if version else None


async def list_published_versions(db: AsyncSession, app_id: str) -> list[AppBuilderPublishedVersion]:
    q = (
        select(AppBuilderPublishedVersion)
        .where(AppBuilderPublishedVersion.app_id == app_id)
        .order_by(AppBuilderPublishedVersion.version.desc())
    )
    return list((await db.execute(q)).scalars().all())


async def _next_version_number(db: AsyncSession, app_id: str) -> int:
    current = (
        await db.execute(
            select(func.max(AppBuilderPublishedVersion.version)).where(
                AppBuilderPublishedVersion.app_id == app_id
            )
        )
    ).scalar_one_or_none()
    return (current or 0) + 1


async def create_app(
    db: AsyncSession,
    body: AppBuilderCreate,
    *,
    created_by: str | None,
    created_by_name: str | None,
) -> AppBuilderApp:
    exists = (
        await db.execute(select(AppBuilderApp.id).where(AppBuilderApp.api_name == body.api_name))
    ).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=409, detail="api_name already exists")

    template_id = (body.template_id or "module").strip() or "module"
    if template_id != "module":
        raise HTTPException(status_code=400, detail="Only module apps are supported")

    try:
        bindings = bindings_as_dict(body.bindings)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    await _require_k8s_cluster(db, bindings)

    app = AppBuilderApp(
        id=new_app_id(),
        name=body.name,
        api_name=body.api_name,
        description=body.description,
        template_id="module",
        bindings=bindings,
        published_version_id=None,
        bindings_hash=None,
        status="draft",
        created_by=created_by,
        created_by_name=created_by_name,
    )
    db.add(app)
    await db.flush()

    version = AppBuilderPublishedVersion(
        id=new_version_id(),
        app_id=app.id,
        version=1,
        components=[],
        bindings=bindings,
        created_by=created_by,
        created_by_name=created_by_name,
    )
    db.add(version)
    await db.flush()
    app.published_version_id = version.id
    app.status = "published"

    await db.commit()
    await db.refresh(app)
    return app


async def update_app(db: AsyncSession, app: AppBuilderApp, body: AppBuilderUpdate) -> AppBuilderApp:
    if body.name is not None:
        app.name = body.name
    if body.description is not None:
        app.description = body.description
    if body.bindings is not None:
        try:
            bindings = bindings_as_dict(body.bindings)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        await _require_k8s_cluster(db, bindings)
        app.bindings = bindings
        app.bindings_hash = None
        if app.published_version_id:
            published = await db.get(AppBuilderPublishedVersion, app.published_version_id)
            if published is not None:
                published.bindings = bindings
    await db.commit()
    await db.refresh(app)
    return app


async def unpublish_app(db: AsyncSession, app: AppBuilderApp) -> AppBuilderApp:
    app.status = "draft"
    app.published_version_id = None
    await db.commit()
    await db.refresh(app)
    return app


async def republish_app(
    db: AsyncSession,
    app: AppBuilderApp,
    *,
    created_by: str | None = None,
    created_by_name: str | None = None,
) -> AppBuilderApp:
    try:
        bindings = normalize_module_bindings(app.bindings or {})
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    await _require_k8s_cluster(db, bindings)
    version = AppBuilderPublishedVersion(
        id=new_version_id(),
        app_id=app.id,
        version=await _next_version_number(db, app.id),
        components=[],
        bindings=bindings,
        created_by=created_by or app.created_by,
        created_by_name=created_by_name or app.created_by_name,
    )
    db.add(version)
    await db.flush()
    app.published_version_id = version.id
    app.status = "published"
    await db.commit()
    await db.refresh(app)
    return app


async def delete_app(db: AsyncSession, app: AppBuilderApp) -> None:
    q = select(AppBuilderPublishedVersion).where(AppBuilderPublishedVersion.app_id == app.id)
    for v in (await db.execute(q)).scalars().all():
        await db.delete(v)
    await db.delete(app)
    await db.commit()
