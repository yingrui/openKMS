"""Text-to-Cypher and answer-summarisation services for the ontology explorer.

Both functions are pure-functional given a model_config + an ontology schema
snapshot. The HTTP routes in `app.api.ontology_explore` build the schema
snapshot from Postgres and pass model_config from `resolve_agent_llm_config`.

No retries, no caching — the caller decides whether to surface raw errors.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

from openai import AsyncOpenAI

logger = logging.getLogger(__name__)


CYPHER_SYSTEM_PROMPT = """You generate read-only Cypher 5 queries for a Neo4j ontology.

HARD RULES:
- Output ONLY valid JSON: {"cypher": "<query>", "explanation": "<one sentence>"}
- Use ONLY node labels and relationship types listed in the SCHEMA.
- **Respect arrow direction.** Schema lists relationships as `(Src)-[:rel]->(Tgt)`.
  Match them in that exact direction. NEVER reverse the arrow.
  Example: schema says `(InsuranceProduct)-[:targets]->(AgeSegment)` ->
  use `MATCH (p:InsuranceProduct)-[:targets]->(a:AgeSegment)` (NOT the other way).
- Use the listed `key_property` (or any listed property) when the user names an entity.
  The properties on a node are exactly the ones in `props=[...]`. Do not invent new ones.
- The query MUST be read-only: MATCH / OPTIONAL MATCH / WHERE / RETURN / WITH / ORDER BY / LIMIT only.
- Never emit CREATE, MERGE, SET, DELETE, REMOVE, DETACH, DROP, CALL, apoc.*, dbms.*.
- Always end with a RETURN clause. **Prefer returning whole node variables** (e.g. `RETURN a, p, c, d`)
  in the order they appear along the path -- this drives the graph view.
- If the question doesn't map to the schema, return an empty cypher string and
  explain in `explanation` what is missing.

EXAMPLES (assuming the schema includes the labels and rels below):

User: "50岁客户买了 MIL 重疾险，确诊了严重肺泡蛋白沉积症，能赔吗？"
Output: {"cypher": "MATCH (a:AgeSegment {name:\\"中老年 50-65 周岁\\"})<-[:targets]-(p:InsuranceProduct {product_code:\\"MIL\\"})-[:provides]->(c:Coverage)-[:covers_disease]->(d:Disease) WHERE d.disease_name CONTAINS \\"肺泡蛋白沉积\\" RETURN a, p, c, d", "explanation": "Walk from age segment via the product to its coverage clauses to the matching disease."}

User: "范可尼综合征 在哪些产品里被除外？"
Output: {"cypher": "MATCH (p:InsuranceProduct)-[:excludes]->(e:Exclusion)-[:excludes_disease]->(d:Disease) WHERE d.disease_name CONTAINS \\"范可尼\\" RETURN p, e, d", "explanation": "Find products with an exclusion clause that excludes Fanconi syndrome."}

