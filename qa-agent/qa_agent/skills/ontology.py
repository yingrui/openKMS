"""LangGraph skill: ontology (Neo4j graph schema + Cypher)."""
import json

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool

from ..ontology_client import get_ontology_schema, run_cypher


def _get_access_token(config: RunnableConfig) -> str:
    return config.get("configurable", {}).get("access_token", "")


@tool
def get_ontology_schema_tool(_config: RunnableConfig) -> str:
    """Get the ontology schema: object types (node labels) and link types (relationships) in the knowledge graph.
    Use this first to understand the graph structure before writing Cypher queries.
    Returns object types with neo4j_label (for MATCH (n:Label)) and link types with neo4j_rel_type."""
    try:
        token = _get_access_token(_config)
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
        token = _get_access_token(_config)
        result = run_cypher(token, cypher.strip())
        return json.dumps(result, indent=2, default=str)
    except Exception as e:
        return f"Error executing Cypher: {e}"


ontology_tools = [get_ontology_schema_tool, run_cypher_tool]

ONTOLOGY_PROMPT = (
    "**Ontology skill** – For coverage/relationship questions (e.g. Which insurance products cover heart attack?): "
    "First call get_ontology_schema_tool, then write a Cypher query and call run_cypher_tool."
)
