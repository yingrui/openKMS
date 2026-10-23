"""Pydantic schemas for ontology functions, groups, and actions."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

FunctionDevelopmentStatus = Literal["experimental", "active", "deprecated"]
FunctionStatus = Literal["active", "archived"]
ExecutionStatus = Literal["ok", "error"]
ActionTypeStatus = Literal["active", "inactive", "archived"]


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


class OntologySchemaFieldRef(BaseModel):
    """One I/O field from a Function version schema (with optional x-ontology)."""

    path: str
    side: Literal["input", "output"]
    kind: Literal["primitive", "object_type", "link_type"]
    type_name: str | None = None
    json_type: str | None = None


class OntologyFunctionSchemaRelations(BaseModel):
    """Ontology types referenced by a Function's latest (or published) I/O schemas."""

    object_type_names: list[str] = Field(default_factory=list)
    link_type_names: list[str] = Field(default_factory=list)
    fields: list[OntologySchemaFieldRef] = Field(default_factory=list)
    input_schema: dict | None = None
    output_schema: dict | None = None
    version: int | None = None


class OntologyFunctionExternalService(BaseModel):
    api_name: str
    #: False when the source calls a name that is not in the external-services registry.
    registered: bool = True


class OntologyFunctionResponse(BaseModel):
    id: str
    api_name: str
    display_name: str
    description: str | None = None
    source: str
    object_type_id: str | None = None
    development_status: FunctionDevelopmentStatus | str
    status: FunctionStatus | str
    published_version_id: str | None = None
    published_version: int | None = None
    latest_version: int | None = None
    schema_relations: OntologyFunctionSchemaRelations | None = None
    #: External services its source calls with `client.external(...)`; empty for a pure function.
    external_services: list[OntologyFunctionExternalService] = []
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
    development_status: FunctionDevelopmentStatus | None = None
    status: FunctionStatus | None = None


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
    status: ExecutionStatus | str
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
    status: ExecutionStatus | str
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


class OntologyGroupRelatedLinkType(BaseModel):
    id: str
    name: str
    source_object_type_id: str
    target_object_type_id: str
    source_object_type_name: str | None = None
    target_object_type_name: str | None = None


class OntologyGroupRelatedFunction(BaseModel):
    id: str
    api_name: str
    display_name: str
    object_type_id: str | None = None


class OntologyGroupRelatedAction(BaseModel):
    id: str
    api_name: str
    display_name: str
    object_type_id: str
    status: str


class OntologyGroupRelatedResponse(BaseModel):
    """Link types / Functions / Actions derived from the group's object types."""

    object_type_ids: list[str] = Field(default_factory=list)
    link_types: list[OntologyGroupRelatedLinkType] = Field(default_factory=list)
    functions: list[OntologyGroupRelatedFunction] = Field(default_factory=list)
    action_types: list[OntologyGroupRelatedAction] = Field(default_factory=list)


class OntologyActionWebhookState(BaseModel):
    """The newest delivery attempt for an Action's webhook."""

    ok: bool
    status: int | None = None
    error: str | None = None
    at: datetime


class OntologyActionTypeResponse(BaseModel):
    id: str
    api_name: str
    display_name: str
    description: str | None = None
    object_type_id: str
    rule_type: str
    function_id: str | None = None
    function_version: int | None = None
    parameters: dict | list | None = None
    #: Where a successful run is announced (external service + path), or null.
    webhook_service_id: str | None = None
    webhook_service_name: str | None = None
    webhook_path: str | None = None
    #: `envelope` (metadata payload) or `object` (the resource representation a REST API accepts).
    webhook_body: str = "envelope"
    webhook_method: str = "POST"
    #: External services the bound Function's source calls — where a Function-rule Action goes
    #: when it has no webhook of its own.
    function_external_services: list[str] = []
    #: Newest delivery attempt (null when the Action has no webhook or never ran).
    last_webhook: OntologyActionWebhookState | None = None
    status: str
    created_at: datetime
    updated_at: datetime
    #: Computed JSON Schema for Action input (built-in OT×fields, or bound Function).
    input_schema: dict | None = None


class OntologyActionTypeCreate(BaseModel):
    api_name: str
    display_name: str
    description: str | None = None
    object_type_id: str
    rule_type: str = "function"
    function_id: str | None = None
    function_version: int | None = None
    parameters: dict | list | None = None
    #: Deliver the result to a registered service path after a successful run.
    webhook_service_id: str | None = None
    webhook_path: str | None = None
    webhook_body: str = "envelope"
    webhook_method: str = "POST"


class OntologyActionTypeUpdate(BaseModel):
    display_name: str | None = None
    description: str | None = None
    rule_type: str | None = None
    function_id: str | None = None
    function_version: int | None = None
    parameters: dict | list | None = None
    status: str | None = None
    #: Send `webhook_service_id: null` (or an empty path) to stop delivering.
    webhook_service_id: str | None = None
    webhook_path: str | None = None
    webhook_body: str | None = None
    webhook_method: str | None = None


class OntologyActionExecuteRequest(BaseModel):
    object_id: str | None = None
    input: dict = Field(default_factory=dict)


class OntologyActionExecuteResponse(BaseModel):
    status: str
    output: dict | None = None
    error: str | None = None
    duration_ms: int | None = None
    log_id: str | None = None
    applied: dict | None = None
    #: Delivery outcome when the Action has a registered webhook (never fails the Action).
    webhook: dict | None = None


class OntologyActionLogResponse(BaseModel):
    id: str
    action_type_id: str
    object_id: str | None = None
    caller_user_id: str | None = None
    status: str
    input_payload: dict | None = None
    output_payload: dict | None = None
    error_message: str | None = None
    #: Webhook delivery outcome (null when the Action registers none).
    webhook_ok: bool | None = None
    webhook_status: int | None = None
    webhook_error: str | None = None
    created_at: datetime
