"""Service for extracting document metadata using LLM."""
import json
import logging
from typing import Any

import httpx

from app.models.api_model import ApiModel

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


def _build_prompt(markdown: str, schema: list[dict[str, Any]]) -> str:
    """Build extraction prompt from schema."""
    lines = [
        "Extract metadata from the following document content. "
        "Return a JSON object with these keys (use null for unknown):",
        "",
    ]
    for field in schema:
        key = field.get("key", "unknown")
        label = field.get("label", key)
        ftype = field.get("type", "string")
        desc = field.get("description", "").strip()
        type_hint = "YYYY-MM-DD" if ftype == "date" else "list of strings" if ftype == "array" else "text"
        if desc:
            lines.append(f"- {key} ({ftype}): {label} – {desc} (e.g. {type_hint})")
        else:
            lines.append(f"- {key} ({ftype}): {label} – e.g. {type_hint}")

    lines.extend([
        "",
        "Document:",
        "---",
        markdown[:TRUNCATE_CHARS],
        "---",
        "",
        "JSON only, no other text.",
    ])
    return "\n".join(lines)


def _extract_json_from_response(content: str) -> dict[str, Any]:
    """Parse JSON from LLM response, handling markdown code blocks."""
    text = content.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        start = 1 if lines[0].startswith("```json") else 0
        end = next((i for i, l in enumerate(lines) if i > 0 and l.strip() == "```"), len(lines))
        text = "\n".join(lines[start:end])
    return json.loads(text)


async def extract_metadata(
    markdown: str,
    model: ApiModel,
    schema: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """
    Extract metadata from document markdown using an LLM.

    Args:
        markdown: Document content in markdown.
        model: Registered ApiModel (category=llm).
        schema: List of field definitions. If None/empty, uses default schema.

    Returns:
        Extracted metadata dict. Keys from schema; values may be null.
    """
    if not markdown or not markdown.strip():
        return {}

    used_schema = schema if schema else DEFAULT_SCHEMA
    prompt = _build_prompt(markdown, used_schema)
    url = f"{model.base_url.rstrip('/')}/v1/chat/completions"
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if model.api_key:
        headers["Authorization"] = f"Bearer {model.api_key}"
    payload = {
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 2048,
        "temperature": 0.2,
    }
    if model.model_name:
        payload["model"] = model.model_name

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(url, json=payload, headers=headers)

        if resp.status_code >= 400:
            logger.warning("Metadata extraction HTTP error: %s %s", resp.status_code, resp.text[:200])
            raise ValueError(f"Extraction failed: HTTP {resp.status_code}")

        data = resp.json()
        choices = data.get("choices", [])
        if not choices:
            raise ValueError("Empty response from model")

        content = choices[0].get("message", {}).get("content", "")
        if not content:
            raise ValueError("No content in model response")

        result = _extract_json_from_response(content)

        # Filter to schema keys only
        schema_keys = {f["key"] for f in used_schema}
        filtered = {k: v for k, v in result.items() if k in schema_keys}
        return filtered

    except json.JSONDecodeError as e:
        logger.warning("Metadata extraction JSON parse error: %s", e)
        raise ValueError(f"Invalid JSON in model response: {e}") from e
    except httpx.ConnectError as e:
        logger.warning("Metadata extraction connection error: %s", e)
        raise ValueError(f"Connection failed: {e}") from e
