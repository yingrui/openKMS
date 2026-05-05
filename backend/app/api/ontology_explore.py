"""Ontology Explorer API – execute Cypher queries against Neo4j."""
import re
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_auth
from app.database import get_db
from app.models.data_source import DataSource
from app.services.credential_encryption import decrypt

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
        from neo4j import GraphDatabase
    except ImportError:
        raise HTTPException(status_code=501, detail="Neo4j driver not installed") from None
    username = decrypt(neo4j_ds.username_encrypted) if neo4j_ds.username_encrypted else ""
    password = decrypt(neo4j_ds.password_encrypted) if neo4j_ds.password_encrypted else ""
    uri = f"bolt://{neo4j_ds.host}:{neo4j_ds.port or 7687}"
    driver = GraphDatabase.driver(uri, auth=(username, password))
    try:
        with driver.session() as session:
            result = session.run(cypher)
            keys = result.keys()
            rows = []
            for record in result:
                row = {}
                for k in keys:
                    v = record.get(k)
                    row[k] = _serialize_val(v)
                rows.append(row)
            return CypherQueryResponse(columns=list(keys), rows=rows)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    finally:
        driver.close()
