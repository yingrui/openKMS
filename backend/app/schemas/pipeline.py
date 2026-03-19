"""Pipeline schemas."""
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


DEFAULT_PIPELINE_COMMAND = (
    "openkms-cli pipeline run --pipeline-name paddleocr-doc-parse "
    "--input {input} --s3-prefix {s3_prefix} --document-id {document_id} "
    "--api-url {api_url}{extraction_args}"
)


class PipelineCreate(BaseModel):
    name: str
    description: str | None = None
    command: str = DEFAULT_PIPELINE_COMMAND
    default_args: dict[str, Any] | None = None
    model_id: str | None = None


class PipelineUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    command: str | None = Field(default=None, max_length=4096)
    default_args: dict[str, Any] | None = None
    model_id: str | None = None


class PipelineResponse(BaseModel):
    id: str
    name: str
    description: str | None = None
    command: str
    default_args: dict[str, Any] | None = None
    model_id: str | None = None
    model_name: str | None = None
    model_base_url: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PipelineListResponse(BaseModel):
    items: list[PipelineResponse]
    total: int
