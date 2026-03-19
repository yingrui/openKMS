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
    if not body.cypher or not body.cypher.strip():
        raise HTTPException(status_code=400, detail="Cypher query is required")
    cypher = body.cypher.strip()
    # Block write operations (whole words)
    if re.search(r"\b(CREATE|MERGE|DELETE|SET|REMOVE|DETACH|DROP)\b", cypher, re.IGNORECASE):
        raise HTTPException(
            status_code=400,
            detail="Only read queries allowed (MATCH, RETURN, WHERE, etc.). Write operations are forbidden.",
        )
    # Block procedure/admin calls (CALL, apoc., dbms., etc.)
    if re.search(r"\bCALL\b", cypher, re.IGNORECASE):
        raise HTTPException(
            status_code=400,
            detail="Procedure calls (CALL) are not allowed.",
        )
    if re.search(r"(apoc\.|dbms\.)", cypher, re.IGNORECASE):
        raise HTTPException(
            status_code=400,
            detail="apoc and dbms procedures are not allowed.",
        )
    # Require RETURN (read queries must return results)
    if "RETURN" not in cypher.upper():
        raise HTTPException(
            status_code=400,
            detail="Query must include RETURN (read-only queries only).",
        )
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
