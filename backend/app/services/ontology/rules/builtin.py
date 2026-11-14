"""Built-in ontology types for the Rules app: `Rule` and `Event`.

Both are ordinary object types with **no dataset** — instances live in `object_instances` (the write
queue) and are projected into Neo4j like any hand-created type. That is the whole point: a rule and
an event are platform-level objects, so they inherit ACLs, search, the graph and Actions instead of
growing a second, parallel store.

`Event` carries Vertex-style event metadata (`event_config`): which property starts an event and
which one ends it. An instance may leave its end empty, meaning the event is still open.

The types are created on startup, idempotently, keyed by `api_name` — an existing type is never
modified (it may have been renamed or had its properties edited by an admin).
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.object_type import ObjectType

RULE_TYPE_NAME = "Rule"
EVENT_TYPE_NAME = "Event"

EVENT_START_PROPERTY = "event_start_time"
EVENT_END_PROPERTY = "event_end_time"

#: Property definitions written on first creation. Types are `string|number|datetime|boolean`
#: (see the object-type schema); anything richer (conditions, evidence) is stored as JSON text.
RULE_PROPERTIES: list[dict] = [
    {"name": "id", "type": "string", "required": True},
    {"name": "name", "type": "string", "required": True},
    {"name": "domain", "type": "string", "required": False},
    {"name": "subject", "type": "string", "required": False},
    {"name": "condition", "type": "string", "required": False},
    {"name": "severity", "type": "string", "required": False},
    {"name": "conclusion", "type": "string", "required": False},
    {"name": "suggestion", "type": "string", "required": False},
    {"name": "owner", "type": "string", "required": False},
    {"name": "status", "type": "string", "required": False},
    {"name": "version", "type": "number", "required": False},
    {"name": "group_by", "type": "string", "required": False},
    {"name": "last_groups", "type": "number", "required": False},
    {"name": "last_failed_groups", "type": "string", "required": False},
    {"name": "last_run_at", "type": "datetime", "required": False},
    {"name": "last_status", "type": "string", "required": False},
    {"name": "last_values", "type": "string", "required": False},
    {"name": "ai_context", "type": "string", "required": False},
]

EVENT_PROPERTIES: list[dict] = [
    {"name": "event_id", "type": "string", "required": True},
    {"name": "title", "type": "string", "required": True},
    {"name": "domain", "type": "string", "required": False},
    {"name": "intent", "type": "string", "required": False},
    {"name": "severity", "type": "string", "required": False},
    {"name": "description", "type": "string", "required": False},
    {"name": EVENT_START_PROPERTY, "type": "datetime", "required": True},
    {"name": EVENT_END_PROPERTY, "type": "datetime", "required": False},
    {"name": "period_start", "type": "string", "required": False},
    {"name": "period_end", "type": "string", "required": False},
    {"name": "scope", "type": "string", "required": False},
    {"name": "evidence", "type": "string", "required": False},
    {"name": "status", "type": "string", "required": False},
    {"name": "assignee", "type": "string", "required": False},
    {"name": "rule_id", "type": "string", "required": False},
    {"name": "rule_version", "type": "number", "required": False},
    {"name": "subject_type", "type": "string", "required": False},
    {"name": "subject_id", "type": "string", "required": False},
    {"name": "dedupe_key", "type": "string", "required": False},
]

EVENT_CONFIG = {"start_property": EVENT_START_PROPERTY, "end_property": EVENT_END_PROPERTY}


async def _by_api_name(db: AsyncSession, api_name: str) -> ObjectType | None:
    return (
        await db.execute(select(ObjectType).where(ObjectType.api_name == api_name))
    ).scalars().first()


async def ensure_builtin_ontology(db: AsyncSession) -> list[str]:
    """Create `Rule` / `Event` when missing. Returns the api_names it created.

    Idempotent and non-destructive: an existing row is left exactly as it is (an admin may have
    changed the display name, the properties, or the sharing). A name/label clash is logged by the
    caller and never blocks startup.
    """
    created: list[str] = []
    specs = (
        (RULE_TYPE_NAME, "规则：条件 + 结论，命中产生事件", RULE_PROPERTIES, None, "name"),
        (EVENT_TYPE_NAME, "事件：带着开始/结束时间的对象", EVENT_PROPERTIES, EVENT_CONFIG, "title"),
    )
    for api_name, description, properties, event_config, display_property in specs:
        existing = await _by_api_name(db, api_name)
        if existing:
            # Additive only: a property declared after the type shipped is appended when missing; an
            # admin's edits (type, required, removal) are never rewritten.
            declared = {str(p.get("name")) for p in (existing.properties or [])}
            missing = [p for p in properties if str(p.get("name")) not in declared]
            if missing:
                existing.properties = [*(existing.properties or []), *missing]
                await db.flush()
                created.append(f"{api_name}+{len(missing)} props")
            continue
        db.add(
            ObjectType(
                id=__import__("uuid").uuid4().hex,
                name=api_name,
                api_name=api_name,
                neo4j_label=api_name,
                description=description,
                dataset_id=None,
                key_properties=["id"] if api_name == RULE_TYPE_NAME else ["event_id"],
                properties=properties,
                display_property=display_property,
                event_config=event_config,
                created_by_name="system",
            )
        )
        created.append(api_name)
    if created:
        await db.commit()
    return created


async def builtin_types(db: AsyncSession) -> tuple[ObjectType | None, ObjectType | None]:
    """(rule_type, event_type) — either may be missing when the instance skipped the bootstrap."""
    return await _by_api_name(db, RULE_TYPE_NAME), await _by_api_name(db, EVENT_TYPE_NAME)
