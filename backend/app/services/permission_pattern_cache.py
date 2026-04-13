"""In-memory cache of compiled backend permission pattern rules."""

from __future__ import annotations

import time

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.permission_pattern_engine import CompiledRule, compile_rules_from_rows
from app.services.security_permission_service import list_permissions_sorted

_cache_rules: list[CompiledRule] | None = None
_cache_monotonic: float = 0.0


def invalidate_permission_pattern_cache() -> None:
    global _cache_rules, _cache_monotonic
    _cache_rules = None
    _cache_monotonic = 0.0


async def get_compiled_pattern_rules(db: AsyncSession, ttl_seconds: float) -> list[CompiledRule]:
    global _cache_rules, _cache_monotonic
    now = time.monotonic()
    if _cache_rules is not None and (now - _cache_monotonic) < ttl_seconds:
        return _cache_rules
    rows = await list_permissions_sorted(db)
    _cache_rules = compile_rules_from_rows(rows)
    _cache_monotonic = now
    return _cache_rules
