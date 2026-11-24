"""Saved explorations: normalising what goes in, and choosing the layout that comes out.

The API accepts conditions in the same vocabulary the URL uses (`prop:op:value`, `@link/prop:op:value`), so a
saved exploration is a URL in a row. Anything the object-set reader cannot parse is refused here rather than
stored and discovered later as an empty result.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exploration import VISIBILITIES, ExplorationLayout
from app.services.ontology.object_query import OPS, QueryError, parse_filter

#: The four things a layout can carry. `perspective` decides which rendering an exploration opens with.
LAYOUT_KEYS = ("charts", "columns", "sorts", "perspective")
PERSPECTIVES = ("explore", "results")


class ExplorationError(ValueError):
    """The exploration is not storable as written; surfaced as HTTP 400."""


def validate_filters(raw: list[str] | list[dict] | None) -> list[dict]:
    """Conditions as dicts. Strings use the URL grammar; dicts are already `{prop, op, value, via?}`."""
    out: list[dict] = []
    for entry in raw or []:
        if isinstance(entry, str):
            try:
                parsed = parse_filter(entry)
            except QueryError as exc:
                raise ExplorationError(str(exc)) from exc
            out.append(
                {
                    "prop": parsed.prop,
                    "op": parsed.op,
                    "value": parsed.value,
                    **({"via": parsed.via} if parsed.via else {}),
                }
            )
            continue
        if not isinstance(entry, dict):
            raise ExplorationError("a condition is a string like `cycle:eq:2026-W46` or an object")
        prop = str(entry.get("prop") or "").strip()
        op = str(entry.get("op") or "").strip()
        if not prop:
            raise ExplorationError("a condition needs `prop`")
        if op not in OPS:
            raise ExplorationError(f"`{op or '?'}` is not one of: {', '.join(OPS)}")
        item: dict[str, Any] = {"prop": prop, "op": op, "value": entry.get("value")}
        if entry.get("via"):
            item["via"] = str(entry["via"])
        out.append(item)
    return out


CHART_METRICS = ("count", "sum", "avg", "min", "max")


def _normalize_chart(entry: Any) -> dict:
    """A chart is a property, and optionally what is measured in it and what it is split by.

    `{prop}` alone is a count per value; `{prop, metric: avg, measure: x}` is "how much, on average"; `{prop, split:
    y}` is a cross-tab. Anything else is refused rather than stored and ignored.
    """
    if not isinstance(entry, dict):
        return {"prop": str(entry)}
    prop = str(entry.get("prop") or "").strip()
    if not prop:
        raise ExplorationError("a chart needs a `prop`")
    out: dict[str, Any] = {"prop": prop}
    metric = entry.get("metric")
    if metric is not None:
        if metric not in CHART_METRICS:
            raise ExplorationError(f"chart metric must be one of: {', '.join(CHART_METRICS)}")
        out["metric"] = metric
    for key in ("measure", "split"):
        value = entry.get(key)
        if value is not None:
            out[key] = str(value)
    if out.get("metric", "count") != "count" and not out.get("measure"):
        raise ExplorationError("a chart with a metric needs a `measure`")
    return out


def normalize_layout(raw: dict | None) -> dict:
    """Keep the four known keys, refuse a perspective we do not render."""
    if raw is None:
        return {}
    if not isinstance(raw, dict):
        raise ExplorationError("layout must be an object")
    unknown = set(raw) - set(LAYOUT_KEYS)
    if unknown:
        raise ExplorationError(
            f"layout has unknown keys: {', '.join(sorted(unknown))} — it carries "
            f"{', '.join(LAYOUT_KEYS)}"
        )
    out: dict[str, Any] = {}
    charts = raw.get("charts")
    if charts is not None:
        if not isinstance(charts, list):
            raise ExplorationError("layout.charts must be a list of {prop}")
        out["charts"] = [_normalize_chart(entry) for entry in charts]
    columns = raw.get("columns")
    if columns is not None:
        if not isinstance(columns, list):
            raise ExplorationError("layout.columns must be a list of property names")
        names = [str(entry).strip() for entry in columns]
        if any(not name for name in names):
            raise ExplorationError("layout.columns cannot hold an empty name")
        out["columns"] = names
    sorts = raw.get("sorts")
    if sorts is not None:
        if not isinstance(sorts, list):
            raise ExplorationError("layout.sorts must be a list")
        out["sorts"] = sorts
    perspective = raw.get("perspective")
    if perspective is not None:
        if perspective not in PERSPECTIVES:
            raise ExplorationError(f"layout.perspective must be one of: {', '.join(PERSPECTIVES)}")
        out["perspective"] = perspective
    return out


def validate_visibility(value: str | None) -> str:
    visibility = (value or "private").strip()
    if visibility not in VISIBILITIES:
        raise ExplorationError(f"visibility must be one of: {', '.join(VISIBILITIES)}")
    return visibility


async def effective_layout(
    db: AsyncSession, object_type_id: str, owner_sub: str | None
) -> tuple[dict, str]:
    """The layout an exploration should open with, and where it came from.

    A personal default wins over the global one; with neither, the caller falls back to the type's prominent
    properties (the "built-in" layout).
    """
    rows = (
        await db.execute(
            select(ExplorationLayout).where(ExplorationLayout.object_type_id == object_type_id)
        )
    ).scalars().all()
    for row in rows:
        if owner_sub and row.owner_sub == owner_sub:
            return row.layout or {}, "personal"
    for row in rows:
        if row.owner_sub == "":
            return row.layout or {}, "global"
    return {}, "builtin"
