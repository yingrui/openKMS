"""CRUD for Chamber apps (hosted Kubernetes Service)."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chamber import ChamberApp
from app.models.kubernetes_cluster import KubernetesCluster
from app.schemas.chamber import ChamberBindings, ChamberCreate, ChamberUpdate
from app.services.runtime.chamber.k8s_binding import normalize_module_bindings

APP_ID_PREFIX = "oa-"
ID_HEX = 12


def new_app_id() -> str:
    return f"{APP_ID_PREFIX}{uuid.uuid4().hex[:ID_HEX]}"


def bindings_as_dict(bindings: ChamberBindings | dict[str, Any] | None) -> dict[str, Any]:
    if bindings is None:
        raise ValueError("Chamber apps require bindings.k8s")
    if isinstance(bindings, ChamberBindings):
        raw = bindings.model_dump(exclude_none=True)
    else:
        raw = dict(bindings)
    return normalize_module_bindings(raw)


def to_response_base(
    app: ChamberApp,
    *,
    stale: bool = False,
    missing: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "id": app.id,
        "name": app.name,
        "api_name": app.api_name,
        "description": app.description,
        "template_id": app.template_id or "module",
        "bindings": app.bindings or {},
        "bindings_stale": stale,
        "missing_bindings": list(missing or []),
        "created_by": app.created_by,
        "created_by_name": app.created_by_name,
        "created_at": app.created_at,
        "updated_at": app.updated_at,
    }


async def _require_k8s_cluster(db: AsyncSession, bindings: dict[str, Any]) -> dict[str, Any]:
    k8s = bindings.get("k8s") if isinstance(bindings, dict) else None
    if not isinstance(k8s, dict):
        raise HTTPException(status_code=400, detail="Chamber apps require bindings.k8s")
    cluster_id = str(k8s.get("cluster_id") or "").strip()
    row = await db.get(KubernetesCluster, cluster_id) if cluster_id else None
    if not row:
        raise HTTPException(status_code=400, detail="Unknown Kubernetes cluster")
    return k8s


async def enrich_stale(db: AsyncSession, app: ChamberApp) -> tuple[bool, list[str]]:
    bindings = app.bindings or {}
    k8s = bindings.get("k8s") if isinstance(bindings, dict) else None
    if not isinstance(k8s, dict) or not str(k8s.get("cluster_id") or "").strip():
        return True, ["k8s"]
    row = await db.get(KubernetesCluster, str(k8s.get("cluster_id")))
    if not row:
        return True, ["k8s.cluster_id"]
    return False, []


async def get_app(db: AsyncSession, app_id: str) -> ChamberApp:
    app = await db.get(ChamberApp, app_id)
    if not app:
        raise HTTPException(status_code=404, detail="App not found")
    return app


async def list_apps(db: AsyncSession) -> list[ChamberApp]:
    q = (
        select(ChamberApp)
        # Legacy discriminator: only Chamber (module) apps exist.
        .where(ChamberApp.template_id == "module")
        .order_by(ChamberApp.updated_at.desc())
    )
    return list((await db.execute(q)).scalars().all())


async def create_app(
    db: AsyncSession,
    body: ChamberCreate,
    *,
    created_by: str | None,
    created_by_name: str | None,
) -> ChamberApp:
    exists = (
        await db.execute(select(ChamberApp.id).where(ChamberApp.api_name == body.api_name))
    ).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=409, detail="api_name already exists")

    try:
        bindings = bindings_as_dict(body.bindings)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    await _require_k8s_cluster(db, bindings)

    app = ChamberApp(
        id=new_app_id(),
        name=body.name,
        api_name=body.api_name,
        description=body.description,
        template_id="module",
        bindings=bindings,
        created_by=created_by,
        created_by_name=created_by_name,
    )
    db.add(app)
    await db.flush()

    await db.commit()
    await db.refresh(app)
    return app


async def update_app(db: AsyncSession, app: ChamberApp, body: ChamberUpdate) -> ChamberApp:
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
    await db.commit()
    await db.refresh(app)
    return app


async def delete_app(db: AsyncSession, app: ChamberApp) -> None:
    await db.delete(app)
    await db.commit()
