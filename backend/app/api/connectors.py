"""Connectors API — inputs, dataset outputs, settings, and encrypted secrets."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_auth, require_any_permission, require_permission
from app.database import get_db
from app.models.connector import Connector
from app.models.data_source import DataSource
from app.models.dataset import Dataset
from app.schemas.connector import (
    ConnectorCreate,
    ConnectorDatasetColumnOut,
    ConnectorKindInputFieldOut,
    ConnectorKindOut,
    ConnectorKindOutputSlotOut,
    ConnectorListResponse,
    ConnectorProvisionDatasetRequest,
    ConnectorProvisionDatasetResponse,
    ConnectorResponse,
    ConnectorProbeRequest,
    ConnectorProbeResponse,
    ConnectorSearchRequest,
    ConnectorSearchResponse,
    ConnectorSyncScheduleOut,
    ConnectorSyncTriggerRequest,
    ConnectorSyncTriggerResponse,
    ConnectorUpdate,
)
from app.services.connector_catalog import (
    CATEGORY_SEARCH_TOOL,
    CATEGORY_SYNC,
    get_kind_spec,
    list_kind_specs,
    merge_secrets_encrypted,
    normalize_and_validate_inputs,
    normalize_and_validate_outputs,
    normalize_and_validate_settings,
    secrets_status,
    validate_kind,
    validate_secrets_for_kind,
)
from app.services.connector_search.run import run_connector_search
from app.services.connector_sync.provision import (
    provision_dataset_for_slot,
    validate_connector_outputs,
)
from app.services.scheduled_triggers import (
    delete_connector_sync_trigger,
    get_trigger_for_connector,
    merge_sync_schedule_response,
    upsert_connector_sync_trigger,
)
from app.services.connector_sync.sync_range import parse_sync_date_range
from app.services.permission_catalog import (
    PERM_CONNECTORS_READ,
    PERM_CONNECTORS_WRITE,
    PERM_CONSOLE_DATASETS,
)

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


async def _to_response(row: Connector, db: AsyncSession) -> ConnectorResponse:
    spec = get_kind_spec(row.kind)
    configured: dict[str, bool] = {}
    if spec:
        configured = secrets_status(spec, row.secrets_encrypted)
    trigger = await get_trigger_for_connector(db, row.id)
    sched_raw = merge_sync_schedule_response(row, trigger)
    sched = ConnectorSyncScheduleOut(**sched_raw) if sched_raw else None
    return ConnectorResponse(
        id=row.id,
        name=row.name,
        kind=row.kind,
        inputs=row.inputs,
        outputs=row.outputs,
        settings=row.settings,
        sync_schedule=sched,
        enabled=row.enabled,
        secrets_configured=configured,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _kind_to_out(s) -> ConnectorKindOut:
    return ConnectorKindOut(
        kind=s.kind,
        category=s.category,
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
                options=list(f.options),
            )
            for f in s.input_fields
        ],
        output_slots=[
            ConnectorKindOutputSlotOut(
                slot=o.slot,
                label=o.label,
                description=o.description,
                resource=o.resource,
                dataset_schema=[
                    ConnectorDatasetColumnOut(
                        name=c.name,
                        pg_type=c.pg_type,
                        nullable=c.nullable,
                        primary_key=c.primary_key,
                    )
                    for c in o.dataset_columns
                ],
                default_pg_schema=o.default_pg_schema,
                default_table_name=o.default_table_name,
            )
            for o in s.output_slots
        ],
        output_schema=s.output_schema,
        default_settings=s.default_settings,
    )


@router.get(
    "/kinds",
    response_model=list[ConnectorKindOut],
    dependencies=[Depends(require_any_permission(PERM_CONNECTORS_READ, PERM_CONNECTORS_WRITE))],
)
async def list_connector_kinds(
    category: str | None = Query(None, description="Filter by category: sync | search_tool"),
):
    """Describe supported connector kinds for setup forms (no secrets)."""
    specs = list_kind_specs()
    if category:
        cat = category.strip()
        specs = [s for s in specs if s.category == cat]
    return [_kind_to_out(s) for s in specs]


@router.post(
    "/provision-dataset",
    response_model=ConnectorProvisionDatasetResponse,
    status_code=201,
    dependencies=[
        Depends(require_permission(PERM_CONNECTORS_WRITE)),
        Depends(require_permission(PERM_CONSOLE_DATASETS)),
    ],
)
async def provision_connector_dataset(
    request: Request,
    body: ConnectorProvisionDatasetRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create a PostgreSQL table and dataset row matching a sync connector output slot schema."""
    try:
        validate_kind(body.kind)
        p = request.state.openkms_jwt_payload
        sub = p.get("sub")
        uname = p.get("preferred_username") or p.get("name")
        dataset = await provision_dataset_for_slot(
            db,
            kind=body.kind.strip(),
            slot=body.slot.strip(),
            data_source_id=body.data_source_id.strip(),
            schema_name=body.schema_name,
            table_name=body.table_name,
            display_name=body.display_name,
            created_by=sub if isinstance(sub, str) else None,
            created_by_name=str(uname)[:256] if isinstance(uname, str) and uname.strip() else None,
        )
        await db.commit()
        await db.refresh(dataset)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    ds = await db.get(DataSource, dataset.data_source_id)
    return ConnectorProvisionDatasetResponse(
        id=dataset.id,
        data_source_id=dataset.data_source_id,
        data_source_name=ds.name if ds else None,
        schema_name=dataset.schema_name,
        table_name=dataset.table_name,
        display_name=dataset.display_name,
    )


