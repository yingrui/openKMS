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


def _resolve_resource(token: str, model_id: str, resource_id: str | None) -> str | None:
    """The data resource a restricted model needs; a public model ignores it.

    Returns the id to send, or None for a public model. Raises when the model is restricted and
    the caller has no usable resource — better a clear message than the API's bare 400.
    """
    model = catalog_client.get_semantic_model(token, model_id)
    if (model.get("access_mode") or "public") != "restricted":
        return None
    available = catalog_client.list_data_resources(token, model_id)
    ids = [r.get("id") for r in available if r.get("id")]
    if resource_id:
        if resource_id in ids:
            return resource_id
        raise ValueError(
            f"Data resource '{resource_id}' is not granted to you for this model."
        )
    if not ids:
        raise ValueError(
            "This semantic model is restricted and no data resource is granted to you. "
            "Ask an owner for access before querying it."
        )
    return ids[0]


def _model_tables(token: str, model: dict[str, Any]) -> list[dict[str, Any]]:
    """Physical tables the SQL Lab allowlist accepts for this model."""
    tables: list[dict[str, Any]] = []
    for ref in model.get("datasets") or []:
        if not isinstance(ref, dict):
            continue
        did = ref.get("id")
        if not did:
            continue
        try:
            ds = catalog_client.get_dataset(token, str(did))
        except Exception as e:
            tables.append({"id": did, "name": ref.get("name"), "error": str(e)})
            continue
        if ds.get("kind") and ds.get("kind") != "table":
            continue
        schema = ds.get("schema_name")
        table = ds.get("table_name")
        tables.append(
            {
                "id": did,
                "name": ds.get("display_name") or ref.get("name") or did,
                "kind": ds.get("kind"),
                "schema_name": schema,
                "table_name": table,
                "qualified_name": (
                    f"{schema}.{table}" if schema and table else table or None
                ),
            }
        )
    return tables


@tool
def get_semantic_model_tool(model_id: str, _config: RunnableConfig) -> str:
    """Get one linked semantic model plus metrics, fields, and physical tables (for query or SQL Lab).
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
        resources = (
            catalog_client.list_data_resources(token, model_id)
            if (model.get("access_mode") or "public") == "restricted"
            else []
        )
        # What this model can answer, stated compactly. `fields` below is the full catalogue and is the right thing to read
        # when building a query; this line is the right thing to read when deciding whether the question is answerable at
        # all — the failure this exists for: asked for revenue, an agent picked a field it did have and answered anyway.
        measures = sorted({str(f.get("name") or f.get("column_name") or "") for f in fields} - {""})
        metric_names = sorted({str(m.get("name") or "") for m in metrics} - {""})
        return json.dumps(
            {
                "available_measures": measures,
                "available_metrics": metric_names,
                "model": model,
                "data_resources": [
                    {"id": r.get("id"), "name": r.get("name"), "rows": len(r.get("row_policy") or [])}
                    for r in resources
                ],
                "tables": _model_tables(token, model),
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
    resource_id: str | None = None,
) -> str:
    """Run one Catalog metric query (not a full SELECT). Prefer a saved metric name; otherwise pass
    an aggregate expression fragment (e.g. SUM(amount)) with base_dataset (dataset id) and optional
    joins (relationship ids). filters: [{field, op, value}] on model fields. where/having: boolean
    SQL fragments AND-ed in. For ad-hoc SELECT/JOIN use sql_semantic_model_tool instead.
    resource_id: which granted data resource to query — required in effect when the model is
    restricted (the resource decides the row scope, which you cannot widen). Defaults to the first
    resource granted to the caller.
    model_id must be linked to this KB."""
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
        resource_id = _resolve_resource(token, model_id, resource_id)
        result = catalog_client.query_semantic_model(token, model_id, body, resource_id)
        return json.dumps(result, indent=2, default=str)
    except Exception as e:
        return f"Error querying semantic model: {e}"


@tool
def sql_semantic_model_tool(
    model_id: str,
    sql: str,
    _config: RunnableConfig,
    limit: int | None = 100,
    resource_id: str | None = None,
) -> str:
    """Run one read-only SQL Lab SELECT against tables in this semantic model.
    Use when a saved metric / expression query is awkward (multi-table JOIN, window functions,
    row samples, custom projections). sql must be a single SELECT or WITH…SELECT; only tables
    listed under get_semantic_model_tool.tables (prefer schema.table) are allowed. Do not write
    INSERT/UPDATE/DELETE or multiple statements. resource_id selects the granted data
    resource (required in effect for a restricted model; it fixes which rows you may read).
    model_id must be linked to this KB."""
    try:
        token = get_tool_access_token(_config)
        kb_id = get_tool_knowledge_base_id(_config)
        if not kb_id:
            return "Error: knowledge_base_id missing."
        _ensure_model_in_kb(token, kb_id, model_id)
        resource_id = _resolve_resource(token, model_id, resource_id)
        result = catalog_client.run_model_sql(
            token, model_id, sql, limit=limit, resource_id=resource_id
        )
        return json.dumps(result, indent=2, default=str)
    except Exception as e:
        return f"Error running SQL Lab: {e}"


catalog_tools = [
    list_semantic_models_tool,
    get_semantic_model_tool,
    query_semantic_model_tool,
    sql_semantic_model_tool,
]

CATALOG_PROMPT = (
    "**Catalog skill** – For numeric / tabular questions against linked semantic models:\n"
    "1. Call **list_semantic_models_tool** (only models linked to this knowledge base).\n"
    "2. Call **get_semantic_model_tool** for metrics, fields, and **tables** "
    "(``schema.table`` allowlist for SQL Lab).\n"
    "3. Prefer **query_semantic_model_tool** with `metric=<saved name>` (or `expression` + "
    "`base_dataset` / joins / filters) when a metric-style aggregate fits.\n"
    "4. Use **sql_semantic_model_tool** for ad-hoc analysis: one SELECT/WITH against "
    "``tables[].qualified_name`` only (JOINs, windows, samples, custom columns). "
    "Never mutate data; never query tables outside the model.\n"
    "4b. When ``data_resources`` is non-empty the model is **restricted**: pass the chosen "
    "``resource_id`` on every query / sql call. The resource fixes the rows you can read; "
    "you cannot widen it, and a missing grant is an error, not a fallback.\n"
    "5. Cite the metric name, expression, or SQL + a short row preview. "
    "If the KB has no linked models, say so."
)
