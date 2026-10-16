"""Datasets API – CRUD and list tables from DataSource (admin-only)."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import MAX_PAGE_SIZE
from app.api.auth import require_any_permission, require_auth, require_permission
from app.api.query_errors import query_failure_detail
from app.services.permissions.permission_catalog import PERM_DATA_READ, PERM_DATA_WRITE
from app.database import get_db
from app.services.acl.data_scope import bootstrap_owner_acl
from app.services.acl.resource_list_acl import readable_id_filter
from app.services.evaluations.dataset_scope import (
    load_dataset_scoped,
    require_dataset_manage,
    require_dataset_write,
)
from app.services.acl.resource_acl_constants import PERM_READ, RT_DATASET
from app.services.ontology.property_types import (
    map_source_type_to_ontology,
    normalize_postgresql_column_type,
)
from app.models.data_source import DataSource
from app.models.dataset import Dataset
from app.models.dataset_profile import DatasetProfile
from app.services.data_layer.dataset_rows import query_dataset_rows, query_dataset_summary
from app.services.data_layer.query import QueryError
from app.services.data_layer.row_filters import RowFilterError
from app.services.data_layer.columns import (
    ColumnError,
    description_map,
    set_description,
)
from app.services.data_layer.profile import (
    ProfileError,
    compute_profile,
    list_schema_history,
    snapshot_schema_if_changed,
    store_profile,
)
from app.schemas.dataset import (
    ColumnMetadata,
    ColumnDescriptionUpdate,
    DatasetCreate,
    DatasetListResponse,
    DatasetProfileResponse,
    DatasetResponse,
    DatasetRowsResponse,
    DatasetRowsQuery,
    DatasetSummaryQuery,
    DatasetSummaryResponse,
    DatasetUpdate,
    SchemaSnapshotResponse,
    TableInfo,
)
from app.services.ontology.dataset_tables import (
    is_valid_identifier,
    pg_engine_for_datasource,
)


router = APIRouter(
    prefix="/datasets",
    tags=["datasets"],
    dependencies=[Depends(require_auth)],
)

_DATASET_VIEW = (PERM_DATA_READ,)


def _dataset_response(d: Dataset, data_source_name: str | None) -> DatasetResponse:
    return DatasetResponse(
        id=d.id,
        data_source_id=d.data_source_id,
        data_source_name=data_source_name,
        schema_name=d.schema_name,
        table_name=d.table_name,
        display_name=d.display_name,
        description=d.description,
        owner_sub=d.owner_sub,
        domain=d.domain,
        tags=d.tags or [],
        business_definition=d.business_definition,
        sensitivity=d.sensitivity,
        primary_key_columns=d.primary_key_columns,
        unique_keys=d.unique_keys or [],
        ai_context=d.ai_context,
        is_editable=d.is_editable,
        created_at=d.created_at,
        updated_at=d.updated_at,
    )


async def get_dataset_scoped(
    dataset_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Dataset:
    return await load_dataset_scoped(db, request, dataset_id, PERM_READ)


async def get_dataset_scoped_write(
    dataset_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Dataset:
    row = await get_dataset_scoped(dataset_id, request, db)
    return await require_dataset_write(db, request, row)


async def get_dataset_scoped_manage(
    dataset_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Dataset:
    row = await get_dataset_scoped(dataset_id, request, db)
    return await require_dataset_manage(db, request, row)


@router.get(
    "/from-source/{data_source_id}",
    response_model=list[TableInfo],
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def list_tables_from_source(
    data_source_id: str,
    db: AsyncSession = Depends(get_db),
):
    """List PostgreSQL tables from a data source (for picker when creating dataset)."""
    ds = await db.get(DataSource, data_source_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Data source not found")
    if ds.kind != "postgresql":
        raise HTTPException(
            status_code=400,
            detail="Listing tables is only supported for PostgreSQL data sources",
        )
    try:
        engine = pg_engine_for_datasource(ds)
        with engine.connect() as conn:
            result = conn.execute(
                text("""
                SELECT table_schema, table_name
                FROM information_schema.tables
                WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
                  AND table_type = 'BASE TABLE'
                ORDER BY table_schema, table_name
                """)
            )
            rows = result.fetchall()
        engine.dispose()
        return [TableInfo(schema_name=r[0], table_name=r[1]) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to list tables: {e}") from e


@router.get("", response_model=DatasetListResponse, dependencies=[Depends(require_any_permission(*_DATASET_VIEW))])
async def list_datasets(
    request: Request,
    data_source_id: str | None = None,
    search: str | None = None,
    limit: int | None = Query(None, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """List datasets (optional `data_source_id` / `search`); paginate with `limit`/`offset`."""
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    acl_filters, empty = await readable_id_filter(
        db, p, sub if isinstance(sub, str) else None, RT_DATASET, Dataset.id
    )
    if empty:
        return DatasetListResponse(items=[], total=0)

    conditions = list(acl_filters)
    if data_source_id:
        conditions.append(Dataset.data_source_id == data_source_id)
    if search and search.strip():
        like = f"%{search.strip()}%"
        conditions.append(
            or_(
                Dataset.display_name.ilike(like),
                Dataset.schema_name.ilike(like),
                Dataset.table_name.ilike(like),
            )
        )

    count_query = select(func.count()).select_from(Dataset)
    if conditions:
        count_query = count_query.where(*conditions)
    total = int((await db.execute(count_query)).scalar_one())

    query = select(Dataset).order_by(Dataset.created_at.desc())
    if conditions:
        query = query.where(*conditions)
    query = query.offset(offset)
    if limit is not None:
        query = query.limit(limit)
    items = list((await db.execute(query)).scalars().all())

    ds_ids = {d.data_source_id for d in items}
    ds_map = {}
    if ds_ids:
        ds_result = await db.execute(select(DataSource).where(DataSource.id.in_(ds_ids)))
        for ds in ds_result.scalars().all():
            ds_map[ds.id] = ds.name
    return DatasetListResponse(
        items=[_dataset_response(d, ds_map.get(d.data_source_id)) for d in items],
        total=total,
    )


@router.post("", response_model=DatasetResponse, status_code=201, dependencies=[Depends(require_permission(PERM_DATA_WRITE))])
async def create_dataset(
    request: Request,
    body: DatasetCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a dataset."""
    ds = await db.get(DataSource, body.data_source_id)
    if not ds:
        raise HTTPException(status_code=400, detail="Data source not found")
    # PostgreSQL sources back datasets. Only sources explicitly tagged `ontology`
    # (the graph layer) are excluded; untagged sources are data-capable.
    if ds.kind != "postgresql" or ds.layer == "ontology":
        raise HTTPException(
            status_code=400, detail="Pick a PostgreSQL data source (not tagged ontology)."
        )
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    uname = p.get("preferred_username") or p.get("name")
    dataset = Dataset(
        id=str(uuid.uuid4()),
        data_source_id=body.data_source_id,
        schema_name=body.schema_name,
        table_name=body.table_name,
        display_name=body.display_name,
        description=body.description,
        owner_sub=sub if isinstance(sub, str) else None,
        domain=body.domain,
        tags=body.tags,
        business_definition=body.business_definition,
        sensitivity=body.sensitivity,
        primary_key_columns=body.primary_key_columns,
        unique_keys=body.unique_keys or [],
        ai_context=body.ai_context,
        is_editable=body.is_editable,
        created_by=sub if isinstance(sub, str) else None,
        created_by_name=str(uname)[:256] if isinstance(uname, str) and uname.strip() else None,
    )
    db.add(dataset)
    await db.flush()
    if isinstance(sub, str):
        await bootstrap_owner_acl(db, RT_DATASET, dataset.id, sub)
    await db.commit()
    await db.refresh(dataset)
    return _dataset_response(dataset, ds.name)


