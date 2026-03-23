"""Service for extracting document metadata using LLM via pydantic-ai."""
import logging
from typing import Any

from openai import AsyncOpenAI
from pydantic_ai import Agent, StructuredDict
from pydantic_ai.exceptions import ModelAPIError
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.api_model import ApiModel
from app.models.object_instance import ObjectInstance
from app.models.object_type import ObjectType

logger = logging.getLogger(__name__)

DEFAULT_SCHEMA = [
    {"key": "abstract", "label": "Abstract", "type": "string", "description": "One-sentence summary of the document's main content"},
    {"key": "author", "label": "Author", "type": "string", "description": "Primary author name"},
    {"key": "publish_date", "label": "Publish Date", "type": "date", "description": "Publication date in YYYY-MM-DD format"},
    {"key": "source", "label": "Source", "type": "string", "description": "Journal, conference, or publisher name"},
    {"key": "tags", "label": "Tags", "type": "array", "description": "Keywords or tags"},
    {"key": "categories", "label": "Categories", "type": "array", "description": "Subject categories"},
]

TRUNCATE_CHARS = 8000


async def resolve_extraction_schema_for_llm(
    schema: list[dict[str, Any]] | dict[str, Any] | None,
    channel: Any,
    db: AsyncSession,
) -> tuple[list[dict[str, Any]] | dict[str, Any] | None, list[str]]:
    """
    Resolve object_type and list[object_type] fields by fetching instance IDs.
    If instance count exceeds channel.object_type_extraction_max_instances, skip
    the field and add a warning.

    Returns (resolved_schema, warnings).
    """
    warnings: list[str] = []
    max_instances = getattr(channel, "object_type_extraction_max_instances", None) or 100

    if schema is None:
        return None, []

    if isinstance(schema, dict):
        if schema.get("type") != "object" or "properties" not in schema:
            return schema, []
        props = schema.get("properties", {})
        resolved_props: dict[str, Any] = {}
        for key, prop in props.items():
            if not isinstance(prop, dict):
                resolved_props[key] = prop
                continue
            obj_type_id = prop.get("x-object_type_id")
            if not obj_type_id:
                resolved_props[key] = prop
                continue
            is_list = prop.get("type") == "array" or prop.get("x-type") == "list[object_type]"
            obj_type = await db.get(ObjectType, obj_type_id)
            if not obj_type:
                resolved_props[key] = prop
                continue
            count = await _object_instance_count(db, obj_type_id)
            if count > max_instances:
                warnings.append(
                    f"Object type '{obj_type.name}' has {count} instances (limit {max_instances}). "
                    f"Skipping field '{key}' for extraction."
                )
                continue
            result = await db.execute(
                select(ObjectInstance.id).where(ObjectInstance.object_type_id == obj_type_id)
            )
            ids = [r[0] for r in result.all()]
            if is_list:
                resolved_props[key] = {
                    "type": "array",
                    "items": {"type": "string", "enum": ids},
                    "description": prop.get("description", ""),
                }
            else:
                resolved_props[key] = {
                    "type": "string",
                    "enum": ids,
                    "description": prop.get("description", ""),
                }
            if prop.get("title"):
                resolved_props[key]["title"] = prop["title"]
        required = [k for k in schema.get("required", []) if k in resolved_props]
        return {"type": "object", "properties": resolved_props, "required": required}, warnings

    if isinstance(schema, list):
        resolved: list[dict[str, Any]] = []
        for field in schema:
            key = field.get("key", "unknown")
            if not key:
                continue
            ftype = field.get("type", "string")
            obj_type_id = field.get("object_type_id")
            if ftype not in ("object_type", "list[object_type]") or not obj_type_id:
                resolved.append(field)
                continue
            obj_type = await db.get(ObjectType, obj_type_id)
            if not obj_type:
                resolved.append(field)
                continue
            count = await _object_instance_count(db, obj_type_id)
            if count > max_instances:
                warnings.append(
                    f"Object type '{obj_type.name}' has {count} instances (limit {max_instances}). "
                    f"Skipping field '{key}' for extraction."
                )
                continue
            result = await db.execute(
                select(ObjectInstance.id).where(ObjectInstance.object_type_id == obj_type_id)
            )
            ids = [r[0] for r in result.all()]
            if ftype == "list[object_type]":
                resolved.append({
                    **field,
                    "type": "array",
                    "enum": ids,
                    "object_type_id": None,
                })
            else:
                resolved.append({
                    **field,
                    "type": "enum",
                    "enum": ids,
                    "object_type_id": None,
                })
        return resolved, warnings

    return schema, []


