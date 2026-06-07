"""LangGraph skill: ontology (Neo4j graph schema + Cypher)."""
import json

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool

from ..ontology_client import get_ontology_schema, run_cypher
from ..request_context import get_tool_access_token


@tool
def get_ontology_schema_tool(_config: RunnableConfig) -> str:
    """Get the ontology schema: object types (node labels) and link types (relationships) in the knowledge graph.
    Use this first to understand the graph structure before writing Cypher queries.
    Returns object types with neo4j_label (for MATCH (n:Label)) and link types with neo4j_rel_type (exact case)."""
    try:
        token = get_tool_access_token(_config)
        schema = get_ontology_schema(token)
        return json.dumps(schema, indent=2, default=str)
    except Exception as e:
        return f"Error fetching ontology schema: {e}"


@tool
def run_cypher_tool(cypher: str, _config: RunnableConfig) -> str:
    """Execute a read-only Cypher query against the Neo4j knowledge graph.
    Use MATCH, RETURN, WHERE. No CREATE, MERGE, DELETE, SET.
    First call get_ontology_schema_tool to learn the node labels and relationship types."""
    if not cypher or not cypher.strip():
        return "Error: Cypher query cannot be empty."
    try:
        token = get_tool_access_token(_config)
        result = run_cypher(token, cypher.strip())
        return json.dumps(result, indent=2, default=str)
    except Exception as e:
        return f"Error executing Cypher: {e}"


ontology_tools = [get_ontology_schema_tool, run_cypher_tool]

ONTOLOGY_PROMPT = (
    "**Ontology skill** – For coverage/relationship questions (e.g. \"哪些产品保障X\"、\"过往同类理赔案例\"):\n"
    "1. Call **get_ontology_schema_tool** first.\n"
    "2. Write Cypher using **exact** `neo4j_label` and `neo4j_rel_type` strings from that JSON "
    "(case-sensitive). Copy them verbatim — do **not** uppercase relationship types, do **not** rename "
    "object/link `name` fields, and do **not** invent labels that are not in the schema.\n"
    "3. Properties: use each object type's `key_property` and names listed under `properties` "
    "(e.g. `disease_name` vs `name` — only what the schema declares).\n"
    "4. Call **run_cypher_tool** (MATCH/RETURN/WHERE only; no CREATE/MERGE/DELETE/SET).\n"
    "Pattern (substitute labels/rel types from your schema):\n"
    "  MATCH (a:<neo4j_label>)-[:<neo4j_rel_type>]->(b:<neo4j_label>) WHERE ... RETURN ... LIMIT 20\n"
    "If the first query returns no rows, try alternate property keywords or a related link type from "
    "the schema before reporting empty."
)
