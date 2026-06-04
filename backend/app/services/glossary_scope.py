"""Glossary resource ACL — thin aliases over ``resource_guard``."""

from __future__ import annotations

from app.models.glossary import Glossary
from app.services.resource_acl_constants import PERM_MANAGE, PERM_READ, PERM_WRITE, RT_GLOSSARY
from app.services.resource_guard import (
    load_scoped_resource,
    require_manage,
    require_read,
    require_write,
    resource_allowed,
)

__all__ = [
    "glossary_allowed",
    "load_glossary_scoped",
    "require_glossary_manage",
    "require_glossary_read",
    "require_glossary_write",
]


async def glossary_allowed(db, request, glossary_id: str, required: int) -> bool:
    return await resource_allowed(db, request, RT_GLOSSARY, glossary_id, required)


async def require_glossary_read(db, request, glossary: Glossary) -> Glossary:
    return await require_read(db, request, RT_GLOSSARY, glossary)


async def require_glossary_write(db, request, glossary: Glossary) -> Glossary:
    return await require_write(db, request, RT_GLOSSARY, glossary)


async def require_glossary_manage(db, request, glossary: Glossary) -> Glossary:
    return await require_manage(db, request, RT_GLOSSARY, glossary)


async def load_glossary_scoped(db, request, glossary_id: str, required: int = PERM_READ) -> Glossary:
    return await load_scoped_resource(db, request, RT_GLOSSARY, glossary_id, required)
