"""Internal process heartbeat endpoint."""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, Field

from app.api.auth import require_internal_client
from app.services import process_heartbeat_registry as registry

router = APIRouter(
    prefix="/internal-api",
    tags=["internal-process-heartbeat"],
    dependencies=[Depends(require_internal_client)],
)


class ProcessHeartbeatIn(BaseModel):
    role: Literal["worker", "scheduler"]
    instance_id: str = Field(..., min_length=1, max_length=128)
    message: str | None = None
    meta: dict[str, Any] = Field(default_factory=dict)


@router.post("/process-heartbeat", status_code=204)
async def post_process_heartbeat(body: ProcessHeartbeatIn) -> Response:
    registry.upsert(
        body.role,
        body.instance_id,
        message=body.message,
        meta=body.meta,
    )
    return Response(status_code=204)
