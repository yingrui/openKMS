"""Pydantic schemas for ontology functions, groups, and actions."""
from datetime import datetime

from pydantic import BaseModel, Field


class OntologyFunctionVersionResponse(BaseModel):
    id: str
    function_id: str
    version: int
    source_code: str
    input_schema: dict | None = None
    output_schema: dict | None = None
    entrypoint: str
    runtime: str
    validation_result: dict | None = None
    created_by: str | None = None
    created_by_name: str | None = None
    created_at: datetime


class OntologyFunctionResponse(BaseModel):
    id: str
    api_name: str
    display_name: str
    description: str | None = None
    source: str
    object_type_id: str | None = None
    development_status: str
    status: str
    published_version_id: str | None = None
    published_version: int | None = None
    latest_version: int | None = None
    created_by: str | None = None
    created_by_name: str | None = None
    created_at: datetime
    updated_at: datetime


class OntologyFunctionListResponse(BaseModel):
    items: list[OntologyFunctionResponse]
    total: int


class OntologyFunctionCreate(BaseModel):
    api_name: str = Field(min_length=1, max_length=128)
    display_name: str = Field(min_length=1, max_length=256)
    description: str | None = None
    object_type_id: str | None = None
    source_code: str | None = None
    input_schema: dict | None = None
    output_schema: dict | None = None


class OntologyFunctionUpdate(BaseModel):
    display_name: str | None = None
    description: str | None = None
    object_type_id: str | None = None
    development_status: str | None = None
    status: str | None = None


class OntologyFunctionVersionCreate(BaseModel):
    source_code: str
    input_schema: dict | None = None
    output_schema: dict | None = None


class OntologyFunctionValidateResponse(BaseModel):
    valid: bool
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class OntologyFunctionExecuteRequest(BaseModel):
    input: dict = Field(default_factory=dict)
    version_id: str | None = None
    use_published: bool = False


class OntologyFunctionExecuteResponse(BaseModel):
    status: str
    output: dict | None = None
    error: str | None = None
    duration_ms: int | None = None
    execution_id: str | None = None


class OntologyFunctionExecutionResponse(BaseModel):
    id: str
    function_id: str
    version_id: str
    caller_user_id: str | None = None
    duration_ms: int | None = None
    status: str
    input_payload: dict | None = None
    output_payload: dict | None = None
    error_message: str | None = None
    created_at: datetime


class OntologyGroupResponse(BaseModel):
    id: str
    display_name: str
    description: str | None = None
    object_type_ids: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class OntologyGroupCreate(BaseModel):
    display_name: str
    description: str | None = None
    object_type_ids: list[str] = Field(default_factory=list)


class OntologyGroupUpdate(BaseModel):
    display_name: str | None = None
    description: str | None = None
    object_type_ids: list[str] | None = None


class OntologyActionTypeResponse(BaseModel):
    id: str
    api_name: str
    display_name: str
    description: str | None = None
    object_type_id: str
    rule_type: str
    function_id: str | None = None
    function_version: int | None = None
    parameters: list | None = None
    status: str
    created_at: datetime
    updated_at: datetime


class OntologyActionTypeCreate(BaseModel):
    api_name: str
    display_name: str
    description: str | None = None
    object_type_id: str
    rule_type: str = "function"
    function_id: str | None = None
    function_version: int | None = None
    parameters: list | None = None


class OntologyActionTypeUpdate(BaseModel):
    display_name: str | None = None
    description: str | None = None
    rule_type: str | None = None
    function_id: str | None = None
    function_version: int | None = None
    parameters: list | None = None
    status: str | None = None


class OntologyActionExecuteRequest(BaseModel):
    object_id: str | None = None
    input: dict = Field(default_factory=dict)


class OntologyActionExecuteResponse(BaseModel):
    status: str
    output: dict | None = None
    error: str | None = None
    duration_ms: int | None = None
    log_id: str | None = None


class OntologyActionLogResponse(BaseModel):
    id: str
    action_type_id: str
    object_id: str | None = None
    caller_user_id: str | None = None
    status: str
    input_payload: dict | None = None
    output_payload: dict | None = None
    error_message: str | None = None
    created_at: datetime
