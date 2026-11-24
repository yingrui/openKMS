"""LangGraph skill: ontology (Neo4j graph schema + Cypher), scoped by KB-linked groups."""
import json
from typing import Annotated

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool

from .. import catalog_client
from ..ontology_client import get_ontology_schema as fetch_ontology_schema
from ..ontology_client import run_cypher as execute_cypher
from ..request_context import get_tool_access_token, get_tool_data_scope


@tool
def get_ontology_schema(
    _config: RunnableConfig,
    group_id: Annotated[str, "Group id from the bound-data section of the system prompt; empty for the full schema"] = "",
) -> str:
    """ One ontology group's object types and link types — the exact labels and relationship types Cypher must use.

    Use before any graph query, and whenever the question is about entities: which products exist, how many, what they
    are linked to, what state they are in. Not for definitions — those are in the knowledge base.

    With one group bound the group's schema is returned directly; with several, pass `group_id`. Returns
    `{object_type_count, link_type_count, object_types: [{name, properties, neo4j_label, ...}], link_types: [...]}`."""
    try:
        token = get_tool_access_token(_config)
        schema = fetch_ontology_schema(token)
        linked = list(get_tool_data_scope(_config).get("ontology_groups") or [])
        if not (group_id or "").strip():
            if len(linked) == 1:
                # Exactly one group: this *is* the schema the caller wants. Asking "which one?" spent a turn to learn
                # what the request had already said — the model then called again, and one of the two calls was noise.
                group_id = str(linked[0].get("id") or "")
            elif linked:
                return json.dumps(
                    {
                        "message": (
                            "This agent is bound to more than one ontology group — pass the group id "
                            "from the bound-data section of the system prompt."
                        ),
                        "bound_group_count": len(linked),
                        "bound_groups": linked,
                    },
                    indent=2,
                    default=str,
                )
            else:
                return json.dumps(schema, indent=2, default=str)

        allowed = {str(g.get("id")) for g in linked}
        if allowed and group_id not in allowed:
            return (
                f"Error: ontology group '{group_id}' is not bound to this agent. "
                "Use a group id from the bound-data section of the system prompt."
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
            "object_type_count": len(object_types),
            "link_type_count": len(link_types),
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
    """Run one read-only Cypher query (MATCH / RETURN / WHERE) against the bound ontology.

    Use to count, filter or join entities the schema describes — "which products have no sales status", "how many
    diseases per parent". Copy `neo4j_label` and `neo4j_rel_type` verbatim from `get_ontology_schema`; uppercase or
    guessed labels return nothing, which reads like "no data".

    Returns `{columns, rows}`; state the numbers you actually got back."""
    if not query or not query.strip():
        return "Error: Cypher query cannot be empty."
    try:
        token = get_tool_access_token(_config)
        result = execute_cypher(token, query.strip())
        return json.dumps(result, indent=2, default=str)
    except Exception as e:
        return f"Error executing Cypher: {e}"


ontology_tools = [get_ontology_schema, run_cypher]

