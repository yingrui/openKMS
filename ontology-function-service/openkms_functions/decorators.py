"""@function decorator — Palantir-style entry registration and metadata."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, TypeVar

F = TypeVar("F", bound=Callable[..., Any])


@dataclass
class FunctionMeta:
    api_name: str | None = None
    uses: list[Any] = field(default_factory=list)
    edits: list[Any] = field(default_factory=list)
    entrypoint: str | None = None


def function(
    fn: F | None = None,
    *,
    api_name: str | None = None,
    uses: list[Any] | None = None,
    edits: list[Any] | None = None,
) -> F | Callable[[F], F]:
    """Register a user function entrypoint with optional metadata."""

    def decorator(f: F) -> F:
        meta = FunctionMeta(
            api_name=api_name,
            uses=list(uses or []),
            edits=list(edits or []),
            entrypoint=f.__name__,
        )
        f.openkms_function_meta = meta  # type: ignore[attr-defined]
        return f

    if fn is not None:
        return decorator(fn)
    return decorator


def find_entrypoint(module_dict: dict[str, Any], entrypoint: str) -> Callable[..., Any] | None:
    """Resolve callable by decorated entrypoint name or legacy execute."""
    for name, obj in module_dict.items():
        if not callable(obj):
            continue
        meta = getattr(obj, "openkms_function_meta", None)
        if meta is not None and (meta.entrypoint == entrypoint or name == entrypoint):
            return obj
    if entrypoint == "execute":
        legacy = module_dict.get("execute")
        if callable(legacy):
            return legacy
    return module_dict.get(entrypoint) if callable(module_dict.get(entrypoint)) else None
