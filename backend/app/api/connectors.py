"""Connectors API — inputs, dataset outputs, settings, and encrypted secrets."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_auth, require_any_permission, require_permission
from app.database import get_db
from app.models.connector import Connector
from app.models.dataset import Dataset
from app.schemas.connector import (
    ConnectorCreate,
    ConnectorKindInputFieldOut,
    ConnectorKindOut,
    ConnectorKindOutputSlotOut,
    ConnectorListResponse,
    ConnectorResponse,
    ConnectorUpdate,
)
from app.services.connector_catalog import (
    get_kind_spec,
    list_kind_specs,
    merge_secrets_encrypted,
    normalize_and_validate_inputs,
    normalize_and_validate_outputs,
    secrets_status,
    validate_kind,
    validate_secrets_for_kind,
)
from app.services.permission_catalog import PERM_CONNECTORS_READ, PERM_CONNECTORS_WRITE

router = APIRouter(
    prefix="/connectors",
    tags=["connectors"],
    dependencies=[Depends(require_auth)],
)


async def _ensure_datasets_exist(db: AsyncSession, dataset_ids: list[str]) -> None:
    for did in dataset_ids:
        row = await db.get(Dataset, did)
        if not row:
            raise HTTPException(status_code=400, detail=f"Dataset not found: {did}")


def _to_response(row: Connector) -> ConnectorResponse:
    spec = get_kind_spec(row.kind)
    configured: dict[str, bool] = {}
    if spec:
        configured = secrets_status(spec, row.secrets_encrypted)
    return ConnectorResponse(
        id=row.id,
        name=row.name,
        kind=row.kind,
        inputs=row.inputs,
        outputs=row.outputs,
        settings=row.settings,
        enabled=row.enabled,
        secrets_configured=configured,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get(
    "/kinds",
    response_model=list[ConnectorKindOut],
    dependencies=[Depends(require_any_permission(PERM_CONNECTORS_READ, PERM_CONNECTORS_WRITE))],
)
async def list_connector_kinds():
    """Describe supported connector kinds for setup forms (no secrets)."""
    out: list[ConnectorKindOut] = []
    for s in list_kind_specs():
        out.append(
            ConnectorKindOut(
                kind=s.kind,
                label=s.label,
                description=s.description,
                secret_keys=sorted(s.secret_keys),
                input_fields=[
                    ConnectorKindInputFieldOut(
                        key=f.key,
                        label=f.label,
                        field_type=f.field_type,
                        required=f.required,
                        default=f.default,
                        placeholder=f.placeholder,
                    )
                    for f in s.input_fields
                ],
                output_slots=[
                    ConnectorKindOutputSlotOut(
                        slot=o.slot,
                        label=o.label,
                        description=o.description,
                        resource=o.resource,
                    )
                    for o in s.output_slots
                ],
            )
        )
    return out


@router.get("", response_model=ConnectorListResponse, dependencies=[Depends(require_any_permission(PERM_CONNECTORS_READ, PERM_CONNECTORS_WRITE))])
async def list_connectors(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Connector).order_by(Connector.created_at.desc()))
    rows = result.scalars().all()
    return ConnectorListResponse(items=[_to_response(r) for r in rows], total=len(rows))


@router.post("", response_model=ConnectorResponse, status_code=201, dependencies=[Depends(require_permission(PERM_CONNECTORS_WRITE))])
async def create_connector(body: ConnectorCreate, db: AsyncSession = Depends(get_db)):
    try:
        validate_kind(body.kind)
        if body.secrets:
            validate_secrets_for_kind(body.kind, body.secrets)
        spec = get_kind_spec(body.kind)
        if spec and spec.secret_keys:
            if not body.secrets:
                raise ValueError(
                    f"Missing secrets for kind '{body.kind}'. Required keys: {', '.join(sorted(spec.secret_keys))}"
                )
            for k in spec.secret_keys:
                if not (body.secrets.get(k) or "").strip():
                    raise ValueError(f"Secret '{k}' is required for kind '{body.kind}'.")
        inputs_norm = normalize_and_validate_inputs(body.kind, body.inputs)
        outputs_norm = normalize_and_validate_outputs(body.kind, body.outputs)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    await _ensure_datasets_exist(db, list(outputs_norm.values()))

    secrets_cipher = None
    if body.secrets:
        secrets_cipher = merge_secrets_encrypted(None, body.secrets, kind=body.kind)

    row = Connector(
        id=str(uuid.uuid4()),
        name=body.name.strip(),
        kind=body.kind.strip(),
        inputs=inputs_norm or None,
        outputs=outputs_norm or None,
        settings=body.settings,
        secrets_encrypted=secrets_cipher,
        enabled=body.enabled,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return _to_response(row)


@router.get("/{connector_id}", response_model=ConnectorResponse, dependencies=[Depends(require_any_permission(PERM_CONNECTORS_READ, PERM_CONNECTORS_WRITE))])
async def get_connector(connector_id: str, db: AsyncSession = Depends(get_db)):
    row = await db.get(Connector, connector_id)
    if not row:
        raise HTTPException(status_code=404, detail="Connector not found")
    return _to_response(row)


@router.put("/{connector_id}", response_model=ConnectorResponse, dependencies=[Depends(require_permission(PERM_CONNECTORS_WRITE))])
async def update_connector(connector_id: str, body: ConnectorUpdate, db: AsyncSession = Depends(get_db)):
    row = await db.get(Connector, connector_id)
    if not row:
        raise HTTPException(status_code=404, detail="Connector not found")

    if body.secrets is not None:
        try:
            validate_secrets_for_kind(row.kind, body.secrets)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

    if body.inputs is not None:
        try:
            inputs_norm = normalize_and_validate_inputs(row.kind, body.inputs)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
    if body.outputs is not None:
        try:
            outputs_norm = normalize_and_validate_outputs(row.kind, body.outputs)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        await _ensure_datasets_exist(db, list(outputs_norm.values()))

    if body.name is not None:
        row.name = body.name.strip()
    if body.inputs is not None:
        row.inputs = inputs_norm or None
    if body.outputs is not None:
        row.outputs = outputs_norm or None
    if body.settings is not None:
        row.settings = body.settings
    if body.enabled is not None:
        row.enabled = body.enabled
    if body.secrets is not None:
        row.secrets_encrypted = merge_secrets_encrypted(row.secrets_encrypted, body.secrets, kind=row.kind)

    await db.flush()
    await db.refresh(row)
    return _to_response(row)


@router.delete("/{connector_id}", status_code=204, dependencies=[Depends(require_permission(PERM_CONNECTORS_WRITE))])
async def delete_connector(connector_id: str, db: AsyncSession = Depends(get_db)):
    row = await db.get(Connector, connector_id)
    if not row:
        raise HTTPException(status_code=404, detail="Connector not found")
    await db.delete(row)
