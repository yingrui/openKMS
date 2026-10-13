"""Dataset ingest API — upload → preview → load a data file into a PostgreSQL table.

All endpoints require `console:datasets`. The target must be a **data-layer**
PostgreSQL data source (decision #11).
"""
import json
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_any_permission, require_auth, require_permission
from app.database import get_db
from app.models.data_source import DataSource
from app.models.dataset import Dataset
from app.models.dataset_ingest import DatasetIngest
from app.schemas.dataset import DatasetResponse
from app.schemas.dataset_ingest import (
    DatasetIngestLoadRequest,
    DatasetIngestPreviewResponse,
    DatasetIngestResponse,
)
from app.services.acl.data_scope import bootstrap_owner_acl
from app.services.acl.resource_acl_constants import RT_DATASET
from app.services.data_layer.ingest import IngestError, load_dataframe, preview_columns, read_head
from app.services.permissions.permission_catalog import PERM_DATA_WRITE
from app.services.storage import get_object, upload_object

router = APIRouter(
    prefix="/datasets/ingests",
    tags=["dataset-ingests"],
    dependencies=[Depends(require_auth)],
)


def _response(row: DatasetIngest) -> DatasetIngestResponse:
    return DatasetIngestResponse(
        id=row.id,
        data_source_id=row.data_source_id,
        dataset_id=row.dataset_id,
        filename=row.filename,
        status=row.status,
        schema_name=row.schema_name,
        table_name=row.table_name,
        row_count=row.row_count,
        error_message=row.error_message,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.post(
    "",
    response_model=DatasetIngestResponse,
    status_code=201,
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def start_ingest(
    request: Request,
    file: UploadFile = File(...),
    data_source_id: str = Form(...),
    db: AsyncSession = Depends(get_db),
):
    """Store an uploaded file in object storage and open an ingest record."""
    ds = await db.get(DataSource, data_source_id)
    if not ds or ds.kind != "postgresql" or ds.layer == "ontology":
        raise HTTPException(
            status_code=400, detail="Pick a PostgreSQL data source (not tagged ontology)."
        )

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file.")

    ingest_id = str(uuid.uuid4())
    filename = file.filename or "upload"
    key = f"datasets/uploads/{ingest_id}/{filename}"
    try:
        upload_object(key, content, file.content_type)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Storage upload failed: {exc}") from exc

    payload = request.state.openkms_jwt_payload
    uname = payload.get("preferred_username") or payload.get("name")
    row = DatasetIngest(
        id=ingest_id,
        data_source_id=data_source_id,
        storage_key=key,
        filename=filename,
        status="uploaded",
        table_name=filename.rsplit(".", 1)[0][:256] or None,
        created_by=payload.get("sub") if isinstance(payload.get("sub"), str) else None,
        created_by_name=str(uname)[:256] if isinstance(uname, str) and uname.strip() else None,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _response(row)


@router.post(
    "/{ingest_id}/preview",
    response_model=DatasetIngestPreviewResponse,
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def preview_ingest(ingest_id: str, db: AsyncSession = Depends(get_db)):
    """Parse the head of the file and infer a schema."""
    row = await db.get(DatasetIngest, ingest_id)
    if not row:
        raise HTTPException(status_code=404, detail="Ingest not found")
    try:
        df = read_head(row.storage_key, row.filename)
    except IngestError as exc:
        row.status = "failed"
        row.error_message = str(exc)
        await db.commit()
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    columns = preview_columns(df)
    sample_rows = json.loads(df.head(5).to_json(orient="records", date_format="iso"))
    row.status = "preview_ready"
    row.parse_config = {"columns": columns}
    await db.commit()
    return DatasetIngestPreviewResponse(
        ingest_id=row.id, columns=columns, sample_rows=sample_rows
    )


@router.post(
    "/{ingest_id}/load",
    response_model=DatasetResponse,
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def load_ingest(
    ingest_id: str,
    body: DatasetIngestLoadRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create/replace the target table and register a Dataset."""
    row = await db.get(DatasetIngest, ingest_id)
    if not row:
        raise HTTPException(status_code=404, detail="Ingest not found")
    ds = await db.get(DataSource, row.data_source_id)
    if not ds or ds.kind != "postgresql":
        raise HTTPException(status_code=400, detail="Data source not available.")

    try:
        count = load_dataframe(
            get_object(row.storage_key),
            row.filename,
            ds,
            body.schema_name,
            body.table_name,
            body.mode,
        )
    except IngestError as exc:
        row.status = "failed"
        row.error_message = str(exc)
        await db.commit()
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    existing = (
        await db.execute(
            select(Dataset).where(
                Dataset.data_source_id == ds.id,
                Dataset.schema_name == body.schema_name,
                Dataset.table_name == body.table_name,
            )
        )
    ).scalar_one_or_none()
    if existing:
        dataset = existing
    else:
        dataset = Dataset(
            id=str(uuid.uuid4()),
            data_source_id=ds.id,
            schema_name=body.schema_name,
            table_name=body.table_name,
            display_name=(row.filename.rsplit(".", 1)[0] or None),
            owner_sub=row.created_by,
            created_by=row.created_by,
            created_by_name=row.created_by_name,
        )
        db.add(dataset)
        await db.flush()
        if isinstance(row.created_by, str):
            await bootstrap_owner_acl(db, RT_DATASET, dataset.id, row.created_by)

    row.status = "completed"
    row.dataset_id = dataset.id
    row.schema_name = body.schema_name
    row.table_name = body.table_name
    row.row_count = count
    row.error_message = None
    await db.commit()
    await db.refresh(dataset)
    return DatasetResponse.model_validate(dataset).model_copy(
        update={"data_source_name": ds.name}
    )


@router.get(
    "/{ingest_id}",
    response_model=DatasetIngestResponse,
    dependencies=[Depends(require_permission(PERM_DATA_WRITE))],
)
async def get_ingest(ingest_id: str, db: AsyncSession = Depends(get_db)):
    row = await db.get(DatasetIngest, ingest_id)
    if not row:
        raise HTTPException(status_code=404, detail="Ingest not found")
    return _response(row)
