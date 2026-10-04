"""Resource sharing (ACL) request/response schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field


class AclGrantIn(BaseModel):
    grantee_type: str
    grantee_id: str | None = None
    permissions: str = Field(description="Permission string: r, w, m (e.g. rw, r, rwm)")
    grantee_label: str | None = None


class AclGrantOut(BaseModel):
    grantee_type: str
    grantee_id: str | None
    permissions: str
    grantee_label: str | None = None
    is_owner: bool = False


class ResourceAclOut(BaseModel):
    resource_type: str
    resource_id: str
    grants: list[AclGrantOut]
    effective_permissions: str
    inherits_from: list[dict[str, str]]
    owner_subject: str | None = None
    owner_label: str | None = None
    created_by: str | None = None


class OwnerCandidateOut(BaseModel):
    subject: str
    label: str


class ResourceAclPut(BaseModel):
    grants: list[AclGrantIn]
