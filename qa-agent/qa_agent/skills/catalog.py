"""LangGraph skill: Catalog semantic models (KB-scoped) + query API."""
from __future__ import annotations

import json
from typing import Any

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool

from .. import catalog_client
from ..request_context import get_tool_access_token, get_tool_knowledge_base_id


def _ensure_model_in_kb(token: str, kb_id: str, model_id: str) -> list[dict[str, Any]]:
    linked = catalog_client.list_kb_semantic_models(token, kb_id)
    ids = {m.get("semantic_model_id") for m in linked}
    if model_id not in ids:
        raise ValueError(
            f"Semantic model '{model_id}' is not linked to this knowledge base. "
            "Call list_semantic_models_tool first."
        )
    return linked


@tool
def list_semantic_models_tool(_config: RunnableConfig) -> str:
    """List semantic models linked to this knowledge base (name, description, metric names, ai_context).
    Use this before querying numbers. If empty, this KB has no Catalog models in scope."""
    try:
        token = get_tool_access_token(_config)
        kb_id = get_tool_knowledge_base_id(_config)
        if not kb_id:
            return "Error: knowledge_base_id missing."
        items = catalog_client.list_kb_semantic_models(token, kb_id)
        if not items:
            return json.dumps(
                {
                    "items": [],
                    "message": "This knowledge base has no linked semantic models.",
                },
                indent=2,
            )
        return json.dumps({"items": items}, indent=2, default=str)
    except Exception as e:
        return f"Error listing semantic models: {e}"


@tool
def get_semantic_model_tool(model_id: str, _config: RunnableConfig) -> str:
    """Get one linked semantic model plus its metrics and fields (for building a query).
    model_id must be from list_semantic_models_tool."""
    try:
        token = get_tool_access_token(_config)
        kb_id = get_tool_knowledge_base_id(_config)
        if not kb_id:
            return "Error: knowledge_base_id missing."
        _ensure_model_in_kb(token, kb_id, model_id)
        model = catalog_client.get_semantic_model(token, model_id)
        metrics = catalog_client.list_model_metrics(token, model_id)
        fields = catalog_client.list_model_fields(token, model_id)
        return json.dumps(
            {
                "model": model,
                "metrics": [
                    {
                        "id": m.get("id"),
                        "name": m.get("name"),
                        "type": m.get("type"),
                        "expression": m.get("expression"),
                        "base_dataset_id": m.get("base_dataset_id"),
                        "joins": m.get("joins"),
                        "ai_context": m.get("ai_context"),
                        "business_definition": m.get("business_definition"),
                    }
                    for m in metrics
                ],
                "fields": [
                    {
                        "id": f.get("id"),
                        "name": f.get("name"),
                        "dataset_id": f.get("dataset_id"),
                        "column_name": f.get("column_name"),
                        "datatype": f.get("datatype"),
                        "dimension": f.get("dimension"),
                        "ai_context": f.get("ai_context"),
                    }
                    for f in fields
                ],
            },
            indent=2,
            default=str,
        )
    except Exception as e:
        return f"Error getting semantic model: {e}"


@tool
def query_semantic_model_tool(
    model_id: str,
    _config: RunnableConfig,
    metric: str | None = None,
    expression: str | None = None,
    base_dataset: str | None = None,
    joins: list[str] | None = None,
    group_by: list[dict[str, Any]] | None = None,
    filters: list[dict[str, Any]] | None = None,
    where: str | None = None,
    having: str | None = None,
    order_by: list[dict[str, Any]] | None = None,
    limit: int | None = 100,
) -> str:
    """Run one Catalog query. Prefer a saved metric name; otherwise pass an aggregate expression
    fragment (e.g. SUM(amount)) with base_dataset (dataset id) and optional joins (relationship ids).
    filters: [{field, op, value}] on model fields. where/having: boolean SQL fragments AND-ed in.
    Do NOT submit a full SELECT or FROM/JOIN text. model_id must be linked to this KB."""
    try:
        token = get_tool_access_token(_config)
        kb_id = get_tool_knowledge_base_id(_config)
        if not kb_id:
            return "Error: knowledge_base_id missing."
        _ensure_model_in_kb(token, kb_id, model_id)
        body: dict[str, Any] = {
            "group_by": group_by or [],
            "filters": filters or [],
            "order_by": order_by or [],
            "limit": limit,
        }
        if metric:
            body["metric"] = metric
        if expression:
            body["expression"] = expression
            if base_dataset:
                body["base_dataset"] = base_dataset
            if joins:
                body["joins"] = joins
        if where:
            body["where"] = where
        if having:
            body["having"] = having
        result = catalog_client.query_semantic_model(token, model_id, body)
        return json.dumps(result, indent=2, default=str)
    except Exception as e:
        return f"Error querying semantic model: {e}"


catalog_tools = [
    list_semantic_models_tool,
    get_semantic_model_tool,
    query_semantic_model_tool,
]

CATALOG_PROMPT = (
    "**Catalog skill** – For numeric / metric questions (e.g. totals, breakdowns by month):\n"
    "1. Call **list_semantic_models_tool** (only models linked to this knowledge base).\n"
    "2. Call **get_semantic_model_tool** on the matching model to learn metric and field names.\n"
    "3. Prefer **query_semantic_model_tool** with `metric=<saved name>` plus group_by/filters.\n"
    "4. If no saved metric fits, pass `expression` (aggregate fragment only, e.g. `SUM(amount)`), "
    "`base_dataset`, optional `joins`, and field filters. Use `where`/`having` for OR or "
    "expression predicates. Never submit a full SELECT.\n"
    "5. Cite the metric name or the expression + returned SQL. If the KB has no linked models, say so."
)
