"""LangGraph skill: ontology (Neo4j graph schema + Cypher), scoped by KB-linked groups."""
import json
from typing import Annotated

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool

from .. import catalog_client
from ..ontology_client import get_ontology_schema as fetch_ontology_schema
from ..ontology_client import run_cypher as execute_cypher
from ..request_context import get_tool_access_token, get_tool_knowledge_base_id


@tool
def list_ontology_groups(_config: RunnableConfig) -> str:
    """ The ontology groups linked to this knowledge base. Call it before any graph query."""
    try:
        token = get_tool_access_token(_config)
        kb_id = get_tool_knowledge_base_id(_config)
        if not kb_id:
            return "Error: knowledge_base_id missing."
        items = catalog_client.list_kb_ontology_groups(token, kb_id)
        if not items:
            return json.dumps(
                {
                    "items": [],
                    "message": "This knowledge base has no linked ontology groups.",
                },
                indent=2,
            )
        return json.dumps({"items": items}, indent=2, default=str)
    except Exception as e:
        return f"Error listing ontology groups: {e}"


@tool
def get_ontology_schema(
    _config: RunnableConfig,
    group_id: Annotated[str, "Group id from list_ontology_groups; empty for every linked group"] = "",
) -> str:
    """ One group's object types and link types — the exact labels Cypher must use."""
    try:
        token = get_tool_access_token(_config)
        kb_id = get_tool_knowledge_base_id(_config)
        schema = fetch_ontology_schema(token)
        if not (group_id or "").strip():
            if kb_id:
                linked = catalog_client.list_kb_ontology_groups(token, kb_id)
                if linked:
                    return json.dumps(
                        {
                            "message": (
                                "This knowledge base links ontology groups — pass group_id "
                                "from list_ontology_groups instead of the full schema."
                            ),
                            "linked_groups": linked,
                        },
                        indent=2,
                        default=str,
                    )
            return json.dumps(schema, indent=2, default=str)

        if not kb_id:
            return "Error: knowledge_base_id missing."
        linked = catalog_client.list_kb_ontology_groups(token, kb_id)
        allowed = {g.get("ontology_group_id") for g in linked}
        if group_id not in allowed:
            return (
                f"Error: ontology group '{group_id}' is not linked to this knowledge base. "
                "Call list_ontology_groups first."
            )
        related = catalog_client.get_ontology_group_related(token, group_id)
        ot_ids = {str(x) for x in (related.get("object_type_ids") or [])}
        object_types = [o for o in schema.get("object_types") or [] if o.get("id") in ot_ids]
        ot_names = {o.get("name") for o in object_types}
        related_lt_ids = {
            lt.get("id") for lt in (related.get("link_types") or []) if isinstance(lt, dict)
        }
        link_types = []
        for lt in schema.get("link_types") or []:
            if lt.get("id") in related_lt_ids:
                link_types.append(lt)
                continue
            src = lt.get("source_object_type_name")
            tgt = lt.get("target_object_type_name")
            if src in ot_names or tgt in ot_names:
                link_types.append(lt)
        scoped = {
            "object_types": object_types,
            "link_types": link_types,
            "group_id": group_id,
            "summary": (
                f"Group-scoped: {len(object_types)} object types, {len(link_types)} link types. "
                "Copy neo4j_label and neo4j_rel_type verbatim."
            ),
        }
        return json.dumps(scoped, indent=2, default=str)
    except Exception as e:
        return f"Error fetching ontology schema: {e}"


@tool
def run_cypher(
    query: Annotated[
        str,
        "Read-only Neo4j Cypher: MATCH / RETURN / WHERE, using the schema's exact labels",
    ],
    _config: RunnableConfig,
) -> str:
    """Run one read-only Cypher query on Neo4j: MATCH / RETURN / WHERE only, with the schema's exact labels and relationship types."""
    if not query or not query.strip():
        return "Error: Cypher query cannot be empty."
    try:
        token = get_tool_access_token(_config)
        result = execute_cypher(token, query.strip())
        return json.dumps(result, indent=2, default=str)
    except Exception as e:
        return f"Error executing Cypher: {e}"


ontology_tools = [list_ontology_groups, get_ontology_schema, run_cypher]

