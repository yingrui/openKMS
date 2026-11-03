"""LangGraph skill: ontology (Neo4j graph schema + Cypher), scoped by KB-linked groups."""
import json

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool

from .. import catalog_client
from ..ontology_client import get_ontology_schema, run_cypher
from ..request_context import get_tool_access_token, get_tool_knowledge_base_id


@tool
def list_ontology_groups_tool(_config: RunnableConfig) -> str:
    """List ontology groups linked to this knowledge base. Use before schema/Cypher for domain questions."""
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
def get_ontology_schema_tool(_config: RunnableConfig, group_id: str = "") -> str:
    """Get the ontology schema: object types (node labels) and link types (relationships).
    If group_id is set, it must be linked to this KB; schema is limited to that group's object types
    and link types that touch them. Call list_ontology_groups_tool first for domain questions."""
    try:
        token = get_tool_access_token(_config)
        kb_id = get_tool_knowledge_base_id(_config)
        schema = get_ontology_schema(token)
        if not (group_id or "").strip():
            if kb_id:
                linked = catalog_client.list_kb_ontology_groups(token, kb_id)
                if linked:
                    return json.dumps(
                        {
                            "message": (
                                "This knowledge base links ontology groups — pass group_id "
                                "from list_ontology_groups_tool instead of the full schema."
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
                "Call list_ontology_groups_tool first."
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
def run_cypher_tool(cypher: str, _config: RunnableConfig) -> str:
    """Execute a read-only Cypher query against the Neo4j knowledge graph.
    Use MATCH, RETURN, WHERE. No CREATE, MERGE, DELETE, SET.
    First call get_ontology_schema_tool (with a linked group_id when the KB has groups)."""
    if not cypher or not cypher.strip():
        return "Error: Cypher query cannot be empty."
    try:
        token = get_tool_access_token(_config)
        result = run_cypher(token, cypher.strip())
        return json.dumps(result, indent=2, default=str)
    except Exception as e:
        return f"Error executing Cypher: {e}"


ontology_tools = [list_ontology_groups_tool, get_ontology_schema_tool, run_cypher_tool]

ONTOLOGY_PROMPT = (
    "**Ontology skill** – For coverage/relationship questions (e.g. \"哪些产品保障X\"、\"过往同类理赔案例\"):\n"
    "1. Call **list_ontology_groups_tool** when this KB links groups; pick a group_id.\n"
    "2. Call **get_ontology_schema_tool** with that group_id (required if groups are linked).\n"
    "3. Write Cypher using **exact** `neo4j_label` and `neo4j_rel_type` strings from that JSON "
    "(case-sensitive). Copy them verbatim — do **not** uppercase relationship types, do **not** rename "
    "object/link `name` fields, and do **not** invent labels that are not in the schema.\n"
    "4. Properties: use each object type's `key_property` and names listed under `properties`.\n"
    "5. Call **run_cypher_tool** (MATCH/RETURN/WHERE only; no CREATE/MERGE/DELETE/SET).\n"
    "If the first query returns no rows, try alternate property keywords or a related link type from "
    "the schema before reporting empty. If no groups are linked, say so instead of querying the full graph."
)