@router.get("", response_model=ConnectorListResponse, dependencies=[Depends(require_any_permission(PERM_CONNECTORS_READ, PERM_CONNECTORS_WRITE))])
async def list_connectors(
    db: AsyncSession = Depends(get_db),
    category: str | None = Query(None, description="Filter by kind category"),
):
    result = await db.execute(select(Connector).order_by(Connector.created_at.desc()))
    rows = result.scalars().all()
    if category:
        cat = category.strip()
        rows = [r for r in rows if (spec := get_kind_spec(r.kind)) and spec.category == cat]
    items = [await _to_response(r, db) for r in rows]
    return ConnectorListResponse(items=items, total=len(items))


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
        settings_norm = normalize_and_validate_settings(body.kind, body.settings)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    await _ensure_datasets_exist(db, list(outputs_norm.values()))
    try:
        await validate_connector_outputs(db, body.kind, outputs_norm)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    secrets_cipher = None
    if body.secrets:
        secrets_cipher = merge_secrets_encrypted(None, body.secrets, kind=body.kind)

    row = Connector(
        id=str(uuid.uuid4()),
        name=body.name.strip(),
        kind=body.kind.strip(),
        inputs=inputs_norm or None,
        outputs=outputs_norm or None,
        settings=settings_norm or None,
        secrets_encrypted=secrets_cipher,
        enabled=body.enabled,
    )
    db.add(row)
    await db.flush()
    try:
        await upsert_connector_sync_trigger(db, row)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    await db.commit()
    await db.refresh(row)
    return await _to_response(row, db)


@router.get("/{connector_id}", response_model=ConnectorResponse, dependencies=[Depends(require_any_permission(PERM_CONNECTORS_READ, PERM_CONNECTORS_WRITE))])
async def get_connector(connector_id: str, db: AsyncSession = Depends(get_db)):
    row = await db.get(Connector, connector_id)
    if not row:
        raise HTTPException(status_code=404, detail="Connector not found")
    return await _to_response(row, db)


