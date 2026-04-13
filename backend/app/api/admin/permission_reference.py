"""Reference lists for configuring security_permissions (frontend routes + API operations)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from app.api.auth import require_permission
from app.services.permission_catalog import PERM_CONSOLE_PERMISSIONS, list_operation_key_hints
from app.services.permission_reference import list_api_operations, list_frontend_features

router = APIRouter(prefix="/admin/permission-reference", tags=["admin-permission-reference"])


class FrontendFeatureRef(BaseModel):
    path_pattern: str
    label: str
    section: str
    note: str | None = None


class ApiOperationRef(BaseModel):
    method: str
    path: str
    summary: str = ""
    tags: list[str] = Field(default_factory=list)


class OperationKeyHintRef(BaseModel):
    key: str
    label: str
    description: str
    category: str


class PermissionReferenceResponse(BaseModel):
    frontend_features: list[FrontendFeatureRef]
    api_operations: list[ApiOperationRef]
    operation_key_hints: list[OperationKeyHintRef]
    hint: str = (
        "Use path patterns in security_permissions: frontend routes are SPA paths; "
        "backend patterns often match OpenAPI paths (e.g. /api/...). Wildcards like /* are conventional, not enforced by the server automatically."
    )


@router.get("", response_model=PermissionReferenceResponse)
async def get_permission_reference(
    request: Request,
    _: None = Depends(require_permission(PERM_CONSOLE_PERMISSIONS)),
) -> PermissionReferenceResponse:
    fe = [FrontendFeatureRef(**x) for x in list_frontend_features()]
    api_rows = list_api_operations(request.app)
    api = [ApiOperationRef(**x) for x in api_rows]
    hints = [OperationKeyHintRef(**x) for x in list_operation_key_hints()]
    return PermissionReferenceResponse(frontend_features=fe, api_operations=api, operation_key_hints=hints)
