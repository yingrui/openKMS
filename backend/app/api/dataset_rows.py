"""Dataset row-edit API — apply insert/update/delete ops to an editable dataset.

Gated by ``data:edit`` (plus dataset ACL write). Requires the dataset to be
``is_editable`` and to have a primary key for update/delete.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_auth, require_permission
from app.api.datasets import get_dataset_scoped_write
from app.database import get_db
from app.models.dataset import Dataset
from app.schemas.dataset import DatasetRowsApplyRequest, DatasetRowsApplyResponse
from app.services.data_layer.dataset_rows_edit import RowEditError, apply_row_ops
from app.services.permissions.permission_catalog import PERM_DATA_EDIT

router = APIRouter(
    prefix="/datasets",
    tags=["dataset-rows"],
    dependencies=[Depends(require_auth)],
)


@router.post(
    "/{dataset_id}/rows/apply",
    response_model=DatasetRowsApplyResponse,
    dependencies=[Depends(require_permission(PERM_DATA_EDIT))],
)
async def apply_dataset_rows(
    request: Request,
    body: DatasetRowsApplyRequest,
    dataset: Dataset = Depends(get_dataset_scoped_write),
    db: AsyncSession = Depends(get_db),
):
    """Apply a batch of row ops (opt-in dataset, PK required, parameterized, audited)."""
    payload = request.state.openkms_jwt_payload
    uname = payload.get("preferred_username") or payload.get("name")
    try:
        counts = await apply_row_ops(
            db,
            dataset,
            [o.model_dump() for o in body.ops],
            dry_run=body.dry_run,
            actor=payload.get("sub") if isinstance(payload.get("sub"), str) else None,
            actor_name=str(uname)[:256] if isinstance(uname, str) and uname.strip() else None,
        )
    except RowEditError as exc:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if body.dry_run:
        await db.rollback()
    else:
        await db.commit()
    return DatasetRowsApplyResponse(**counts, dry_run=body.dry_run)
