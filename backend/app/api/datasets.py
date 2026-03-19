"""Datasets API – CRUD and list tables from DataSource (admin-only)."""
import json
import re
import uuid
from datetime import date, datetime
from decimal import Decimal
from urllib.parse import quote_plus

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import create_engine, text
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_admin, require_auth
from app.database import get_db
from app.models.data_source import DataSource
from app.models.dataset import Dataset
from app.schemas.dataset import (
    ColumnMetadata,
    DatasetCreate,
    DatasetListResponse,
    DatasetResponse,
    DatasetRowsResponse,
    DatasetUpdate,
    TableInfo,
)
from app.services.credential_encryption import decrypt


def _pg_engine_for_datasource(ds: DataSource):
    """Create a sync SQLAlchemy engine for a PostgreSQL data source."""
    username = decrypt(ds.username_encrypted) if ds.username_encrypted else ""
    password = decrypt(ds.password_encrypted) if ds.password_encrypted else ""
    password_escaped = quote_plus(password) if password else ""
    url = (
        f"postgresql://{username}:{password_escaped}@{ds.host}:{ds.port or 5432}"
        f"/{ds.database or 'postgres'}"
    )
    return create_engine(url, pool_pre_ping=True, pool_recycle=10)

router = APIRouter(
    prefix="/datasets",
    tags=["datasets"],
    dependencies=[Depends(require_auth)],
)


@router.get(
    "/from-source/{data_source_id}",
    response_model=list[TableInfo],
    dependencies=[Depends(require_admin)],
)
async def list_tables_from_source(data_source_id: str, db: AsyncSession = Depends(get_db)):
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
        engine = _pg_engine_for_datasource(ds)
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


