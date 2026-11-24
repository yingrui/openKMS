"""Saved explorations, and the layouts that decide how they open.

Reads use the data plane's grants (an analyst reads an exploration); writes need `data:write`; the **global**
layout is an ontology-level decision, so it needs `ontology:write`.

Visibility never widens data access: `shared` means "someone else can open this exploration", and what rows they
then see is still decided by the object type and row policies at read time.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_any_permission, require_permission
from app.database import get_db
from app.models.exploration import VISIBILITIES, Exploration, ExplorationLayout
from app.models.object_type import ObjectType
from app.services.explorer.explorations import (
    PERSPECTIVES,
    ExplorationError,
    effective_layout,
    normalize_layout,
    validate_filters,
    validate_visibility,
)
from app.services.identity.permissions.permission_catalog import (
    PERM_DATA_READ,
    PERM_DATA_WRITE,
    PERM_ONTOLOGY_WRITE,
)

READ_DEPS = [Depends(require_any_permission(PERM_DATA_READ, PERM_DATA_WRITE, PERM_ONTOLOGY_WRITE))]
WRITE_DEPS = [Depends(require_any_permission(PERM_DATA_WRITE, PERM_ONTOLOGY_WRITE))]

router = APIRouter(prefix="/explorations", tags=["explorations"])
layouts_router = APIRouter(prefix="/exploration-layouts", tags=["explorations"])


class ExplorationWrite(BaseModel):
    name: str = Field(min_length=1, max_length=256)
    object_type_id: str
    filters: list[str | dict] = []
    layout: dict = {}
    visibility: str = "private"


class ExplorationPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=256)
    filters: list[str | dict] | None = None
    layout: dict | None = None
    visibility: str | None = None


class ExplorationOut(BaseModel):
    id: str
    name: str
    object_type_id: str
    object_type_name: str | None = None
    filters: list[dict]
    layout: dict
    visibility: str
    owner_sub: str | None = None
    owner_name: str | None = None
    created_at: str | None = None
    updated_at: str | None = None
    #: True when the caller owns it — the UI uses it to offer rename/delete.
    mine: bool = False


class LayoutWrite(BaseModel):
    object_type_id: str
    layout: dict
    #: `personal` writes the caller's row; `global` writes the shared one and needs `ontology:write`.
    scope: str = Field(default="personal", pattern="^(personal|global)$")


class LayoutChoice(BaseModel):
    scope: str  # `personal` | `global`
    layout: dict


class LayoutOut(BaseModel):
    object_type_id: str
    layout: dict
    source: str
    #: What can be chosen: this caller's layout (when set) and the global one (when set).
    available: list[LayoutChoice] = []


def _payload(request: Request) -> tuple[str | None, str | None]:
    p = request.state.openkms_jwt_payload
    return (p.get("sub"), p.get("preferred_username") or p.get("name"))


def _out(row: Exploration, *, names: dict[str, str], me: str | None) -> ExplorationOut:
    return ExplorationOut(
        id=row.id,
        name=row.name,
        object_type_id=row.object_type_id,
        object_type_name=names.get(row.object_type_id),
        filters=list(row.filters or []),
        layout=dict(row.layout or {}),
        visibility=row.visibility,
        owner_sub=row.owner_sub,
        owner_name=row.owner_name,
        created_at=row.created_at.isoformat() if row.created_at else None,
        updated_at=row.updated_at.isoformat() if row.updated_at else None,
        mine=bool(me) and row.owner_sub == me,
    )


async def _type_names(db: AsyncSession, ids: set[str]) -> dict[str, str]:
    if not ids:
        return {}
    rows = (await db.execute(select(ObjectType).where(ObjectType.id.in_(ids)))).scalars().all()
    return {row.id: row.name for row in rows}


@router.get("", response_model=list[ExplorationOut], dependencies=READ_DEPS)
async def list_explorations(
    request: Request,
    object_type_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Mine, plus everything shared — the explorer's home list."""
    me, _ = _payload(request)
    query = select(Exploration).order_by(Exploration.updated_at.desc())
    if object_type_id:
        query = query.where(Exploration.object_type_id == object_type_id)
    query = query.where(
        or_(Exploration.visibility == "shared", Exploration.owner_sub == me)
        if me
        else Exploration.visibility == "shared"
    )
    rows = (await db.execute(query)).scalars().all()
    names = await _type_names(db, {row.object_type_id for row in rows})
    return [_out(row, names=names, me=me) for row in rows]


@router.get("/{exploration_id}", response_model=ExplorationOut, dependencies=READ_DEPS)
async def get_exploration(
    exploration_id: str, request: Request, db: AsyncSession = Depends(get_db)
):
    me, _ = _payload(request)
    row = await db.get(Exploration, exploration_id)
    if row is None or (row.visibility != "shared" and row.owner_sub != me):
        raise HTTPException(status_code=404, detail="Exploration not found")
    names = await _type_names(db, {row.object_type_id})
    return _out(row, names=names, me=me)


