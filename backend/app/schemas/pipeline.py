"""Pipeline schemas."""
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator


DEFAULT_PIPELINE_COMMAND = (
    "openkms-cli pipeline run --pipeline-name paddleocr-doc-parse "
    "--input {input} --s3-prefix {s3_prefix} --document-id {document_id} "
    "--api-url {api_url}{extraction_args}"
)

DEFAULT_BAIDU_PIPELINE_COMMAND = (
    "openkms-cli pipeline run --pipeline-name baidu-doc-parse "
    "--input {input} --s3-prefix {s3_prefix} --document-id {document_id} "
    "--api-url {api_url}{extraction_args}"
)

#: Flags that carry a channel's extraction config. A template must ask for `{extraction_args}`, which
#: renders the whole block or nothing; spelling the flags out breaks every run whose channel has no
#: extraction configured, because `{extraction_model_name}` / `{extraction_schema}` render empty and
#: the CLI is left holding a flag with no value.
EXTRACTION_FLAG_LITERALS = ("--extract-metadata", "--extraction-model-name", "--extraction-schema")


def _reject_literal_extraction_flags(command: str) -> str:
    found = [flag for flag in EXTRACTION_FLAG_LITERALS if flag in command]
    if found:
        raise ValueError(
            f"Command template must not hardcode {', '.join(found)}. Use {{extraction_args}} instead: it "
            "expands to the whole extraction block when the channel has an extraction model and schema, "
            "and to nothing otherwise."
        )
    return command



class PipelineCreate(BaseModel):
    name: str
    description: str | None = None
    command: str = DEFAULT_PIPELINE_COMMAND
    default_args: dict[str, Any] | None = None
    model_id: str | None = None
    is_active: bool = True

    _check_command = field_validator("command")(_reject_literal_extraction_flags)


class PipelineUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    command: str | None = Field(default=None, max_length=4096)
    default_args: dict[str, Any] | None = None
    model_id: str | None = None
    is_active: bool | None = None

    _check_command = field_validator("command")(
        lambda command: None if command is None else _reject_literal_extraction_flags(command)
    )


class PipelineResponse(BaseModel):
    id: str
    name: str
    description: str | None = None
    command: str
    default_args: dict[str, Any] | None = None
    model_id: str | None = None
    model_name: str | None = None
    model_base_url: str | None = None
    is_active: bool = True
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PipelineListResponse(BaseModel):
    items: list[PipelineResponse]
    total: int
    limit: int
    offset: int
