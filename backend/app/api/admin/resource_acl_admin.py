"""Console: resource ACL issues and audit."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_jwt_payload, require_permission
from app.api.resource_acl import (
    AclGrantOut,
    OwnerCandidateOut,
    ResourceAclOut,
    ResourceAclPut,
    list_local_owner_candidates,
    persist_resource_acl,
    serialize_resource_acl,
)
from app.database import get_db
from app.services.permission_catalog import PERM_CONSOLE_GROUPS
from app.services.resource_acl_constants import SECURABLE_RESOURCE_TYPES
from app.services.resource_acl_issue_detection import ISSUE_TYPES_ORDER
from app.services.resource_acl_issue_scan import (
    aggregate_issue_counts,
    list_issue_page,
    scan_resources_with_issues,
)

router = APIRouter(prefix="/admin/resource-acl", tags=["admin-resource-acl"])

VALID_ISSUE_CODES = frozenset(ISSUE_TYPES_ORDER)
DEFAULT_ISSUE_PAGE_SIZE = 5
MAX_ISSUE_PAGE_SIZE = 100


class ResourceAclIssueItemOut(BaseModel):
    resource_type: str
    resource_type_label: str
    resource_id: str
    resource_label: str
    share_path: str | None
    issues: list[str]
    owner_label: str | None = None
    owner_permissions: str | None = None
    others_permissions: str | None = None
    inherited_others_permissions: str | None = None
    broken_group_ids: list[str] = Field(default_factory=list)
    empty_group_ids: list[str] = Field(default_factory=list)
    grants: list[AclGrantOut]


class ResourceAclIssuesSummaryOut(BaseModel):
    issue_count: int
    by_issue: dict[str, int]


class ResourceAclIssuesPageOut(ResourceAclIssuesSummaryOut):
    issue: str
    total: int
    limit: int
    offset: int
    items: list[ResourceAclIssueItemOut]


@router.get("/issues", response_model=ResourceAclIssuesSummaryOut | ResourceAclIssuesPageOut)
async def resource_acl_issues(
    issue: str | None = Query(None, description="Filter to one issue code; returns a paginated page"),
    limit: int = Query(DEFAULT_ISSUE_PAGE_SIZE, ge=1, le=MAX_ISSUE_PAGE_SIZE),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission(PERM_CONSOLE_GROUPS)),
):
    """ACL issue summary, or paginated items for one issue type."""
    if issue is not None and issue not in VALID_ISSUE_CODES:
        raise HTTPException(status_code=400, detail="Unknown issue code")

    if issue is None:
        scanned = await scan_resources_with_issues(db)
        issue_count, by_issue = aggregate_issue_counts(scanned)
        return ResourceAclIssuesSummaryOut(issue_count=issue_count, by_issue=by_issue)

    total, page_items, issue_count, by_issue = await list_issue_page(
        db, issue, limit=limit, offset=offset
    )
    return ResourceAclIssuesPageOut(
        issue=issue,
        total=total,
        limit=limit,
        offset=offset,
        items=[ResourceAclIssueItemOut.model_validate(item) for item in page_items],
        issue_count=issue_count,
        by_issue=by_issue,
    )


def _validate_resource_type(resource_type: str) -> None:
    if resource_type not in SECURABLE_RESOURCE_TYPES:
        raise HTTPException(status_code=400, detail="Unknown resource type")


@router.get("/{resource_type}/{resource_id}", response_model=ResourceAclOut)
async def admin_get_resource_acl(
    resource_type: str,
    resource_id: str,
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(get_jwt_payload),
    _: None = Depends(require_permission(PERM_CONSOLE_GROUPS)),
):
    """Read ACL for any resource without requiring data read permission (Console audit)."""
    _validate_resource_type(resource_type)
    sub = payload.get("sub")
    if not isinstance(sub, str):
        raise HTTPException(status_code=401, detail="Unauthorized")
    return await serialize_resource_acl(db, resource_type, resource_id, sub, payload)


@router.put("/{resource_type}/{resource_id}", response_model=ResourceAclOut)
async def admin_put_resource_acl(
    resource_type: str,
    resource_id: str,
    body: ResourceAclPut,
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(get_jwt_payload),
    _: None = Depends(require_permission(PERM_CONSOLE_GROUPS)),
):
    """Update ACL for any resource without requiring manage on that resource (Console audit)."""
    _validate_resource_type(resource_type)
    sub = payload.get("sub")
    if not isinstance(sub, str):
        raise HTTPException(status_code=401, detail="Unauthorized")
    return await persist_resource_acl(
        db, resource_type, resource_id, body, sub, payload, skip_manage_check=True
    )


@router.get("/{resource_type}/{resource_id}/owner-candidates", response_model=list[OwnerCandidateOut])
async def admin_get_owner_candidates(
    resource_type: str,
    resource_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission(PERM_CONSOLE_GROUPS)),
):
    _validate_resource_type(resource_type)
    return await list_local_owner_candidates(db)
