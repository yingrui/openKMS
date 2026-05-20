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
    Returns object types with neo4j_label (for MATCH (n:Label)) and link types with neo4j_rel_type."""
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
    "**Ontology skill** – For coverage/relationship questions (e.g. \"哪些产品保障X\"、\"过往同类理赔案例\"): "
    "First call get_ontology_schema_tool to learn the actual labels & relationship types, "
    "**then** write a Cypher query and call run_cypher_tool. "
    "Critical conventions for this knowledge graph:\n"
    "  - Node labels: InsuranceProduct, Disease, ClaimCase, Circular, AgeSegment, CustomerSegment, Coverage, Exclusion, BenefitDefinition\n"
    "  - **AgeSegment** = 按年龄段（如中青年 / 中老年 / 高龄 / 未成年）；**CustomerSegment** = 按财富/服务等级（如 HNW / Affluent / Mass）。两者是正交维度，产品同时通过 `targets` 边连两类。\n"
    "  - Relationship types are **lowercase**: covers, governed_by, issued_under, targets, benefits, excludes, precedent_for\n"
    "  - Disease nodes use property `disease_name` (NOT `name`)\n"
    "  - Use `CONTAINS` for fuzzy matching disease names since the graph uses generic categories like '恶性肿瘤'/'急性心肌梗塞'\n"
    "Example for \"Which products cover cancer?\":\n"
    "  MATCH (p:InsuranceProduct)-[:covers]->(d:Disease) WHERE d.disease_name CONTAINS '恶性肿瘤' RETURN p.name, d.disease_name LIMIT 20\n"
    "Example for product → 客户群体（年龄段 + 财富等级）：\n"
    "  MATCH (p:InsuranceProduct {product_code:'<CODE>'})-[:targets]->(s) RETURN labels(s)[0] AS segment_kind, s.name, s.tier, s.age_band\n"
    "Example for HNW 适用产品：\n"
    "  MATCH (p:InsuranceProduct)-[:targets]->(c:CustomerSegment {tier:'HNW'})-[]-(p) RETURN DISTINCT p.product_code, p.name\n"
    "Example for case→product→circular compliance trace:\n"
    "  MATCH (c:ClaimCase)-[:issued_under]->(p:InsuranceProduct)-[:governed_by]->(circ:Circular) RETURN c.case_id, p.name, circ.title LIMIT 10\n"
    "If the first Cypher returns empty rows, **try variations** (different disease keyword, different relationship, different label between AgeSegment/CustomerSegment) before reporting empty."
)