@router.post(
    "/{connector_id}/sync",
    response_model=ConnectorSyncTriggerResponse,
    status_code=202,
    dependencies=[Depends(require_permission(PERM_CONNECTORS_WRITE))],
)
async def trigger_connector_sync(
    connector_id: str,
    body: ConnectorSyncTriggerRequest | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Queue a sync job. Manual runs pass start_date + end_date; omit both for connector-defined defaults."""
    row = await db.get(Connector, connector_id)
    if not row:
        raise HTTPException(status_code=404, detail="Connector not found")
    spec = get_kind_spec(row.kind)
    if not spec or spec.category != CATEGORY_SYNC:
        raise HTTPException(status_code=400, detail="Connector kind does not support sync")
    if not row.enabled:
        raise HTTPException(status_code=400, detail="Connector is disabled")
    if not row.outputs:
        raise HTTPException(status_code=400, detail="Connector has no dataset outputs configured")

    req = body or ConnectorSyncTriggerRequest()
    try:
        parse_sync_date_range(req.start_date, req.end_date)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    from app.jobs.defer import defer_task
    from app.jobs.tasks import run_connector_sync
    from app.services.schedule_dispatch import CONNECTOR_SYNC_LOCK_PREFIX

    defer_kwargs: dict[str, str] = {"connector_id": row.id}
    if req.start_date is not None and req.end_date is not None:
        defer_kwargs["start_date"] = req.start_date.isoformat()
        defer_kwargs["end_date"] = req.end_date.isoformat()
    job_id = await defer_task(
        run_connector_sync.configure(lock=f"{CONNECTOR_SYNC_LOCK_PREFIX}{row.id}"),
        **defer_kwargs,
    )
    await db.commit()
    return ConnectorSyncTriggerResponse(job_id=int(job_id))


@router.post(
    "/{connector_id}/search",
    response_model=ConnectorSearchResponse,
    dependencies=[Depends(require_any_permission(PERM_CONNECTORS_READ, PERM_CONNECTORS_WRITE))],
)
async def search_connector(connector_id: str, body: ConnectorSearchRequest, db: AsyncSession = Depends(get_db)):
    """Run a search_tool connector (test from UI or same path Agents use internally)."""
    row = await db.get(Connector, connector_id)
    if not row:
        raise HTTPException(status_code=404, detail="Connector not found")
    spec = get_kind_spec(row.kind)
    if not spec or spec.category != CATEGORY_SEARCH_TOOL:
        raise HTTPException(status_code=400, detail="Connector kind does not support search")
    try:
        result = await run_connector_search(
            row,
            body.query,
            param_overrides=body.params,
            include_debug=True,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Search provider error: {e}") from e
    return ConnectorSearchResponse(**result)


@router.post(
    "/{connector_id}/probe",
    response_model=ConnectorProbeResponse,
    dependencies=[Depends(require_any_permission(PERM_CONNECTORS_READ, PERM_CONNECTORS_WRITE))],
)
async def probe_connector(connector_id: str, body: ConnectorProbeRequest, db: AsyncSession = Depends(get_db)):
    """Call a live Tushare API from the connector detail Probe tab (no dataset writes)."""
    from app.services.connector_sync.tushare.client import TushareRateLimitError
    from app.services.connector_sync.tushare.probe import run_tushare_probe

    row = await db.get(Connector, connector_id)
    if not row:
        raise HTTPException(status_code=404, detail="Connector not found")
    if row.kind != "tushare":
        raise HTTPException(status_code=400, detail="Probe is only supported for Tushare connectors")
    try:
        result = await run_tushare_probe(
            row,
            api_name=body.api_name,
            ts_code=body.ts_code,
            trade_date=body.trade_date,
            start_date=body.start_date,
            end_date=body.end_date,
            limit=body.limit,
            offset=body.offset,
            include_debug=True,
        )
    except TushareRateLimitError as exc:
        raise HTTPException(
            status_code=429,
            detail=f"Tushare rate limited on {exc.api_name}; retry in {int(exc.retry_after_seconds)}s",
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Tushare API error: {exc}") from exc
    return ConnectorProbeResponse(**result)


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
        try:
            await validate_connector_outputs(db, row.kind, outputs_norm)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
    if body.settings is not None:
        try:
            settings_norm = normalize_and_validate_settings(row.kind, dict(body.settings))
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

    if body.name is not None:
        row.name = body.name.strip()
    if body.inputs is not None:
        row.inputs = inputs_norm or None
    if body.outputs is not None:
        row.outputs = outputs_norm or None
    if body.settings is not None:
        row.settings = settings_norm or None
    if body.enabled is not None:
        row.enabled = body.enabled
    if body.secrets is not None:
        row.secrets_encrypted = merge_secrets_encrypted(row.secrets_encrypted, body.secrets, kind=row.kind)

    await db.flush()
    try:
        await upsert_connector_sync_trigger(db, row)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    await db.commit()
    await db.refresh(row)
    return await _to_response(row, db)


@router.delete("/{connector_id}", status_code=204, dependencies=[Depends(require_permission(PERM_CONNECTORS_WRITE))])
async def delete_connector(connector_id: str, db: AsyncSession = Depends(get_db)):
    row = await db.get(Connector, connector_id)
    if not row:
        raise HTTPException(status_code=404, detail="Connector not found")
    await delete_connector_sync_trigger(db, row.id)
    await db.delete(row)
    await db.commit()