async def _object_instance_count(db: AsyncSession, object_type_id: str) -> int:
    result = await db.execute(
        select(func.count()).select_from(ObjectInstance).where(
            ObjectInstance.object_type_id == object_type_id
        )
    )
    return result.scalar_one() or 0


def _array_schema_to_json_schema(schema: list[dict[str, Any]]) -> dict[str, Any]:
    """Convert legacy array extraction_schema to JSON Schema for StructuredDict."""
    properties: dict[str, dict[str, Any]] = {}
    required: list[str] = []
    for field in schema:
        key = field.get("key", "unknown")
        if not key:
            continue
        ftype = field.get("type", "string")
        desc = (field.get("description") or "").strip()
        if ftype == "date":
            prop = {"type": "string", "format": "date"}
        elif ftype == "array":
            enum_vals = field.get("enum")
            if isinstance(enum_vals, list) and enum_vals:
                prop = {"type": "array", "items": {"type": "string", "enum": enum_vals}}
            else:
                prop = {"type": "array", "items": {"type": "string"}}
        elif ftype == "integer":
            prop = {"type": "integer"}
        elif ftype == "number":
            prop = {"type": "number"}
        elif ftype == "boolean":
            prop = {"type": "boolean"}
        elif ftype == "enum":
            enum_vals = field.get("enum")
            prop = {"type": "string", "enum": enum_vals if isinstance(enum_vals, list) else []}
        else:
            prop = {"type": "string"}
        if desc:
            prop["description"] = desc
        properties[key] = prop
        if field.get("required"):
            required.append(key)
    return {
        "type": "object",
        "properties": properties,
        "required": required,
    }


def _schema_to_json_schema(schema: list[dict[str, Any]] | dict[str, Any] | None) -> dict[str, Any]:
    """Convert extraction_schema (dict or legacy array) to JSON Schema for StructuredDict."""
    if schema is None:
        return _array_schema_to_json_schema(DEFAULT_SCHEMA)
    if isinstance(schema, dict):
        if schema.get("type") == "object" and "properties" in schema:
            return schema
        # Malformed dict, fall back to default
        return _array_schema_to_json_schema(DEFAULT_SCHEMA)
    if isinstance(schema, list):
        if not schema:
            return _array_schema_to_json_schema(DEFAULT_SCHEMA)
        return _array_schema_to_json_schema(schema)
    return _array_schema_to_json_schema(DEFAULT_SCHEMA)


async def extract_metadata(
    markdown: str,
    model: ApiModel,
    schema: list[dict[str, Any]] | dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Extract metadata from document markdown using an LLM via pydantic-ai.

    Args:
        markdown: Document content in markdown.
        model: Registered ApiModel (category=llm).
        schema: JSON Schema dict (type/object, properties, required) or legacy array
                of field definitions. If None/empty, uses default schema.

    Returns:
        Extracted metadata dict. Keys from schema properties; values may be null.
    """
    if not markdown or not markdown.strip():
        return {}

    json_schema = _schema_to_json_schema(schema)

    base_url = model.provider_rel.base_url.rstrip("/")
    if not base_url.endswith("/v1"):
        base_url = f"{base_url}/v1"

    client = AsyncOpenAI(
        base_url=base_url,
        api_key=model.provider_rel.api_key or "dummy",
    )
    provider = OpenAIProvider(openai_client=client)
    openai_model = OpenAIChatModel(
        model.model_name or "gpt-4",
        provider=provider,
    )

    output_type = StructuredDict(
        json_schema,
        name="DocumentMetadata",
        description="Extracted document metadata",
    )

    agent = Agent(
        openai_model,
        output_type=output_type,
        system_prompt="Extract metadata from the document content. Use null for unknown values.",
    )

    truncated = markdown[:TRUNCATE_CHARS]
    prompt = f"Document:\n---\n{truncated}\n---\n\nExtract metadata from the above document."

    try:
        result = await agent.run(prompt)
        output = result.output or {}
        schema_keys = set(json_schema.get("properties", {}).keys())
        return {k: v for k, v in output.items() if k in schema_keys}
    except ModelAPIError as e:
        status = getattr(e, "status_code", 502)
        logger.warning("Metadata extraction HTTP error: %s %s", status, str(e)[:200])
        raise ValueError(f"Extraction failed: HTTP {status}") from e
    except Exception as e:
        logger.warning("Metadata extraction error: %s", e)
        raise ValueError(f"Extraction failed: {e}") from e
