"""Ontology Explorer API – execute Cypher queries against Neo4j, plus text-to-cypher and answer summarisation."""
import asyncio
import logging
import re
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_auth
from app.database import get_db
from app.models.data_source import DataSource
from app.models.link_type import LinkType
from app.models.object_type import ObjectType
from app.services.agent.llm import resolve_agent_llm_config
from app.services.credential_encryption import decrypt
from app.services.text_to_cypher import (
    generate_cypher_from_question,
    summarize_answer,
)

logger = logging.getLogger(__name__)

MAX_CYPHER_ROWS = 500

router = APIRouter(
    prefix="/ontology",
    tags=["ontology-explore"],
    dependencies=[Depends(require_auth)],
)


class CypherQueryRequest(BaseModel):
    cypher: str


class CypherQueryResponse(BaseModel):
    columns: list[str]
    rows: list[dict]


class TextToCypherRequest(BaseModel):
    question: str


class TextToCypherResponse(BaseModel):
    cypher: str
    explanation: str


class AnswerRequest(BaseModel):
    question: str
    cypher: str
    columns: list[str]
    rows: list[dict]


class AnswerResponse(BaseModel):
    answer: str


def validate_ontology_explore_cypher(cypher: str) -> tuple[bool, str | None]:
    """Return ``(True, None)`` if the string may be sent to Neo4j as read-only exploration.

    Otherwise ``(False, detail)`` matches the ``HTTPException`` messages used by
    :func:`execute_cypher`. Kept pure for unit tests (see ``tests/test_ontology_explore_cypher.py``).
    """
    if not cypher or not cypher.strip():
        return False, "Cypher query is required"
    text = cypher.strip()
    if re.search(r"\b(CREATE|MERGE|DELETE|SET|REMOVE|DETACH|DROP)\b", text, re.IGNORECASE):
        return False, "Only read queries allowed (MATCH, RETURN, WHERE, etc.). Write operations are forbidden."
    if re.search(r"\bCALL\b", text, re.IGNORECASE):
        return False, "Procedure calls (CALL) are not allowed."
    if re.search(r"(apoc\.|dbms\.)", text, re.IGNORECASE):
        return False, "apoc and dbms procedures are not allowed."
    if "RETURN" not in text.upper():
        return False, "Query must include RETURN (read-only queries only)."
    return True, None


def _serialize_val(v):
    if v is None:
        return None
    if isinstance(v, (str, int, float, bool)):
        return v
    if hasattr(v, "isoformat"):
        return v.isoformat()
    if hasattr(v, "keys") and hasattr(v, "__getitem__"):  # Node, Relationship, dict
        return {k: _serialize_val(v[k]) for k in v.keys()}
    if isinstance(v, (list, tuple)):
        return [_serialize_val(x) for x in v]
    return str(v)


def _run_neo4j_cypher(uri: str, username: str, password: str, cypher: str) -> tuple[list[str], list[dict]]:
    from neo4j import GraphDatabase

    driver = GraphDatabase.driver(uri, auth=(username, password))
    try:
        with driver.session() as session:
            result = session.run(cypher)
            keys = list(result.keys())
            rows: list[dict] = []
            for record in result:
                row = {}
                for k in keys:
                    row[k] = _serialize_val(record.get(k))
                rows.append(row)
                if len(rows) >= MAX_CYPHER_ROWS:
                    break
            return keys, rows
    finally:
        driver.close()


