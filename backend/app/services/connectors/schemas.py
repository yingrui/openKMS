"""JSON Schema constants for search_tool connector responses."""

from __future__ import annotations

from typing import Any

# Normalized connector output (not raw Zhipu JSON).
# Provider returns search_result[]; openKMS exposes results[] for Agents.
ZHIPU_WEB_SEARCH_OUTPUT_SCHEMA: dict[str, Any] = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "ZhipuWebSearchResponse",
    "description": (
        "Normalized search_tool response. Raw Zhipu fields id/created/request_id "
        "are grouped under provider; search_result[] is exposed as results[]."
    ),
    "type": "object",
    "required": ["query", "results"],
    "properties": {
        "query": {
            "type": "string",
            "description": "Echo of the search_query sent to the provider",
        },
        "provider": {
            "type": "object",
            "description": "Passthrough metadata from the Zhipu response envelope",
            "properties": {
                "id": {"type": "string", "description": "Provider task id"},
                "created": {
                    "type": "integer",
                    "description": "Unix timestamp (seconds) when the provider created the response",
                },
                "request_id": {"type": "string", "description": "Client or provider request identifier"},
            },
        },
        "search_intent": {
            "type": "array",
            "description": "Intent recognition output from the provider (when enabled)",
            "items": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Original query from provider"},
                    "intent": {
                        "type": "string",
                        "enum": ["SEARCH_ALL", "SEARCH_NONE", "SEARCH_ALWAYS"],
                        "description": "SEARCH_ALWAYS when search_intent input is false",
                    },
                    "keywords": {
                        "type": "string",
                        "description": "Rewritten keywords used for retrieval",
                    },
                },
            },
        },
        "results": {
            "type": "array",
            "description": "Hits normalized from provider search_result[]",
            "items": {
                "type": "object",
                "required": ["title", "link"],
                "properties": {
                    "title": {"type": "string"},
                    "content": {"type": "string", "description": "Snippet or summary text"},
                    "link": {"type": "string", "description": "Result URL"},
                    "media": {"type": "string", "description": "Site or publisher name"},
                    "icon": {"type": "string", "description": "Site icon URL (may be empty)"},
                    "refer": {"type": "string", "description": "Citation label, e.g. ref_1"},
                    "publish_date": {"type": "string", "description": "Publish date when provided"},
                },
            },
        },
    },
}