The user question may be in Chinese or English. The Cypher is always English."""


def _build_schema_block(object_types: list[dict], link_types: list[dict]) -> str:
    lines = ["NODE LABELS:"]
    for ot in object_types:
        props = ot.get("properties") or []
        prop_names = [p.get("name") for p in props if isinstance(p, dict) and p.get("name")]
        key = ot.get("key_property") or "(none)"
        prop_str = ", ".join(prop_names) if prop_names else "(no declared props)"
        desc = (ot.get("description") or "").strip()
        line = f"- ({ot['name']}) key_property={key} props=[{prop_str}]"
        if desc:
            line += f"  // {desc[:80]}"
        lines.append(line)
    lines.append("")
    lines.append("RELATIONSHIP TYPES:")
    for lt in link_types:
        src = lt.get("source_object_type_name") or "?"
        tgt = lt.get("target_object_type_name") or "?"
        desc = (lt.get("description") or "").strip()
        line = f"- ({src})-[:{lt['name']}]->({tgt})  cardinality={lt.get('cardinality','?')}"
        if desc:
            line += f"  // {desc[:80]}"
        lines.append(line)
    return "\n".join(lines)


def _strip_code_fence(s: str) -> str:
    s = s.strip()
    if s.startswith("```"):
        lines = s.split("\n")
        if lines and lines[-1].strip() == "```":
            lines = lines[1:-1]
        else:
            lines = lines[1:]
        s = "\n".join(lines).strip()
    return s


_FORBIDDEN_RE = re.compile(
    r"\b(CREATE|MERGE|DELETE|SET|REMOVE|DETACH|DROP|CALL)\b|apoc\.|dbms\.",
    re.IGNORECASE,
)


def _validate_cypher_against_schema(
    cypher: str,
    object_type_names: set[str],
    link_type_names: set[str],
) -> tuple[bool, str]:
    """Return (ok, error_message). Only structural — read-only checks happen at /explore."""
    if not cypher.strip():
        return False, "empty cypher"
    if _FORBIDDEN_RE.search(cypher):
        return False, "generated cypher contains forbidden write operation or procedure call"
    if "RETURN" not in cypher.upper():
        return False, "generated cypher has no RETURN clause"
    used_labels = set(re.findall(r":(\w+)\b", cypher))
    # Discriminate: labels are after a `:` inside `()` or after an `=` like `n:Label`.
    # The simple regex over-collects; we treat unknown ones as unknown but only fail when none of the
    # cypher's labels matches anything in the schema (real hallucination).
    if used_labels:
        unknown = [u for u in used_labels if u not in object_type_names and u not in link_type_names]
        # If every found token is unknown, we definitely hallucinated; otherwise allow (partial match enough).
        if unknown and len(unknown) == len(used_labels):
            return False, f"unknown labels/rels in cypher: {sorted(unknown)[:5]}"
    return True, ""


async def generate_cypher_from_question(
    *,
    question: str,
    object_types: list[dict],
    link_types: list[dict],
    model_config: dict[str, Any],
) -> dict[str, str]:
    """Call the LLM. Return {"cypher": "...", "explanation": "..."} (cypher may be empty if not answerable)."""
    if not question.strip():
        raise ValueError("question is required")

    base_url = (model_config.get("base_url") or "").rstrip("/")
    if not base_url:
        raise ValueError("LLM base_url is not configured")
    if not base_url.endswith("/v1"):
        base_url = f"{base_url}/v1"
    client = AsyncOpenAI(
        base_url=base_url,
        api_key=model_config.get("api_key") or "no-key",
    )

    schema_block = _build_schema_block(object_types, link_types)
    user_prompt = f"SCHEMA:\n{schema_block}\n\nUSER QUESTION:\n{question.strip()}\n\nReturn JSON only."

    try:
        response = await client.chat.completions.create(
            model=model_config.get("model_name", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": CYPHER_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.1,
        )
    except Exception as e:
        logger.error("text-to-cypher LLM call failed: %s", e)
        raise

    content = response.choices[0].message.content or ""
    content = _strip_code_fence(content)
    try:
        payload = json.loads(content)
    except json.JSONDecodeError as e:
        logger.warning("text-to-cypher LLM returned non-JSON: %s", content[:300])
        raise ValueError(f"LLM did not return JSON: {e}") from e

    cypher = str(payload.get("cypher") or "").strip()
    explanation = str(payload.get("explanation") or "").strip()
    if cypher:
        ot_names = {ot["name"] for ot in object_types}
        lt_names = {lt["name"] for lt in link_types}
        ok, err = _validate_cypher_against_schema(cypher, ot_names, lt_names)
        if not ok:
            raise ValueError(f"generated cypher invalid: {err}")
    return {"cypher": cypher, "explanation": explanation}


ANSWER_SYSTEM_PROMPT = """You are a domain analyst. Given a user question, the Cypher query that was run,
and the resulting rows from a knowledge graph, write a concise, citation-grounded answer.

RULES:
- Answer in the same language as the question.
- Cite specific values from the rows (product names, clause IDs, regulator IDs, disease names, SLA days, etc.).
- 4-8 short bullet points; no preamble; no caveats.
- If the rows are empty, say so plainly and suggest one alternative angle.
- Do not invent facts that are not in the rows."""


async def summarize_answer(
    *,
    question: str,
    cypher: str,
    columns: list[str],
    rows: list[dict],
    model_config: dict[str, Any],
    max_rows: int = 30,
) -> str:
    """Summarise Cypher results into a final natural-language answer."""
    if not question.strip():
        raise ValueError("question is required")

    base_url = (model_config.get("base_url") or "").rstrip("/")
    if not base_url.endswith("/v1"):
        base_url = f"{base_url}/v1"
    client = AsyncOpenAI(
        base_url=base_url,
        api_key=model_config.get("api_key") or "no-key",
    )

    rows_block = json.dumps(rows[:max_rows], ensure_ascii=False, indent=2)
    user_prompt = (
        f"USER QUESTION:\n{question.strip()}\n\n"
        f"CYPHER:\n{cypher}\n\n"
        f"COLUMNS: {columns}\n\n"
        f"ROWS (first {min(len(rows), max_rows)} of {len(rows)}):\n{rows_block}\n\n"
        f"Write the answer now."
    )

    try:
        response = await client.chat.completions.create(
            model=model_config.get("model_name", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": ANSWER_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
        )
    except Exception as e:
        logger.error("text-to-cypher answer-summarise LLM call failed: %s", e)
        raise

    return (response.choices[0].message.content or "").strip()
