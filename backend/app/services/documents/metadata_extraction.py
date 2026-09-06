"""Service for extracting document metadata using LLM via pydantic-ai."""
import logging
import re
from typing import Any

from openai import AsyncOpenAI
from pydantic_ai import Agent, PromptedOutput, StructuredDict
from pydantic_ai.exceptions import ModelAPIError
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.profiles.openai import OpenAIModelProfile
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

# Large enough to cover a full multi-page audit report (financial tables sit deep in the doc).
# GLM-4.5/5.2 carry 128K context, so a generous cap avoids dropping type-specific fields.
TRUNCATE_CHARS = 60000

# DeepSeek and some OpenAI-compatible APIs reject response_format json_schema; use json_object + schema in prompt.
_LLM_EXTRACTION_PROFILE = OpenAIModelProfile(
    supports_json_schema_output=False,
    supports_json_object_output=True,
)


def _is_typed_schema(schema: Any) -> bool:
    """A type-aware schema is a dict with a 'by_type' map (per-document-type fields)."""
    return isinstance(schema, dict) and isinstance(schema.get("by_type"), dict)


async def classify_document_type(markdown: str, model: ApiModel, type_names: list[str]) -> str | None:
    """One cheap LLM call: pick which document type this markdown is, from a fixed list.

    Returns the chosen type name (must be one of type_names) or None if undecided.
    """
    if not markdown or not markdown.strip() or not type_names:
        return None
    base_url = model.provider_rel.base_url.rstrip("/")
    if not re.search(r"/v\d+$", base_url):
        base_url = f"{base_url}/v1"
    client = AsyncOpenAI(base_url=base_url, api_key=model.provider_rel.api_key or "dummy")
    provider = OpenAIProvider(openai_client=client)
    openai_model = OpenAIChatModel(model.model_name or "gpt-4", provider=provider, profile=_LLM_EXTRACTION_PROFILE)
    schema = StructuredDict(
        {
            "type": "object",
            "properties": {"document_type": {"type": "string", "enum": type_names}},
            "required": ["document_type"],
        },
        name="DocumentType",
        description="Classify the document type",
    )
    agent = Agent(
        openai_model,
        output_type=PromptedOutput(schema),
        system_prompt=(
            "You classify a Chinese financial/credit document into exactly one of the allowed types. "
            "Answer with the single best-fitting type."
        ),
    )
    prompt = f"文档内容（节选）：\n---\n{markdown[:4000]}\n---\n请判断这份文档属于哪一种类型。"
    try:
        result = await agent.run(prompt)
        chosen = (result.output or {}).get("document_type")
        return chosen if chosen in type_names else None
    except Exception as e:  # noqa: BLE001 — classification is best-effort
        logger.warning("Document type classification failed: %s", e)
        return None


async def select_type_aware_schema(
    schema: Any, markdown: str, model: ApiModel
) -> tuple[Any, str | None, list[str]]:
    """For a type-aware schema, classify the doc then return common + type-specific fields
    as a flat legacy-array schema. For any other schema, return it unchanged.

    Returns (effective_schema, detected_type, warnings).
    """
    if not _is_typed_schema(schema):
        return schema, None, []
    common: list[dict[str, Any]] = list(schema.get("common") or [])
    by_type: dict[str, Any] = schema.get("by_type") or {}
    warnings: list[str] = []
    doc_type = await classify_document_type(markdown, model, list(by_type.keys()))
    type_fields = list(by_type.get(doc_type, [])) if doc_type else []
    if doc_type is None:
        warnings.append("Document type could not be classified; extracting common fields only.")
    # Common fields first, then type-specific; de-dup by key (common wins).
    seen = {f.get("key") for f in common if isinstance(f, dict)}
    merged = common + [f for f in type_fields if isinstance(f, dict) and f.get("key") not in seen]
    return merged, doc_type, warnings


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
        model: Registered ApiModel (api_kind=chat-completions).
        schema: JSON Schema dict (type/object, properties, required) or legacy array
                of field definitions. If None/empty, uses default schema.

    Returns:
        Extracted metadata dict. Keys from schema properties; values may be null.
    """
    if not markdown or not markdown.strip():
        return {}

    json_schema = _schema_to_json_schema(schema)

    base_url = model.provider_rel.base_url.rstrip("/")
    # Only append /v1 for bare hosts (e.g. https://api.openai.com). Providers whose base_url
    # already carries a version segment (GLM's .../paas/v4, etc.) must be used as-is.
    if not re.search(r"/v\d+$", base_url):
        base_url = f"{base_url}/v1"

    client = AsyncOpenAI(
        base_url=base_url,
        api_key=model.provider_rel.api_key or "dummy",
    )
    provider = OpenAIProvider(openai_client=client)
    openai_model = OpenAIChatModel(
        model.model_name or "gpt-4",
        provider=provider,
        profile=_LLM_EXTRACTION_PROFILE,
    )

    structured = StructuredDict(
        json_schema,
        name="DocumentMetadata",
        description="Extracted document metadata",
    )

    agent = Agent(
        openai_model,
        output_type=PromptedOutput(structured),
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