@router.post("/explore", response_model=CypherQueryResponse)
async def execute_cypher(
    body: CypherQueryRequest,
    db: AsyncSession = Depends(get_db),
):
    """Execute a read-only Cypher query against the first Neo4j data source. Returns columns and rows."""
    ok, err = validate_ontology_explore_cypher(body.cypher or "")
    if not ok:
        raise HTTPException(status_code=400, detail=err or "Invalid query")
    cypher = body.cypher.strip()
    result = await db.execute(select(DataSource).where(DataSource.kind == "neo4j").limit(1))
    neo4j_ds = result.scalar_one_or_none()
    if not neo4j_ds:
        raise HTTPException(status_code=400, detail="No Neo4j data source configured")
    try:
        from neo4j import GraphDatabase  # noqa: F401
    except ImportError:
        raise HTTPException(status_code=501, detail="Neo4j driver not installed") from None
    username = decrypt(neo4j_ds.username_encrypted) if neo4j_ds.username_encrypted else ""
    password = decrypt(neo4j_ds.password_encrypted) if neo4j_ds.password_encrypted else ""
    uri = f"bolt://{neo4j_ds.host}:{neo4j_ds.port or 7687}"
    try:
        keys, rows = await asyncio.to_thread(_run_neo4j_cypher, uri, username, password, cypher)
        return CypherQueryResponse(columns=keys, rows=rows)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


async def _load_schema_snapshot(db: AsyncSession) -> tuple[list[dict], list[dict]]:
    """Build the {object_types, link_types} snapshot the LLM uses to ground its Cypher."""
    ot_rows = (await db.execute(select(ObjectType).order_by(ObjectType.name))).scalars().all()
    object_types = [
        {
            "name": ot.name,
            "description": ot.description,
            "key_property": ot.key_property,
            "properties": ot.properties or [],
        }
        for ot in ot_rows
    ]
    name_by_id = {ot.id: ot.name for ot in ot_rows}

    lt_rows = (await db.execute(select(LinkType).order_by(LinkType.name))).scalars().all()
    link_types = [
        {
            "name": lt.name,
            "description": lt.description,
            "cardinality": lt.cardinality,
            "source_object_type_name": name_by_id.get(lt.source_object_type_id),
            "target_object_type_name": name_by_id.get(lt.target_object_type_id),
        }
        for lt in lt_rows
    ]
    return object_types, link_types


@router.post("/text-to-cypher", response_model=TextToCypherResponse)
async def text_to_cypher(
    body: TextToCypherRequest,
    db: AsyncSession = Depends(get_db),
):
    """Convert a natural-language question into a Cypher query grounded in the current ontology schema."""
    if not body.question or not body.question.strip():
        raise HTTPException(status_code=400, detail="question is required")
    model_config = await resolve_agent_llm_config(db)
    if not model_config:
        raise HTTPException(
            status_code=503,
            detail="No LLM model configured. Add an LLM in Console > Models.",
        )
    object_types, link_types = await _load_schema_snapshot(db)
    if not object_types:
        raise HTTPException(status_code=400, detail="No object types defined in ontology")
    try:
        out = await generate_cypher_from_question(
            question=body.question,
            object_types=object_types,
            link_types=link_types,
            model_config=model_config,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    except Exception as e:
        logger.exception("text-to-cypher failed")
        raise HTTPException(status_code=502, detail=f"LLM error: {e}") from e
    return TextToCypherResponse(cypher=out["cypher"], explanation=out["explanation"])


@router.post("/answer", response_model=AnswerResponse)
async def summarise_answer(
    body: AnswerRequest,
    db: AsyncSession = Depends(get_db),
):
    """Summarise a Cypher result back into a natural-language answer for the user."""
    if not body.question or not body.question.strip():
        raise HTTPException(status_code=400, detail="question is required")
    model_config = await resolve_agent_llm_config(db)
    if not model_config:
        raise HTTPException(
            status_code=503,
            detail="No LLM model configured. Add an LLM in Console > Models.",
        )
    try:
        text = await summarize_answer(
            question=body.question,
            cypher=body.cypher,
            columns=body.columns,
            rows=body.rows,
            model_config=model_config,
        )
    except Exception as e:
        logger.exception("answer summarisation failed")
        raise HTTPException(status_code=502, detail=f"LLM error: {e}") from e
    return AnswerResponse(answer=text)