@router.get("", response_model=DatasetListResponse, dependencies=[Depends(require_admin)])
async def list_datasets(
    data_source_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """List datasets. Optional filter by data_source_id."""
    query = select(Dataset).order_by(Dataset.created_at.desc())
    if data_source_id:
        query = query.where(Dataset.data_source_id == data_source_id)
    result = await db.execute(query)
    items = result.scalars().all()
    ds_ids = {d.data_source_id for d in items}
    ds_map = {}
    if ds_ids:
        ds_result = await db.execute(select(DataSource).where(DataSource.id.in_(ds_ids)))
        for ds in ds_result.scalars().all():
            ds_map[ds.id] = ds.name
    return DatasetListResponse(
        items=[
            DatasetResponse(
                id=d.id,
                data_source_id=d.data_source_id,
                data_source_name=ds_map.get(d.data_source_id),
                schema_name=d.schema_name,
                table_name=d.table_name,
                display_name=d.display_name,
                created_at=d.created_at,
                updated_at=d.updated_at,
            )
            for d in items
        ],
        total=len(items),
    )


@router.post("", response_model=DatasetResponse, status_code=201, dependencies=[Depends(require_admin)])
async def create_dataset(body: DatasetCreate, db: AsyncSession = Depends(get_db)):
    """Create a dataset."""
    ds = await db.get(DataSource, body.data_source_id)
    if not ds:
        raise HTTPException(status_code=400, detail="Data source not found")
    dataset = Dataset(
        id=str(uuid.uuid4()),
        data_source_id=body.data_source_id,
        schema_name=body.schema_name,
        table_name=body.table_name,
        display_name=body.display_name,
    )
    db.add(dataset)
    await db.flush()
    await db.refresh(dataset)
    return DatasetResponse(
        id=dataset.id,
        data_source_id=dataset.data_source_id,
        data_source_name=ds.name,
        schema_name=dataset.schema_name,
        table_name=dataset.table_name,
        display_name=dataset.display_name,
        created_at=dataset.created_at,
        updated_at=dataset.updated_at,
    )


def _validate_identifier(name: str) -> bool:
    """Validate schema/table name to prevent SQL injection."""
    return bool(re.match(r"^[a-zA-Z0-9_]+$", name))


async def get_dataset_row_count(db: AsyncSession, dataset_id: str) -> int:
    """Get row count for a dataset table. Returns 0 if dataset not found or on error."""
    dataset = await db.get(Dataset, dataset_id)
    if not dataset:
        return 0
    ds = await db.get(DataSource, dataset.data_source_id)
    if not ds or ds.kind != "postgresql":
        return 0
    schema, table = dataset.schema_name, dataset.table_name
    if not _validate_identifier(schema) or not _validate_identifier(table):
        return 0
    try:
        engine = _pg_engine_for_datasource(ds)
        with engine.connect() as conn:
            quoted = f'"{schema}"."{table}"'
            result = conn.execute(text(f"SELECT COUNT(*) FROM {quoted}"))
            total = result.scalar() or 0
        engine.dispose()
        return int(total)
    except Exception:
        return 0


def _serialize_row_value(obj):
    """Serialize a row value for JSON compatibility."""
    if obj is None:
        return None
    if isinstance(obj, (date, datetime)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    return obj


async def fetch_dataset_rows(
    db: AsyncSession, dataset_id: str, limit: int = 500, offset: int = 0
) -> tuple[list[dict], int]:
    """Fetch rows from dataset table. Returns (rows, total). Raises HTTPException on error."""
    dataset = await db.get(Dataset, dataset_id)
    if not dataset:
        raise ValueError("Dataset not found")
    ds = await db.get(DataSource, dataset.data_source_id)
    if not ds or ds.kind != "postgresql":
        raise ValueError("Dataset rows only supported for PostgreSQL sources")
    schema, table = dataset.schema_name, dataset.table_name
    if not _validate_identifier(schema) or not _validate_identifier(table):
        raise ValueError("Invalid schema or table name")
    quoted = f'"{schema}"."{table}"'
    engine = _pg_engine_for_datasource(ds)
    try:
        with engine.connect() as conn:
            count_result = conn.execute(text(f"SELECT COUNT(*) FROM {quoted}"))
            total = count_result.scalar() or 0
            rows_result = conn.execute(
                text(f"SELECT * FROM {quoted} LIMIT :limit OFFSET :offset"),
                {"limit": limit, "offset": offset},
            )
            columns = list(rows_result.keys())
            rows = [dict(zip(columns, r)) for r in rows_result.fetchall()]
            rows = [{k: _serialize_row_value(v) for k, v in r.items()} for r in rows]
        engine.dispose()
        return rows, int(total)
    except Exception:
        engine.dispose()
        raise


@router.get(
    "/{dataset_id}/rows",
    response_model=DatasetRowsResponse,
    dependencies=[Depends(require_admin)],
)
async def get_dataset_rows(
    dataset_id: str,
    db: AsyncSession = Depends(get_db),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """Fetch rows from the dataset table (PostgreSQL only)."""
    dataset = await db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    ds = await db.get(DataSource, dataset.data_source_id)
    if not ds or ds.kind != "postgresql":
        raise HTTPException(status_code=400, detail="Dataset rows only supported for PostgreSQL sources")
    schema, table = dataset.schema_name, dataset.table_name
    if not _validate_identifier(schema) or not _validate_identifier(table):
        raise HTTPException(status_code=400, detail="Invalid schema or table name")
    quoted = f'"{schema}"."{table}"'
    try:
        engine = _pg_engine_for_datasource(ds)
        with engine.connect() as conn:
            count_result = conn.execute(text(f"SELECT COUNT(*) FROM {quoted}"))
            total = count_result.scalar() or 0
            rows_result = conn.execute(
                text(f"SELECT * FROM {quoted} LIMIT :limit OFFSET :offset"),
                {"limit": limit, "offset": offset},
            )
            columns = list(rows_result.keys())
            rows = [dict(zip(columns, r)) for r in rows_result.fetchall()]
            rows = [{k: _serialize_row_value(v) for k, v in r.items()} for r in rows]
        engine.dispose()
        return DatasetRowsResponse(rows=rows, total=total, limit=limit, offset=offset)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch rows: {e}") from e


@router.get(
    "/{dataset_id}/metadata",
    response_model=list[ColumnMetadata],
    dependencies=[Depends(require_admin)],
)
async def get_dataset_metadata(dataset_id: str, db: AsyncSession = Depends(get_db)):
    """Fetch column metadata from the dataset table (PostgreSQL only)."""
    dataset = await db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    ds = await db.get(DataSource, dataset.data_source_id)
    if not ds or ds.kind != "postgresql":
        raise HTTPException(status_code=400, detail="Metadata only supported for PostgreSQL sources")
    schema, table = dataset.schema_name, dataset.table_name
    if not _validate_identifier(schema) or not _validate_identifier(table):
        raise HTTPException(status_code=400, detail="Invalid schema or table name")
    try:
        engine = _pg_engine_for_datasource(ds)
        with engine.connect() as conn:
            result = conn.execute(
                text("""
                SELECT column_name, data_type, is_nullable, ordinal_position
                FROM information_schema.columns
                WHERE table_schema = :schema AND table_name = :table
                ORDER BY ordinal_position
                """),
                {"schema": schema, "table": table},
            )
            rows = result.fetchall()
        engine.dispose()
        return [
            ColumnMetadata(
                column_name=r[0],
                data_type=r[1],
                is_nullable=r[2] == "YES",
                ordinal_position=r[3],
            )
            for r in rows
        ]
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch metadata: {e}") from e


@router.get("/{dataset_id}", response_model=DatasetResponse, dependencies=[Depends(require_admin)])
async def get_dataset(dataset_id: str, db: AsyncSession = Depends(get_db)):
    """Get a dataset by ID."""
    dataset = await db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    ds = await db.get(DataSource, dataset.data_source_id)
    return DatasetResponse(
        id=dataset.id,
        data_source_id=dataset.data_source_id,
        data_source_name=ds.name if ds else None,
        schema_name=dataset.schema_name,
        table_name=dataset.table_name,
        display_name=dataset.display_name,
        created_at=dataset.created_at,
        updated_at=dataset.updated_at,
    )


@router.put("/{dataset_id}", response_model=DatasetResponse, dependencies=[Depends(require_admin)])
async def update_dataset(
    dataset_id: str,
    body: DatasetUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a dataset."""
    dataset = await db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if body.schema_name is not None:
        dataset.schema_name = body.schema_name
    if body.table_name is not None:
        dataset.table_name = body.table_name
    if body.display_name is not None:
        dataset.display_name = body.display_name
    await db.flush()
    await db.refresh(dataset)
    ds = await db.get(DataSource, dataset.data_source_id)
    return DatasetResponse(
        id=dataset.id,
        data_source_id=dataset.data_source_id,
        data_source_name=ds.name if ds else None,
        schema_name=dataset.schema_name,
        table_name=dataset.table_name,
        display_name=dataset.display_name,
        created_at=dataset.created_at,
        updated_at=dataset.updated_at,
    )


@router.delete("/{dataset_id}", status_code=204, dependencies=[Depends(require_admin)])
async def delete_dataset(dataset_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a dataset."""
    dataset = await db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    await db.delete(dataset)
