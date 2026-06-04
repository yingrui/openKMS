"""Unified resource ACL guard for FastAPI handlers (Layer 2).

Standalone securable types share one code path: load (optional), check via
``check_resource_access``, return 404 on denial to avoid leaking existence.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dataset import Dataset
from app.models.evaluation import Evaluation
from app.models.glossary import Glossary
from app.models.knowledge_base import KnowledgeBase
from app.models.link_type import LinkType
from app.models.object_type import ObjectType
from app.models.wiki_models import WikiSpace
from app.services.resource_acl_constants import (
    PERM_MANAGE,
    PERM_READ,
    PERM_WRITE,
    RT_DATASET,
    RT_EVALUATION,
    RT_GLOSSARY,
    RT_KNOWLEDGE_BASE,
    RT_LINK_TYPE,
    RT_OBJECT_TYPE,
    RT_WIKI_SPACE,
)
from app.services.resource_acl_service import check_resource_access, scope_applies


@dataclass(frozen=True)
class SecurableResourceSpec:
    model: type
    not_found_detail: str


RESOURCE_REGISTRY: dict[str, SecurableResourceSpec] = {
    RT_DATASET: SecurableResourceSpec(Dataset, "Dataset not found"),
    RT_EVALUATION: SecurableResourceSpec(Evaluation, "Evaluation not found"),
    RT_GLOSSARY: SecurableResourceSpec(Glossary, "Glossary not found"),
    RT_KNOWLEDGE_BASE: SecurableResourceSpec(KnowledgeBase, "Knowledge base not found"),
    RT_OBJECT_TYPE: SecurableResourceSpec(ObjectType, "Object type not found"),
    RT_LINK_TYPE: SecurableResourceSpec(LinkType, "Link type not found"),
    RT_WIKI_SPACE: SecurableResourceSpec(WikiSpace, "Wiki space not found"),
}


def not_found_detail(resource_type: str) -> str:
    spec = RESOURCE_REGISTRY.get(resource_type)
    if spec is None:
        return "Resource not found"
    return spec.not_found_detail


async def resource_allowed(
    db: AsyncSession,
    request: Request,
    resource_type: str,
    resource_id: str,
    required: int,
) -> bool:
    """Return whether the caller may perform ``required`` on the resource instance."""
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if not isinstance(sub, str) or not scope_applies(p, sub):
        return True
    return await check_resource_access(db, p, sub, resource_type, resource_id, required)


async def require_resource_access(
    db: AsyncSession,
    request: Request,
    resource_type: str,
    resource: Any,
    required: int,
) -> Any:
    """Enforce ACL on a loaded model; raise 404 when denied."""
    resource_id = str(getattr(resource, "id"))
    if not await resource_allowed(db, request, resource_type, resource_id, required):
        raise HTTPException(status_code=404, detail=not_found_detail(resource_type))
    return resource


async def require_resource_by_id(
    db: AsyncSession,
    request: Request,
    resource_type: str,
    resource_id: str,
    required: int,
) -> Any:
    """Load a standalone resource by id and enforce ACL."""
    spec = RESOURCE_REGISTRY.get(resource_type)
    if spec is None:
        raise ValueError(f"Unsupported standalone resource type: {resource_type}")
    row = await db.get(spec.model, resource_id)
    if not row:
        raise HTTPException(status_code=404, detail=spec.not_found_detail)
    return await require_resource_access(db, request, resource_type, row, required)


async def load_scoped_resource(
    db: AsyncSession,
    request: Request,
    resource_type: str,
    resource_id: str,
    required: int = PERM_READ,
) -> Any:
    """FastAPI-friendly helper for ``get_*_scoped`` dependencies."""
    return await require_resource_by_id(db, request, resource_type, resource_id, required)


# --- Permission-level shortcuts (common Depends patterns) ---

async def require_read(
    db: AsyncSession, request: Request, resource_type: str, resource: Any
) -> Any:
    return await require_resource_access(db, request, resource_type, resource, PERM_READ)


async def require_write(
    db: AsyncSession, request: Request, resource_type: str, resource: Any
) -> Any:
    return await require_resource_access(db, request, resource_type, resource, PERM_WRITE)


async def require_manage(
    db: AsyncSession, request: Request, resource_type: str, resource: Any
) -> Any:
    return await require_resource_access(db, request, resource_type, resource, PERM_MANAGE)