@router.post("", response_model=ExplorationOut, status_code=201, dependencies=WRITE_DEPS)
async def create_exploration(
    request: Request, body: ExplorationWrite, db: AsyncSession = Depends(get_db)
):
    if not await db.get(ObjectType, body.object_type_id):
        raise HTTPException(status_code=400, detail="Object type not found")
    try:
        filters = validate_filters(body.filters)
        layout = normalize_layout(body.layout)
        visibility = validate_visibility(body.visibility)
    except ExplorationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    sub, name = _payload(request)
    row = Exploration(
        id=uuid.uuid4().hex,
        name=body.name.strip(),
        object_type_id=body.object_type_id,
        filters=filters,
        layout=layout,
        visibility=visibility,
        owner_sub=sub,
        owner_name=name,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    names = await _type_names(db, {row.object_type_id})
    return _out(row, names=names, me=sub)


@router.patch("/{exploration_id}", response_model=ExplorationOut, dependencies=WRITE_DEPS)
async def update_exploration(
    exploration_id: str,
    request: Request,
    body: ExplorationPatch,
    db: AsyncSession = Depends(get_db),
):
    me, _ = _payload(request)
    row = await db.get(Exploration, exploration_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Exploration not found")
    if row.owner_sub and row.owner_sub != me:
        raise HTTPException(
            status_code=403, detail="Only the owner can change a saved exploration"
        )
    try:
        if body.filters is not None:
            row.filters = validate_filters(body.filters)
        if body.layout is not None:
            row.layout = normalize_layout(body.layout)
        if body.visibility is not None:
            row.visibility = validate_visibility(body.visibility)
    except ExplorationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if body.name is not None:
        row.name = body.name.strip()
    await db.commit()
    await db.refresh(row)
    names = await _type_names(db, {row.object_type_id})
    return _out(row, names=names, me=me)


@router.delete("/{exploration_id}", status_code=204, dependencies=WRITE_DEPS)
async def delete_exploration(
    exploration_id: str, request: Request, db: AsyncSession = Depends(get_db)
):
    me, _ = _payload(request)
    row = await db.get(Exploration, exploration_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Exploration not found")
    if row.owner_sub and row.owner_sub != me:
        raise HTTPException(status_code=403, detail="Only the owner can delete a saved exploration")
    await db.delete(row)
    await db.commit()


@layouts_router.get("", response_model=LayoutOut, dependencies=READ_DEPS)
async def get_layout(
    request: Request, object_type_id: str, db: AsyncSession = Depends(get_db)
):
    """The layout an exploration of this type opens with, and which layouts can be chosen."""
    me, _ = _payload(request)
    layout, source = await effective_layout(db, object_type_id, me)
    rows = (
        await db.execute(
            select(ExplorationLayout).where(ExplorationLayout.object_type_id == object_type_id)
        )
    ).scalars().all()
    available = [
        LayoutChoice(
            scope="personal" if row.owner_sub == me else "global",
            layout=dict(row.layout or {}),
        )
        for row in rows
        if row.owner_sub == me or row.owner_sub == ""
    ]
    return LayoutOut(
        object_type_id=object_type_id, layout=layout, source=source, available=available
    )


@layouts_router.put("", response_model=LayoutOut, dependencies=WRITE_DEPS)
async def put_layout(
    request: Request, body: LayoutWrite, db: AsyncSession = Depends(get_db)
):
    me, _ = _payload(request)
    if body.scope == "global":
        await require_permission(PERM_ONTOLOGY_WRITE)(request)
    if not await db.get(ObjectType, body.object_type_id):
        raise HTTPException(status_code=400, detail="Object type not found")
    try:
        layout = normalize_layout(body.layout)
    except ExplorationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    owner_sub = "" if body.scope == "global" else (me or "")
    if body.scope == "personal" and not owner_sub:
        raise HTTPException(status_code=400, detail="A personal layout needs an identified caller")
    row = (
        await db.execute(
            select(ExplorationLayout).where(
                ExplorationLayout.object_type_id == body.object_type_id,
                ExplorationLayout.owner_sub == owner_sub,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        db.add(
            ExplorationLayout(
                id=uuid.uuid4().hex,
                object_type_id=body.object_type_id,
                owner_sub=owner_sub,
                layout=layout,
            )
        )
    else:
        row.layout = layout
    await db.commit()
    return LayoutOut(
        object_type_id=body.object_type_id,
        layout=layout,
        source="global" if body.scope == "global" else "personal",
    )


__all__ = ["router", "layouts_router", "VISIBILITIES", "PERSPECTIVES"]