@router.post(
    "/{dataset_id}/aggregate",
    response_model=DatasetSummaryResponse,
    dependencies=[Depends(require_any_permission(*_DATASET_VIEW))],
)
async def summarise_dataset(
    request: Request,
    body: DatasetSummaryQuery,
    dataset: Dataset = Depends(get_dataset_scoped),
    db: AsyncSession = Depends(get_db),
):
    """Group and aggregate this dataset's table — read-only, capped and timed.

    The dataset-side answer to "turnover by month": the same filters as the grid, a whitelisted
    aggregate list, and the model query's response shape. A failure is classified like the others
    (`kind`: `request` for a bad column/aggregate, `data` for what the source refused).
    """
    try:
        summary = await query_dataset_summary(
            db,
            dataset.id,
            group_by=[g if isinstance(g, str) else g.model_dump() for g in body.group_by],
            aggregates=[a.model_dump() for a in body.aggregates],
            filters=[f.model_dump() for f in body.filters],
            order_by=[o.model_dump() for o in body.order_by],
            limit=body.limit,
            offset=body.offset,
        )
    except (QueryError, RowFilterError) as exc:
        raise HTTPException(status_code=400, detail=query_failure_detail(request, exc.failure)) from exc
    return DatasetSummaryResponse(
        sql=summary.sql,
        columns=summary.columns,
        rows=summary.rows,
        row_count=summary.row_count,
        capped=summary.capped,
        duration_ms=summary.duration_ms,
    )


