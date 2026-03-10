"""Metadata extraction using pydantic-ai (sync for CLI)."""
import asyncio
from typing import Any

from openai import AsyncOpenAI
from pydantic_ai import Agent, StructuredDict
from pydantic_ai.exceptions import ModelAPIError
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider

DEFAULT_SCHEMA = [
    {"key": "abstract", "label": "Abstract", "type": "string", "description": "One-sentence summary of the document's main content"},
    {"key": "author", "label": "Author", "type": "string", "description": "Primary author name"},
    {"key": "publish_date", "label": "Publish Date", "type": "date", "description": "Publication date in YYYY-MM-DD format"},
    {"key": "source", "label": "Source", "type": "string", "description": "Journal, conference, or publisher name"},
    {"key": "tags", "label": "Tags", "type": "array", "description": "Keywords or tags"},
    {"key": "categories", "label": "Categories", "type": "array", "description": "Subject categories"},
]

TRUNCATE_CHARS = 8000


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
        return _array_schema_to_json_schema(DEFAULT_SCHEMA)
    if isinstance(schema, list):
        if not schema:
            return _array_schema_to_json_schema(DEFAULT_SCHEMA)
        return _array_schema_to_json_schema(schema)
    return _array_schema_to_json_schema(DEFAULT_SCHEMA)


def extract_metadata_sync(
    markdown: str,
    model_config: dict[str, Any],
    schema: list[dict[str, Any]] | dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Extract metadata from document markdown using an LLM via pydantic-ai (sync).

    Args:
        markdown: Document content in markdown.
        model_config: Dict with base_url, api_key, model_name.
        schema: JSON Schema dict (type/object, properties, required) or legacy array
                of field definitions. If None/empty, uses default schema.

    Returns:
        Extracted metadata dict. Keys from schema properties; values may be null.
    """
    if not markdown or not markdown.strip():
        return {}

    json_schema = _schema_to_json_schema(schema)

    base_url = (model_config.get("base_url") or "").rstrip("/")
    if not base_url.endswith("/v1"):
        base_url = f"{base_url}/v1"

    api_key = model_config.get("api_key") or "dummy"
    model_name = model_config.get("model_name") or "gpt-4"

    client = AsyncOpenAI(
        base_url=base_url,
        api_key=api_key,
    )
    provider = OpenAIProvider(openai_client=client)
    openai_model = OpenAIChatModel(
        model_name,
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

    async def _run() -> dict[str, Any]:
        result = await agent.run(prompt)
        output = result.output or {}
        schema_keys = set(json_schema.get("properties", {}).keys())
        return {k: v for k, v in output.items() if k in schema_keys}

    try:
        return asyncio.run(_run())
    except ModelAPIError as e:
        status = getattr(e, "status_code", 502)
        raise ValueError(f"Extraction failed: HTTP {status}") from e
    except Exception as e:
        raise ValueError(f"Extraction failed: {e}") from e
