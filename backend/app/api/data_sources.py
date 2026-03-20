"""Data sources API – CRUD and test connection (admin-only)."""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_admin, require_auth
from app.database import get_db
from app.models.data_source import DataSource
from app.models.dataset import Dataset
from app.schemas.data_source import (
    DataSourceCreate,
    DataSourceListResponse,
    DataSourceResponse,
    DataSourceUpdate,
)
from app.services.credential_encryption import decrypt, encrypt

router = APIRouter(
    prefix="/data-sources",
    tags=["data-sources"],
    dependencies=[Depends(require_auth)],
)


def _to_response(ds: DataSource) -> DataSourceResponse:
    """Build response with decrypted username, never expose password."""
    username_plain = ""
    try:
        username_plain = decrypt(ds.username_encrypted) if ds.username_encrypted else ""
    except Exception:
        username_plain = "(encrypted)"
    return DataSourceResponse(
        id=ds.id,
        name=ds.name,
        kind=ds.kind,
        host=ds.host,
        port=ds.port,
        database=ds.database,
        username=username_plain,
        password_masked=bool(ds.password_encrypted),
        options=ds.options,
        created_at=ds.created_at,
        updated_at=ds.updated_at,
    )


@router.get("", response_model=DataSourceListResponse, dependencies=[Depends(require_admin)])
async def list_data_sources(db: AsyncSession = Depends(get_db)):
    """List all data sources."""
    result = await db.execute(select(DataSource).order_by(DataSource.created_at.desc()))
    items = result.scalars().all()
    return DataSourceListResponse(items=[_to_response(d) for d in items], total=len(items))


@router.post("", response_model=DataSourceResponse, status_code=201, dependencies=[Depends(require_admin)])
async def create_data_source(body: DataSourceCreate, db: AsyncSession = Depends(get_db)):
    """Create a data source. Encrypts username and password."""
    ds = DataSource(
        id=str(uuid.uuid4()),
        name=body.name,
        kind=body.kind,
        host=body.host,
        port=body.port,
        database=body.database or None,
        username_encrypted=encrypt(body.username),
        password_encrypted=encrypt(body.password) if body.password else None,
        options=body.options,
    )
    db.add(ds)
    await db.flush()
    await db.refresh(ds)
    return _to_response(ds)


@router.get("/{data_source_id}", response_model=DataSourceResponse, dependencies=[Depends(require_admin)])
async def get_data_source(data_source_id: str, db: AsyncSession = Depends(get_db)):
    """Get a data source by ID."""
    ds = await db.get(DataSource, data_source_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Data source not found")
    return _to_response(ds)


@router.put("/{data_source_id}", response_model=DataSourceResponse, dependencies=[Depends(require_admin)])
async def update_data_source(
    data_source_id: str,
    body: DataSourceUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a data source. Re-encrypts password if provided."""
    ds = await db.get(DataSource, data_source_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Data source not found")
    if body.name is not None:
        ds.name = body.name
    if body.kind is not None:
        ds.kind = body.kind
    if body.host is not None:
        ds.host = body.host
    if body.port is not None:
        ds.port = body.port
    if body.database is not None:
        ds.database = body.database or None
    if body.username is not None:
        ds.username_encrypted = encrypt(body.username)
    if body.password is not None:
        ds.password_encrypted = encrypt(body.password) if body.password else None
    if body.options is not None:
        ds.options = body.options
    await db.flush()
    await db.refresh(ds)
    return _to_response(ds)


@router.delete("/{data_source_id}", status_code=204, dependencies=[Depends(require_admin)])
async def delete_data_source(data_source_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a data source. Cascades to datasets."""
    ds = await db.get(DataSource, data_source_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Data source not found")
    await db.delete(ds)


@router.post("/{data_source_id}/test", dependencies=[Depends(require_admin)])
async def test_data_source_connection(data_source_id: str, db: AsyncSession = Depends(get_db)):
    """Test connection to the data source."""
    ds = await db.get(DataSource, data_source_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Data source not found")

    if ds.kind == "postgresql":
        try:
            from urllib.parse import quote_plus

            username = decrypt(ds.username_encrypted) if ds.username_encrypted else ""
            password = decrypt(ds.password_encrypted) if ds.password_encrypted else ""
            host = ds.host
            port = ds.port or 5432
            database = ds.database or "postgres"
            password_escaped = quote_plus(password) if password else ""
            url = f"postgresql://{username}:{password_escaped}@{host}:{port}/{database}"
            from sqlalchemy import create_engine, text

            engine = create_engine(url, pool_pre_ping=True, pool_recycle=10)
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            engine.dispose()
            return {"ok": True, "message": "Connection successful"}
        except Exception as e:
            return {"ok": False, "message": str(e)}
    elif ds.kind == "neo4j":
        try:
            from neo4j import GraphDatabase
            username = decrypt(ds.username_encrypted) if ds.username_encrypted else ""
            password = decrypt(ds.password_encrypted) if ds.password_encrypted else ""
            uri = f"bolt://{ds.host}:{ds.port or 7687}"
            driver = GraphDatabase.driver(uri, auth=(username, password))
            driver.verify_connectivity()
            driver.close()
            return {"ok": True, "message": "Connection successful"}
        except ImportError:
            raise HTTPException(
                status_code=501,
                detail="Neo4j driver not installed. pip install neo4j",
            )
        except Exception as e:
            return {"ok": False, "message": str(e)}
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported data source kind: {ds.kind}")


@router.post("/{data_source_id}/neo4j-delete-all", dependencies=[Depends(require_admin)])
async def neo4j_delete_all(data_source_id: str, db: AsyncSession = Depends(get_db)):
    """Delete all nodes and relationships in the Neo4j database. Admin only. Neo4j data sources only."""
    ds = await db.get(DataSource, data_source_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Data source not found")
    if ds.kind != "neo4j":
        raise HTTPException(status_code=400, detail="Only Neo4j data sources support delete all")

    try:
        from neo4j import GraphDatabase
    except ImportError:
        raise HTTPException(
            status_code=501,
            detail="Neo4j driver not installed. pip install neo4j",
        )

    username = decrypt(ds.username_encrypted) if ds.username_encrypted else ""
    password = decrypt(ds.password_encrypted) if ds.password_encrypted else ""
    uri = f"bolt://{ds.host}:{ds.port or 7687}"
    driver = GraphDatabase.driver(uri, auth=(username, password))
    try:
        with driver.session() as session:
            session.run("MATCH (n) DETACH DELETE n")
        return {"ok": True, "message": "All nodes and relationships deleted"}
    except Exception as e:
        return {"ok": False, "message": str(e)}
    finally:
        driver.close()