@router.post(
    "/{dataset_id}/rows/query",
    response_model=DatasetRowsResponse,
    dependencies=[Depends(require_any_permission(*_DATASET_VIEW))],
)
async def query_dataset_rows_endpoint(
    request: Request,
    body: DatasetRowsQuery,
    dataset: Dataset = Depends(get_dataset_scoped),
    db: AsyncSession = Depends(get_db),
):
    """Browse this dataset's table: filters + sort + paging, read-only and capped.

    Failures are classified like the query API's (`kind`: `request` for a bad filter, `data` for
    what the source refused), so the grid explains them instead of echoing a driver error.
    """
    try:
        page = await query_dataset_rows(
            db,
            dataset.id,
            filters=[f.model_dump() for f in body.filters],
            sort=body.sort,
            order=body.order,
            after=body.after,
            limit=body.limit,
            offset=body.offset,
        )
    except (QueryError, RowFilterError) as exc:
        raise HTTPException(status_code=400, detail=query_failure_detail(request, exc.failure)) from exc
    return DatasetRowsResponse(
        columns=page.columns,
        rows=page.rows,
        total=page.total,
        limit=body.limit,
        offset=body.offset,
        next_after=page.next_after,
        capped=page.capped,
    )


@router.get(
    "/{dataset_id}/metadata",
    response_model=list[ColumnMetadata],
    dependencies=[Depends(require_any_permission(*_DATASET_VIEW))],
)
async def get_dataset_metadata(
    dataset: Dataset = Depends(get_dataset_scoped),
    db: AsyncSession = Depends(get_db),
):
    """Fetch column metadata from the dataset table (PostgreSQL only)."""
    ds = await db.get(DataSource, dataset.data_source_id)
    if not ds or ds.kind != "postgresql":
        raise HTTPException(status_code=400, detail="Metadata only supported for PostgreSQL sources")
    schema, table = dataset.schema_name, dataset.table_name
    if not is_valid_identifier(schema) or not is_valid_identifier(table):
        raise HTTPException(status_code=400, detail="Invalid schema or table name")
    try:
        engine = pg_engine_for_datasource(ds)
        with engine.connect() as conn:
            result = conn.execute(
                text("""
                SELECT column_name, data_type, udt_name, is_nullable, ordinal_position
                FROM information_schema.columns
                WHERE table_schema = :schema AND table_name = :table
                ORDER BY ordinal_position
                """),
                {"schema": schema, "table": table},
            )
            rows = result.fetchall()
        engine.dispose()
        descriptions = await description_map(db, dataset.id)
        out: list[ColumnMetadata] = []
        for r in rows:
            source_type = normalize_postgresql_column_type(str(r[1]), str(r[2] or ""))
            out.append(
                ColumnMetadata(
                    column_name=r[0],
                    data_type=source_type,
                    ontology_type=map_source_type_to_ontology(ds.kind, source_type),
                    is_nullable=r[3] == "YES",
                    ordinal_position=r[4],
                    description=descriptions.get(str(r[0])),
                )
            )
        try:
            if await snapshot_schema_if_changed(db, dataset, [c.model_dump() for c in out]):
                await db.commit()
        except SQLAlchemyError:  # snapshotting must not break metadata reads
            pass
        return out
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch metadata: {e}") from e


