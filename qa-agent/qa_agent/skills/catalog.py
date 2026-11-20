"""LangGraph skill: Catalog semantic models (KB-scoped) + query API."""
from __future__ import annotations

import json
from typing import Annotated, Any

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool

from .. import catalog_client
from ..request_context import get_tool_access_token



@tool
def list_semantic_models(_config: RunnableConfig) -> str:
    """ The semantic models you may read. Call it before any number."""
    try:
        token = get_tool_access_token(_config)
        items = catalog_client.list_semantic_models(token)
        if not items:
            return json.dumps(
                {"items": [], "message": "No readable semantic models."},
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
def get_semantic_model(
    model_id: Annotated[str, "Model id from list_semantic_models"],
    _config: RunnableConfig,
) -> str:
    """One model's metrics, fields, tables, data assertions and `ai_context`."""
    try:
        token = get_tool_access_token(_config)
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
                        "additivity": m.get("additivity"),
                        "depends_on": [
                            d.get("name") for d in (m.get("depends_on") or []) if d.get("name")
                        ],
                        # Identities this metric takes part in, with their last verdict. A check that is
                        # failing means the number itself is not verified — say so instead of answering
                        # as if it were.
                        "assertions": [
                            {
                                "direction": a.get("direction"),
                                "counterpart": a.get("counterpart_name") or a.get("counterpart"),
                                "weight": a.get("weight"),
                                "tolerance": a.get("tolerance"),
                                "health": a.get("health"),
                                "rule_id": a.get("rule_id"),
                            }
                            for a in (m.get("assertions") or [])
                        ],
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
def query_semantic_model(
    model_id: Annotated[str, "Model id from list_semantic_models"],
    _config: RunnableConfig,
    metric: Annotated[str | None, "Saved metric name; preferred over expression"] = None,
    expression: Annotated[str | None, "Aggregate expression (e.g. SUM(amount)) when no saved metric fits"] = None,
    base_dataset: Annotated[str | None, "Dataset id the expression runs on"] = None,
    joins: Annotated[list[str] | None, "Relationship ids to join"] = None,
    group_by: Annotated[list[dict[str, Any]] | None, "Dimensions: [{field, ...}]"] = None,
    filters: Annotated[list[dict[str, Any]] | None, "Row filters: [{field, op, value}]"] = None,
    where: Annotated[str | None, "Boolean SQL fragment AND-ed into the query"] = None,
    having: Annotated[str | None, "Boolean SQL fragment on the aggregate"] = None,
    order_by: Annotated[list[dict[str, Any]] | None, "Ordering: [{field, direction}]"] = None,
    limit: Annotated[int | None, "Maximum rows"] = 100,
    resource_id: Annotated[str | None, "Granted data resource; required when the model is restricted"] = None,
) -> str:
    """One governed metric query: a saved metric or an aggregate expression. Never sum a `non_additive` metric — query it at the needed grain; pass `resource_id` when the model is restricted."""
    try:
        token = get_tool_access_token(_config)
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
def run_sql(
    model_id: Annotated[str, "Model id from list_semantic_models"],
    sql: Annotated[str, "One SELECT or WITH…SELECT over this model's tables"],
    _config: RunnableConfig,
    limit: Annotated[int | None, "Maximum rows"] = 100,
    resource_id: Annotated[str | None, "Granted data resource; required when the model is restricted"] = None,
) -> str:
    """One read-only SELECT over this model's tables, when a metric query cannot express it. `resource_id` when restricted."""
    try:
        token = get_tool_access_token(_config)
        resource_id = _resolve_resource(token, model_id, resource_id)
        result = catalog_client.run_model_sql(
            token, model_id, sql, limit=limit, resource_id=resource_id
        )
        return json.dumps(result, indent=2, default=str)
    except Exception as e:
        return f"Error running SQL Lab: {e}"


catalog_tools = [
    list_semantic_models,
    get_semantic_model,
    query_semantic_model,
    run_sql,
]

