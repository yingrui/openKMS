"""ACL-aware filters for paginated resource list endpoints."""

from __future__ import annotations

from sqlalchemy import ColumnElement
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.resource_acl_service import readable_resource_ids, scope_applies


async def readable_id_filter(
    db: AsyncSession,
    payload: dict,
    sub: str | None,
    resource_type: str,
    id_column,
) -> tuple[list[ColumnElement], bool]:
    """Return SQL filters for readable resource ids.

    Returns ``(filters, empty)`` where ``empty=True`` means the caller should return
    an empty page (subject has no readable instances).
    """
    if not isinstance(sub, str):
        return [], False
    if not scope_applies(payload, sub):
        return [], False
    readable = await readable_resource_ids(db, payload, sub, resource_type)
    if readable is None:
        return [], False
    if not readable:
        return [], True
    return [id_column.in_(readable)], False