@router.put(
    "/{dataset_id}/columns/{column_name}",
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def update_column_description(
    column_name: str,
    request: Request,
    body: ColumnDescriptionUpdate,
    dataset: Dataset = Depends(get_dataset_scoped_write),
    db: AsyncSession = Depends(get_db),
):
    """Set a physical column's description (maintained by engineers / agents)."""
    p = request.state.openkms_jwt_payload
    uname = p.get("preferred_username") or p.get("name")
    try:
        await set_description(
            db,
            dataset,
            column_name,
            body.description,
            sub=p.get("sub") if isinstance(p.get("sub"), str) else None,
            uname=str(uname)[:256] if isinstance(uname, str) and uname.strip() else None,
        )
    except ColumnError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"column_name": column_name, "description": body.description}


@router.get("/{dataset_id}", response_model=DatasetResponse, dependencies=[Depends(require_any_permission(*_DATASET_VIEW))])
async def get_dataset(
    dataset: Dataset = Depends(get_dataset_scoped),
    db: AsyncSession = Depends(get_db),
):
    """Get a dataset by ID."""
    ds = await db.get(DataSource, dataset.data_source_id)
    return _dataset_response(dataset, ds.name if ds else None)


@router.put("/{dataset_id}", response_model=DatasetResponse, dependencies=[Depends(require_permission(PERM_DATA_WRITE))])
async def update_dataset(
    body: DatasetUpdate,
    dataset: Dataset = Depends(get_dataset_scoped_write),
    db: AsyncSession = Depends(get_db),
):
    """Update a dataset."""
    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(dataset, field, value)
    await db.flush()
    await db.refresh(dataset)
    ds = await db.get(DataSource, dataset.data_source_id)
    return _dataset_response(dataset, ds.name if ds else None)


@router.delete("/{dataset_id}", status_code=204, dependencies=[Depends(require_permission(PERM_DATA_WRITE))])
async def delete_dataset(
    dataset: Dataset = Depends(get_dataset_scoped_manage),
    db: AsyncSession = Depends(get_db),
):
    """Delete a dataset."""
    await db.delete(dataset)


@router.get(
    "/{dataset_id}/profile",
    response_model=DatasetProfileResponse,
    dependencies=[Depends(require_any_permission(*_DATASET_VIEW))],
)
async def get_dataset_profile(
    dataset: Dataset = Depends(get_dataset_scoped),
    db: AsyncSession = Depends(get_db),
):
    """Return the last computed profile (empty if never profiled)."""
    row = (
        await db.execute(select(DatasetProfile).where(DatasetProfile.dataset_id == dataset.id))
    ).scalar_one_or_none()
    return DatasetProfileResponse(
        dataset_id=dataset.id,
        row_count=row.row_count if row else None,
        column_stats=(row.column_stats if row and row.column_stats else []),
        computed_at=row.computed_at if row else None,
    )


@router.post(
    "/{dataset_id}/profile",
    response_model=DatasetProfileResponse,
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def refresh_dataset_profile(
    dataset: Dataset = Depends(get_dataset_scoped_write),
    db: AsyncSession = Depends(get_db),
):
    """Scan the backing table and refresh the stored profile."""
    try:
        total, stats = await compute_profile(db, dataset)
    except ProfileError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    row = await store_profile(db, dataset, total, stats)
    await db.commit()
    await db.refresh(row)
    return DatasetProfileResponse(
        dataset_id=dataset.id,
        row_count=row.row_count,
        column_stats=row.column_stats or [],
        computed_at=row.computed_at,
    )


@router.get(
    "/{dataset_id}/schema-history",
    response_model=list[SchemaSnapshotResponse],
    dependencies=[Depends(require_any_permission(*_DATASET_VIEW))],
)
async def get_schema_history(
    dataset: Dataset = Depends(get_dataset_scoped),
    db: AsyncSession = Depends(get_db),
):
    """List captured schema snapshots (newest first)."""
    rows = await list_schema_history(db, dataset.id)
    return [
        SchemaSnapshotResponse(
            id=r.id, dataset_id=r.dataset_id, columns=r.columns or [], captured_at=r.captured_at
        )
        for r in rows
    ]

